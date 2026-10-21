import {
  type CheckIssue,
  type CheckReport,
  CheckReportSchema,
  type QuoteCheckInput,
  QuoteCheckInputSchema,
  type QuoteCheckService,
  type RuleCategory,
} from "@tradequote/contracts";

/** B00 semantics only: pure literal checks, never model opinions or executable rules. */
export const quoteCheckService: QuoteCheckService = {
  evaluate(input: QuoteCheckInput): CheckReport {
    const { quote, knowledge, reportId, checkedAt } = QuoteCheckInputSchema.parse(input);
    const selected = new Map<string, (typeof knowledge)[number]>();
    for (const revision of knowledge) {
      const { scope } = revision.content;
      if (!revision.publishedAt || Date.parse(revision.publishedAt) > Date.parse(checkedAt))
        continue;
      if (
        (scope.platforms.length && !scope.platforms.includes(quote.scenario.platform)) ||
        (scope.markets.length && !scope.markets.includes(quote.scenario.market)) ||
        (scope.categories.length && !scope.categories.includes(quote.scenario.category))
      )
        continue;
      const old = selected.get(revision.documentId);
      if (!old || old.version < revision.version) selected.set(revision.documentId, revision);
    }
    const revisions = [...selected.values()].sort((a, b) =>
      a.revisionId.localeCompare(b.revisionId),
    );
    const issues: CheckIssue[] = [];
    const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
    const coverage = (["commercial_terms", "platform_guidance"] as RuleCategory[]).map(
      (category) => {
        const appliedRuleIds: string[] = [];
        for (const revision of revisions)
          for (const rule of revision.content.rules) {
            if (rule.category !== category) continue;
            if (!appliedRuleIds.includes(rule.ruleId)) appliedRuleIds.push(rule.ruleId);
            const value = quote[rule.field];
            const failed =
              rule.condition.kind === "required"
                ? value.trim().length === 0
                : normalize(value).includes(normalize(rule.condition.literal));
            if (failed)
              issues.push({
                checkId: `${quote.id}:${revision.revisionId}:${rule.ruleId}`,
                category,
                severity: rule.failureSeverity,
                fieldPath: rule.field,
                message: rule.message,
                suggestedAction: rule.suggestedAction,
                evidence: [
                  {
                    revisionId: revision.revisionId,
                    ruleId: rule.ruleId,
                    sourceHash: revision.sourceHash,
                    sourceLabel: revision.content.sourceLabel,
                    sourceStatus: revision.content.sourceStatus,
                    location: revision.content.location,
                  },
                ],
              });
          }
        if (!appliedRuleIds.length)
          issues.push({
            checkId: `${quote.id}:pending:${category}`,
            category,
            severity: "pending",
            fieldPath: "scenario.platform",
            message: "缺少此类已发布适用规则，尚未核验",
            suggestedAction: "请人工补充并发布适用规则后重新检查",
            evidence: [],
          });
        return {
          category,
          appliedRuleIds: appliedRuleIds.sort(),
          status: appliedRuleIds.length ? ("checked" as const) : ("pending" as const),
        };
      },
    );
    return CheckReportSchema.parse({
      reportId,
      quoteId: quote.rootId ?? quote.id,
      revisionId: quote.id,
      quoteVersion: quote.version,
      checkedAt,
      ruleRevisionIds: revisions
        .filter((revision) => revision.content.rules.length)
        .map((revision) => revision.revisionId)
        .sort(),
      coverage,
      issues,
    });
  },
};
