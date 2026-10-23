import {
  type CheckCoverage,
  type CheckIssue,
  CheckReportSchema,
  QuoteCheckInputSchema,
  type QuoteCheckService,
  type RuleCategory,
} from "@tradequote/contracts";

const categories: RuleCategory[] = ["commercial_terms", "platform_guidance"];
const categoryLabels = {
  commercial_terms: "商务条款",
  platform_guidance: "平台指引",
};
const inputSchema = QuoteCheckInputSchema.refine(
  ({ knowledge }) =>
    new Set(knowledge.map((revision) => revision.revisionId)).size === knowledge.length &&
    new Set(knowledge.map((revision) => revision.documentId)).size === knowledge.length,
  "检查须由宿主为每份文档提供唯一知识版本",
).refine(
  ({ quote }) => quote.version === 1 || (quote.rootId !== undefined && quote.rootId !== quote.id),
  "修订报价必须携带独立的根报价身份",
);

/** Pure B00 rule evaluation. Published-source eligibility remains a host responsibility. */
export const quoteCheckService: QuoteCheckService = {
  evaluate(raw) {
    const { quote, knowledge, reportId, checkedAt } = inputSchema.parse(raw);
    const applicable = knowledge
      .filter(
        ({ content: { scope }, publishedAt }) =>
          publishedAt !== null &&
          Date.parse(publishedAt) <= Date.parse(checkedAt) &&
          (scope.platforms.length === 0 || scope.platforms.includes(quote.scenario.platform)) &&
          (scope.markets.length === 0 || scope.markets.includes(quote.scenario.market)) &&
          (scope.categories.length === 0 || scope.categories.includes(quote.scenario.category)),
      )
      .sort((a, b) => (a.revisionId < b.revisionId ? -1 : a.revisionId > b.revisionId ? 1 : 0));
    const issues: CheckIssue[] = [];
    const coverage: CheckCoverage[] = categories.map((category) => {
      const appliedRuleIds: string[] = [];
      for (const revision of applicable) {
        for (const rule of [...revision.content.rules].sort((a, b) =>
          a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
        )) {
          if (rule.category !== category) continue;
          appliedRuleIds.push(rule.ruleId);
          const value = quote[rule.field];
          const failed =
            rule.condition.kind === "required"
              ? !value.trim()
              : value
                  .normalize("NFKC")
                  .toLowerCase()
                  .includes(rule.condition.literal.normalize("NFKC").toLowerCase());
          if (!failed) continue;
          const prefix = revision.content.sourceStatus === "synthetic" ? "【合成规则】" : "";
          issues.push({
            checkId: `${quote.id}:${revision.revisionId}:${rule.ruleId}`,
            category,
            severity: rule.failureSeverity,
            fieldPath: rule.field,
            message: prefix + rule.message.slice(0, 2000 - prefix.length),
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
      }
      if (!appliedRuleIds.length)
        issues.push({
          checkId: `${quote.id}:coverage:${category}`,
          category,
          severity: "pending",
          fieldPath: "scenario.platform",
          message: `缺少适用的${categoryLabels[category]}规则，尚未核实`,
          suggestedAction: "人工确认并发布适用规则后重新检查",
          evidence: [],
        });
      return {
        category,
        appliedRuleIds: [...new Set(appliedRuleIds)].sort(),
        status: appliedRuleIds.length ? "checked" : "pending",
      };
    });
    return CheckReportSchema.parse({
      reportId,
      quoteId: quote.rootId ?? quote.id,
      revisionId: quote.id,
      quoteVersion: quote.version,
      checkedAt,
      ruleRevisionIds: applicable.map((revision) => revision.revisionId).sort(),
      coverage,
      issues,
    });
  },
};
