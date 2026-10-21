import { createHash, randomUUID } from "node:crypto";
import {
  AgentCommandSchema,
  type AgentRun,
  AgentRunSchema,
  ClarificationSchema,
  failure,
  ModelCredentialsSchema,
  type RevisionProposal,
  type RunCommand,
  RunCommandSchema,
  type RunListQuery,
  RunListQuerySchema,
  type Understanding,
} from "@tradequote/contracts";
import { TradeFault, transitionAgentRun } from "@tradequote/domain";
import type Database from "better-sqlite3";
import { z } from "zod";
import { TradeStore } from "./trade-store";

export interface RunTicket {
  runId: string;
  attempt: number;
  executionId: string;
  workerSessionId: string;
}
interface Row {
  data_json: string;
  request_hash: string;
  execution_id: string | null;
  worker_session_id: string | null;
}
interface Effect {
  run: AgentRun;
  dispatch: { runId: string; attempt: number } | null;
  abort: RunTicket | null;
}
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const context = JSON.stringify({ actorId: "local-user", origin: "system_job" });

/** Internal storage prerequisite. No scheduler, credentials, IPC or automatic retries. */
export class AgentRunStore {
  private readonly trades: TradeStore;
  constructor(private readonly db: Database.Database) {
    this.trades = new TradeStore(db);
  }

