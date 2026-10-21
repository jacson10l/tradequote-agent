import { randomUUID } from "node:crypto";
import {
  failure,
  type ModelCredentials,
  type RuntimeCommand,
  type RuntimeResult,
  WorkerReplySchema,
} from "@tradequote/contracts";
import { type UtilityProcess, utilityProcess } from "electron";

export class BusinessWorker {
  private readonly child: UtilityProcess;
  private exited = false;
  private readonly pending = new Map<
    string,
    {
      resolve: (result: RuntimeResult) => void;
      timer: ReturnType<typeof setTimeout>;
      readOnly: boolean;
    }
  >();
  constructor(entry: string, database: string, fixture?: string) {
    this.child = utilityProcess.fork(entry, [database, ...(fixture ? [fixture] : [])], {
      serviceName: "TradeQuote Business",
      stdio: "ignore",
    });
    this.child.on("message", (message: unknown) => {
      const parsed = WorkerReplySchema.safeParse(message);
      if (!parsed.success) return;
      const pending = this.pending.get(parsed.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(parsed.data.id);
      pending.resolve(parsed.data.result);
    });
    this.child.on("exit", () => {
      this.exited = true;
      this.rejectPending();
    });
  }
  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(
        failure(
          "CAPABILITY_UNAVAILABLE",
          pending.readOnly
            ? "只读任务连接中断，未保存报价；重新运行会再次调用模型"
            : "业务进程不可用，请重启应用；重试将复用操作标识",
        ),
      );
    }
    this.pending.clear();
  }
  request(command: RuntimeCommand, credentials?: ModelCredentials): Promise<RuntimeResult> {
    if (this.exited || this.pending.size >= 50)
      return Promise.resolve(failure("CAPABILITY_UNAVAILABLE", "业务进程暂不可用，请重试"));
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          resolve(
            failure(
              "CAPABILITY_UNAVAILABLE",
              command.method === "agent.read"
                ? "只读任务等待超时，未保存报价；重新运行会再次调用模型"
                : "保存结果未知，请重试同一操作或重新加载",
            ),
          );
        },
        command.method === "agent.read"
          ? 135000
          : command.method.startsWith("agent.")
            ? 60000
            : 15000,
      );
      this.pending.set(id, { resolve, timer, readOnly: command.method === "agent.read" });
      this.child.postMessage({ id, command, ...(credentials ? { credentials } : {}) });
    });
  }
  close() {
    this.exited = true;
    this.rejectPending();
    this.child.kill();
  }
}
