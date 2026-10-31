import { createHash, randomUUID } from "node:crypto";
import {
  CheckCommandSchema,
  type CheckListResult,
  type CheckReport,
  CheckReportSchema,
  type CheckResult,
  CheckResultSchema,
  type ExecutionContext,
  failure,
  type KnowledgeRepository,
  QuoteCheckInputSchema,
  type QuoteSnapshot,
  QuoteSnapshotSchema,
  WikiConsumptionSchema,
} from "@tradequote/contracts";
import { quoteCheckService, TradeFault } from "@tradequote/domain";
import type Database from "better-sqlite3";

export { checkReportTableSql } from "./check-report-schema";
export interface CheckKnowledgeSource {
  prepare(
    quote: QuoteSnapshot,
    reportId: string,
    checkedAt: string,
    context: ExecutionContext,
  ): {
    report: CheckReport;
    register(): void;
  };
}
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
type JsonRow = { data_json: string; content_hash: string };
type QuoteRow = JsonRow & {
  id: string;
  workspace_id: string;
  root_id: string;
  parent_id: string | null;
  quote_version: number;
};
type ReportRow = JsonRow & {
  report_id: string;
  workspace_id: string;
  quote_id: string;
  revision_id: string;
  quote_version: number;
  checked_at: string;
};

/** Worker-internal report store; the synchronous participant shares the connection
 * and registers consumption in this transaction. No DB opening, migrations or IPC.
 */
