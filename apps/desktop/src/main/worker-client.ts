import { randomUUID } from "node:crypto";
import {
  type Command,
  failure,
  WorkerReplySchema,
  type WorkspaceResult,
} from "@tradequote/contracts";
import { type UtilityProcess, utilityProcess } from "electron";

export class BusinessWorker {
  private readonly child: UtilityProcess;
  private exited = false;
  private readonly pending = new Map<
    string,
    { resolve: (result: WorkspaceResult) => void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(entry: string, database: string) {
    this.child = utilityProcess.fork(entry, [database], {
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
        failure("CAPABILITY_UNAVAILABLE", "业务进程不可用，请重启应用；重试将复用操作标识"),
      );
    }
    this.pending.clear();
  }
  request(command: Command): Promise<WorkspaceResult> {
    if (this.exited || this.pending.size >= 50)
      return Promise.resolve(failure("CAPABILITY_UNAVAILABLE", "业务进程暂不可用，请重试"));
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(failure("CAPABILITY_UNAVAILABLE", "保存结果未知，请重试同一操作或重新加载"));
      }, 15000);
      this.pending.set(id, { resolve, timer });
      this.child.postMessage({ id, command });
    });
  }
  close() {
    this.exited = true;
    this.rejectPending();
    this.child.kill();
  }
}
