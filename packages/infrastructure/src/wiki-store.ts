import { createHash, randomUUID } from "node:crypto";
import {
  CheckReportSchema,
  evaluateMaintenanceResolution,
  failure,
  type KnowledgeCitation,
  type KnowledgeImpactItem,
  KnowledgeImpactItemSchema,
  type KnowledgeImpactPage,
  KnowledgeImpactPageSchema,
  KnowledgeImpactQuerySchema,
  type KnowledgeImpactReport,
  KnowledgeImpactReportSchema,
  type KnowledgeImpactSubject,
  KnowledgeImpactSubjectSchema,
  type KnowledgeIndexRebuild,
  KnowledgeIndexRebuildSchema,
  type KnowledgeIndexStatus,
  KnowledgeIndexStatusSchema,
  type KnowledgeLintIssue,
  type KnowledgeLintReport,
  KnowledgeLintReportSchema,
  KnowledgeLintReviewExchangeSchema,
  KnowledgeLintReviewInputExchangeSchema,
  type KnowledgeMaintenanceLifecycleEvent,
  type KnowledgeMaintenanceResult,
  type MaintenanceEvidence,
  MaintenanceEvidenceSchema,
  type MaintenanceIssue,
  MaintenanceIssueSchema,
  type MaintenancePage,
  MaintenancePageSchema,
  type MaintenanceQuery,
  type MaintenanceTarget,
  QuoteSnapshotSchema,
  validTextLocation,
  type WikiCitationResolveInput,
  WikiCitationResolveInputSchema,
  WikiCommandSchema,
  type WikiConsumption,
  type WikiConsumptionInput,
  WikiConsumptionInputSchema,
  WikiConsumptionResultSchema,
  type WikiEligibility,
  type WikiHostContext,
  type WikiIneligibilityReason,
  type WikiLifecycle,
  WikiLintReceiptSchema,
  type WikiPublicationEvent,
  type WikiResult,
  type WikiReviewDecision,
  WikiReviewDecisionSchema,
  WikiReviewInputSchema,
  type WikiRevision,
  type WikiRevisionRecord,
  type WikiSearchHit,
  type WikiSearchPage,
  type WikiSearchQuery,
  WikiSearchQuerySchema,
  type WikiSourceRevision,
  type WikiSourceStageInput,
  WikiSourceStageInputSchema,
  type WikiSourceState,
  type WikiStageInput,
  WikiStageInputSchema,
  type WikiValidity,
  wikiSourceSetPayload,
} from "@tradequote/contracts";
import type Database from "better-sqlite3";
import type { z } from "zod";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** keyword 倒排投影的分词：小写化后按非字母数字切分并去重（保序）。 */
const tokenize = (text: string): string[] => {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of text.toLocaleLowerCase("und").split(/[^\p{L}\p{N}]+/u)) {
    if (raw === "" || seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
  }
  return tokens;
};
const sha256Utf8 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** 请求幂等指纹只绑定方法、业务输入与身份（工作区/actor/origin），
 *  排除 requestId 与宿主时钟等传输噪声：同一身份/输入/幂等键重放首结果。 */
function requestFingerprint(method: string, payload: unknown, context: WikiHostContext): string {
  return hash(
    JSON.stringify({
      method,
      payload,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      origin: context.origin,
    }),
  );
}

/** 7e6b485 及更早的幂等指纹把完整 host context（含宿主 now）一起串进 hash。
 *  旧库重开时，已成功键的 request_hash 只能靠这条旧指纹匹配重放。 */
function legacyRequestFingerprint(
  method: string,
  payload: unknown,
  context: WikiHostContext,
): string {
  return hash(JSON.stringify({ method, payload, context }));
}

type Row = { data_json: string };
type WikiLintReceipt = z.infer<typeof WikiLintReceiptSchema>;

// Reuse the authoritative public payload schemas; no parallel DTO.
const publishInputSchema = WikiCommandSchema.options[6].shape.payload;
const withdrawInputSchema = WikiCommandSchema.options[7].shape.payload;

function validityAllows(
  validity: { status: string; validFrom: string | null; validUntil: string | null },
  at: string,
): boolean {
  return (
    validity.status === "confirmed" &&
    (validity.validFrom === null || Date.parse(validity.validFrom) <= Date.parse(at)) &&
    (validity.validUntil === null || Date.parse(at) < Date.parse(validity.validUntil))
  );
}

/** 知识或来源的有效期不适用于 checkedAt 时，落到公开资格原因。 */
function validityIneligibility(
  validity: { status: string; validFrom: string | null; validUntil: string | null },
  at: string,
): WikiIneligibilityReason {
  if (validity.status === "conflict") return "conflict";
  if (validity.validUntil && Date.parse(validity.validUntil) <= Date.parse(at)) return "expired";
  if (validity.validFrom && Date.parse(validity.validFrom) > Date.parse(at)) return "not_yet_valid";
  return "unknown";
}

function citationMatches(c: KnowledgeCitation, r: WikiRevision): boolean {
  const section = r.content.sections.find((s) => s.sectionId === c.sectionId);
  if (
    !section ||
    c.revisionId !== r.revisionId ||
    c.documentId !== r.documentId ||
    c.version !== r.version ||
    c.contentHash !== r.contentHash ||
    c.sourceSetHash !== r.sourceSetHash ||
    section.sourceReferenceIds.length !== c.sourceRefs.length
  )
    return false;
  return section.sourceReferenceIds.every((id) => {
    const expected = r.content.sourceRefs.find((ref) => ref.referenceId === id);
    const actual = c.sourceRefs.find((ref) => ref.referenceId === id);
    return (
      expected &&
      actual &&
      expected.sourceId === actual.sourceId &&
      expected.sourceRevisionId === actual.sourceRevisionId &&
      expected.sourceVersion === actual.sourceVersion &&
      expected.artifactHash === actual.artifactHash &&
      expected.excerptHash === actual.excerptHash &&
      expected.assertion === actual.assertion &&
      expected.location.start === actual.location.start &&
      expected.location.end === actual.location.end
    );
  });
}

/** A01c SQLite wiki store: B00a P0 source/wiki/lifecycle/consumption persistence and
 *  the retrieval/citation/consumption read-write paths. Immutable revision rows are
 *  written once; the mutable lifecycle projection is versioned separately. */
export class SqliteWikiStore {
  constructor(private readonly db: Database.Database) {}

  private workspaceId(): string | null {
    const row = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
      | { id: string }
      | undefined;
    return row ? row.id : null;
  }

  private replay<T = WikiResult>(
    key: string,
    requestHash: string,
    legacyRequestHash: string,
  ): T | "conflict" | null {
    const prior = this.db
      .prepare("SELECT request_hash, result_json FROM idempotency WHERE key=?")
      .get(key) as { request_hash: string; result_json: string } | undefined;
    if (!prior) return null;
    return prior.request_hash === requestHash || prior.request_hash === legacyRequestHash
      ? (JSON.parse(prior.result_json) as T)
      : "conflict";
  }

  private emit(workspaceId: string, type: string, payload: unknown, context: WikiHostContext) {
    this.db
      .prepare(
        "INSERT INTO outbox(event_id,workspace_id,type,payload_json,context_json,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        workspaceId,
        type,
        JSON.stringify(payload),
        JSON.stringify(context),
        context.now,
      );
  }

  private sourceRevisionResult(revision: WikiSourceRevision): WikiResult {
    return {
      ok: true,
      data: { kind: "sourceRevision", revision },
      warnings: [],
      evidenceIds: [revision.sourceRevisionId],
    };
  }

  private wikiRevisionResult(record: WikiRevisionRecord): WikiResult {
    return {
      ok: true,
      data: { kind: "wikiRevision", record },
      warnings: [],
      evidenceIds: [record.revision.revisionId],
    };
  }

  private readSourceRevision(sourceRevisionId: string): WikiSourceRevision | null {
    const workspaceId = this.workspaceId();
    const row = this.db
      .prepare(
        "SELECT data_json FROM knowledge_source WHERE source_revision_id=? AND workspace_id=?",
      )
      .get(sourceRevisionId, workspaceId) as Row | undefined;
    return row ? (JSON.parse(row.data_json) as WikiSourceRevision) : null;
  }

  private readWikiRevision(revisionId: string): WikiRevision | null {
    const workspaceId = this.workspaceId();
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_wiki WHERE revision_id=? AND workspace_id=?")
      .get(revisionId, workspaceId) as Row | undefined;
    return row ? (JSON.parse(row.data_json) as WikiRevision) : null;
  }

  private readLifecycle(revisionId: string): WikiLifecycle | null {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_lifecycle WHERE revision_id=?")
      .get(revisionId) as Row | undefined;
    return row ? (JSON.parse(row.data_json) as WikiLifecycle) : null;
  }