  private transaction<T>(work: () => T): T {
    try {
      return this.db.transaction(work).immediate();
    } catch (error) {
      if (error instanceof TradeFault) throw error;
      throw new TradeFault("STORAGE_ERROR", "运行记录读写失败，请保留操作标识并查询当前状态");
    }
  }
  private workspaceId(): string {
    const row = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
      | { id: string }
      | undefined;
    if (!row) throw new TradeFault("NOT_FOUND", "请先创建工作区");
    return row.id;
  }
  private row(runId: string): Row {
    const row = this.db
      .prepare("SELECT * FROM agent_run WHERE workspace_id=? AND run_id=?")
      .get(this.workspaceId(), runId) as Row | undefined;
    if (!row) throw new TradeFault("NOT_FOUND", "运行不存在");
    return row;
  }
  private decode(row: Row): AgentRun {
    const run = AgentRunSchema.parse(JSON.parse(row.data_json));
    if (
      row.request_hash !==
        fingerprint({ method: run.command.method, payload: run.command.payload }) ||
      (run.status === "running") !== (row.execution_id !== null && row.worker_session_id !== null)
    )
      throw new TradeFault("STORAGE_ERROR", "运行记录与执行凭据不一致");
    if (
      run.status === "completed" &&
      this.trades.committedAgentRevision(run.command) !== run.committedRevisionId
    )
      throw new TradeFault("STORAGE_ERROR", "运行提交引用不一致");
    return run;
  }
  private event(run: AgentRun) {
    this.db
      .prepare(
        "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        this.workspaceId(),
        `agent.run.${run.status}`,
        JSON.stringify({
          runId: run.runId,
          attempt: run.attempt,
          status: run.status,
          committedRevisionId: run.committedRevisionId,
        }),
        context,
        run.updatedAt,
      );
  }
  private save(run: AgentRun, ticket: RunTicket | null = null): AgentRun {
    const checked = AgentRunSchema.parse(run);
    this.db
      .prepare(
        "UPDATE agent_run SET data_json=?, execution_id=?, worker_session_id=? WHERE workspace_id=? AND run_id=?",
      )
      .run(
        JSON.stringify(checked),
        ticket?.executionId ?? null,
        ticket?.workerSessionId ?? null,
        this.workspaceId(),
        run.runId,
      );
    this.event(checked);
    return checked;
  }
  private now(run?: AgentRun) {
    return new Date(Math.max(Date.now(), Date.parse(run?.updatedAt ?? "1970-01-01"))).toISOString();
  }
  private ticket(run: AgentRun, row: Row): RunTicket | null {
    return row.execution_id && row.worker_session_id
      ? {
          runId: run.runId,
          attempt: run.attempt,
          executionId: row.execution_id,
          workerSessionId: row.worker_session_id,
        }
      : null;
  }
  private current(ticket: RunTicket): { run: AgentRun; matches: boolean } {
    const row = this.row(ticket.runId),
      run = this.decode(row);
    return {
      run,
      matches:
        run.status === "running" &&
        run.attempt === ticket.attempt &&
        row.execution_id === ticket.executionId &&
        row.worker_session_id === ticket.workerSessionId,
    };
  }
  get(runId: string): AgentRun {
    return this.transaction(() => this.decode(this.row(z.uuid().parse(runId))));
  }
  list(input: RunListQuery = {}): {
    runs: AgentRun[];
    nextCursor: { createdAt: string; runId: string } | null;
  } {
    return this.transaction(() => {
      const query = RunListQuerySchema.parse(input);
      const rows = this.db
        .prepare(`SELECT * FROM agent_run WHERE workspace_id=?
        AND (? IS NULL OR json_extract(data_json,'$.status')=?)
        AND (? IS NULL OR (json_extract(data_json,'$.createdAt'),run_id) > (?,?))
        ORDER BY json_extract(data_json,'$.createdAt'),run_id LIMIT ?`)
        .all(
          this.workspaceId(),
          query.status ?? null,
          query.status ?? null,
          query.cursor?.createdAt ?? null,
          query.cursor?.createdAt ?? null,
          query.cursor?.runId ?? null,
          query.limit + 1,
        ) as Row[];
      const runs = rows.slice(0, query.limit).map((row) => this.decode(row));
      const last = runs.at(-1);
      return {
        runs,
        nextCursor:
          rows.length > query.limit && last
            ? { createdAt: last.createdAt, runId: last.runId }
            : null,
      };
    });
  }
  start(input: Extract<RunCommand, { method: "agent.start" }>): Effect {
    const command = RunCommandSchema.options[0].parse(input);
    return this.transaction(() => {
      const workspaceId = this.workspaceId();
      const hash = fingerprint(command.payload);
      const prior = this.db
        .prepare("SELECT * FROM agent_run WHERE workspace_id=? AND operation_key=?")
        .get(workspaceId, command.idempotencyKey) as Row | undefined;
      if (prior) {
        if (prior.request_hash !== hash)
          throw new TradeFault("IDEMPOTENCY_CONFLICT", "同一业务标识不能用于不同内容");
        return { run: this.decode(prior), dispatch: null, abort: null };
      }
      const operation = AgentCommandSchema.parse({ ...command, ...command.payload });
      const committedRevisionId = this.trades.committedAgentRevision(operation);
      const now = this.now();
      const run = AgentRunSchema.parse({
        runId: randomUUID(),
        operationKey: command.idempotencyKey,
        command: operation,
        status: committedRevisionId ? "completed" : "queued",
        attempt: 1,
        createdAt: now,
        updatedAt: now,
        baseRevisionId: operation.method === "agent.revise" ? operation.payload.baseId : null,
        committedRevisionId,
        error: null,
        clarification: null,
      });
      this.db
        .prepare(
          "INSERT INTO agent_run(run_id,workspace_id,operation_key,request_hash,data_json) VALUES (?,?,?,?,?)",
        )
        .run(run.runId, workspaceId, run.operationKey, hash, JSON.stringify(run));
      this.event(run);
      return {
        run,
        dispatch: committedRevisionId ? null : { runId: run.runId, attempt: run.attempt },
        abort: null,
      };
    });
  }
  claim(
    runId: string,
    expectedAttempt: number,
    workerSessionId: string,
  ): { run: AgentRun; ticket: RunTicket | null } {
    z.uuid().parse(workerSessionId);
    return this.transaction(() => {
      const run = this.decode(this.row(runId));
      if (run.status !== "queued" || run.attempt !== expectedAttempt) return { run, ticket: null };
      const ticket = { runId, attempt: run.attempt, executionId: randomUUID(), workerSessionId };
      return {
        run: this.save(
          { ...run, status: transitionAgentRun(run.status, "begin"), updatedAt: this.now(run) },
          ticket,
        ),
        ticket,
      };
    });
  }
  waitForInput(ticket: RunTicket, clarification: string): AgentRun {
    return this.transaction(() => {
      const current = this.current(ticket);
      if (!current.matches) return current.run;
      const parsed = ClarificationSchema.parse({ clarification });
      return this.save({
        ...current.run,
        status: transitionAgentRun(current.run.status, "wait_for_input"),
        clarification: parsed.clarification,
        updatedAt: this.now(current.run),
      });
    });
  }
  // Accept a code only; never persist an arbitrary provider/SQL exception message.
  fail(ticket: RunTicket, code: NonNullable<AgentRun["error"]>["code"]): AgentRun {
    return this.transaction(() => {
      const current = this.current(ticket);
      if (!current.matches) return current.run;
      return this.save({
        ...current.run,
        status: transitionAgentRun(current.run.status, "fail"),
        error: failure(code, "运行失败，请检查模型配置、输入和当前报价后显式重试").error,
        updatedAt: this.now(current.run),
      });
    });
  }
  commitQuote(
    ticket: RunTicket,
    proposal: Understanding | RevisionProposal,
    model: string,
  ): AgentRun {
    return this.transaction(() => {
      const current = this.current(ticket);
      if (!current.matches) return current.run;
      ModelCredentialsSchema.shape.model.parse(model);
      // Existing commitAgent opens a savepoint on this SAME connection. Only this outer
      // transaction commits: quote + turn + business idempotency + run + both outboxes.
      const result = this.trades.commitAgent(current.run.command, proposal, model);
      if (!result.ok) throw new TradeFault(result.error.code, result.error.message);
      const committedRevisionId = this.trades.committedAgentRevision(current.run.command);
      if (!committedRevisionId) throw new TradeFault("STORAGE_ERROR", "报价未产生提交凭据");
      return this.save({
        ...current.run,
        status: transitionAgentRun(current.run.status, "commit"),
        committedRevisionId,
        updatedAt: this.now(current.run),
      });
    });
  }
  control(input: Extract<RunCommand, { method: "agent.cancel" | "agent.retry" }>): Effect {
    const parsed = RunCommandSchema.parse(input);
    if (parsed.method !== "agent.cancel" && parsed.method !== "agent.retry")
      throw new TradeFault("VALIDATION_ERROR", "不是运行控制命令");
    return this.transaction(() => {
      const workspaceId = this.workspaceId(),
        hash = fingerprint({ method: parsed.method, payload: parsed.payload });
      const prior = this.db
        .prepare(
          "SELECT request_hash,result_json FROM agent_run_control WHERE workspace_id=? AND control_key=?",
        )
        .get(workspaceId, parsed.idempotencyKey) as
        | { request_hash: string; result_json: string }
        | undefined;
      if (prior) {
        if (prior.request_hash !== hash)
          throw new TradeFault("IDEMPOTENCY_CONFLICT", "控制标识已用于其他操作");
        return {
          run: AgentRunSchema.parse(JSON.parse(prior.result_json)),
          dispatch: null,
          abort: null,
        };
      }
      const row = this.row(parsed.payload.runId),
        run = this.decode(row);
      const status = transitionAgentRun(
        run.status,
        parsed.method === "agent.cancel" ? "cancel" : "retry",
      );
      const changed = status !== run.status;
      const abort = changed && parsed.method === "agent.cancel" ? this.ticket(run, row) : null;
      const next = changed
        ? this.save({
            ...run,
            status,
            attempt: run.attempt + (status === "queued" ? 1 : 0),
            error: null,
            clarification: null,
            updatedAt: this.now(run),
          })
        : run;
      this.db
        .prepare("INSERT INTO agent_run_control VALUES (?,?,?,?)")
        .run(workspaceId, parsed.idempotencyKey, hash, JSON.stringify(next));
      return {
        run: next,
        abort,
        dispatch:
          changed && status === "queued" ? { runId: run.runId, attempt: next.attempt } : null,
      };
    });
  }
  /** Call only during exclusive worker startup after the previous writer has exited.
   * This primitive cannot establish process ownership; C01c must enforce that boundary. */
  recoverOnStartup(): string[] {
    return this.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT * FROM agent_run WHERE workspace_id=? AND json_extract(data_json,'$.status') IN ('queued','running')",
        )
        .all(this.workspaceId()) as Row[];
      return rows.map((row) => {
        const run = this.decode(row);
        this.save({
          ...run,
          status: transitionAgentRun(run.status, "interrupt"),
          error: failure("CAPABILITY_UNAVAILABLE", "上次运行已中断；不会自动重发模型请求").error,
          updatedAt: this.now(run),
        });
        return run.runId;
      });
    });
  }
}
