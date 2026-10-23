import { createHash, randomUUID } from "node:crypto";
import {
  AgentCommandSchema,
  type AgentRun,
  AgentRunSchema,
  type AgentToolStep,
  AgentToolStepSchema,
  ClarificationSchema,
  failure,
  ModelCredentialsSchema,
  type RevisionProposal,
  RevisionProposalSchema,
  type RunCommand,
  RunCommandSchema,
  type RunEventsQuery,
  type RunListQuery,
  RunListQuerySchema,
  type Understanding,
  UnderstandingSchema,
} from "@tradequote/contracts";
import { TradeFault, transitionAgentRun } from "@tradequote/domain";
import type Database from "better-sqlite3";
import { z } from "zod";
import { SqliteKnowledgeStore } from "./knowledge-store";
import {
  checkDraft,
  checkedKnowledge,
  type DraftAuthorization,
  DraftAuthorizationSchema,
  digest,
  draftPlan,
  knowledgeQuery,
  knowledgeStamp,
  semanticQuote,
} from "./quote-draft-plan";
import { RunEventStore } from "./run-event-store";
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
    if (run.toolSteps) {
      const steps = (
        this.db
          .prepare(
            "SELECT data_json FROM agent_tool_step WHERE run_id=? AND attempt=? ORDER BY ordinal",
          )
          .all(run.runId, run.attempt) as { data_json: string }[]
      ).map((row) => AgentToolStepSchema.parse(JSON.parse(row.data_json)));
      if (digest(steps) !== digest(run.toolSteps))
        throw new TradeFault("STORAGE_ERROR", "运行步骤与工具账本不一致");
    }
    if (run.validation?.kind === "saved_revision") {
      const receipt = this.db
        .prepare(
          "SELECT validation_json FROM agent_write_call WHERE run_id=? AND status='committed'",
        )
        .get(run.runId) as { validation_json: string | null } | undefined;
      if (!receipt?.validation_json) throw new TradeFault("STORAGE_ERROR", "缺少已保存校验依据");
      const proof = DraftAuthorizationSchema.parse(JSON.parse(receipt.validation_json));
      const report = run.validation.report;
      const knowledgeStore = new SqliteKnowledgeStore(this.db);
      const knowledge = checkedKnowledge({
        ok: true,
        data: {
          kind: "list",
          revisions: report.ruleRevisionIds.map((id) => knowledgeStore.getRevision(id)),
        },
        warnings: [],
        evidenceIds: [],
      });
      const board = this.trades.execute(
        { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
        { actorId: "local-user", origin: "agent_tool" },
      );
      const quote = board.ok
        ? board.data.quotes.find((quote) => quote.id === run.committedRevisionId)
        : undefined;
      if (
        !quote ||
        knowledgeStamp(knowledge) !== proof.knowledgeStamp ||
        digest(semanticQuote(quote)) !== digest(semanticQuote(proof.calculated)) ||
        digest(checkDraft(quote, knowledge, report.checkedAt, report.reportId)) !== digest(report)
      )
        throw new TradeFault("STORAGE_ERROR", "检查报告与已保存报价或来源不一致");
    }
    return run;
  }
  private event(run: AgentRun, type = `agent.run.${run.status}`) {
    this.db
      .prepare(
        "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        this.workspaceId(),
        type,
        JSON.stringify({
          runId: run.runId,
          attempt: run.attempt,
          status: run.status,
          committedRevisionId: run.committedRevisionId,
        }),
        context,
        run.updatedAt,
      );
    new RunEventStore(this.db, this.workspaceId()).append(
      run,
      type === "agent.tool.completed" ? run.toolSteps?.at(-1) : undefined,
    );
  }
  private save(run: AgentRun, ticket: RunTicket | null = null, eventType?: string): AgentRun {
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
    if (checked.status !== "running")
      this.db
        .prepare(
          "UPDATE agent_write_call SET status='abandoned' WHERE run_id=? AND status='prepared'",
        )
        .run(run.runId);
    this.event(checked, eventType);
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
  isCurrentExecution(ticket: RunTicket): boolean {
    return this.transaction(() => this.current(ticket).matches);
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
  events(input: RunEventsQuery) {
    return this.transaction(() => {
      const run = this.decode(this.row(z.uuid().parse(input.runId)));
      return new RunEventStore(this.db, this.workspaceId()).page(input, run);
    });
  }
  eventHints(cursor: number) {
    return new RunEventStore(this.db, this.workspaceId()).hints(cursor);
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
        error: failure(
          code,
          code === "MODEL_AUTH_FAILED"
            ? "模型鉴权失败，请检查模型设置后显式重试"
            : code === "MODEL_INVALID_OUTPUT"
              ? "模型建议未通过字段校验，请补充要求后显式重试"
              : code === "REVISION_CONFLICT"
                ? "报价或场景已有新版本，请加载最新事实并新建任务"
                : "运行失败，请检查模型配置、输入和当前报价后显式重试",
        ).error,
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
  /** Persist host-generated call identity before executing a draft mutation. */
  prepareWrite(
    ticket: RunTicket,
    toolCallId: string,
    proposal: Understanding | RevisionProposal,
    model: string,
  ) {
    return this.transaction(() => {
      z.uuid().parse(toolCallId);
      const current = this.current(ticket);
      const input = {
        proposal: (current.run.command.method === "agent.understand"
          ? UnderstandingSchema
          : RevisionProposalSchema
        ).parse(proposal),
        model: ModelCredentialsSchema.shape.model.parse(model),
      };
      const toolName =
        current.run.command.method === "agent.understand" ? "create_draft" : "apply_patch";
      const hash = fingerprint({ toolName, input });
      const prior = this.writeRow(ticket.runId, toolCallId);
      if (prior) {
        let storedInput: unknown;
        try {
          const persisted = JSON.parse(prior.input_json);
          storedInput = {
            proposal: (current.run.command.method === "agent.understand"
              ? UnderstandingSchema
              : RevisionProposalSchema
            ).parse(persisted.proposal),
            model: ModelCredentialsSchema.shape.model.parse(persisted.model),
          };
          if (
            prior.tool_name !== toolName ||
            fingerprint({ toolName, input: storedInput }) !== prior.request_hash
          )
            throw new Error("mismatch");
        } catch {
          throw new TradeFault("STORAGE_ERROR", "写工具调用记录损坏");
        }
        if (prior.request_hash !== hash)
          throw new TradeFault("IDEMPOTENCY_CONFLICT", "写工具调用标识已用于不同参数");
        if (prior.status === "committed") {
          if (
            current.run.status !== "completed" ||
            current.run.committedRevisionId !== prior.revision_id
          )
            throw new TradeFault("STORAGE_ERROR", "写工具提交凭据不一致");
          return true;
        }
        return (
          current.matches &&
          prior.status === "prepared" &&
          prior.execution_id === ticket.executionId &&
          prior.worker_session_id === ticket.workerSessionId &&
          prior.attempt === ticket.attempt
        );
      }
      if (!current.matches) return false;
      this.db
        .prepare(
          `INSERT INTO agent_write_call(run_id,tool_call_id,attempt,execution_id,worker_session_id,tool_name,request_hash,input_json,status) VALUES (?,?,?,?,?,?,?,?,'prepared')`,
        )
        .run(
          ticket.runId,
          toolCallId,
          ticket.attempt,
          ticket.executionId,
          ticket.workerSessionId,
          toolName,
          hash,
          JSON.stringify(input),
        );
      return true;
    });
  }
  private writeRow(runId: string, toolCallId: string) {
    return this.db
      .prepare("SELECT * FROM agent_write_call WHERE run_id=? AND tool_call_id=?")
      .get(runId, toolCallId) as
      | {
          attempt: number;
          execution_id: string;
          worker_session_id: string;
          request_hash: string;
          status: "prepared" | "committed" | "abandoned";
          tool_name: string;
          revision_id: string | null;
          input_json: string;
          validation_json: string | null;
        }
      | undefined;
  }
  /** Receipt, quote, turn, business idempotency and completed run share one COMMIT. */
  commitWrite(
    ticket: RunTicket,
    toolCallId: string,
    proposal: Understanding | RevisionProposal,
    model: string,
  ): AgentRun {
    return this.transaction(() => {
      if (!this.prepareWrite(ticket, toolCallId, proposal, model)) return this.current(ticket).run;
      const prior = this.writeRow(ticket.runId, toolCallId);
      if (!prior) throw new TradeFault("STORAGE_ERROR", "写工具调用记录缺失");
      if (prior.status === "committed") return this.current(ticket).run;
      // save() retires prepared calls; this receipt is promoted to committed below
      // in the same outer transaction. No abandoned intermediate state is observable.
      const done = this.commitQuote(ticket, proposal, model);
      if (done.status !== "completed" || !done.committedRevisionId)
        throw new TradeFault("STORAGE_ERROR", "写工具未产生已保存版本");
      this.db
        .prepare(
          "UPDATE agent_write_call SET status='committed',revision_id=? WHERE run_id=? AND tool_call_id=?",
        )
        .run(done.committedRevisionId, ticket.runId, toolCallId);
      return done;
    });
  }

  recordToolStep(
    ticket: RunTicket,
    step: AgentToolStep,
    validation?: NonNullable<AgentRun["validation"]>,
  ): AgentRun {
    return this.transaction(() => {
      const current = this.current(ticket);
      if (!current.matches) return current.run;
      return this.appendToolStep(current.run, step, ticket, validation);
    });
  }
  private appendToolStep(
    run: AgentRun,
    input: AgentToolStep,
    ticket: RunTicket | null,
    validation?: NonNullable<AgentRun["validation"]>,
  ): AgentRun {
    const step = AgentToolStepSchema.parse(input);
    const prior = this.db
      .prepare(
        "SELECT data_json FROM agent_tool_step WHERE run_id=? AND attempt=? AND tool_call_id=?",
      )
      .get(run.runId, run.attempt, step.toolCallId) as { data_json: string } | undefined;
    if (prior) {
      if (prior.data_json !== JSON.stringify(step))
        throw new TradeFault("IDEMPOTENCY_CONFLICT", "工具调用身份已用于其他步骤");
      return run;
    }
    if (step.attempt !== run.attempt || step.ordinal !== (run.toolSteps?.length ?? 0) + 1)
      throw new TradeFault("VALIDATION_ERROR", "工具步骤次序无效");
    this.db
      .prepare("INSERT INTO agent_tool_step VALUES (?,?,?,?,?)")
      .run(run.runId, run.attempt, step.toolCallId, step.ordinal, JSON.stringify(step));
    return this.save(
      {
        ...run,
        toolSteps: [...(run.toolSteps ?? []), step],
        ...(["calculate_quote", "search_knowledge"].includes(step.tool)
          ? { validation: undefined }
          : {}),
        ...(validation ? { validation } : {}),
        updatedAt: this.now(run),
      },
      ticket,
      "agent.tool.completed",
    );
  }
  prepareValidatedWrite(
    ticket: RunTicket,
    toolCallId: string,
    proposal: Understanding | RevisionProposal,
    model: string,
    authorization: DraftAuthorization,
  ) {
    return this.transaction(() => {
      const proof = DraftAuthorizationSchema.parse(authorization);
      if (!this.prepareWrite(ticket, toolCallId, proposal, model)) return false;
      const row = this.writeRow(ticket.runId, toolCallId);
      if (!row) throw new TradeFault("STORAGE_ERROR", "写工具调用记录缺失");
      const json = JSON.stringify(proof);
      if (row.validation_json !== null && row.validation_json !== json)
        throw new TradeFault("IDEMPOTENCY_CONFLICT", "写工具调用校验依据发生变化");
      if (row.status === "committed") return true;
      this.db
        .prepare(
          "UPDATE agent_write_call SET validation_json=? WHERE run_id=? AND tool_call_id=? AND status='prepared'",
        )
        .run(json, ticket.runId, toolCallId);
      return true;
    });
  }
  /** Recheck the live published facts and prices inside the same write transaction.
   * No model value can substitute for these host-owned validation inputs. */
  commitValidatedWrite(
    ticket: RunTicket,
    toolCallId: string,
    proposal: Understanding | RevisionProposal,
    model: string,
    authorization: DraftAuthorization,
  ): AgentRun {
    return this.transaction(() => {
      if (!this.prepareValidatedWrite(ticket, toolCallId, proposal, model, authorization))
        return this.current(ticket).run;
      const current = this.current(ticket);
      if (!current.matches) return current.run;
      const proof = DraftAuthorizationSchema.parse(authorization);
      if (
        proof.asOf !== proof.calculated.createdAt ||
        proof.asOf.slice(0, 10) !== new Date().toISOString().slice(0, 10)
      )
        throw new TradeFault("SOURCE_EXPIRED", "核价日期已变化，请重新计算");
      const result = this.trades.execute(
        { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
        { actorId: "local-user", origin: "agent_tool" },
      );
      if (!result.ok) throw new TradeFault(result.error.code, result.error.message);
      const planned = draftPlan(
        result.data,
        current.run.command,
        proposal,
        this.workspaceId(),
        proof.asOf,
        proof.calculated.id,
      );
      if (digest(semanticQuote(planned)) !== digest(semanticQuote(proof.calculated)))
        throw new TradeFault("SOURCE_CONFLICT", "核价候选与当前资料不一致，请重新核价");
      const at = this.now();
      const knowledge = checkedKnowledge({
        ok: true,
        data: {
          kind: "list",
          revisions: new SqliteKnowledgeStore(this.db).findPublished(knowledgeQuery(planned, at)),
        },
        warnings: [],
        evidenceIds: [],
      });
      if (knowledgeStamp(knowledge) !== proof.knowledgeStamp)
        throw new TradeFault("SOURCE_CONFLICT", "适用知识版本已变化，请重新检索校验");
      const checked = checkDraft(planned, knowledge, at);
      if (checked.issues.some((issue) => issue.severity === "block"))
        throw new TradeFault("RULE_BLOCKED", "候选仍有阻断规则问题，未保存");
      const done = this.commitWrite(ticket, toolCallId, proposal, model);
      const saved = this.trades.execute(
        { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
        { actorId: "local-user", origin: "agent_tool" },
      );
      if (!saved.ok) throw new TradeFault(saved.error.code, saved.error.message);
      const quote = saved.data.quotes.find((quote) => quote.id === done.committedRevisionId);
      if (!quote || digest(semanticQuote(quote)) !== digest(semanticQuote(planned)))
        throw new TradeFault("SOURCE_CONFLICT", "实际保存与已核价候选不一致");
      return this.appendToolStep(
        done,
        {
          toolCallId,
          attempt: done.attempt,
          ordinal: (done.toolSteps?.length ?? 0) + 1,
          tool: done.command.method === "agent.understand" ? "create_draft" : "apply_patch",
          ok: true,
          errorCode: null,
          evidenceIds: [quote.id],
        },
        null,
        { kind: "saved_revision", report: checkDraft(quote, knowledge, at) },
      );
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
            toolSteps: status === "queued" && run.toolSteps ? [] : run.toolSteps,
            validation: status === "queued" ? undefined : run.validation,
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
