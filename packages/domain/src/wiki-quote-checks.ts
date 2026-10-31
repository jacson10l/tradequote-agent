import {
  type CheckReport,
  CheckReportSchema,
  type KnowledgeRevision,
  type QuoteWikiCheckInput,
  QuoteWikiCheckInputSchema,
} from "@tradequote/contracts";
import { quoteCheckService } from "./quote-checks";

/** Explicit B00a adapter. The B00 evaluator supplies rule semantics only; its
 * temporary Markdown evidence is replaced with every exact source reference. */
export function evaluateWikiQuote(raw: QuoteWikiCheckInput): CheckReport {
  const { quote, resolutions, reportId, checkedAt } = QuoteWikiCheckInputSchema.parse(raw);
  const groups = new Map<string, KnowledgeRevision>();
  const evidence = new Map<string, CheckReport["issues"][number]["evidence"]>();
  const citations = [] as NonNullable<CheckReport["wikiCitations"]>;
  for (const resolution of resolutions) {
    const { revision, citation, sources } = resolution;
    if (
      resolution.purpose !== "new_reference" ||
      !resolution.eligibility.eligible ||
      resolution.checkedAt !== checkedAt ||
      revision.workspaceId !== quote.workspaceId ||
      !quote.scenario.locales.some(
        (locale) =>
          Intl.getCanonicalLocales(locale)[0] ===
          Intl.getCanonicalLocales(revision.content.locale)[0],
      )
    )
      throw new Error("INVALID_WIKI_RULE_ELIGIBILITY");
    if (revision.content.kind !== "rule") continue;
    const rules = revision.content.rules.filter((rule) => rule.sectionId === citation.sectionId);
    if (!rules.length) continue;
    if (
      citations.some(
        (c) => c.revisionId === citation.revisionId && c.sectionId === citation.sectionId,
      )
    )
      throw new Error("DUPLICATE_WIKI_RULE_SECTION");
    citations.push(citation);
    let projected = groups.get(revision.revisionId);
    if (!projected) {
      projected = {
        revisionId: revision.revisionId,
        documentId: revision.documentId,
        version: revision.version,
        status: "published",
        createdAt: revision.createdAt,
        publishedAt: resolution.lifecycle.publication?.occurredAt ?? null,
        sourceHash: revision.contentHash,
        content: {
          title: revision.content.title,
          scope: revision.content.scope,
          sourceStatus: sources.some((s) => s.sourceStatus === "synthetic")
            ? "synthetic"
            : "user_provided",
          sourceLabel: revision.content.title,
          sourceText: revision.content.markdown,
          location: { kind: "text", start: 0, end: revision.content.markdown.length },
          rules: [],
        },
      };
      groups.set(revision.revisionId, projected);
    }
    projected.content.rules.push(...rules.map((rule) => rule.definition));
    for (const { definition } of rules) {
      evidence.set(
        `${revision.revisionId}:${definition.ruleId}`,
        citation.sourceRefs.map((ref) => {
          const source = sources.find((s) => s.sourceRevisionId === ref.sourceRevisionId);
          if (!source) throw new Error("MISSING_WIKI_RULE_SOURCE");
          return {
            revisionId: revision.revisionId,
            ruleId: definition.ruleId,
            sourceHash: ref.artifactHash,
            sourceLabel: source.label,
            sourceStatus: source.sourceStatus,
            location: ref.location,
            citation,
            referenceId: ref.referenceId,
          };
        }),
      );
    }
  }
  const report = quoteCheckService.evaluate({
    quote,
    knowledge: [...groups.values()],
    reportId,
    checkedAt,
  });
  return CheckReportSchema.parse({
    ...report,
    wikiCitations: citations.filter((c) => report.ruleRevisionIds.includes(c.revisionId)),
    issues: report.issues.map((issue) => ({
      ...issue,
      evidence: issue.evidence.flatMap((e) => {
        const full = evidence.get(`${e.revisionId}:${e.ruleId}`);
        if (!full) throw new Error("MISSING_WIKI_RULE_EVIDENCE");
        return full;
      }),
    })),
  });
}
