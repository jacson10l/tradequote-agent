import { createHash, randomUUID } from "node:crypto";
import {
  type ExecutionContext,
  failure,
  type KnowledgeDraftInput,
  KnowledgeDraftInputSchema,
  type KnowledgePublishInput,
  KnowledgePublishInputSchema,
  type KnowledgeQuery,
  KnowledgeQuerySchema,
  type KnowledgeRepository,
  type KnowledgeRevision,
  type KnowledgeRevisionResult,
} from "@tradequote/contracts";
import type Database from "better-sqlite3";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Row = { data_json: string };

/** A01b SQLite store for knowledge revisions, mirroring TradeStore conventions:
 *  immediate transactions, idempotency replay, outbox events, immutable rows.
 *  Publishing never mutates: it appends a published row for the same (document,version);
 *  at most one staged revision may exist per document at a time. */
export class SqliteKnowledgeStore implements KnowledgeRepository {
  constructor(private readonly db: Database.Database) {}

  private workspaceId(): string | null {
    const row = this.db.prepare("SELECT id FROM workspace WHERE slot=1").get() as
      | { id: string }
      | undefined;
    return row ? row.id : null;
  }

  private replay(
    key: string,
    requestHash: string,
  ): KnowledgeRevisionResult | "conflict" | null {
    const prior = this.db
      .prepare("SELECT request_hash, result_json FROM idempotency WHERE key=?")
      .get(key) as { request_hash: string; result_json: string } | undefined;
    if (!prior) return null;
    return prior.request_hash === requestHash
      ? (JSON.parse(prior.result_json) as KnowledgeRevisionResult)
      : "conflict";
  }

