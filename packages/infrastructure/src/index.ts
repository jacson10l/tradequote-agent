import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Command,
  type ExecutionContext,
  failure,
  ResultSchema,
  type TradeCommand,
  WorkspaceSchema,
} from "@tradequote/contracts";
import { transitionWorkspace, type WorkspaceRepository } from "@tradequote/domain";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrations";
import { workspace } from "./schema";
import { TradeStore } from "./trade-store";

export { FileArtifactStore } from "./artifacts";
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly db: Database.Database;
  private readonly orm: ReturnType<typeof drizzle>;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    try {
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = FULL");
      migrate(this.db);
      this.orm = drizzle(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  read() {
    const row = this.orm.select().from(workspace).get();
    if (!row) return null;
    const { slot: _slot, ...data } = row;
    return WorkspaceSchema.parse(data);
  }
  commit(command: Exclude<Command, { method: "workspace.get" }>, context: ExecutionContext) {
    return this.db
      .transaction(() => {
        // requestId changes on transport retry; the command identity does not.
        const hash = createHash("sha256")
          .update(JSON.stringify({ method: command.method, payload: command.payload, context }))
          .digest("hex");
        const prior = this.db
          .prepare("SELECT request_hash, result_json FROM idempotency WHERE key=?")
          .get(command.idempotencyKey) as { request_hash: string; result_json: string } | undefined;
        if (prior)
          return prior.request_hash === hash
            ? ResultSchema.parse(JSON.parse(prior.result_json))
            : failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        const now = new Date().toISOString();
        const result = transitionWorkspace(this.read(), command, randomUUID(), now);
        if (!result.ok || !result.data) return result;
        this.orm
          .insert(workspace)
          .values({ slot: 1, ...result.data })
          .onConflictDoUpdate({
            target: workspace.slot,
            set: { name: result.data.name, version: result.data.version },
          })
          .run();
        this.db
          .prepare(
            "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            result.data.id,
            command.method,
            JSON.stringify(result.data),
            JSON.stringify(context),
            now,
          );
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(command.idempotencyKey, hash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }
  executeTrade(command: TradeCommand, context: ExecutionContext) {
    return new TradeStore(this.db).execute(command, context);
  }
  agentReplay(command: import("@tradequote/contracts").AgentCommand) {
    return new TradeStore(this.db).replay(command);
  }
  commitAgent(
    command: import("@tradequote/contracts").AgentCommand,
    proposal:
      | import("@tradequote/contracts").Understanding
      | import("@tradequote/contracts").RevisionProposal,
    model: string,
  ) {
    return new TradeStore(this.db).commitAgent(command, proposal, model);
  }
  close() {
    this.db.close();
  }
}

export { AgentExecutor } from "./agent-executor";
export { CatalogQuoteReadService } from "./catalog-quote-read-service";
export { DeepSeekProvider } from "./deepseek";

export { ModelSettingsStore } from "./model-settings";