export class CheckStore {
  constructor(
    private readonly db: Database.Database,
    private readonly knowledge: Pick<KnowledgeRepository, "findPublished"> | CheckKnowledgeSource,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private readReport(row: ReportRow, workspaceId: string) {
    if (hash(row.data_json) !== row.content_hash) throw new Error("INVALID_REPORT_HASH");
    const report = CheckReportSchema.parse(JSON.parse(row.data_json));
    if (
      row.workspace_id !== workspaceId ||
      report.reportId !== row.report_id ||
      report.quoteId !== row.quote_id ||
      report.revisionId !== row.revision_id ||
      report.quoteVersion !== row.quote_version ||
      report.checkedAt !== row.checked_at
    )
      throw new Error("INVALID_REPORT_IDENTITY");
    if (report.wikiCitations?.length) {
      const saved = this.db
        .prepare(
          "SELECT data_json FROM knowledge_consumption WHERE workspace_id=? AND consumer_kind='artifact' AND consumer_revision_id=?",
        )
        .get(workspaceId, report.reportId) as { data_json: string } | undefined;
      if (!saved) throw new Error("MISSING_REPORT_CONSUMPTION");
      const consumption = WikiConsumptionSchema.parse(JSON.parse(saved.data_json));
      if (
        consumption.workspaceId !== workspaceId ||
        consumption.consumer.kind !== "artifact" ||
        consumption.consumer.entityId !== report.reportId ||
        consumption.consumer.revisionId !== report.reportId ||
        consumption.consumer.contentHash !== row.content_hash ||
        JSON.stringify(consumption.citations) !== JSON.stringify(report.wikiCitations)
      )
        throw new Error("INVALID_REPORT_CONSUMPTION");
    }
    return report;
  }

  execute(input: unknown, context: ExecutionContext): CheckResult | CheckListResult {
    const parsed = CheckCommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR", "检查请求字段不合法");
    const command = parsed.data;
    try {
      return this.db
        .transaction((): CheckResult | CheckListResult => {
          const workspace = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
            | { id: string }
            | undefined;
          if (!workspace) return failure("NOT_FOUND", "请先创建本地工作区");
          const fingerprint = hash(
            JSON.stringify({
              workspaceId: workspace.id,
              method: command.method,
              payload: command.payload,
              actorId: context.actorId,
              origin: context.origin,
            }),
          );
          if (command.method === "quote.check") {
            const prior = this.db
              .prepare("SELECT request_hash,result_json FROM idempotency WHERE key=?")
              .get(command.idempotencyKey) as
              | { request_hash: string; result_json: string }
              | undefined;
            if (prior) {
              if (prior.request_hash !== fingerprint)
                return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同检查内容或调用者");
              const result = CheckResultSchema.parse(JSON.parse(prior.result_json));
              if (!result.ok || result.data.revisionId !== command.payload.revisionId)
                throw new Error("INVALID_CHECK_RECEIPT");
              const saved = this.db
                .prepare("SELECT * FROM quote_check_report WHERE workspace_id=? AND report_id=?")
                .get(workspace.id, result.data.reportId) as ReportRow | undefined;
              if (
                !saved ||
                JSON.stringify(this.readReport(saved, workspace.id)) !== JSON.stringify(result.data)
              )
                throw new Error("INVALID_CHECK_RECEIPT");
              return result;
            }
          }
          const quoteRows = this.db
            .prepare(`
          SELECT id,workspace_id,id AS root_id,NULL AS parent_id,1 AS quote_version,data_json,content_hash
            FROM quote_v1 WHERE workspace_id=? AND id=?
          UNION ALL SELECT id,workspace_id,root_id,parent_id,version AS quote_version,data_json,content_hash
            FROM quote_revision WHERE workspace_id=? AND id=?
        `)
            .all(
              workspace.id,
              command.payload.revisionId,
              workspace.id,
              command.payload.revisionId,
            ) as QuoteRow[];
          if (quoteRows.length > 1) throw new Error("AMBIGUOUS_QUOTE_IDENTITY");
          const row = quoteRows[0];
          if (!row) return failure("NOT_FOUND", "报价版本不存在");
          const quote = QuoteSnapshotSchema.parse(JSON.parse(row.data_json));
          if (
            hash(row.data_json) !== row.content_hash ||
            quote.id !== row.id ||
            quote.workspaceId !== row.workspace_id ||
            quote.version !== row.quote_version ||
            (quote.rootId ?? quote.id) !== row.root_id ||
            (quote.parentId ?? null) !== row.parent_id ||
            (quote.version > 1 && (!quote.rootId || quote.rootId === quote.id || !quote.parentId))
          )
            throw new Error("INVALID_STORED_QUOTE");
          if (command.method === "quote.getChecks") {
            const rows = this.db
              .prepare(`
            SELECT * FROM quote_check_report
            WHERE workspace_id=? AND revision_id=?
            ORDER BY julianday(checked_at) DESC,report_id ASC
          `)
              .all(workspace.id, quote.id) as ReportRow[];
            const reports = rows.map((saved) => {
              const report = this.readReport(saved, workspace.id);
              if (
                report.quoteId !== (quote.rootId ?? quote.id) ||
                report.revisionId !== quote.id ||
                report.quoteVersion !== quote.version
              )
                throw new Error("INVALID_REPORT_IDENTITY");
              return report;
            });
            return {
              ok: true,
              data: reports,
              warnings: [],
              evidenceIds: reports.map((report) => report.reportId),
            };
          }
          const checkedAt = this.clock();
          const reportId = randomUUID();
          const prepared =
            "prepare" in this.knowledge
              ? this.knowledge.prepare(quote, reportId, checkedAt, context)
              : null;
          let report;
          if (prepared) {
            const parsedReport = CheckReportSchema.safeParse(prepared.report);
            if (
              !parsedReport.success ||
              parsedReport.data.reportId !== reportId ||
              parsedReport.data.quoteId !== (quote.rootId ?? quote.id) ||
              parsedReport.data.revisionId !== quote.id ||
              parsedReport.data.quoteVersion !== quote.version ||
              parsedReport.data.checkedAt !== checkedAt
            )
              throw new TradeFault("SOURCE_CONFLICT", "检查参与方报告与本次报价版本不一致");
            report = parsedReport.data;
          } else {
            if (!("findPublished" in this.knowledge)) throw new Error("INVALID_KNOWLEDGE_SOURCE");
            const checkedInput = QuoteCheckInputSchema.safeParse({
              quote,
              knowledge: this.knowledge.findPublished({
                scope: {
                  platform: quote.scenario.platform,
                  market: quote.scenario.market,
                  category: quote.scenario.category,
                },
                at: checkedAt,
              }),
              reportId,
              checkedAt,
            });
            if (
              !checkedInput.success ||
              checkedInput.data.knowledge.some(
                (revision) => hash(revision.content.sourceText) !== revision.sourceHash,
              )
            )
              throw new TradeFault("SOURCE_CONFLICT", "知识版本或来源不一致");
            try {
              report = quoteCheckService.evaluate(checkedInput.data);
            } catch {
              throw new TradeFault("SOURCE_CONFLICT", "知识版本或来源不一致");
            }
          }
          const json = JSON.stringify(report);
          this.db
            .prepare(
              "INSERT INTO quote_check_report(report_id,workspace_id,quote_id,revision_id,quote_version,checked_at,content_hash,data_json) VALUES (?,?,?,?,?,?,?,?)",
            )
            .run(
              report.reportId,
              workspace.id,
              report.quoteId,
              report.revisionId,
              report.quoteVersion,
              report.checkedAt,
              hash(json),
              json,
            );
          // The participant shares this DB transaction. Any returned failure must
          // throw, otherwise SQLite would commit a report with no consumption.
          prepared?.register();
          this.db
            .prepare(
              "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              workspace.id,
              command.method,
              JSON.stringify({ reportId: report.reportId, revisionId: report.revisionId }),
              JSON.stringify({ actorId: context.actorId, origin: context.origin }),
              checkedAt,
            );
          const result: CheckResult = {
            ok: true,
            data: report,
            warnings: [],
            evidenceIds: [report.reportId],
          };
          this.db
            .prepare("INSERT INTO idempotency(key,request_hash,result_json) VALUES (?,?,?)")
            .run(command.idempotencyKey, fingerprint, JSON.stringify(result));
          return result;
        })
        .immediate();
    } catch (error) {
      if (error instanceof TradeFault && error.code === "SOURCE_CONFLICT")
        return failure("SOURCE_CONFLICT", "知识版本或来源不一致，请核对后重新检查");
      return failure("STORAGE_ERROR", "本地检查报告读取或保存失败，请重试");
    }
  }
}
