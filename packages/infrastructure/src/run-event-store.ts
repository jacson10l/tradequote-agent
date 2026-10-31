import { randomUUID } from "node:crypto";
import {
  type AgentRun,
  type AgentToolStep,
  type RunEvent,
  RunEventSchema,
  RunEventsPageSchema,
  type RunEventsQuery,
  RunEventsQuerySchema,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import type Database from "better-sqlite3";

// Append-only durable journal in the existing transactional outbox. These rows must
// never be consumed/deleted by an ephemeral notification dispatcher.
const namespace = "agent.run.event.v1";
type Row = { seq: number; event_id: string; payload_json: string };
export class RunEventStore {
  constructor(
    private readonly db: Database.Database,
    private readonly workspaceId: string,
  ) {}
  private decode(row: Row) {
    const event = RunEventSchema.parse(JSON.parse(row.payload_json));
    if (event.eventId !== row.event_id) throw new TradeFault("STORAGE_ERROR", "运行事件身份不一致");
    return event;
  }
  private head(runId: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(json_extract(payload_json,'$.seq')),0) AS head FROM outbox WHERE workspace_id=? AND type=? AND json_extract(payload_json,'$.runId')=?",
      )
      .get(this.workspaceId, namespace, runId) as { head: number };
    return row.head;
  }
  append(run: AgentRun, step?: AgentToolStep) {
    if (!this.db.inTransaction)
      throw new TradeFault("STORAGE_ERROR", "运行事件必须与业务同事务保存");
    let seq = this.head(run.runId);
    const append = (body: Pick<RunEvent, "type" | "payload">) => {
      const event = RunEventSchema.parse({
        schemaVersion: 1,
        eventId: randomUUID(),
        runId: run.runId,
        seq: ++seq,
        timestamp: run.updatedAt,
        ...body,
      });
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          event.eventId,
          this.workspaceId,
          namespace,
          JSON.stringify(event),
          JSON.stringify({ actorId: "local-user", origin: "system_job" }),
          event.timestamp,
        );
    };
    if (step)
      append({
        type: "tool.completed",
        payload: { toolCallId: step.toolCallId, toolName: step.tool, ok: step.ok },
      });
    append({
      type: "run.updated",
      payload: {
        status: run.status,
        attempt: run.attempt,
        committedRevisionId: run.committedRevisionId,
        errorCode: run.error?.code ?? null,
      },
    });
  }
  page(input: RunEventsQuery, run: AgentRun) {
    const query = RunEventsQuerySchema.parse(input),
      headSeq = this.head(run.runId);
    if (query.runId !== run.runId || query.afterSeq > headSeq)
      throw new TradeFault("VALIDATION_ERROR", "运行事件游标不属于当前历史");
    const rows = this.db
      .prepare(
        "SELECT seq,event_id,payload_json FROM outbox WHERE workspace_id=? AND type=? AND json_extract(payload_json,'$.runId')=? AND json_extract(payload_json,'$.seq')>? ORDER BY json_extract(payload_json,'$.seq') LIMIT ?",
      )
      .all(this.workspaceId, namespace, run.runId, query.afterSeq, query.limit) as Row[];
    const events = rows.map((row) => this.decode(row));
    const nextSeq = query.afterSeq + events.length;
    return RunEventsPageSchema.parse({
      run,
      events,
      afterSeq: query.afterSeq,
      nextSeq,
      headSeq,
      hasMore: nextSeq < headSeq,
    });
  }
  // Called by a timer only outside synchronous business transactions. Outbox seq is
  // just a dispatcher cursor; public event.seq is contiguous within each run.
  hints(afterOutboxSeq: number) {
    if (this.db.inTransaction) throw new TradeFault("STORAGE_ERROR", "事务提交前不可发布运行提示");
    const rows = this.db
      .prepare(
        "SELECT seq,event_id,payload_json FROM outbox WHERE workspace_id=? AND type=? AND seq>? ORDER BY seq LIMIT 100",
      )
      .all(this.workspaceId, namespace, afterOutboxSeq) as Row[];
    return {
      cursor: rows.at(-1)?.seq ?? afterOutboxSeq,
      hints: rows.map((row) => {
        const e = this.decode(row);
        return { type: "events.available" as const, runId: e.runId, seq: e.seq };
      }),
    };
  }
}
