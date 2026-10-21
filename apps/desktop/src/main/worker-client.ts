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
  private child: UtilityProcess | undefined;
  private closing = false;
  private ready: Promise<boolean> = Promise.resolve(false);
  private exit: Promise<void> = Promise.resolve();
  private readonly pending = new Map<
    string,
    {
      resolve: (result: RuntimeResult) => void;
      timer: ReturnType<typeof setTimeout>;
      readOnly: boolean;
    }
  >();
  constructor(
    private readonly entry: string,
    private readonly database: string,
    private readonly fixture?: string,
  ) {
    this.start();
  }
  private start() {
    if (this.child || this.closing) return;
    const child = utilityProcess.fork(
      this.entry,
      [this.database, ...(this.fixture ? [this.fixture] : [])],
      {
        serviceName: "TradeQuote Business",
        stdio: "ignore",
      },
    );
    this.child = child;
    let ready = (value: boolean) => {
      void value;
    };
    let exited = () => {};
    this.ready = new Promise<boolean>((resolve) => {
      ready = resolve;
    });
    this.exit = new Promise<void>((resolve) => {
      exited = resolve;
    });
    const startup = setTimeout(() => {
      ready(false);
      child.kill();
    }, 15000);
    child.on("message", (message: unknown) => {
      if (this.child !== child) return;
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "ready" &&
        Object.keys(message).length === 1
      ) {
        clearTimeout(startup);
        ready(true);
        return;
      }
      const parsed = WorkerReplySchema.safeParse(message);
      if (!parsed.success) return;
      const pending = this.pending.get(parsed.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(parsed.data.id);
      pending.resolve(parsed.data.result);
    });
    child.on("exit", () => {
      clearTimeout(startup);
      ready(false);
      if (this.child === child) {
        this.child = undefined;
        this.rejectPending();
      }
      exited();
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
            : "业务进程已退出，请刷新运行记录；中断任务须显式重试",
        ),
      );
    }
    this.pending.clear();
  }
  async request(command: RuntimeCommand, credentials?: ModelCredentials): Promise<RuntimeResult> {
    if (this.closing || this.pending.size >= 50)
      return failure("CAPABILITY_UNAVAILABLE", "业务进程暂不可用，请重试");
    // An exit event is the only place that clears child. No overlapping writers and
    // no request replay: a later user query may create a fresh, recovery-only worker.
    if (!this.child) this.start();
    const child = this.child;
    if (!(await this.ready) || !child || child !== this.child || this.closing)
      return failure("CAPABILITY_UNAVAILABLE", "业务进程尚未就绪，请刷新运行记录");
    if (this.pending.size >= 50) return failure("CAPABILITY_UNAVAILABLE", "业务进程请求过多");
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
                : "保存结果未知，请刷新运行记录；中断任务须显式重试",
            ),
          );
          // Terminate the uncertain writer; do not spawn until its exit is observed.
          child.kill();
        },
        command.method === "agent.read"
          ? 135000
          : command.method === "agent.understand" || command.method === "agent.revise"
            ? 60000
            : 15000,
      );
      this.pending.set(id, { resolve, timer, readOnly: command.method === "agent.read" });
      try {
        child.postMessage({ id, command, ...(credentials ? { credentials } : {}) });
      } catch {
        child.kill();
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(failure("CAPABILITY_UNAVAILABLE", "业务连接中断，请刷新运行记录"));
      }
    });
  }
  async close() {
    this.closing = true;
    this.rejectPending();
    this.child?.kill();
    await this.exit;
  }
}
