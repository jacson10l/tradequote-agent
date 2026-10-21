import { randomUUID } from "node:crypto";
import {
  type AgentCommand,
  AgentCommandSchema,
  type AgentRun,
  ClarificationSchema,
  failure,
  type ModelCredentials,
  RevisionProposalSchema,
  type RunCommand,
  RunCommandSchema,
  type RunListResult,
  type RunResult,
  type TradeResult,
  UnderstandingSchema,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import { AgentExecutor } from "./agent-executor";
import type { RunTicket } from "./agent-run-store";
import type { DeepSeekProvider } from "./deepseek";
import { DeepSeekProvider as DefaultProvider } from "./deepseek";
import type { SqliteWorkspaceRepository } from "./index";
import { QuoteToolAgent } from "./quote-tool-agent";

const ok = <T>(data: T) => ({ ok: true as const, data, warnings: [], evidenceIds: [] });
const fault = (error: unknown) =>
  error instanceof TradeFault
    ? failure(error.code, error.message)
    : failure("STORAGE_ERROR", "运行状态保存失败，请重新查询；不会自动重发模型请求");

/** One instance per exclusively owned worker. Both legacy and run IPC enter here.
 * Construct only after acquiring WorkerOwnership; recovery never dispatches. */
export class AgentRunCoordinator {
  private readonly store;
  private readonly generator: AgentExecutor;
  private readonly sessionId = randomUUID();
  private closed = false;
  private readonly active = new Map<
    string,
    {
      ticket: RunTicket;
      controller: AbortController;
      promise: Promise<AgentRun>;
    }
  >();
  constructor(
    private readonly repository: SqliteWorkspaceRepository,
    private readonly provider?: (credentials: ModelCredentials) => Pick<DeepSeekProvider, "json">,
  ) {
    this.store = repository.runStore();
    this.generator = new AgentExecutor(repository, provider);
    // An empty workspace has no runs to recover yet.
    if (repository.read()) this.store.recoverOnStartup();
  }
  execute(input: RunCommand, credentials?: ModelCredentials): RunResult | RunListResult {
    const parsed = RunCommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR", "运行请求字段不合法");
    if (this.closed) return failure("CAPABILITY_UNAVAILABLE", "业务进程正在关闭");
    try {
      const command = parsed.data;
      if (command.method === "agent.get") return ok(this.store.get(command.payload.runId));
      if (command.method === "agent.list") return ok(this.store.list(command.payload));
      const effect =
        command.method === "agent.start" ? this.store.start(command) : this.store.control(command);
      // Storage commits first. Replayed controls contain no effects.
      if (effect.abort) {
        const active = this.active.get(effect.abort.runId);
        if (active?.ticket.executionId === effect.abort.executionId) active.controller.abort();
      }
      if (effect.dispatch) this.dispatch(effect.dispatch, credentials);
      return ok(effect.run);
    } catch (error) {
      return fault(error);
    }
  }
  async executeLegacy(input: AgentCommand, credentials?: ModelCredentials): Promise<TradeResult> {
    const parsed = AgentCommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR", "对话请求字段不合法");
    const command = parsed.data;
    const start = RunCommandSchema.parse({
      ...command,
      method: "agent.start",
      payload: { method: command.method, payload: command.payload },
    });
    const result = this.execute(start, credentials);
    if (!result.ok) return result;
    if (!("runId" in result.data)) return failure("STORAGE_ERROR", "运行结果不一致");
    try {
      const pending = this.active.get(result.data.runId);
      const run = pending ? await pending.promise : this.store.get(result.data.runId);
      if (run.status === "completed") {
        const replay = this.repository.agentReplay(command);
        return replay ?? failure("STORAGE_ERROR", "提交凭据缺失");
      }
      if (run.status === "waiting_input")
        return failure("MISSING_FACTS", `需要补充：${run.clarification}`);
      if (run.status === "cancelled") return failure("CANCELLED", "请求已取消，未提交新版本");
      return run.error
        ? { ok: false, error: run.error }
        : failure("CAPABILITY_UNAVAILABLE", "请查询运行记录并显式重试");
    } catch (error) {
      return fault(error);
    }
  }
  private dispatch(job: { runId: string; attempt: number }, credentials?: ModelCredentials) {
    const claimed = this.store.claim(job.runId, job.attempt, this.sessionId);
    if (!claimed.ticket) return;
    const ticket = claimed.ticket;
    const controller = new AbortController();
    const overloaded = this.active.size >= 2;
    // Defer execution until the active identity is registered, even for sync failures.
    const promise = Promise.resolve()
      .then(() => this.run(claimed.run, ticket, controller.signal, credentials, overloaded))
      .finally(() => {
        if (this.active.get(job.runId)?.ticket.executionId === ticket.executionId)
          this.active.delete(job.runId);
      });
    // Store failures stay discoverable as running; a failed persistence attempt must
    // not become an unhandled rejection when the start caller doesn't await completion.
    void promise.catch(() => {});
    this.active.set(job.runId, { ticket, controller, promise });
  }
  private async run(
    run: AgentRun,
    ticket: RunTicket,
    cancellation: AbortSignal,
    credentials: ModelCredentials | undefined,
    overloaded: boolean,
  ): Promise<AgentRun> {
    try {
      if (overloaded)
        throw new TradeFault("CAPABILITY_UNAVAILABLE", "已有模型请求运行中，请稍后显式重试");
      if (!credentials) throw new TradeFault("MODEL_AUTH_FAILED", "请先保存模型设置");
      if (cancellation.aborted || this.closed) return this.store.get(run.runId);
      if (run.command.payload.executionMode === "tool_loop")
        return await new QuoteToolAgent(
          this.repository,
          this.store,
          this.provider?.(credentials) ?? new DefaultProvider(credentials),
          ticket,
          run.command,
          credentials.model,
        ).run(cancellation);
      const deadline = AbortSignal.timeout(50000);
      const signal = AbortSignal.any([cancellation, deadline]);
      let onAbort = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () =>
          reject(
            new TradeFault(
              cancellation.aborted && signal.reason === cancellation.reason
                ? "CANCELLED"
                : "MODEL_TIMEOUT",
              "模型调用已终止",
            ),
          );
        signal.addEventListener("abort", onAbort, { once: true });
      });
      let output: unknown;
      try {
        output = await Promise.race([
          this.generator.propose(run.command, credentials, signal),
          aborted,
        ]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      if (signal.aborted || this.closed) return this.store.get(run.runId);
      const clarification = ClarificationSchema.safeParse(output);
      if (clarification.success)
        return this.store.waitForInput(ticket, clarification.data.clarification);
      const proposal = (
        run.command.method === "agent.understand" ? UnderstandingSchema : RevisionProposalSchema
      ).safeParse(output);
      if (!proposal.success) throw new TradeFault("MODEL_INVALID_OUTPUT", "模型建议未通过字段校验");
      const toolCallId = randomUUID();
      if (!this.store.prepareWrite(ticket, toolCallId, proposal.data, credentials.model))
        return this.store.get(run.runId);
      return this.store.commitWrite(ticket, toolCallId, proposal.data, credentials.model);
    } catch (error) {
      if (this.closed) return this.store.get(run.runId);
      return this.store.fail(
        ticket,
        error instanceof TradeFault
          ? error.code
          : cancellation.aborted
            ? "CANCELLED"
            : "STORAGE_ERROR",
      );
    }
  }
  /** Stop admission/abort network first; host must still await process exit before reuse. */
  async close() {
    this.closed = true;
    for (const active of this.active.values()) active.controller.abort();
    await Promise.allSettled([...this.active.values()].map((active) => active.promise));
  }
}