  private readLintReport(receiptId: string): KnowledgeLintReport | null {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_lint WHERE receipt_id=?")
      .get(receiptId) as Row | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.data_json) as KnowledgeLintReport;
    return KnowledgeLintReportSchema.safeParse(parsed).success ? parsed : null;
  }

  private readRecord(revisionId: string): WikiRevisionRecord | null {
    const revision = this.readWikiRevision(revisionId);
    if (!revision) return null;
    const lifecycle = this.readLifecycle(revisionId);
    if (!lifecycle) return null;
    return { revision, lifecycle };
  }

  private sourceStates(sources: WikiSourceRevision[]): WikiSourceState[] {
    return sources.map((source) => {
      const row = this.db
        .prepare(
          "SELECT state, lifecycle_version, created_at FROM knowledge_source WHERE source_revision_id=?",
        )
        .get(source.sourceRevisionId) as
        | { state: "active" | "withdrawn"; lifecycle_version: number; created_at: string }
        | undefined;
      return {
        sourceRevisionId: source.sourceRevisionId,
        lifecycleVersion: row?.lifecycle_version ?? 1,
        state: row?.state ?? "active",
        changedAt: row?.created_at ?? source.createdAt,
      };
    });
  }

  // -- source -------------------------------------------------------------

  stageSource(
    input: WikiSourceStageInput,
    context: WikiHostContext,
    idempotencyKey: string,
  ): WikiResult {
    const parsed = WikiSourceStageInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("source.stage", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint("source.stage", parsed, context);
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const last = this.db
          .prepare("SELECT MAX(version) AS version FROM knowledge_source WHERE source_id=?")
          .get(parsed.sourceId) as { version: number | null };
        const currentVersion = last.version ?? 0;
        if (currentVersion !== parsed.expectedVersion)
          return failure(
            "REVISION_CONFLICT",
            `来源当前版本为 v${currentVersion}，与提交的 expectedVersion 不一致`,
          );
        const parent = this.db
          .prepare(
            "SELECT source_revision_id FROM knowledge_source WHERE source_id=? AND version=?",
          )
          .get(parsed.sourceId, parsed.expectedVersion) as
          | { source_revision_id: string }
          | undefined;
        if (parsed.expectedVersion > 0 && !parent)
          return failure("REVISION_CONFLICT", "来源父版本不存在");
        const artifactHash = sha256Utf8(parsed.sourceText);
        const sourceRevision: WikiSourceRevision = {
          workspaceId,
          sourceId: parsed.sourceId,
          sourceRevisionId: randomUUID(),
          version: currentVersion + 1,
          parentRevisionId: parent?.source_revision_id ?? null,
          label: parsed.label,
          sourceStatus: parsed.sourceStatus,
          mediaType: parsed.mediaType,
          sourceText: parsed.sourceText,
          acquiredAt: parsed.acquiredAt,
          sourceUri: parsed.sourceUri,
          permissionNote: parsed.permissionNote,
          validity: parsed.validity,
          artifactId: artifactHash,
          artifactHash,
          createdAt: context.now,
        };
        this.db
          .prepare(
            "INSERT INTO knowledge_source(source_revision_id,workspace_id,source_id,version,parent_revision_id,state,lifecycle_version,artifact_hash,created_at,data_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            sourceRevision.sourceRevisionId,
            workspaceId,
            sourceRevision.sourceId,
            sourceRevision.version,
            sourceRevision.parentRevisionId,
            "active",
            1,
            sourceRevision.artifactHash,
            sourceRevision.createdAt,
            JSON.stringify(sourceRevision),
          );
        this.bumpSeq(workspaceId);
        this.emit(
          workspaceId,
          "source.stage",
          { sourceRevisionId: sourceRevision.sourceRevisionId },
          context,
        );
        const result = this.sourceRevisionResult(sourceRevision);
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  getSourceRevision(sourceRevisionId: string): WikiResult {
    const revision = this.readSourceRevision(sourceRevisionId);
    return revision ? this.sourceRevisionResult(revision) : failure("NOT_FOUND", "来源版本不存在");
  }

  // -- wiki ---------------------------------------------------------------

  stageWiki(input: WikiStageInput, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = WikiStageInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.stage", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint("wiki.stage", parsed, context);
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const last = this.db
          .prepare("SELECT MAX(version) AS version FROM knowledge_wiki WHERE document_id=?")
          .get(parsed.documentId) as { version: number | null };
        const currentVersion = last.version ?? 0;
        if (currentVersion !== parsed.expectedVersion)
          return failure(
            "REVISION_CONFLICT",
            `知识文档当前版本为 v${currentVersion}，与提交的 expectedVersion 不一致`,
          );
        const contentHash = sha256Utf8(parsed.content.markdown);
        const sourceSetHash = sha256Utf8(wikiSourceSetPayload(parsed.content.sourceRefs));
        const revision: WikiRevision = {
          workspaceId,
          revisionId: randomUUID(),
          documentId: parsed.documentId,
          version: currentVersion + 1,
          parentRevisionId: parsed.parentRevisionId,
          content: parsed.content,
          artifactId: contentHash,
          contentHash,
          sourceSetHash,
          createdAt: context.now,
        };
        const lifecycle: WikiLifecycle = {
          revisionId: revision.revisionId,
          lifecycleVersion: 1,
          state: "candidate",
          review: null,
          publication: null,
        };
        this.db
          .prepare(
            "INSERT INTO knowledge_wiki(revision_id,workspace_id,document_id,version,parent_revision_id,content_hash,source_set_hash,created_at,data_json) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            revision.revisionId,
            workspaceId,
            revision.documentId,
            revision.version,
            revision.parentRevisionId,
            revision.contentHash,
            revision.sourceSetHash,
            revision.createdAt,
            JSON.stringify(revision),
          );
        this.db
          .prepare(
            "INSERT INTO knowledge_lifecycle(revision_id,lifecycle_version,state,data_json) VALUES (?,?,?,?)",
          )
          .run(
            revision.revisionId,
            lifecycle.lifecycleVersion,
            lifecycle.state,
            JSON.stringify(lifecycle),
          );
        this.bumpSeq(workspaceId);
        this.emit(
          workspaceId,
          "wiki.stage",
          { revisionId: revision.revisionId, documentId: revision.documentId },
          context,
        );
        const result = this.wikiRevisionResult({ revision, lifecycle });
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  getWikiRevision(revisionId: string): WikiResult {
    const record = this.readRecord(revisionId);
    return record ? this.wikiRevisionResult(record) : failure("NOT_FOUND", "知识版本不存在");
  }

  listWikiRevisions(documentId: string, beforeVersion: number | null, limit: number): WikiResult {
    const workspaceId = this.workspaceId();
    const rows = this.db
      .prepare(
        "SELECT revision_id FROM knowledge_wiki WHERE document_id=? AND workspace_id=? AND (? IS NULL OR version < ?) ORDER BY version DESC LIMIT ?",
      )
      .all(documentId, workspaceId, beforeVersion, beforeVersion, limit) as {
      revision_id: string;
    }[];
    const records = rows
      .map((row) => this.readRecord(row.revision_id))
      .filter((record): record is WikiRevisionRecord => record !== null);
    const nextBeforeVersion =
      records.length === limit ? (records.at(-1)?.revision.version ?? null) : null;
    return {
      ok: true,
      data: { kind: "wikiRevisions", records, nextBeforeVersion },
      warnings: [],
      evidenceIds: records.map((record) => record.revision.revisionId),
    };
  }

  // -- review / publish / withdraw ----------------------------------------

  /** 维护前置事实：对特定知识版本做一次真实 lint，落库一份不可变完整报告
   *  （KnowledgeLintReport，reportId=receiptId，含七类 coverage/issues/error）。
   *  审核必须引用这里已保存的报告（契约要求“已存 lint 事实”），而不是在
   *  审核请求里现算。lint 通过只产生回执，绝不自动发布。 */
  runLint(revisionId: string, context: WikiHostContext): WikiLintReceipt | null {
    const revision = this.readWikiRevision(revisionId);
    if (!revision) return null;
    const workspaceId = this.workspaceId();
    if (!workspaceId) return null;
    const checkedAt = context.now;
    return this.db
      .transaction(() => {
        // 同一 (版本/hash/检查时刻) 幂等：重复 lint 返回已落库回执，不重复插入。
        const existing = this.db
          .prepare(
            "SELECT data_json FROM knowledge_lint WHERE revision_id=? AND content_hash=? AND source_set_hash=? AND checked_at=?",
          )
          .get(revision.revisionId, revision.contentHash, revision.sourceSetHash, checkedAt) as
          | Row
          | undefined;
        if (existing) {
          const stored = JSON.parse(existing.data_json) as KnowledgeLintReport | WikiLintReceipt;
          if (KnowledgeLintReportSchema.safeParse(stored).success)
            return (stored as KnowledgeLintReport).receipt;
          // 7e6b485 及更早只把回执本身写入 data_json（无报告壳），旧事实须原样返回。
          if (WikiLintReceiptSchema.safeParse(stored).success) return stored as WikiLintReceipt;
          return null;
        }
        const report = this.buildLintReport(revision, workspaceId, checkedAt);
        // 持久化前校验完整报告契约：校验失败即抛错回滚，绝不留下伪成功报告。
        KnowledgeLintReportSchema.parse(report);
        const receipt = report.receipt;
        this.db
          .prepare(
            "INSERT INTO knowledge_lint(receipt_id,workspace_id,revision_id,content_hash,source_set_hash,checked_at,policy_version,outcome,data_json) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            receipt.receiptId,
            receipt.workspaceId,
            receipt.revisionId,
            receipt.contentHash,
            receipt.sourceSetHash,
            receipt.checkedAt,
            receipt.policyVersion,
            receipt.outcome,
            JSON.stringify(report),
          );
        this.emit(
          workspaceId,
          "wiki.lint",
          { receiptId: receipt.receiptId, outcome: receipt.outcome },
          context,
        );
        return receipt;
      })
      .immediate();
  }

  /** S4 公共维护端口 wiki.lint：绑定真实工作区/版本/hash/生命周期后跑一次真实
   *  lint，落库并返回完整 KnowledgeLintReport（不用 runLint 的 receipt 简写）。 */
  lint(
    input: {
      revisionId: string;
      contentHash: string;
      sourceSetHash: string;
      expectedLifecycleVersion: number;
    },
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult {
    const revision = this.readWikiRevision(input.revisionId);
    if (!revision) return failure("NOT_FOUND", "知识版本不存在");
    if (revision.workspaceId !== context.workspaceId)
      return failure("SOURCE_CONFLICT", "lint 工作区与知识版本不一致");
    if (
      input.contentHash !== revision.contentHash ||
      input.sourceSetHash !== revision.sourceSetHash
    )
      return failure("MISSING_FACTS", "lint 绑定与知识版本 hash 不一致");
    const lifecycle = this.readLifecycle(input.revisionId);
    if (!lifecycle) return failure("NOT_FOUND", "知识生命周期不存在");
    if (lifecycle.lifecycleVersion !== input.expectedLifecycleVersion)
      return failure(
        "REVISION_CONFLICT",
        `知识生命周期当前版本为 v${lifecycle.lifecycleVersion}，与提交的 expectedLifecycleVersion 不一致`,
      );
    const receipt = this.runLint(input.revisionId, context);
    if (!receipt) return failure("NOT_FOUND", "知识版本不存在");
    const report = this.readLintReport(receipt.receiptId);
    if (!report) return failure("STORAGE_ERROR", "lint 未生成完整报告事实");
    return {
      ok: true,
      data: { kind: "lintReport", report },
      warnings: [],
      evidenceIds: [report.reportId],
    };
  }

  /** S4 公共维护端口 wiki.getLintReport：重开回读完整报告。 */
  getLintReport(reportId: string): KnowledgeMaintenanceResult {
    const report = this.readLintReport(reportId);
    return report
      ? {
          ok: true,
          data: { kind: "lintReport", report },
          warnings: [],
          evidenceIds: [report.reportId],
        }
      : failure("NOT_FOUND", "lint 报告不存在");
  }

  /** 生成完整 P1 报告：七类覆盖逐项真实核对。已证实失格落 block，无法确定落
   *  unknown（coverage=unknown / severity=unknown），任一 unknown 即 status=partial、
   *  outcome=unknown；全可确定时 status=completed，outcome 由是否存在 block issue 推导。 */
  private buildLintReport(
    revision: WikiRevision,
    workspaceId: string,
    checkedAt: string,
  ): KnowledgeLintReport {
    const checks: KnowledgeLintIssue["check"][] = [
      "source_integrity",
      "section_references",
      "relations",
      "scope_validity",
      "source_updates",
      "duplicates_conflicts",
      "orphans",
    ];
    const issues: KnowledgeLintIssue[] = [];
    const add = (
      check: KnowledgeLintIssue["check"],
      severity: KnowledgeLintIssue["severity"],
      message: string,
      sectionIds: string[] = [],
      sourceRevisionIds: string[] = [],
      distinctBy: string[] = [],
    ) => {
      issues.push({
        issueKey: hash(
          JSON.stringify([check, severity, message, sectionIds, sourceRevisionIds, distinctBy]),
        ),
        check,
        severity,
        message,
        sectionIds,
        sourceRevisionIds,
      });
    };

    // source_integrity：正文/来源集 hash、来源身份与 hash、摘录位置与 excerpt。
    if (sha256Utf8(revision.content.markdown) !== revision.contentHash)
      add("source_integrity", "block", "知识正文与 contentHash 不一致");
    if (sha256Utf8(wikiSourceSetPayload(revision.content.sourceRefs)) !== revision.sourceSetHash)
      add("source_integrity", "block", "来源集与 sourceSetHash 不一致");
    const sources = new Map<string, WikiSourceRevision>();
    for (const ref of revision.content.sourceRefs) {
      const source = this.readSourceRevision(ref.sourceRevisionId);
      if (!source) {
        add("source_integrity", "block", "引用来源版本不存在", [], [ref.sourceRevisionId]);
        continue;
      }
      sources.set(source.sourceRevisionId, source);
      if (
        source.workspaceId !== revision.workspaceId ||
        source.sourceId !== ref.sourceId ||
        source.version !== ref.sourceVersion ||
        source.artifactHash !== ref.artifactHash
      )
        add(
          "source_integrity",
          "block",
          "来源身份或 hash 与引用不一致",
          [],
          [ref.sourceRevisionId],
        );
      if (sha256Utf8(source.sourceText) !== source.artifactHash)
        add(
          "source_integrity",
          "block",
          "来源原文与 artifactHash 不一致",
          [],
          [ref.sourceRevisionId],
        );
      if (!validTextLocation(source.sourceText, ref.location))
        add("source_integrity", "block", "来源摘录位置越界", [], [ref.sourceRevisionId]);
      else if (
        sha256Utf8(source.sourceText.slice(ref.location.start, ref.location.end)) !==
        ref.excerptHash
      )
        add(
          "source_integrity",
          "block",
          "来源摘录与 excerptHash 不一致",
          [],
          [ref.sourceRevisionId],
        );
    }

    // section_references：段落引用不能悬空，来源引用不能无段落使用。
    const refIds = new Set(revision.content.sourceRefs.map((r) => r.referenceId));
    const usedIds = new Set(revision.content.sections.flatMap((s) => s.sourceReferenceIds));
    for (const section of revision.content.sections)
      for (const id of section.sourceReferenceIds)
        if (!refIds.has(id))
          add("section_references", "block", "段落引用不存在的来源", [section.sectionId]);
    for (const ref of revision.content.sourceRefs)
      if (!usedIds.has(ref.referenceId))
        add("section_references", "block", "来源引用未被任何段落使用", [], [ref.sourceRevisionId]);

    // relations：关联指向的版本必须真实存在且属于同一文档/工作区。
    for (const relation of revision.content.relations) {
      const target = this.readWikiRevision(relation.revisionId);
      if (
        !target ||
        target.documentId !== relation.documentId ||
        target.workspaceId !== revision.workspaceId
      )
        add(
          "relations",
          "block",
          "关联指向不存在的知识版本",
          [],
          [],
          [relation.documentId, relation.revisionId],
        );
    }

    // scope_validity：知识与来源的有效期须确认且当前适用。已证实失格（到期/未生效/冲突）
    // 落 block；无法确定（status 非 confirmed/conflict）落 unknown，不得误判为失格。
    if (!validityAllows(revision.content.validity, checkedAt))
      add(
        "scope_validity",
        validityIneligibility(revision.content.validity, checkedAt) === "unknown"
          ? "unknown"
          : "block",
        `知识有效期不适用：${validityIneligibility(revision.content.validity, checkedAt)}`,
      );
    for (const [sourceRevisionId, source] of sources)
      if (!validityAllows(source.validity, checkedAt))
        add(
          "scope_validity",
          validityIneligibility(source.validity, checkedAt) === "unknown" ? "unknown" : "block",
          `来源有效期不适用：${validityIneligibility(source.validity, checkedAt)}`,
          [],
          [sourceRevisionId],
        );

    // source_updates：来源不得已被新版本替代或撤回。
    for (const [sourceRevisionId, source] of sources) {
      if (this.hasNewerSourceVersion(revision.workspaceId, source.sourceId, source.version))
        add("source_updates", "block", "来源已有新版本，引用已过期", [], [sourceRevisionId]);
      const row = this.db
        .prepare("SELECT state FROM knowledge_source WHERE source_revision_id=?")
        .get(sourceRevisionId) as { state: string } | undefined;
      if (row && row.state !== "active")
        add("source_updates", "block", "来源已撤回", [], [sourceRevisionId]);
    }

    // duplicates_conflicts：有效期冲突等重复/冲突事实。
    if (revision.content.validity.status === "conflict")
      add("duplicates_conflicts", "block", "知识有效期处于冲突状态");

    // orphans：规则不得绑定不存在的段落。
    for (const rule of revision.content.rules)
      if (!revision.content.sections.some((s) => s.sectionId === rule.sectionId))
        add("orphans", "block", "规则绑定不存在的段落", [rule.sectionId]);

    const coverage = checks.map((check) => {
      const checkIssues = issues.filter((issue) => issue.check === check);
      const status =
        checkIssues.length === 0
          ? ("passed" as const)
          : checkIssues.some((i) => i.severity === "block" || i.severity === "warning")
            ? ("issues" as const)
            : ("unknown" as const);
      return { check, status };
    }) as KnowledgeLintReport["coverage"];
    const status: KnowledgeLintReport["status"] =
      coverage.some((c) => c.status === "unknown") || issues.some((i) => i.severity === "unknown")
        ? "partial"
        : "completed";
    const outcome: WikiLintReceipt["outcome"] =
      status !== "completed"
        ? "unknown"
        : issues.some((i) => i.severity === "block")
          ? "blocked"
          : "passed";
    const receipt: WikiLintReceipt = {
      receiptId: randomUUID(),
      workspaceId,
      revisionId: revision.revisionId,
      contentHash: revision.contentHash,
      sourceSetHash: revision.sourceSetHash,
      checkedAt,
      policyVersion: "knowledge-maintenance-v1",
      outcome,
    };
    return {
      reportId: receipt.receiptId,
      receipt,
      status,
      coverage,
      issues,
      error: null,
    };
  }

  /** 审核/发布提交边界前的来源资格复核：任一引用来源已撤回、过期或被新版本
   *  替代即返回失败；否则返回 null（表示可继续）。 */
  private sourceRevalidationFailure(revision: WikiRevision, checkedAt: string): WikiResult | null {
    for (const ref of revision.content.sourceRefs) {
      const source = this.readSourceRevision(ref.sourceRevisionId);
      if (!source) return failure("SOURCE_CONFLICT", "引用来源版本不存在，不能继续");
      const row = this.db
        .prepare("SELECT state FROM knowledge_source WHERE source_revision_id=?")
        .get(ref.sourceRevisionId) as { state: string } | undefined;
      if (!row || row.state !== "active")
        return failure("SOURCE_CONFLICT", "引用来源已撤回，不能继续");
      if (!validityAllows(source.validity, checkedAt))
        return failure("SOURCE_CONFLICT", "引用来源已失效，不能继续");
      if (this.hasNewerSourceVersion(revision.workspaceId, source.sourceId, source.version))
        return failure("SOURCE_CONFLICT", "引用来源已有新版本，不能继续");
    }
    return null;
  }

  review(input: unknown, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = WikiReviewInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.review", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint("wiki.review", parsed, context);
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const revision = this.readWikiRevision(parsed.revisionId);
        if (!revision) return failure("NOT_FOUND", "知识版本不存在");
        const lifecycle = this.readLifecycle(parsed.revisionId);
        if (!lifecycle) return failure("NOT_FOUND", "知识生命周期不存在");
        if (lifecycle.lifecycleVersion !== parsed.expectedLifecycleVersion)
          return failure(
            "REVISION_CONFLICT",
            `知识生命周期当前版本为 v${lifecycle.lifecycleVersion}，与提交的 expectedLifecycleVersion 不一致`,
          );
        if (lifecycle.state !== "candidate")
          return failure("ACTION_NOT_ALLOWED", "仅候选版本可审核");
        if (
          parsed.contentHash !== revision.contentHash ||
          parsed.sourceSetHash !== revision.sourceSetHash
        )
          return failure("MISSING_FACTS", "审核绑定与知识版本 hash 不一致");
        const lintReport = this.readLintReport(parsed.lintReceiptId);
        if (!lintReport) return failure("NOT_FOUND", "lint 报告不存在");
        if (
          !KnowledgeLintReviewInputExchangeSchema.safeParse({
            report: lintReport,
            input: parsed,
            context,
          }).success
        )
          return failure("MISSING_FACTS", "审核须在当前工作区绑定已存lint报告");
        // 提交边界复核：批准前来源不得已被更新、到期或撤回。
        if (parsed.decision === "approve") {
          const ineligible = this.sourceRevalidationFailure(revision, context.now);
          if (ineligible) return ineligible;
        }
        const decision: WikiReviewDecision = {
          ...parsed,
          workspaceId,
          lintReceipt: lintReport.receipt,
          reviewId: randomUUID(),
          actorId: context.actorId,
          decidedAt: context.now,
        };
        const parsedDecision = WikiReviewDecisionSchema.safeParse(decision);
        if (!parsedDecision.success)
          return failure(
            "MISSING_FACTS",
            "审核须绑定同工作区/版本/hash的已存lint事实，批准必须通过",
          );
        if (
          !KnowledgeLintReviewExchangeSchema.safeParse({
            report: lintReport,
            review: parsedDecision.data,
          }).success
        )
          return failure("MISSING_FACTS", "审核须使用已存报告的完整回执");
        const newLifecycle: WikiLifecycle = {
          revisionId: parsed.revisionId,
          lifecycleVersion: parsed.expectedLifecycleVersion + 1,
          state: parsed.decision === "approve" ? "approved" : "rejected",
          review: parsedDecision.data,
          publication: null,
        };
        this.db
          .prepare(
            "UPDATE knowledge_lifecycle SET lifecycle_version=?, state=?, data_json=? WHERE revision_id=?",
          )
          .run(
            newLifecycle.lifecycleVersion,
            newLifecycle.state,
            JSON.stringify(newLifecycle),
            newLifecycle.revisionId,
          );
        this.bumpSeq(workspaceId);
        this.emit(
          workspaceId,
          "wiki.review",
          {
            revisionId: newLifecycle.revisionId,
            reviewId: parsedDecision.data.reviewId,
            decision: parsed.decision,
          },
          context,
        );
        const result = this.wikiRevisionResult({ revision, lifecycle: newLifecycle });
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  publish(input: unknown, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = publishInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.publish", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint("wiki.publish", parsed, context);
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const revision = this.readWikiRevision(parsed.revisionId);
        if (!revision) return failure("NOT_FOUND", "知识版本不存在");
        const lifecycle = this.readLifecycle(parsed.revisionId);
        if (!lifecycle) return failure("NOT_FOUND", "知识生命周期不存在");
        if (lifecycle.lifecycleVersion !== parsed.expectedLifecycleVersion)
          return failure(
            "REVISION_CONFLICT",
            `知识生命周期当前版本为 v${lifecycle.lifecycleVersion}，与提交的 expectedLifecycleVersion 不一致`,
          );
        if (lifecycle.state !== "approved")
          return failure("ACTION_NOT_ALLOWED", "仅审核通过的版本可发布");
        const review = lifecycle.review;
        if (!review || review.decision !== "approve")
          return failure("MISSING_FACTS", "发布缺少批准记录");
        if (
          parsed.contentHash !== revision.contentHash ||
          parsed.sourceSetHash !== revision.sourceSetHash
        )
          return failure("MISSING_FACTS", "发布绑定与知识版本 hash 不一致");
        if (review.reviewId !== parsed.reviewId)
          return failure("MISSING_FACTS", "发布引用的 reviewId 与已存审核不一致");
        if (Date.parse(context.now) < Date.parse(review.decidedAt))
          return failure("MISSING_FACTS", "发布时间不得早于审核时间");
        // 提交边界复核：发布前来源不得已被更新、到期或撤回。
        const ineligible = this.sourceRevalidationFailure(revision, context.now);
        if (ineligible) return ineligible;
        const publication: WikiPublicationEvent = {
          eventId: randomUUID(),
          revisionId: parsed.revisionId,
          lifecycleVersion: parsed.expectedLifecycleVersion + 1,
          type: "published",
          reviewId: review.reviewId,
          contentHash: review.contentHash,
          sourceSetHash: review.sourceSetHash,
          actorId: context.actorId,
          occurredAt: context.now,
          note: review.note,
        };
        const newLifecycle: WikiLifecycle = {
          revisionId: parsed.revisionId,
          lifecycleVersion: parsed.expectedLifecycleVersion + 1,
          state: "published",
          review,
          publication,
        };
        this.db
          .prepare(
            "UPDATE knowledge_lifecycle SET lifecycle_version=?, state=?, data_json=? WHERE revision_id=?",
          )
          .run(
            newLifecycle.lifecycleVersion,
            newLifecycle.state,
            JSON.stringify(newLifecycle),
            newLifecycle.revisionId,
          );
        this.bumpSeq(workspaceId);
        this.emit(
          workspaceId,
          "wiki.publish",
          { revisionId: parsed.revisionId, publicationEventId: publication.eventId },
          context,
        );
        const result = this.wikiRevisionResult({ revision, lifecycle: newLifecycle });
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  withdraw(input: unknown, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = withdrawInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.withdraw", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint("wiki.withdraw", parsed, context);
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const revision = this.readWikiRevision(parsed.revisionId);
        if (!revision) return failure("NOT_FOUND", "知识版本不存在");
        const lifecycle = this.readLifecycle(parsed.revisionId);
        if (!lifecycle) return failure("NOT_FOUND", "知识生命周期不存在");
        if (lifecycle.lifecycleVersion !== parsed.expectedLifecycleVersion)
          return failure(
            "REVISION_CONFLICT",
            `知识生命周期当前版本为 v${lifecycle.lifecycleVersion}，与提交的 expectedLifecycleVersion 不一致`,
          );
        if (lifecycle.state !== "published")
          return failure("ACTION_NOT_ALLOWED", "仅已发布版本可撤回");
        const review = lifecycle.review;
        if (!review || review.decision !== "approve")
          return failure("MISSING_FACTS", "撤回缺少批准记录");
        if (Date.parse(context.now) < Date.parse(review.decidedAt))
          return failure("MISSING_FACTS", "撤回时间不得早于审核时间");
        const publication: WikiPublicationEvent = {
          eventId: randomUUID(),
          revisionId: parsed.revisionId,
          lifecycleVersion: parsed.expectedLifecycleVersion + 1,
          type: "withdrawn",
          reviewId: review.reviewId,
          contentHash: review.contentHash,
          sourceSetHash: review.sourceSetHash,
          actorId: context.actorId,
          occurredAt: context.now,
          note: parsed.note,
        };
        const newLifecycle: WikiLifecycle = {
          revisionId: parsed.revisionId,
          lifecycleVersion: parsed.expectedLifecycleVersion + 1,
          state: "withdrawn",
          review,
          publication,
        };
        this.db
          .prepare(
            "UPDATE knowledge_lifecycle SET lifecycle_version=?, state=?, data_json=? WHERE revision_id=?",
          )
          .run(
            newLifecycle.lifecycleVersion,
            newLifecycle.state,
            JSON.stringify(newLifecycle),
            newLifecycle.revisionId,
          );
        this.bumpSeq(workspaceId);
        this.emit(
          workspaceId,
          "wiki.withdraw",
          { revisionId: parsed.revisionId, publicationEventId: publication.eventId },
          context,
        );
        const result = this.wikiRevisionResult({ revision, lifecycle: newLifecycle });
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  // -- search -------------------------------------------------------------

  search(query: WikiSearchQuery, context: WikiHostContext): WikiResult {
    const parsed = WikiSearchQuerySchema.parse(query);
    const workspaceId = this.workspaceId();
    if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
    const queryHash = hash(
      JSON.stringify({
        keywords: parsed.keywords,
        scope: parsed.scope,
        locale: parsed.locale,
        kinds: parsed.kinds,
        limit: parsed.limit,
      }),
    );
    // A cursor pins the snapshot it belongs to; a fresh query opens a new one.
    if (parsed.cursor && parsed.cursor.queryHash !== queryHash)
      return failure("REVISION_CONFLICT", "续页游标与当前查询不一致");
    const snapshotId = parsed.cursor ? parsed.cursor.snapshotId : randomUUID();
    const snapshotAt = context.now;
    const checkedAt = context.now;

    // Every published revision, newest per document first (publication head), then
    // deterministic document ordering. Filtering happens after dedup so a scope
    // mismatch on the head never falls back to an older revision.
    const rows = this.db
      .prepare(
        `SELECT w.data_json AS wiki, l.data_json AS lifecycle
           FROM knowledge_wiki w
           JOIN knowledge_lifecycle l ON l.revision_id = w.revision_id
          WHERE w.workspace_id=? AND l.state IN ('published','withdrawn')
          ORDER BY w.document_id ASC, w.version DESC`,
      )
      .all(workspaceId) as { wiki: string; lifecycle: string }[];
    const seen = new Set<string>();
    const hits: WikiSearchHit[] = [];
    for (const row of rows) {
      const revision = JSON.parse(row.wiki) as WikiRevision;
      const lifecycle = JSON.parse(row.lifecycle) as WikiLifecycle;
      if (seen.has(revision.documentId)) continue;
      seen.add(revision.documentId);
      if (lifecycle.state !== "published") continue;
      const { scope, locale, kind, title, markdown, sections, sourceRefs } = revision.content;
      if (scope.platforms.length && !scope.platforms.includes(parsed.scope.platform)) continue;
      if (scope.markets.length && !scope.markets.includes(parsed.scope.market)) continue;
      if (scope.categories.length && !scope.categories.includes(parsed.scope.category)) continue;
      if (Intl.getCanonicalLocales(locale)[0] !== Intl.getCanonicalLocales(parsed.locale)[0])
        continue;
      if (parsed.kinds.length && !parsed.kinds.includes(kind)) continue;
      if (!validityAllows(revision.content.validity, checkedAt)) continue;
      const haystack = `${title}\n${markdown}`.toLocaleLowerCase("und");
      if (parsed.keywords.some((word) => !haystack.includes(word.toLocaleLowerCase("und"))))
        continue;
      const citations = sections.map<KnowledgeCitation>((section) => ({
        revisionId: revision.revisionId,
        contentHash: revision.contentHash,
        sourceSetHash: revision.sourceSetHash,
        documentId: revision.documentId,
        version: revision.version,
        sectionId: section.sectionId,
        sourceRefs: section.sourceReferenceIds.map(
          (id) => sourceRefs.find((ref) => ref.referenceId === id)!,
        ),
      }));
      hits.push({
        revision,
        lifecycle,
        eligibility: { eligible: true, reasons: [] },
        publicationHead: {
          snapshotRevisionId: revision.revisionId,
          currentRevisionId: revision.revisionId,
        },
        citations,
      });
    }

    // Cursor pagination over the already-deduplicated, sorted hit list.
    let start = 0;
    if (parsed.cursor) {
      const idx = hits.findIndex(
        (hit) => hit.revision.documentId === parsed.cursor!.afterDocumentId,
      );
      start = idx < 0 ? hits.length : idx + 1;
    }
    const pageHits = hits.slice(start, start + parsed.limit);
    const nextCursor =
      start + pageHits.length < hits.length
        ? {
            snapshotId,
            queryHash,
            afterDocumentId: pageHits.at(-1)!.revision.documentId,
            afterRevisionId: pageHits.at(-1)!.revision.revisionId,
          }
        : null;
    const page: WikiSearchPage = {
      snapshotId,
      queryHash,
      snapshotAt,
      checkedAt,
      hits: pageHits,
      nextCursor,
    };
    return {
      ok: true,
      data: { kind: "searchPage", page },
      warnings: [],
      evidenceIds: pageHits.map((hit) => hit.revision.revisionId),
    };
  }

  // -- citation -----------------------------------------------------------

  resolveCitation(input: WikiCitationResolveInput, context: WikiHostContext): WikiResult {
    const parsed = WikiCitationResolveInputSchema.parse(input);
    const checkedAt = context.now;
    const record = this.readRecord(parsed.citation.revisionId);
    if (!record) return failure("NOT_FOUND", "引用指向的知识版本不存在");
    const { revision, lifecycle } = record;
    if (!citationMatches(parsed.citation, revision))
      return failure("MISSING_FACTS", "引用与知识段落或来源不一致");

    const sourceIds = [...new Set(parsed.citation.sourceRefs.map((ref) => ref.sourceRevisionId))];
    const sources = sourceIds
      .map((id) => this.readSourceRevision(id))
      .filter((source): source is WikiSourceRevision => source !== null);
    if (sources.length !== sourceIds.length) return failure("NOT_FOUND", "引用来源缺失");

    // Verify each referenced source identity, hash and location against the stored revision.
    for (const ref of parsed.citation.sourceRefs) {
      const source = sources.find((s) => s.sourceRevisionId === ref.sourceRevisionId);
      if (
        !source ||
        source.workspaceId !== revision.workspaceId ||
        source.sourceId !== ref.sourceId ||
        source.version !== ref.sourceVersion ||
        source.artifactHash !== ref.artifactHash
      )
        return failure("SOURCE_CONFLICT", "来源身份或哈希不一致");
    }

    const states = this.sourceStates(sources);
    const currentPublicationRevisionId = this.currentPublishedRevisionId(revision.documentId);
    const eligible = this.eligibility(
      revision,
      lifecycle,
      currentPublicationRevisionId,
      sources,
      states,
      checkedAt,
    );
    // 新引用必须是当前有效依据：任一来源/知识失效或已被更新即整体拒绝，不得返回 ok=true/eligible=false。
    if (parsed.purpose === "new_reference" && !eligible.eligible)
      return failure("SOURCE_CONFLICT", "引用依据已更新或失效，不能作为新引用");
    return {
      ok: true,
      data: {
        kind: "citationResolution",
        resolution: {
          purpose: parsed.purpose,
          lifecycle,
          currentPublicationRevisionId,
          citation: parsed.citation,
          revision,
          sources,
          sourceStates: states,
          eligibility: eligible,
          checkedAt,
        },
      },
      warnings: [],
      evidenceIds: sources.map((source) => source.sourceRevisionId),
    };
  }

  private currentPublishedRevisionId(documentId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT w.revision_id
           FROM knowledge_wiki w
           JOIN knowledge_lifecycle l ON l.revision_id = w.revision_id
          WHERE w.document_id=? AND l.state IN ('published','withdrawn')
          ORDER BY w.version DESC LIMIT 1`,
      )
      .get(documentId) as { revision_id: string } | undefined;
    return row?.revision_id ?? null;
  }

  /** 同一来源是否已存在更高版本：来源 S2 一旦暂存，仍引用 S1 的新引资格须标 source_updated。 */
  private hasNewerSourceVersion(workspaceId: string, sourceId: string, version: number): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS found FROM knowledge_source WHERE workspace_id=? AND source_id=? AND version > ? LIMIT 1",
      )
      .get(workspaceId, sourceId, version) as { found: number } | undefined;
    return row !== undefined;
  }

  private eligibility(
    revision: WikiRevision,
    lifecycle: WikiLifecycle,
    currentPublicationRevisionId: string | null,
    sources: WikiSourceRevision[],
    states: WikiSourceState[],
    checkedAt: string,
  ): WikiEligibility {
    const reasons: WikiIneligibilityReason[] = [];
    if (lifecycle.state === "candidate") reasons.push("candidate");
    else if (lifecycle.state === "rejected") reasons.push("rejected");
    else if (lifecycle.state === "withdrawn") reasons.push("withdrawn");
    else if (lifecycle.state !== "published") reasons.push("unknown");
    if (currentPublicationRevisionId !== revision.revisionId) reasons.push("superseded");
    if (!validityAllows(revision.content.validity, checkedAt))
      reasons.push(validityIneligibility(revision.content.validity, checkedAt));
    for (const source of sources) {
      const state = states.find((s) => s.sourceRevisionId === source.sourceRevisionId);
      if (!state || state.state !== "active") reasons.push("source_unavailable");
      if (!validityAllows(source.validity, checkedAt))
        reasons.push(validityIneligibility(source.validity, checkedAt));
      if (this.hasNewerSourceVersion(revision.workspaceId, source.sourceId, source.version))
        reasons.push("source_updated");
    }
    const unique = [...new Set(reasons)];
    return unique.length === 0
      ? { eligible: true, reasons: [] }
      : { eligible: false, reasons: unique };
  }

  // -- consumption --------------------------------------------------------

  registerConsumption(
    input: WikiConsumptionInput,
    context: WikiHostContext,
    idempotencyKey: string,
  ): WikiResult {
    const parsed = WikiConsumptionInputSchema.parse(input);
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.registerConsumption", parsed, context);
        const legacyRequestHash = legacyRequestFingerprint(
          "wiki.registerConsumption",
          parsed,
          context,
        );
        const prior = this.replay(idempotencyKey, requestHash, legacyRequestHash);
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        // Re-validate every citation against authoritative lifecycle/source state
        // within the same transaction.
        for (const citation of parsed.citations) {
          const record = this.readRecord(citation.revisionId);
          if (!record) return failure("NOT_FOUND", "消费引用指向的知识版本不存在");
          if (record.lifecycle.state !== "published")
            return failure("MISSING_FACTS", "只能消费已发布知识");
          if (!citationMatches(citation, record.revision))
            return failure("MISSING_FACTS", "消费引用与知识段落或来源不一致");
          for (const ref of citation.sourceRefs) {
            const row = this.db
              .prepare("SELECT state FROM knowledge_source WHERE source_revision_id=?")
              .get(ref.sourceRevisionId) as { state: string } | undefined;
            if (!row) return failure("NOT_FOUND", "消费引用来源缺失");
            if (row.state !== "active")
              return failure("SOURCE_CONFLICT", "来源已撤回，不能登记消费");
          }
        }
        // A standalone command cannot register fabricated consumers. Check reports
        // are immutable stored artifacts; quote consumers retain their exact revision.
        if (context.workspaceId !== workspaceId)
          return failure("SOURCE_CONFLICT", "消费工作区不一致");
        const consumer = parsed.consumer;
        if (consumer.kind === "quote") {
          const rows = this.db
            .prepare(`SELECT id,id AS root_id,content_hash,data_json FROM quote_v1 WHERE workspace_id=? AND id=?
          UNION ALL SELECT id,root_id,content_hash,data_json FROM quote_revision WHERE workspace_id=? AND id=?`)
            .all(workspaceId, consumer.revisionId, workspaceId, consumer.revisionId) as {
            id: string;
            root_id: string;
            content_hash: string;
            data_json: string;
          }[];
          const row = rows[0];
          if (
            rows.length !== 1 ||
            !row ||
            row.root_id !== consumer.entityId ||
            row.content_hash !== consumer.contentHash ||
            hash(row.data_json) !== consumer.contentHash ||
            !QuoteSnapshotSchema.safeParse(JSON.parse(row.data_json)).success
          )
            return failure("SOURCE_CONFLICT", "消费报价版本或内容不一致");
        } else {
          if (
            !this.db.prepare("SELECT name FROM sqlite_master WHERE name='quote_check_report'").get()
          )
            return failure("SOURCE_CONFLICT", "消费产出尚未保存");
          const row = this.db
            .prepare(
              "SELECT content_hash,data_json FROM quote_check_report WHERE workspace_id=? AND report_id=?",
            )
            .get(workspaceId, consumer.revisionId) as
            | { content_hash: string; data_json: string }
            | undefined;
          const report = row && CheckReportSchema.safeParse(JSON.parse(row.data_json));
          if (
            !row ||
            consumer.entityId !== consumer.revisionId ||
            row.content_hash !== consumer.contentHash ||
            hash(row.data_json) !== consumer.contentHash ||
            !report ||
            !report.success ||
            JSON.stringify(report.data.wikiCitations) !== JSON.stringify(parsed.citations)
          )
            return failure("SOURCE_CONFLICT", "消费报告版本或完整引用不一致");
        }
        const consumption: WikiConsumption = {
          ...parsed,
          workspaceId,
          consumptionId: randomUUID(),
          registeredAt: context.now,
          actorId: context.actorId,
        };
        this.db
          .prepare(
            "INSERT INTO knowledge_consumption(consumption_id,workspace_id,consumer_kind,consumer_entity_id,consumer_revision_id,registered_at,data_json) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            consumption.consumptionId,
            workspaceId,
            consumption.consumer.kind,
            consumption.consumer.entityId,
            consumption.consumer.revisionId,
            consumption.registeredAt,
            JSON.stringify(consumption),
          );
        this.emit(
          workspaceId,
          "wiki.registerConsumption",
          { consumptionId: consumption.consumptionId },
          context,
        );
        const result = WikiConsumptionResultSchema.parse({
          ok: true,
          data: { kind: "consumption", consumption },
          warnings: [],
          evidenceIds: [consumption.consumptionId],
        });
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  getConsumption(consumer: { kind: "quote" | "artifact"; revisionId: string }): WikiResult {
    const workspaceId = this.workspaceId();
    const row = this.db
      .prepare(
        "SELECT data_json FROM knowledge_consumption WHERE workspace_id=? AND consumer_kind=? AND consumer_revision_id=?",
      )
      .get(workspaceId, consumer.kind, consumer.revisionId) as Row | undefined;
    if (!row) return failure("NOT_FOUND", "消费登记不存在");
    const consumption = JSON.parse(row.data_json) as WikiConsumption;
    return {
      ok: true,
      data: { kind: "consumption", consumption },
      warnings: [],
      evidenceIds: [consumption.consumptionId],
    };
  }

  // -- maintenance (A01e) -------------------------------------------------

  private hasSeqTable(): boolean {
    return (
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_seq'")
        .get() !== undefined
    );
  }

  private currentSeq(workspaceId: string): number {
    if (!this.hasSeqTable()) return 0;
    const row = this.db
      .prepare("SELECT seq FROM knowledge_seq WHERE workspace_id=?")
      .get(workspaceId) as { seq: number } | undefined;
    return row?.seq ?? 0;
  }

  /** 权威快照序号：任何来源/知识生命周期权威写都会单调递增，供索引滞后判定。
   *  旧谱系（尚无 knowledge_seq）写入时安全跳过，待统一迁移补齐后再计数。 */
  private bumpSeq(workspaceId: string): number {
    if (!this.hasSeqTable()) return 0;
    const next = this.currentSeq(workspaceId) + 1;
    this.db
      .prepare(
        "INSERT INTO knowledge_seq(workspace_id,seq) VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET seq=excluded.seq",
      )
      .run(workspaceId, next);
    return next;
  }

  private maintenanceDedupKey(kind: string, target: unknown): string {
    return hash(JSON.stringify({ kind, target }));
  }

  private readMaintenanceIssue(issueId: string): MaintenanceIssue | null {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_maintenance_issue WHERE issue_id=?")
      .get(issueId) as Row | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.data_json) as MaintenanceIssue;
    return MaintenanceIssueSchema.safeParse(parsed).success ? parsed : null;
  }

  /** M06：读回维护页冻结快照；全部事实通过 schema 校验才视为有效，否则视为过期。 */
  private readMaintenanceSnapshot(
    snapshotId: string,
  ): { workspaceId: string; queryHash: string; issues: MaintenanceIssue[] } | null {
    const row = this.db
      .prepare(
        "SELECT workspace_id, query_hash, issues_json FROM knowledge_maintenance_snapshot WHERE snapshot_id=?",
      )
      .get(snapshotId) as
      | { workspace_id: string; query_hash: string; issues_json: string }
      | undefined;
    if (!row) return null;
    const issues = JSON.parse(row.issues_json) as MaintenanceIssue[];
    return issues.every((i) => MaintenanceIssueSchema.safeParse(i).success)
      ? { workspaceId: row.workspace_id, queryHash: row.query_hash, issues }
      : null;
  }

  /** 已发布头部：每个 document 取最新 published 版本（去重），按 document_id 升序。 */
  private publishedHeads(
    workspaceId: string,
  ): { documentId: string; revisionId: string; title: string; markdown: string }[] {
    const rows = this.db
      .prepare(
        `SELECT w.document_id AS document_id, w.revision_id AS revision_id, w.data_json AS wiki
           FROM knowledge_wiki w
           JOIN knowledge_lifecycle l ON l.revision_id = w.revision_id
          WHERE w.workspace_id=? AND l.state='published'
          ORDER BY w.document_id ASC, w.version DESC`,
      )
      .all(workspaceId) as { document_id: string; revision_id: string; wiki: string }[];
    const seen = new Set<string>();
    const heads: { documentId: string; revisionId: string; title: string; markdown: string }[] = [];
    for (const row of rows) {
      if (seen.has(row.document_id)) continue;
      seen.add(row.document_id);
      const revision = JSON.parse(row.wiki) as WikiRevision;
      heads.push({
        documentId: row.document_id,
        revisionId: row.revision_id,
        title: revision.content.title,
        markdown: revision.content.markdown,
      });
    }
    return heads;
  }

  private readImpactReport(reportId: string): KnowledgeImpactReport | null {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_impact_report WHERE report_id=?")
      .get(reportId) as Row | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.data_json) as KnowledgeImpactReport;
    return KnowledgeImpactReportSchema.safeParse(parsed).success ? parsed : null;
  }

  /** M04/B：按证据资格白名单回读「已发生事实」为 MaintenanceEvidence。
   *  六类可作 resolveMaintenance 证据的事实里，本存储当前能产出三类：
   *  knowledge.revision_published（已发布知识版本，取生命周期发布事件）、
   *  source.revised（来源修订，取带前驱的版本行）、index.rebuilt（索引重建完成）。
   *  候选/模型提案/报价/审批、生命周期事件、lint 回执/消费/影响报告均不是证据 → null。
   *  validity_confirmed / integrity_reverified / review_decision 暂缺持久化事实 → null。 */
  private readMaintenanceEvidence(evidenceId: string): MaintenanceEvidence | null {
    const published = this.db
      .prepare(
        `SELECT w.workspace_id AS workspace_id, w.document_id AS document_id, w.version AS version,
                w.revision_id AS revision_id, w.content_hash AS content_hash, w.source_set_hash AS source_set_hash,
                l.data_json AS lifecycle_json
           FROM knowledge_wiki w
           JOIN knowledge_lifecycle l ON l.revision_id = w.revision_id
          WHERE w.revision_id=? AND l.state='published'`,
      )
      .get(evidenceId) as
      | {
          workspace_id: string;
          document_id: string;
          version: number;
          revision_id: string;
          content_hash: string;
          source_set_hash: string;
          lifecycle_json: string;
        }
      | undefined;
    if (published) {
      const lifecycle = JSON.parse(published.lifecycle_json) as {
        publication?: { actorId?: string; occurredAt?: string };
      } | null;
      const pub = lifecycle?.publication;
      if (!pub?.actorId || !pub?.occurredAt) return null;
      const candidate: MaintenanceEvidence = {
        kind: "knowledge.revision_published",
        workspaceId: published.workspace_id,
        evidenceId: published.revision_id,
        occurredAt: pub.occurredAt,
        actorId: pub.actorId,
        revision: {
          documentId: published.document_id,
          revisionId: published.revision_id,
          version: published.version,
          contentHash: published.content_hash,
          sourceSetHash: published.source_set_hash,
          publishedAt: pub.occurredAt,
        },
      };
      return MaintenanceEvidenceSchema.safeParse(candidate).success ? candidate : null;
    }
    const src = this.db
      .prepare(
        "SELECT workspace_id, source_id, version, parent_revision_id, source_revision_id, artifact_hash, created_at, data_json FROM knowledge_source WHERE source_revision_id=?",
      )
      .get(evidenceId) as
      | {
          workspace_id: string;
          source_id: string;
          version: number;
          parent_revision_id: string | null;
          source_revision_id: string;
          artifact_hash: string;
          created_at: string;
          data_json: string;
        }
      | undefined;
    if (src) {
      const parsed = JSON.parse(src.data_json) as { validity?: WikiValidity } | null;
      const validity = parsed?.validity;
      if (!validity) return null;
      // source.revised 须有前驱版本（previousSourceRevisionId 绑定被替换的旧版本）。
      if (src.parent_revision_id === null) return null;
      const candidate: MaintenanceEvidence = {
        kind: "source.revised",
        workspaceId: src.workspace_id,
        evidenceId: src.source_revision_id,
        occurredAt: src.created_at,
        actorId: "system",
        source: {
          sourceId: src.source_id,
          sourceRevisionId: src.source_revision_id,
          previousSourceRevisionId: src.parent_revision_id,
          artifactHash: src.artifact_hash,
          validity,
        },
      };
      return MaintenanceEvidenceSchema.safeParse(candidate).success ? candidate : null;
    }
    const rebuild = this.db
      .prepare("SELECT workspace_id, data_json FROM knowledge_index_rebuild WHERE rebuild_id=?")
      .get(evidenceId) as { workspace_id: string; data_json: string } | undefined;
    if (rebuild) {
      const parsed = JSON.parse(rebuild.data_json) as KnowledgeIndexRebuild | null;
      if (!parsed || parsed.status !== "completed" || parsed.result === null) return null;
      const result = parsed.result;
      const candidate: MaintenanceEvidence = {
        kind: "index.rebuilt",
        workspaceId: rebuild.workspace_id,
        evidenceId: parsed.rebuildId,
        occurredAt: parsed.updatedAt,
        actorId: "system",
        index: {
          index: result.index,
          generation: result.generation,
          indexedSeq: result.indexedSeq,
          authoritativeSeq: result.authoritativeSeq,
        },
      };
      return MaintenanceEvidenceSchema.safeParse(candidate).success ? candidate : null;
    }
    // lint 回执 / 消费 / 影响报告 / 生命周期事件：非证据，返回 null。
    return null;
  }

  /** 按 dedupKey 幂等登记维护问题；已存在只刷新 lastDetectedAt，不重开也不改版本。 */
  private upsertMaintenanceIssue(
    workspaceId: string,
    dedupKey: string,
    kind: MaintenanceIssue["kind"],
    target: MaintenanceTarget,
    severity: MaintenanceIssue["severity"],
    message: string,
    evidenceIds: string[],
    now: string,
  ): MaintenanceIssue {
    const existing = this.db
      .prepare(
        "SELECT data_json FROM knowledge_maintenance_issue WHERE workspace_id=? AND dedup_key=?",
      )
      .get(workspaceId, dedupKey) as Row | undefined;
    if (existing) {
      const issue = JSON.parse(existing.data_json) as MaintenanceIssue;
      const updated: MaintenanceIssue = {
        ...issue,
        lastDetectedAt: now,
        evidenceIds: [...new Set([...issue.evidenceIds, ...evidenceIds])],
      };
      this.db
        .prepare(
          "UPDATE knowledge_maintenance_issue SET last_detected_at=?, data_json=? WHERE issue_id=?",
        )
        .run(updated.lastDetectedAt, JSON.stringify(updated), updated.issueId);
      return updated;
    }
    const issue: MaintenanceIssue = {
      workspaceId,
      issueId: randomUUID(),
      issueVersion: 1,
      dedupKey,
      kind,
      target,
      severity,
      message,
      state: "open",
      evidenceIds,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolution: null,
    };
    const parsed = MaintenanceIssueSchema.safeParse(issue);
    if (!parsed.success) throw new Error("维护问题事实不合法");
    this.db
      .prepare(
        "INSERT INTO knowledge_maintenance_issue(issue_id,workspace_id,dedup_key,kind,state,first_detected_at,last_detected_at,data_json) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        issue.issueId,
        workspaceId,
        dedupKey,
        kind,
        issue.state,
        issue.firstDetectedAt,
        issue.lastDetectedAt,
        JSON.stringify(issue),
      );
    return issue;
  }

  /** source.withdraw：来源生命周期推进为 withdrawn，登记维护队列并落 source.withdrawn 事件。 */
  withdrawSource(
    input: { sourceRevisionId: string; expectedLifecycleVersion: number; note: string },
    context: WikiHostContext,
    idempotencyKey: string,
  ): KnowledgeMaintenanceResult {
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("source.withdraw", input, context);
        const legacyRequestHash = legacyRequestFingerprint("source.withdraw", input, context);
        const prior = this.replay<KnowledgeMaintenanceResult>(
          idempotencyKey,
          requestHash,
          legacyRequestHash,
        );
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const row = this.db
          .prepare(
            "SELECT source_id, version, state, lifecycle_version, artifact_hash FROM knowledge_source WHERE source_revision_id=? AND workspace_id=?",
          )
          .get(input.sourceRevisionId, workspaceId) as
          | {
              source_id: string;
              version: number;
              state: "active" | "withdrawn";
              lifecycle_version: number;
              artifact_hash: string;
            }
          | undefined;
        if (!row) return failure("NOT_FOUND", "来源版本不存在");
        if (input.expectedLifecycleVersion !== row.lifecycle_version)
          return failure(
            "REVISION_CONFLICT",
            `来源生命周期当前版本为 v${row.lifecycle_version}，与提交的 expectedLifecycleVersion 不一致`,
          );
        if (row.state !== "active")
          return failure("ACTION_NOT_ALLOWED", "来源已撤回，不能重复撤回");
        this.bumpSeq(workspaceId);
        const newVersion = row.lifecycle_version + 1;
        this.db
          .prepare(
            "UPDATE knowledge_source SET state='withdrawn', lifecycle_version=? WHERE source_revision_id=?",
          )
          .run(newVersion, input.sourceRevisionId);
        const state: WikiSourceState = {
          sourceRevisionId: input.sourceRevisionId,
          lifecycleVersion: newVersion,
          state: "withdrawn",
          changedAt: context.now,
        };
        const event: KnowledgeMaintenanceLifecycleEvent = {
          schemaVersion: 1,
          workspaceId,
          eventId: randomUUID(),
          entityId: input.sourceRevisionId,
          entityVersion: newVersion,
          type: "source.withdrawn",
          evidenceIds: [input.sourceRevisionId],
          actorId: context.actorId,
          occurredAt: context.now,
          note: input.note,
        };
        this.emit(
          workspaceId,
          "source.withdrawn",
          { sourceRevisionId: input.sourceRevisionId, eventId: event.eventId },
          context,
        );
        this.upsertMaintenanceIssue(
          workspaceId,
          this.maintenanceDedupKey("source_withdrawn", {
            sourceId: row.source_id,
            sourceRevisionId: input.sourceRevisionId,
          }),
          "source_withdrawn",
          {
            kind: "source",
            sourceId: row.source_id,
            sourceRevisionId: input.sourceRevisionId,
            artifactHash: row.artifact_hash,
          },
          "warning",
          `来源 v${row.version} 已撤回，依赖该来源的知识与消费需复核`,
          [input.sourceRevisionId],
          context.now,
        );
        const result = {
          ok: true,
          data: { kind: "sourceWithdrawal", state, event },
          warnings: [],
          evidenceIds: [event.eventId, input.sourceRevisionId],
        } satisfies KnowledgeMaintenanceResult;
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  /** wiki.getMaintenance：按 kinds/states 过滤，issueId 稳定前进分页。
   *  M06：首页固定全量候选集 + 事实快照，续页从快照读回冻结的 version/state，
   *  不再回读并发处理后的更新状态。 */
  getMaintenance(query: MaintenanceQuery, context: WikiHostContext): KnowledgeMaintenanceResult {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
    const kinds = [...query.kinds].sort();
    const states = [...query.states].sort();
    const queryHash = hash(JSON.stringify({ kinds, states }));
    if (query.cursor !== null && query.cursor.queryHash !== queryHash)
      return failure("REVISION_CONFLICT", "续页游标与当前查询不一致");

    let frozen: MaintenanceIssue[] | null;
    let snapshotId: string;
    if (query.cursor === null) {
      snapshotId = randomUUID();
      const kindsFilter =
        kinds.length === 0 ? "" : ` AND kind IN (${kinds.map(() => "?").join(",")})`;
      const statesFilter =
        states.length === 0 ? "" : ` AND state IN (${states.map(() => "?").join(",")})`;
      const rows = this.db
        .prepare(
          `SELECT issue_id FROM knowledge_maintenance_issue WHERE workspace_id=?${kindsFilter}${statesFilter} ORDER BY issue_id`,
        )
        .all(workspaceId, ...kinds, ...states) as { issue_id: string }[];
      frozen = rows
        .map((r) => this.readMaintenanceIssue(r.issue_id))
        .filter((i): i is MaintenanceIssue => i !== null);
      this.db
        .prepare(
          "INSERT INTO knowledge_maintenance_snapshot(snapshot_id,workspace_id,query_hash,checked_at,issues_json) VALUES (?,?,?,?,?)",
        )
        .run(snapshotId, workspaceId, queryHash, context.now, JSON.stringify(frozen));
    } else {
      snapshotId = query.cursor.snapshotId;
      const snapshot = this.readMaintenanceSnapshot(snapshotId);
      if (snapshot === null) return failure("REVISION_CONFLICT", "维护页快照不存在或已过期");
      if (snapshot.workspaceId !== workspaceId || snapshot.queryHash !== queryHash)
        return failure("REVISION_CONFLICT", "维护页快照与当前工作区或查询条件不一致");
      frozen = snapshot.issues;
    }

    const afterIssueId = query.cursor?.afterIssueId ?? "";
    let start = 0;
    if (afterIssueId !== "") {
      const idx = frozen.findIndex((i) => i.issueId === afterIssueId);
      start = idx < 0 ? frozen.length : idx + 1;
    }
    const issues = frozen.slice(start, start + query.limit);
    const hasMore = start + issues.length < frozen.length;
    const nextCursor =
      hasMore && issues.length > 0
        ? { snapshotId, queryHash, afterIssueId: issues[issues.length - 1]!.issueId }
        : null;
    const page: MaintenancePage = {
      snapshotId,
      queryHash,
      checkedAt: context.now,
      issues,
      nextCursor,
    };
    const parsed = MaintenancePageSchema.safeParse(page);
    if (!parsed.success) return failure("STORAGE_ERROR", "维护页事实不完整");
    return {
      ok: true,
      data: { kind: "maintenancePage", page: parsed.data },
      warnings: [],
      evidenceIds: issues.map((i) => i.issueId),
    };
  }

  /** wiki.resolveMaintenance：OCC 推进 open→in_progress→resolved/dismissed。 */
  resolveMaintenance(
    input: {
      issueId: string;
      expectedIssueVersion: number;
      action: "start_review" | "resolve" | "dismiss";
      note: string;
      evidenceIds: string[];
    },
    context: WikiHostContext,
    idempotencyKey: string,
  ): KnowledgeMaintenanceResult {
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.resolveMaintenance", input, context);
        const legacyRequestHash = legacyRequestFingerprint(
          "wiki.resolveMaintenance",
          input,
          context,
        );
        const prior = this.replay<KnowledgeMaintenanceResult>(
          idempotencyKey,
          requestHash,
          legacyRequestHash,
        );
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const issue = this.readMaintenanceIssue(input.issueId);
        if (!issue) return failure("NOT_FOUND", "维护问题不存在");
        // B 资格政策：把 evidenceIds 解析为「已发生事实」证据（权威读取）。
        //  生命周期事件、候选/模型提案/报价/审批、lint/消费/影响报告不在此列。
        //  resolve/dismiss 必须每条证据都可解析且决定性；start_review 不关闭问题，
        //  证据为参考性，未解析的事实跳过（由裁决器只校验同工作区）。
        const evidence: MaintenanceEvidence[] = [];
        for (const id of input.evidenceIds) {
          const fact = this.readMaintenanceEvidence(id);
          if (fact) evidence.push(fact);
          else if (input.action !== "start_review")
            return failure("NOT_FOUND", `处理证据 ${id} 不存在或不属于六类证据事实`);
        }
        // B 资格政策：事务内首错判定（actor/workspace/version/state/证据资格/绑定/时点）。
        const verdict = evaluateMaintenanceResolution({
          workspaceId,
          actorId: context.actorId,
          origin: context.origin,
          action: input.action,
          issue,
          expectedIssueVersion: input.expectedIssueVersion,
          resolvedAt: context.now,
          evidence,
        });
        if (!verdict.ok)
          return failure(verdict.code, `${verdict.message}（${verdict.reason}）`);
        let nextState: MaintenanceIssue["state"];
        let resolution: MaintenanceIssue["resolution"];
        let eventType: KnowledgeMaintenanceLifecycleEvent["type"];
        if (input.action === "start_review") {
          nextState = "in_progress";
          resolution = null;
          eventType = "maintenance.in_progress";
        } else {
          nextState = input.action === "resolve" ? "resolved" : "dismissed";
          resolution = {
            action: input.action,
            note: input.note,
            evidenceIds: input.evidenceIds,
            actorId: context.actorId,
            resolvedAt: context.now,
          };
          eventType = input.action === "resolve" ? "maintenance.resolved" : "maintenance.dismissed";
        }
        const updated: MaintenanceIssue = {
          ...issue,
          issueVersion: issue.issueVersion + 1,
          state: nextState,
          resolution,
        };
        const parsedIssue = MaintenanceIssueSchema.safeParse(updated);
        if (!parsedIssue.success) return failure("MISSING_FACTS", "维护问题处理事实不完整");
        this.db
          .prepare("UPDATE knowledge_maintenance_issue SET state=?, data_json=? WHERE issue_id=?")
          .run(updated.state, JSON.stringify(updated), updated.issueId);
        this.emit(workspaceId, eventType, { issueId: updated.issueId }, context);
        const result = {
          ok: true,
          data: { kind: "maintenanceIssue", issue: parsedIssue.data },
          warnings: [],
          evidenceIds: [updated.issueId],
        } satisfies KnowledgeMaintenanceResult;
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  /** wiki.analyzeImpact：计算主题波及的知识版本与消费，并登记维护队列。 */
  analyzeImpact(
    subject: KnowledgeImpactSubject,
    context: WikiHostContext,
    idempotencyKey: string,
  ): KnowledgeMaintenanceResult {
    return this.db
      .transaction(() => {
        const subjectParsed = KnowledgeImpactSubjectSchema.safeParse(subject);
        if (!subjectParsed.success) return failure("VALIDATION_ERROR", "影响分析主题不合法");
        const requestHash = requestFingerprint("wiki.analyzeImpact", subjectParsed.data, context);
        const legacyRequestHash = legacyRequestFingerprint(
          "wiki.analyzeImpact",
          subjectParsed.data,
          context,
        );
        const prior = this.replay<KnowledgeMaintenanceResult>(
          idempotencyKey,
          requestHash,
          legacyRequestHash,
        );
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        if (subject.target.kind === "source") {
          const src = this.readSourceRevision(subject.target.sourceRevisionId);
          if (!src || src.workspaceId !== workspaceId)
            return failure("NOT_FOUND", "影响分析来源不存在");
          if (src.sourceId !== subject.target.sourceId)
            return failure("SOURCE_CONFLICT", "影响分析来源身份与固定来源不符");
          if (src.artifactHash !== subject.target.artifactHash)
            return failure("SOURCE_CONFLICT", "影响分析来源内容哈希与固定来源不符");
          if (subject.reason === "source_updated" && subject.replacementRevisionId) {
            const repl = this.readSourceRevision(subject.replacementRevisionId);
            if (!repl || repl.sourceId !== subject.target.sourceId)
              return failure("NOT_FOUND", "替代来源版本不存在或不属于同源");
            if (repl.version <= src.version)
              return failure("SOURCE_CONFLICT", "替代来源版本必须晚于原来源版本");
          }
        } else if (subject.target.kind === "knowledge") {
          const rev = this.readWikiRevision(subject.target.revisionId);
          if (!rev || rev.workspaceId !== workspaceId)
            return failure("NOT_FOUND", "影响分析知识版本不存在");
          if (rev.contentHash !== subject.target.contentHash)
            return failure("SOURCE_CONFLICT", "影响分析知识内容哈希与固定版本不符");
          if (rev.sourceSetHash !== subject.target.sourceSetHash)
            return failure("SOURCE_CONFLICT", "影响分析知识来源集哈希与固定版本不符");
          if (rev.documentId !== subject.target.documentId)
            return failure("SOURCE_CONFLICT", "影响分析知识文档身份与固定版本不符");
        } else {
          return failure("VALIDATION_ERROR", "影响分析主题不得为消费者");
        }

        const issueKind: MaintenanceIssue["kind"] =
          subject.reason === "withdrawn" ? "source_withdrawn" : subject.reason;
        const targetEvidence =
          subject.target.kind === "source"
            ? subject.target.sourceRevisionId
            : subject.target.revisionId;
        const dedupTarget =
          issueKind === "source_withdrawn" && subject.target.kind === "source"
            ? {
                sourceId: subject.target.sourceId,
                sourceRevisionId: subject.target.sourceRevisionId,
              }
            : subject.target;
        this.upsertMaintenanceIssue(
          workspaceId,
          this.maintenanceDedupKey(issueKind, dedupTarget),
          issueKind,
          subject.target,
          issueKind === "conflict" || issueKind === "expired" ? "block" : "warning",
          `影响分析主题：${subject.reason}`,
          [targetEvidence],
          context.now,
        );

        const affectedRevisionIds = new Set<string>();
        if (subject.target.kind === "source") {
          const sourceId = subject.target.sourceId;
          const all = this.db
            .prepare("SELECT revision_id FROM knowledge_wiki WHERE workspace_id=?")
            .all(workspaceId) as { revision_id: string }[];
          for (const { revision_id } of all) {
            const rev = this.readWikiRevision(revision_id);
            if (rev && rev.content.sourceRefs.some((ref) => ref.sourceId === sourceId))
              affectedRevisionIds.add(revision_id);
          }
        } else {
          affectedRevisionIds.add(subject.target.revisionId);
        }

        const consumptions = this.db
          .prepare("SELECT data_json FROM knowledge_consumption WHERE workspace_id=?")
          .all(workspaceId) as Row[];
        const items: KnowledgeImpactItem[] = [];
        let hasUnknownConsumer = false;
        for (const revisionId of affectedRevisionIds) {
          const rev = this.readWikiRevision(revisionId);
          if (!rev) continue;
          items.push({
            itemId: randomUUID(),
            target: {
              kind: "knowledge",
              revisionId: rev.revisionId,
              contentHash: rev.contentHash,
              sourceSetHash: rev.sourceSetHash,
              documentId: rev.documentId,
            },
            viaKnowledgeRevisionIds: [rev.revisionId],
            consumptionId: null,
            consumerState: null,
            requiresReview: false,
          });
          for (const row of consumptions) {
            const consumption = JSON.parse(row.data_json) as WikiConsumption;
            if (!consumption.citations.some((c) => c.revisionId === revisionId)) continue;
            items.push({
              itemId: randomUUID(),
              target: {
                kind: "consumer",
                consumerKind: consumption.consumer.kind,
                entityId: consumption.consumer.entityId,
                revisionId: consumption.consumer.revisionId,
                contentHash: consumption.consumer.contentHash,
              },
              viaKnowledgeRevisionIds: [revisionId],
              consumptionId: consumption.consumptionId,
              consumerState: "unknown",
              requiresReview: true,
            });
            hasUnknownConsumer = true;
          }
        }

        const snapshotSeq = this.currentSeq(workspaceId);
        const status: KnowledgeImpactReport["status"] = hasUnknownConsumer
          ? "partial"
          : "completed";
        const report: KnowledgeImpactReport = {
          workspaceId,
          reportId: randomUUID(),
          subject: subjectParsed.data,
          snapshotSeq,
          checkedAt: context.now,
          status,
          totalItems: status === "completed" ? items.length : null,
          unknownReasons: hasUnknownConsumer ? ["受影响消费者的最终状态需桌面侧判定"] : [],
          error: null,
        };
        const parsedReport = KnowledgeImpactReportSchema.safeParse(report);
        if (!parsedReport.success) return failure("MISSING_FACTS", "影响分析报告事实不完整");
        this.db
          .prepare(
            "INSERT INTO knowledge_impact_report(report_id,workspace_id,snapshot_seq,data_json) VALUES (?,?,?,?)",
          )
          .run(report.reportId, workspaceId, snapshotSeq, JSON.stringify(report));
        for (const item of items) {
          if (!KnowledgeImpactItemSchema.safeParse(item).success) continue;
          this.db
            .prepare(
              "INSERT INTO knowledge_impact_item(item_id,report_id,data_json) VALUES (?,?,?)",
            )
            .run(item.itemId, report.reportId, JSON.stringify(item));
        }
        const result = {
          ok: true,
          data: { kind: "impactReport", report: parsedReport.data },
          warnings: [],
          evidenceIds: [report.reportId],
        } satisfies KnowledgeMaintenanceResult;
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  /** wiki.getImpact：按 reportId 读回影响页，itemId 稳定前进分页。 */
  getImpact(
    query: z.infer<typeof KnowledgeImpactQuerySchema>,
    _context: WikiHostContext,
  ): KnowledgeMaintenanceResult {
    const report = this.readImpactReport(query.reportId);
    if (!report) return failure("NOT_FOUND", "影响分析报告不存在");
    const afterItemId = query.cursor?.afterItemId ?? "";
    const rows = this.db
      .prepare(
        "SELECT item_id FROM knowledge_impact_item WHERE report_id=? AND item_id > ? ORDER BY item_id LIMIT ?",
      )
      .all(query.reportId, afterItemId, query.limit + 1) as { item_id: string }[];
    const items = rows
      .slice(0, query.limit)
      .map((r) => {
        const row = this.db
          .prepare("SELECT data_json FROM knowledge_impact_item WHERE item_id=?")
          .get(r.item_id) as Row | undefined;
        return row ? (JSON.parse(row.data_json) as KnowledgeImpactItem) : null;
      })
      .filter((i): i is KnowledgeImpactItem => i !== null);
    const hasMore = rows.length > query.limit;
    const nextCursor =
      hasMore && items.length > 0
        ? { reportId: report.reportId, afterItemId: items[items.length - 1]!.itemId }
        : null;
    const page: KnowledgeImpactPage = { report, items, nextCursor };
    const parsed = KnowledgeImpactPageSchema.safeParse(page);
    if (!parsed.success) return failure("STORAGE_ERROR", "影响分析页事实不完整");
    return {
      ok: true,
      data: { kind: "impactPage", page: parsed.data },
      warnings: [],
      evidenceIds: items.map((i) => i.itemId),
    };
  }

  /** wiki.getIndexStatus：按当前权威快照序号推导缺失/滞后/就绪。 */
  getIndexStatus(
    index: "keyword" | "markdown_view",
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
    const authoritativeSeq = this.currentSeq(workspaceId);
    const row = this.db
      .prepare(
        "SELECT generation, indexed_seq FROM knowledge_index_status WHERE workspace_id=? AND index_kind=?",
      )
      .get(workspaceId, index) as { generation: number; indexed_seq: number } | undefined;
    const generation = row?.generation ?? 0;
    const indexedSeq = row?.indexed_seq ?? 0;
    const state: KnowledgeIndexStatus["state"] =
      generation === 0 && indexedSeq === 0
        ? "missing"
        : indexedSeq < authoritativeSeq
          ? "stale"
          : "ready";
    const status: KnowledgeIndexStatus = {
      workspaceId,
      index,
      generation,
      authoritativeSeq,
      indexedSeq,
      state,
      rebuildId: null,
      checkedAt: context.now,
      error: null,
    };
    const parsed = KnowledgeIndexStatusSchema.safeParse(status);
    if (!parsed.success) return failure("STORAGE_ERROR", "索引状态事实不完整");
    return {
      ok: true,
      data: { kind: "indexStatus", status: parsed.data },
      warnings: [],
      evidenceIds: [],
    };
  }

  /** wiki.rebuildIndex：OCC 校验代际/权威序号后原子推进投影并落重建票据。 */
  rebuildIndex(
    input: {
      index: "keyword" | "markdown_view";
      expectedGeneration: number;
      expectedAuthoritativeSeq: number;
    },
    context: WikiHostContext,
    idempotencyKey: string,
  ): KnowledgeMaintenanceResult {
    return this.db
      .transaction(() => {
        const requestHash = requestFingerprint("wiki.rebuildIndex", input, context);
        const legacyRequestHash = legacyRequestFingerprint("wiki.rebuildIndex", input, context);
        const prior = this.replay<KnowledgeMaintenanceResult>(
          idempotencyKey,
          requestHash,
          legacyRequestHash,
        );
        if (prior === "conflict")
          return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
        if (prior) return prior;
        const workspaceId = this.workspaceId();
        if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
        const row = this.db
          .prepare(
            "SELECT generation, indexed_seq FROM knowledge_index_status WHERE workspace_id=? AND index_kind=?",
          )
          .get(workspaceId, input.index) as { generation: number; indexed_seq: number } | undefined;
        const currentGeneration = row?.generation ?? 0;
        const currentAuthoritative = this.currentSeq(workspaceId);
        if (input.expectedGeneration !== currentGeneration)
          return failure(
            "REVISION_CONFLICT",
            `索引当前代际为 ${currentGeneration}，与提交的 expectedGeneration 不一致`,
          );
        if (input.expectedAuthoritativeSeq !== currentAuthoritative)
          return failure(
            "REVISION_CONFLICT",
            `权威快照当前序号为 ${currentAuthoritative}，与提交的 expectedAuthoritativeSeq 不一致`,
          );
        const requestedSeq = currentAuthoritative;
        const targetGeneration = currentGeneration + 1;
        const now = context.now;
        // B 决策：实际构建分代投影，校验通过后才原子切换；绝不只推进代际。
        // 事务内先物化新代际行，再更新状态指向该代际；失败则整体回滚。
        const heads = this.publishedHeads(workspaceId);
        if (input.index === "markdown_view") {
          this.db
            .prepare("DELETE FROM knowledge_index_markdown WHERE workspace_id=? AND generation=?")
            .run(workspaceId, targetGeneration);
          const insert = this.db.prepare(
            "INSERT INTO knowledge_index_markdown(generation,workspace_id,document_id,revision_id,markdown) VALUES (?,?,?,?,?)",
          );
          for (const h of heads)
            insert.run(targetGeneration, workspaceId, h.documentId, h.revisionId, h.markdown);
          const built = this.db
            .prepare(
              "SELECT COUNT(*) AS c FROM knowledge_index_markdown WHERE workspace_id=? AND generation=?",
            )
            .get(workspaceId, targetGeneration) as { c: number };
          if (built.c !== heads.length)
            return failure("STORAGE_ERROR", "markdown_view 投影构建校验失败");
        } else {
          this.db
            .prepare("DELETE FROM knowledge_index_keyword WHERE workspace_id=? AND generation=?")
            .run(workspaceId, targetGeneration);
          const insert = this.db.prepare(
            "INSERT INTO knowledge_index_keyword(generation,workspace_id,keyword,document_id,revision_id) VALUES (?,?,?,?,?)",
          );
          let tokenCount = 0;
          for (const h of heads) {
            for (const keyword of tokenize(`${h.title}\n${h.markdown}`)) {
              insert.run(targetGeneration, workspaceId, keyword, h.documentId, h.revisionId);
              tokenCount += 1;
            }
          }
          const built = this.db
            .prepare(
              "SELECT COUNT(*) AS c FROM knowledge_index_keyword WHERE workspace_id=? AND generation=?",
            )
            .get(workspaceId, targetGeneration) as { c: number };
          if (built.c !== tokenCount) return failure("STORAGE_ERROR", "keyword 投影构建校验失败");
        }
        const status: KnowledgeIndexStatus = {
          workspaceId,
          index: input.index,
          generation: targetGeneration,
          authoritativeSeq: requestedSeq,
          indexedSeq: requestedSeq,
          state: "ready",
          rebuildId: null,
          checkedAt: now,
          error: null,
        };
        const parsedStatus = KnowledgeIndexStatusSchema.safeParse(status);
        if (!parsedStatus.success) return failure("MISSING_FACTS", "重建后索引状态不合法");
        const rebuildId = randomUUID();
        const rebuild: KnowledgeIndexRebuild = {
          workspaceId,
          rebuildId,
          operationKey: idempotencyKey,
          index: input.index,
          requestedSeq,
          targetGeneration,
          status: "completed",
          createdAt: now,
          updatedAt: now,
          result: parsedStatus.data,
          error: null,
        };
        const parsedRebuild = KnowledgeIndexRebuildSchema.safeParse(rebuild);
        if (!parsedRebuild.success) return failure("MISSING_FACTS", "重建票据事实不完整");
        this.db
          .prepare(
            "INSERT INTO knowledge_index_status(workspace_id,index_kind,generation,authoritative_seq,indexed_seq,state,rebuild_id,data_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,index_kind) DO UPDATE SET generation=excluded.generation,authoritative_seq=excluded.authoritative_seq,indexed_seq=excluded.indexed_seq,state=excluded.state,rebuild_id=excluded.rebuild_id,data_json=excluded.data_json",
          )
          .run(
            workspaceId,
            input.index,
            targetGeneration,
            requestedSeq,
            requestedSeq,
            "ready",
            null,
            JSON.stringify(status),
          );
        this.db
          .prepare(
            "INSERT INTO knowledge_index_rebuild(rebuild_id,workspace_id,index_kind,data_json) VALUES (?,?,?,?)",
          )
          .run(rebuildId, workspaceId, input.index, JSON.stringify(rebuild));
        this.emit(
          workspaceId,
          "index.rebuilt",
          { index: input.index, rebuildId, generation: targetGeneration },
          context,
        );
        const result = {
          ok: true,
          data: { kind: "indexRebuild", rebuild: parsedRebuild.data },
          warnings: [],
          evidenceIds: [rebuildId],
        } satisfies KnowledgeMaintenanceResult;
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      })
      .immediate();
  }

  /** wiki.getIndexRebuild：按 rebuildId 读回重建票据。 */
  getIndexRebuild(rebuildId: string): KnowledgeMaintenanceResult {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_index_rebuild WHERE rebuild_id=?")
      .get(rebuildId) as Row | undefined;
    if (!row) return failure("NOT_FOUND", "索引重建票据不存在");
    const rebuild = JSON.parse(row.data_json) as KnowledgeIndexRebuild;
    const parsed = KnowledgeIndexRebuildSchema.safeParse(rebuild);
    if (!parsed.success) return failure("STORAGE_ERROR", "索引重建票据不完整");
    return {
      ok: true,
      data: { kind: "indexRebuild", rebuild: parsed.data },
      warnings: [],
      evidenceIds: [rebuildId],
    };
  }
}
