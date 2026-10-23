import { createHash } from "node:crypto";
import {
  type ExecutionContext,
  type KnowledgeCitation,
  type QuoteSnapshot,
  type WikiCitationResolution,
  WikiCitationResolutionSchema,
  type WikiHostContext,
  WikiResultSchema,
  WikiSearchExchangeSchema,
  type WikiSearchQuery,
  wikiSourceSetPayload,
} from "@tradequote/contracts";
import { evaluateWikiQuote, TradeFault } from "@tradequote/domain";
import type Database from "better-sqlite3";
import type { CheckKnowledgeSource } from "./check-store";
import { SqliteWikiStore } from "./wiki-store";

const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function conflict(): never {
  throw new TradeFault("SOURCE_CONFLICT", "知识版本或完整来源无法核验");
}

/** Worker-internal participant: no second connection, async boundary or renderer
 * authority. It runs inside CheckStore's IMMEDIATE transaction. */
export class SqliteWikiCheckSource implements CheckKnowledgeSource {
  private readonly wiki: SqliteWikiStore;
  constructor(private readonly db: Database.Database) {
    this.wiki = new SqliteWikiStore(db);
  }

  prepare(quote: QuoteSnapshot, reportId: string, checkedAt: string, actor: ExecutionContext) {
    if (!this.db.inTransaction) throw new Error("CHECK_TRANSACTION_REQUIRED");
    const context: WikiHostContext = { ...actor, workspaceId: quote.workspaceId, now: checkedAt };
    const scope = {
      platform: quote.scenario.platform,
      market: quote.scenario.market,
      category: quote.scenario.category,
    };
    const resolutions = new Map<string, WikiCitationResolution>();
    for (const locale of quote.scenario.locales) {
      let cursor: WikiSearchQuery["cursor"] = null;
      do {
        const query: WikiSearchQuery = {
          keywords: [],
          scope,
          locale,
          kinds: ["rule"],
          limit: 100,
          cursor,
        };
        const result = WikiResultSchema.parse(this.wiki.search(query, context));
        if (!result.ok || result.data.kind !== "searchPage") conflict();
        const { page } = WikiSearchExchangeSchema.parse({ query, page: result.data.page });
        for (const hit of page.hits)
          for (const citation of hit.citations) {
            if (!hit.revision.content.rules.some((rule) => rule.sectionId === citation.sectionId))
              continue;
            const key = `${citation.revisionId}:${citation.sectionId}`;
            if (!resolutions.has(key))
              resolutions.set(key, this.resolve(citation, scope, locale, context));
            if (resolutions.size > 100) conflict();
          }
        cursor = page.nextCursor;
      } while (cursor);
    }
    const report = evaluateWikiQuote({
      quote,
      reportId,
      checkedAt,
      resolutions: [...resolutions.values()],
    });
    return {
      report,
      register: () => {
        if (!this.db.inTransaction) throw new Error("CHECK_TRANSACTION_REQUIRED");
        const citations = report.wikiCitations ?? [];
        if (!citations.length) return; // Missing coverage has no invented consumption.
        // Re-resolve at commit as well. Retain every source, including successful rules.
        for (const citation of citations) {
          const prior = resolutions.get(`${citation.revisionId}:${citation.sectionId}`);
          if (!prior) conflict();
          this.resolve(citation, scope, prior.revision.content.locale, context);
        }
        const receipt = WikiResultSchema.parse(
          this.wiki.registerConsumption(
            {
              consumer: {
                kind: "artifact",
                entityId: report.reportId,
                revisionId: report.reportId,
                contentHash: hash(JSON.stringify(report)),
              },
              citations,
            },
            context,
            report.reportId,
          ),
        );
        if (!receipt.ok || receipt.data.kind !== "consumption") conflict();
      },
    };
  }

  private resolve(
    citation: KnowledgeCitation,
    scope: WikiSearchQuery["scope"],
    locale: string,
    context: WikiHostContext,
  ) {
    const result = WikiResultSchema.parse(
      this.wiki.resolveCitation({ citation, purpose: "new_reference", scope, locale }, context),
    );
    if (!result.ok || result.data.kind !== "citationResolution") conflict();
    const resolution = WikiCitationResolutionSchema.parse(result.data.resolution);
    const { revision, sources } = resolution;
    if (
      revision.workspaceId !== context.workspaceId ||
      hash(revision.content.markdown) !== revision.contentHash ||
      hash(wikiSourceSetPayload(revision.content.sourceRefs)) !== revision.sourceSetHash ||
      sources.some((s) => hash(s.sourceText) !== s.artifactHash)
    )
      conflict();
    for (const source of sources) {
      const head = this.db
        .prepare(
          "SELECT source_revision_id FROM knowledge_source WHERE workspace_id=? AND source_id=? ORDER BY version DESC LIMIT 1",
        )
        .get(context.workspaceId, source.sourceId) as { source_revision_id: string } | undefined;
      if (head?.source_revision_id !== source.sourceRevisionId) conflict();
    }
    for (const ref of citation.sourceRefs) {
      const source = sources.find((s) => s.sourceRevisionId === ref.sourceRevisionId);
      if (
        !source ||
        hash(source.sourceText.slice(ref.location.start, ref.location.end)) !== ref.excerptHash
      )
        conflict();
    }
    return resolution;
  }
}
