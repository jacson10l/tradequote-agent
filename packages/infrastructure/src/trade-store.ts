import { createHash, randomUUID } from "node:crypto";
import {
  type AgentCommand,
  AgentTurnSchema,
  type ExecutionContext,
  failure,
  type ImportBatch,
  ImportBatchSchema,
  ProductSchema,
  QuoteApprovalSchema,
  QuoteSnapshotSchema,
  QuoteV1Schema,
  type RevisionProposal,
  RevisionProposalSchema,
  ScenarioSchema,
  type TradeBoard,
  type TradeCommand,
  type TradeResult,
  TradeResultSchema,
  type Understanding,
  UnderstandingSchema,
} from "@tradequote/contracts";
import {
  approveQuote,
  calculateQuoteV1,
  reviseQuote,
  sortedTiers,
  TradeFault,
  validateListingCompliance,
} from "@tradequote/domain";
import type Database from "better-sqlite3";
import { parseCatalogCsv } from "./catalog-csv";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type JsonRow = { data_json: string };
export class TradeStore {
  constructor(private readonly db: Database.Database) {}
  board(workspaceId: string): TradeBoard {
    const scenario = this.db
      .prepare(
        "SELECT data_json FROM scenario_revision WHERE workspace_id=? ORDER BY version DESC LIMIT 1",
      )
      .get(workspaceId) as JsonRow | undefined;
    const read = (
      table:
        | "catalog_batch"
        | "catalog_product"
        | "quote_v1"
        | "quote_revision"
        | "agent_turn"
        | "quote_approval",
    ) =>
      (
        this.db
          .prepare(`SELECT data_json FROM ${table} WHERE workspace_id=? ORDER BY rowid DESC`)
          .all(workspaceId) as JsonRow[]
      ).map((row) => JSON.parse(row.data_json));
    const approvals =
      this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quote_approval'")
        .get() !== undefined
        ? read("quote_approval").map((value) => QuoteApprovalSchema.parse(value))
        : [];
    return {
      scenario: scenario ? ScenarioSchema.parse(JSON.parse(scenario.data_json)) : null,
      batches: read("catalog_batch").map((value) => ImportBatchSchema.parse(value)),
      products: read("catalog_product").map((value) => ProductSchema.parse(value)),
      quotes: [...read("quote_revision"), ...read("quote_v1")].map((value) =>
        QuoteSnapshotSchema.parse(value),
      ),
      turns: read("agent_turn").map((value) => AgentTurnSchema.parse(value)),
      approvals,
    };
  }
  replay(command: AgentCommand): TradeResult | null {
    const prior = this.db
      .prepare("SELECT request_hash,result_json FROM idempotency WHERE key=?")
      .get(command.idempotencyKey) as { request_hash: string; result_json: string } | undefined;
    if (!prior) return null;
    return prior.request_hash === this.agentHash(command)
      ? TradeResultSchema.parse(JSON.parse(prior.result_json))
      : failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
  }
  // Used by the run transaction to adopt old successes and obtain an exact receipt.
  // Never infer a revision from board order or an unvalidated evidence id alone.
  committedAgentRevision(command: AgentCommand): string | null {
    const replay = this.replay(command);
    if (!replay) return null;
    if (!replay.ok) throw new TradeFault(replay.error.code, replay.error.message);
    const workspace = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
      | { id: string }
      | undefined;
    if (!workspace) throw new TradeFault("NOT_FOUND", "请先创建工作区");
    const [quoteId, turnId] = replay.evidenceIds;
    const savedQuote = replay.data.quotes.find((q) => q.id === quoteId);
    const savedTurn = replay.data.turns.find((t) => t.id === turnId);
    const board = this.board(workspace.id);
    const quote = board.quotes.find((q) => q.id === quoteId);
    const turn = board.turns.find((t) => t.id === turnId);
    const baseId = command.method === "agent.revise" ? command.payload.baseId : null;
    const instruction =
      command.method === "agent.revise" ? command.payload.instruction : command.payload.inquiry;
    if (
      replay.evidenceIds.length !== 2 ||
      !quote ||
      !turn ||
      !savedQuote ||
      !savedTurn ||
      quote.workspaceId !== workspace.id ||
      turn.quoteId !== quote.id ||
      turn.baseId !== baseId ||
      turn.instruction !== instruction ||
      turn.rootId !== (quote.rootId ?? quote.id) ||
      (baseId === null ? quote.version !== 1 : quote.parentId !== baseId) ||
      JSON.stringify(quote) !== JSON.stringify(savedQuote) ||
      JSON.stringify(turn) !== JSON.stringify(savedTurn)
    )
      throw new TradeFault("STORAGE_ERROR", "已保存报价的提交凭据不一致，未重新执行");
    return quote.id;
  }
  private agentHash(command: AgentCommand) {
    return hash(
      JSON.stringify({ method: command.method, payload: command.payload, origin: "agent_tool" }),
    );
  }
  commitAgent(
    command: AgentCommand,
    proposal: Understanding | RevisionProposal,
    model: string,
  ): TradeResult {
    proposal =
      command.method === "agent.understand"
        ? UnderstandingSchema.parse(proposal)
        : RevisionProposalSchema.parse(proposal);
    return this.db
      .transaction((): TradeResult => {
        const replay = this.replay(command);
        if (replay) return replay;
        const workspace = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
          | { id: string }
          | undefined;
        if (!workspace) throw new TradeFault("NOT_FOUND", "请先创建工作区");
        const board = this.board(workspace.id),
          now = new Date().toISOString();
        let quote;
        if (command.method === "agent.understand" && "lines" in proposal) {
          if (!board.scenario) throw new TradeFault("NOT_FOUND", "请先保存场景");
          if (board.scenario.id !== command.payload.scenarioId)
            throw new TradeFault("REVISION_CONFLICT", "场景已变化，请重新加载");
          quote = calculateQuoteV1(
            { ...command.payload, ...proposal },
            board.scenario,
            board.products,
            { id: randomUUID(), workspaceId: workspace.id, createdAt: now },
          );
          const json = JSON.stringify(quote);
          this.db
            .prepare("INSERT INTO quote_v1 VALUES (?,?,?,?,?)")
            .run(quote.id, workspace.id, quote.scenario.id, hash(json), json);
        } else if (command.method === "agent.revise" && "patches" in proposal) {
          const base = board.quotes.find((q) => q.id === command.payload.baseId);
          if (!base) throw new TradeFault("NOT_FOUND", "报价不存在");
          const rootId = base.rootId ?? base.id;
          if (
            base.version !== command.payload.expectedVersion ||
            board.quotes.some((q) => (q.rootId ?? q.id) === rootId && q.version > base.version)
          )
            throw new TradeFault("REVISION_CONFLICT", "报价已有新版本，请重新加载并选择最新版本");
          quote = reviseQuote(base, proposal, { id: randomUUID(), createdAt: now });
          const json = JSON.stringify(quote);
          this.db
            .prepare("INSERT INTO quote_revision VALUES (?,?,?,?,?,?,?)")
            .run(quote.id, workspace.id, rootId, base.id, quote.version, hash(json), json);
        } else throw new TradeFault("MODEL_INVALID_OUTPUT", "模型建议类型不匹配");
        const turn = AgentTurnSchema.parse({
          id: randomUUID(),
          quoteId: quote.id,
          rootId: "rootId" in quote ? quote.rootId : quote.id,
          baseId: command.method === "agent.revise" ? command.payload.baseId : null,
          instruction:
            command.method === "agent.revise"
              ? command.payload.instruction
              : command.payload.inquiry,
          summary: proposal.summary,
          model,
          createdAt: now,
        });
        this.db
          .prepare("INSERT INTO agent_turn VALUES (?,?,?)")
          .run(turn.id, workspace.id, JSON.stringify(turn));
        this.db
          .prepare(
            "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            workspace.id,
            command.method,
            JSON.stringify({ entityId: quote.id, turnId: turn.id }),
            JSON.stringify({ actorId: "local-user", origin: "agent_tool" }),
            now,
          );
        const result: TradeResult = {
          ok: true,
          data: this.board(workspace.id),
          warnings: [],
          evidenceIds: [quote.id, turn.id],
        };
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(command.idempotencyKey, this.agentHash(command), JSON.stringify(result));
        return result;
      })
      .immediate();
  }
  execute(command: TradeCommand, context: ExecutionContext): TradeResult {
    return this.db
      .transaction((): TradeResult => {
        const workspace = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
          | { id: string }
          | undefined;
        if (!workspace) return failure("NOT_FOUND", "请先创建本地工作区");
        const current = this.board(workspace.id);
        if (command.method === "trade.get")
          return { ok: true, data: current, warnings: [], evidenceIds: [] };
        const fingerprint = hash(
          JSON.stringify({ method: command.method, payload: command.payload, context }),
        );
        const prior = this.db
          .prepare("SELECT request_hash,result_json FROM idempotency WHERE key=?")
          .get(command.idempotencyKey) as { request_hash: string; result_json: string } | undefined;
        if (prior)
          return prior.request_hash === fingerprint
            ? TradeResultSchema.parse(JSON.parse(prior.result_json))
            : failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        const now = new Date().toISOString();
        let entityId: string;
        switch (command.method) {
          case "scenario.save": {
            const version = current.scenario?.version ?? 0;
            if (command.payload.expectedVersion !== version)
              return failure("REVISION_CONFLICT", "场景已被修改，请重新加载后核对");
            const scenario = ScenarioSchema.parse({
              ...command.payload.scenario,
              id: randomUUID(),
              version: version + 1,
              createdAt: now,
            });
            entityId = scenario.id;
            this.db
              .prepare("INSERT INTO scenario_revision VALUES (?,?,?,?)")
              .run(scenario.id, workspace.id, scenario.version, JSON.stringify(scenario));
            break;
          }
          case "catalog.stage": {
            if (Buffer.byteLength(command.payload.csv, "utf8") > 262144)
              throw new TradeFault("VALIDATION_ERROR", "CSV 原文超过 256 KiB，请拆分文件");
            const sourceHash = hash(command.payload.csv);
            const priorBatch = current.batches.find(
              (batch) =>
                batch.sourceHash === sourceHash &&
                batch.sourceStatus === command.payload.sourceStatus,
            );
            if (priorBatch) {
              entityId = priorBatch.id;
              break;
            }
            const parsed = parseCatalogCsv(command.payload.csv);
            const batch: ImportBatch = {
              id: randomUUID(),
              sourceHash,
              sourceName: command.payload.sourceName,
              sourceStatus: command.payload.sourceStatus,
              status: "staged",
              createdAt: now,
              ...parsed,
              listingIssues: validateListingCompliance(parsed.rows),
            };
            entityId = batch.id;
            this.db
              .prepare("INSERT INTO catalog_batch VALUES (?,?,?,?,?,?)")
              .run(
                batch.id,
                workspace.id,
                sourceHash,
                batch.sourceStatus,
                command.payload.csv,
                JSON.stringify(batch),
              );
            break;
          }
          case "catalog.publish": {
            const batch = current.batches.find((item) => item.id === command.payload.batchId);
            if (!batch || batch.sourceHash !== command.payload.sourceHash)
              throw new TradeFault("SOURCE_CONFLICT", "导入预览与原始资料不一致，请重新读取");
            entityId = batch.id;
            if (batch.status === "published") break;
            if (batch.issues.length || !batch.rows.length)
              throw new TradeFault(
                "VALIDATION_ERROR",
                "请修正 CSV 中的错误并重新预览，当前批次不能发布",
              );
            const skus = [...new Set(batch.rows.map((row) => row.sku))];
            if (current.products.some((product) => skus.includes(product.sku)))
              throw new TradeFault(
                "SOURCE_CONFLICT",
                "SKU 已发布；本阶段不覆盖旧商品/价格，请使用新 SKU 或等待版本更新功能",
              );
            for (const sku of skus) {
              const rows = batch.rows.filter((row) => row.sku === sku);
              const first = rows[0];
              if (!first) throw new Error("EMPTY_GROUP");
              const product = ProductSchema.parse({
                id: randomUUID(),
                batchId: batch.id,
                sourceHash: batch.sourceHash,
                sourceName: batch.sourceName,
                sourceStatus: batch.sourceStatus,
                sku,
                name: first.name,
                category: first.category,
                unit: first.unit,
                currency: first.currency,
                validUntil: first.validUntil,
                description: first.description,
                tiers: sortedTiers(rows),
              });
              this.db
                .prepare("INSERT INTO catalog_product VALUES (?,?,?,?,?)")
                .run(product.id, workspace.id, batch.id, sku, JSON.stringify(product));
            }
            this.db
              .prepare("UPDATE catalog_batch SET data_json=? WHERE id=?")
              .run(JSON.stringify({ ...batch, status: "published" }), batch.id);
            break;
          }
          case "quote.createV1": {
            if (!current.scenario) throw new TradeFault("NOT_FOUND", "请先保存演示场景");
            const quote = QuoteV1Schema.parse(
              calculateQuoteV1(command.payload, current.scenario, current.products, {
                id: randomUUID(),
                workspaceId: workspace.id,
                createdAt: now,
              }),
            );
            entityId = quote.id;
            const json = JSON.stringify(quote);
            this.db
              .prepare("INSERT INTO quote_v1 VALUES (?,?,?,?,?)")
              .run(quote.id, workspace.id, quote.scenario.id, hash(json), json);
            break;
          }
          case "quote.approve": {
            const quote = current.quotes.find((q) => q.id === command.payload.quoteId);
            if (!quote || quote.id !== command.payload.revisionId)
              throw new TradeFault("NOT_FOUND", "报价不存在或修订版本不匹配，请重新加载");
            const approval = QuoteApprovalSchema.parse(
              approveQuote(
                quote,
                { approvedBy: command.payload.approvedBy, note: command.payload.note },
                { id: randomUUID(), approvedAt: now },
              ),
            );
            entityId = approval.id;
            const json = JSON.stringify(approval);
            this.db
              .prepare("INSERT INTO quote_approval VALUES (?,?,?,?,?,?,?)")
              .run(
                approval.id,
                workspace.id,
                approval.quoteId,
                approval.revisionId,
                approval.quoteVersion,
                hash(json),
                json,
              );
            break;
          }
        }
        // Business writes, audit event, and retry result commit or roll back together.
        this.db
          .prepare(
            "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            workspace.id,
            command.method,
            JSON.stringify({ entityId }),
            JSON.stringify(context),
            now,
          );
        const result: TradeResult = {
          ok: true,
          data: this.board(workspace.id),
          warnings: [],
          evidenceIds: [entityId],
        };
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(command.idempotencyKey, fingerprint, JSON.stringify(result));
        return result;
      })
      .immediate();
  }
}
