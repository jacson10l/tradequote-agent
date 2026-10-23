import { createHash, randomUUID } from "node:crypto";
import {
  failure,
  type KnowledgeCitation,
  type WikiCitationResolveInput,
  WikiCitationResolveInputSchema,
  type WikiConsumption,
  type WikiConsumptionInput,
  WikiConsumptionInputSchema,
  WikiEligibilitySchema,
  type WikiHostContext,
  WikiIneligibilityReasonSchema,
  type WikiLifecycle,
  type WikiResult,
  type WikiRevision,
  type WikiRevisionRecord,
  WikiSearchHitSchema,
  type WikiSearchPage,
  type WikiSearchQuery,
  WikiSearchQuerySchema,
  type WikiSourceRevision,
  type WikiSourceState,
  type WikiSourceStageInput,
  WikiSourceStageInputSchema,
  type WikiStageInput,
  WikiStageInputSchema,
  wikiSourceSetPayload,
} from "@tradequote/contracts";
import type Database from "better-sqlite3";
import { z } from "zod";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sha256Utf8 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

type Row = { data_json: string };
type WikiEligibility = z.infer<typeof WikiEligibilitySchema>;
type WikiIneligibilityReason = z.infer<typeof WikiIneligibilityReasonSchema>;
type WikiSearchHit = z.infer<typeof WikiSearchHitSchema>;

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

  private replay(key: string, requestHash: string): WikiResult | "conflict" | null {
    const prior = this.db
      .prepare("SELECT request_hash, result_json FROM idempotency WHERE key=?")
      .get(key) as { request_hash: string; result_json: string } | undefined;
    if (!prior) return null;
    return prior.request_hash === requestHash
      ? (JSON.parse(prior.result_json) as WikiResult)
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

  stageSource(input: WikiSourceStageInput, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = WikiSourceStageInputSchema.parse(input);
    return this.db.transaction(() => {
      const requestHash = hash(JSON.stringify({ method: "source.stage", payload: parsed, context }));
      const prior = this.replay(idempotencyKey, requestHash);
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
      this.emit(workspaceId, "source.stage", { sourceRevisionId: sourceRevision.sourceRevisionId }, context);
      const result = this.sourceRevisionResult(sourceRevision);
      this.db
        .prepare("INSERT INTO idempotency VALUES (?,?,?)")
        .run(idempotencyKey, requestHash, JSON.stringify(result));
      return result;
    }).immediate();
  }

  getSourceRevision(sourceRevisionId: string): WikiResult {
    const revision = this.readSourceRevision(sourceRevisionId);
    return revision
      ? this.sourceRevisionResult(revision)
      : failure("NOT_FOUND", "来源版本不存在");
  }

  // -- wiki ---------------------------------------------------------------

  stageWiki(input: WikiStageInput, context: WikiHostContext, idempotencyKey: string): WikiResult {
    const parsed = WikiStageInputSchema.parse(input);
    return this.db.transaction(() => {
      const requestHash = hash(JSON.stringify({ method: "wiki.stage", payload: parsed, context }));
      const prior = this.replay(idempotencyKey, requestHash);
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
        .run(revision.revisionId, lifecycle.lifecycleVersion, lifecycle.state, JSON.stringify(lifecycle));
      this.emit(workspaceId, "wiki.stage", { revisionId: revision.revisionId, documentId: revision.documentId }, context);
      const result = this.wikiRevisionResult({ revision, lifecycle });
      this.db
        .prepare("INSERT INTO idempotency VALUES (?,?,?)")
        .run(idempotencyKey, requestHash, JSON.stringify(result));
      return result;
    }).immediate();
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

  review(_input: unknown, _context: WikiHostContext, _idempotencyKey: string): WikiResult {
    return failure("CAPABILITY_UNAVAILABLE", "审核发布依赖维护协议 lint 回执，尚未实现");
  }

  publish(_input: unknown, _context: WikiHostContext, _idempotencyKey: string): WikiResult {
    return failure("CAPABILITY_UNAVAILABLE", "发布依赖审核通过回执，尚未实现");
  }

  withdraw(_input: unknown, _context: WikiHostContext, _idempotencyKey: string): WikiResult {
    return failure("CAPABILITY_UNAVAILABLE", "撤回依赖持续维护协议，尚未实现");
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
          WHERE w.workspace_id=? AND l.state='published'
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
      const { scope, locale, kind, title, markdown, sections, sourceRefs } = revision.content;
      if (scope.platforms.length && !scope.platforms.includes(parsed.scope.platform)) continue;
      if (scope.markets.length && !scope.markets.includes(parsed.scope.market)) continue;
      if (scope.categories.length && !scope.categories.includes(parsed.scope.category)) continue;
      if (Intl.getCanonicalLocales(locale)[0] !== Intl.getCanonicalLocales(parsed.locale)[0]) continue;
      if (parsed.kinds.length && !parsed.kinds.includes(kind)) continue;
      if (!validityAllows(revision.content.validity, checkedAt)) continue;
      const haystack = `${title}\n${markdown}`.toLocaleLowerCase("und");
      if (
        parsed.keywords.some((word) => !haystack.includes(word.toLocaleLowerCase("und")))
      )
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
    const page: WikiSearchPage = { snapshotId, queryHash, snapshotAt, checkedAt, hits: pageHits, nextCursor };
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

    const sources = parsed.citation.sourceRefs
      .map((ref) => this.readSourceRevision(ref.sourceRevisionId))
      .filter((source): source is WikiSourceRevision => source !== null);
    if (sources.length !== parsed.citation.sourceRefs.length)
      return failure("NOT_FOUND", "引用来源缺失");

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
      states,
      checkedAt,
    );
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
          WHERE w.document_id=? AND l.state='published'
          ORDER BY w.version DESC LIMIT 1`,
      )
      .get(documentId) as { revision_id: string } | undefined;
    return row?.revision_id ?? null;
  }

  private eligibility(
    revision: WikiRevision,
    lifecycle: WikiLifecycle,
    currentPublicationRevisionId: string | null,
    states: WikiSourceState[],
    checkedAt: string,
  ): WikiEligibility {
    const reasons: WikiIneligibilityReason[] = [];
    if (lifecycle.state === "candidate") reasons.push("candidate");
    else if (lifecycle.state === "rejected") reasons.push("rejected");
    else if (lifecycle.state === "withdrawn") reasons.push("withdrawn");
    else if (lifecycle.state !== "published") reasons.push("unknown");
    if (currentPublicationRevisionId !== revision.revisionId) reasons.push("superseded");
    if (!validityAllows(revision.content.validity, checkedAt)) {
      if (revision.content.validity.status === "conflict") reasons.push("conflict");
      else if (
        revision.content.validity.validUntil &&
        Date.parse(revision.content.validity.validUntil) <= Date.parse(checkedAt)
      )
        reasons.push("expired");
      else if (
        revision.content.validity.validFrom &&
        Date.parse(revision.content.validity.validFrom) > Date.parse(checkedAt)
      )
        reasons.push("not_yet_valid");
      else reasons.push("unknown");
    }
    for (const state of states) {
      if (state.state !== "active") reasons.push("source_unavailable");
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
    return this.db.transaction(() => {
      const requestHash = hash(
        JSON.stringify({ method: "wiki.registerConsumption", payload: parsed, context }),
      );
      const prior = this.replay(idempotencyKey, requestHash);
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
          if (row.state !== "active") return failure("SOURCE_CONFLICT", "来源已撤回，不能登记消费");
        }
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
      this.emit(workspaceId, "wiki.registerConsumption", { consumptionId: consumption.consumptionId }, context);
      const result = {
        ok: true,
        data: { kind: "consumption", consumption },
        warnings: [],
        evidenceIds: [consumption.consumptionId],
      } as WikiResult;
      this.db
        .prepare("INSERT INTO idempotency VALUES (?,?,?)")
        .run(idempotencyKey, requestHash, JSON.stringify(result));
      return result;
    }).immediate();
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
}