  private emit(
    workspaceId: string,
    type: string,
    payload: unknown,
    context: ExecutionContext,
  ) {
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
        new Date().toISOString(),
      );
  }

  private revisionRow(
    revision: KnowledgeRevision,
    workspaceId: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO knowledge_revision(id,workspace_id,document_id,version,status,source_hash,created_at,published_at,data_json) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        revision.revisionId,
        workspaceId,
        revision.documentId,
        revision.version,
        revision.status,
        revision.sourceHash,
        revision.createdAt,
        revision.publishedAt,
        JSON.stringify(revision),
      );
  }

  private ok(revision: KnowledgeRevision, evidenceIds: string[]): KnowledgeRevisionResult {
    return { ok: true, data: { kind: "revision", revision }, warnings: [], evidenceIds };
  }

  getRevision(revisionId: string): KnowledgeRevision | null {
    const row = this.db
      .prepare("SELECT data_json FROM knowledge_revision WHERE id=?")
      .get(revisionId) as Row | undefined;
    return row ? (JSON.parse(row.data_json) as KnowledgeRevision) : null;
  }

  findPublished(query: KnowledgeQuery): KnowledgeRevision[] {
    const parsed = KnowledgeQuerySchema.parse(query);
    const rows = this.db
      .prepare(
        "SELECT data_json FROM knowledge_revision WHERE status='published' ORDER BY document_id, version DESC",
      )
      .all() as Row[];
    const at = Date.parse(parsed.at);
    const seen = new Set<string>();
    const out: KnowledgeRevision[] = [];
    for (const row of rows) {
      const revision = JSON.parse(row.data_json) as KnowledgeRevision;
      if (seen.has(revision.documentId)) continue; // first hit is the highest version
      seen.add(revision.documentId);
      if (Date.parse(revision.createdAt) > at) continue;
      if (revision.publishedAt !== null && Date.parse(revision.publishedAt) > at) continue;
      const { scope } = revision.content;
      if (!scope.platforms.includes(parsed.scope.platform)) continue;
      if (!scope.markets.includes(parsed.scope.market)) continue;
      if (!scope.categories.includes(parsed.scope.category)) continue;
      out.push(revision);
    }
    return out;
  }

  stage(
    input: KnowledgeDraftInput,
    context: ExecutionContext,
    idempotencyKey: string,
  ): KnowledgeRevisionResult {
    const draft = KnowledgeDraftInputSchema.parse(input);
    return this.db.transaction(() => {
      const requestHash = hash(
        JSON.stringify({ method: "knowledge.stage", payload: draft, context }),
      );
      const prior = this.replay(idempotencyKey, requestHash);
      if (prior === "conflict")
        return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
      if (prior) return prior;
      const workspaceId = this.workspaceId();
      if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
      const staged = this.db
        .prepare(
          `SELECT version FROM knowledge_revision k
           WHERE document_id=? AND status='staged'
             AND NOT EXISTS (
               SELECT 1 FROM knowledge_revision p
               WHERE p.document_id=k.document_id AND p.version=k.version AND p.status='published')`,
        )
        .get(draft.documentId) as { version: number } | undefined;
      if (staged)
        return failure(
          "REVISION_CONFLICT",
          `该文档已有待发布版本 v${staged.version}，请先发布或放弃后重新加载`,
        );
      const last = this.db
        .prepare(
          "SELECT MAX(version) AS version FROM knowledge_revision WHERE document_id=?",
        )
        .get(draft.documentId) as { version: number | null };
      const currentVersion = last.version ?? 0;
      if (currentVersion !== draft.expectedVersion)
        return failure(
          "REVISION_CONFLICT",
          `文档当前版本为 v${currentVersion}，与提交的 expectedVersion 不一致，请重新加载`,
        );
      const now = new Date().toISOString();
      const { documentId: _documentId, expectedVersion: _expectedVersion, ...content } = draft;
      const revision: KnowledgeRevision = {
        revisionId: randomUUID(),
        documentId: draft.documentId,
        version: currentVersion + 1,
        status: "staged",
        sourceHash: hash(draft.sourceText),
        createdAt: now,
        publishedAt: null,
        content,
      };
      this.revisionRow(revision, workspaceId);
      this.emit(
        workspaceId,
        "knowledge.stage",
        { entityId: revision.revisionId, documentId: revision.documentId },
        context,
      );
      const result = this.ok(revision, [revision.revisionId]);
      this.db
        .prepare("INSERT INTO idempotency VALUES (?,?,?)")
        .run(idempotencyKey, requestHash, JSON.stringify(result));
      return result;
    })();
  }

  publish(
    input: KnowledgePublishInput,
    context: ExecutionContext,
    idempotencyKey: string,
  ): KnowledgeRevisionResult {
    const parsed = KnowledgePublishInputSchema.parse(input);
    return this.db.transaction(() => {
      const requestHash = hash(
        JSON.stringify({ method: "knowledge.publish", payload: parsed, context }),
      );
      const prior = this.replay(idempotencyKey, requestHash);
      if (prior === "conflict")
        return failure("IDEMPOTENCY_CONFLICT", "同一操作标识不能用于不同内容");
      if (prior) return prior;
      const workspaceId = this.workspaceId();
      if (!workspaceId) return failure("NOT_FOUND", "请先创建工作区");
      const target = this.getRevision(parsed.revisionId);
      if (!target) return failure("NOT_FOUND", "指定版本不存在");
      const publishedRow = this.db
        .prepare(
          "SELECT data_json FROM knowledge_revision WHERE document_id=? AND version=? AND status='published'",
        )
        .get(target.documentId, target.version) as Row | undefined;
      if (publishedRow) {
        // Retry-safe across different keys: republishing returns the existing publication.
        const publishedAlready = JSON.parse(publishedRow.data_json) as KnowledgeRevision;
        const result = this.ok(publishedAlready, [publishedAlready.revisionId]);
        this.db
          .prepare("INSERT INTO idempotency VALUES (?,?,?)")
          .run(idempotencyKey, requestHash, JSON.stringify(result));
        return result;
      }
      if (target.status !== "staged") return failure("NOT_FOUND", "指定版本不存在");
      if (target.sourceHash !== parsed.sourceHash)
        return failure(
          "SOURCE_CONFLICT",
          "来源哈希与暂存内容不一致，请重新核对原文后发布",
        );
      const now = new Date().toISOString();
      const published: KnowledgeRevision = {
        ...target,
        revisionId: randomUUID(),
        status: "published",
        publishedAt: now,
      };
      this.revisionRow(published, workspaceId);
      this.emit(
        workspaceId,
        "knowledge.publish",
        {
          entityId: published.revisionId,
          stagedRevisionId: target.revisionId,
          documentId: published.documentId,
        },
        context,
      );
      const result = this.ok(published, [published.revisionId]);
      this.db
        .prepare("INSERT INTO idempotency VALUES (?,?,?)")
        .run(idempotencyKey, requestHash, JSON.stringify(result));
      return result;
    })();
  }
}
