import {
  type CheckCoverage,
  type CheckIssue,
  type CheckReport,
  CheckReportSchema,
  type KnowledgeEvidence,
  type PublishedKnowledgeRevision,
  type QuoteCheckInput,
  type QuoteSnapshot,
  type RuleCategory,
  type RuleDefinition,
} from "@tradequote/contracts";

/**
 * B01 deterministic rule engine (first batch). Pure: no storage, model, IPC or clock.
 * Field scope is limited to payment/delivery by the B00 contract; a wider field set is a later
 * contract change, never inferred here. Literal matching is NFKC + case-fold + space-collapse, so
 * full-width digits/percent signs compare the same as ASCII ones. No regex, no code, no numeric
 * comparison: "预付100%" is decided as a literal, not as a ratio threshold.
 */
const normalize = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

const categories: readonly RuleCategory[] = ["commercial_terms", "platform_guidance"];

interface AppliedRule {
  revision: PublishedKnowledgeRevision;
  rule: RuleDefinition;
}

function scopeMatches(revision: PublishedKnowledgeRevision, quote: QuoteSnapshot): boolean {
  const pairs = [
    [revision.content.scope.platforms, quote.scenario.platform],
    [revision.content.scope.markets, quote.scenario.market],
    [revision.content.scope.categories, quote.scenario.category],
  ] as const;
  // An empty dimension means "not restricted here", which is the current P0 scope contract.
  return pairs.every(
    ([allowed, value]) =>
      allowed.length === 0 || allowed.some((item) => normalize(item) === normalize(value)),
  );
}

function evidenceOf(revision: PublishedKnowledgeRevision, rule: RuleDefinition): KnowledgeEvidence {
  return {
    revisionId: revision.revisionId,
    ruleId: rule.ruleId,
    sourceHash: revision.sourceHash,
    sourceLabel: revision.content.sourceLabel,
    sourceStatus: revision.content.sourceStatus,
    location: revision.content.location,
  };
}

function definitionOf(rule: RuleDefinition): string {
  return JSON.stringify([
    rule.category,
    rule.title,
    rule.message,
    rule.suggestedAction,
    rule.field,
    rule.condition.kind,
    rule.condition.kind === "forbidden_literal" ? rule.condition.literal : "",
    rule.failureSeverity,
  ]);
}

function violated(rule: RuleDefinition, quote: QuoteSnapshot): boolean {
  const text = normalize(rule.field === "payment" ? quote.payment : quote.delivery);
  return rule.condition.kind === "required"
    ? text.length === 0
    : text.includes(normalize(rule.condition.literal));
}

export interface QuoteCheckEvaluation {
  report: CheckReport;
  /** Same checkIds as `report.issues`; the risk mark and the text annotation read one result. */
  annotations: Array<{ checkId: string; fieldPath: CheckIssue["fieldPath"] }>;
}

/**
 * Evaluate one quote revision against the caller-provided published knowledge.
 * The caller must pass the exact revisions it resolved for this scenario; unknown or empty coverage
 * yields a pending annotation instead of an all-clear report.
 */
export function evaluateQuoteChecks(input: QuoteCheckInput): QuoteCheckEvaluation {
  const { quote, knowledge, reportId, checkedAt } = input;
  const applied: AppliedRule[] = knowledge
    .filter((revision) => scopeMatches(revision, quote))
    .flatMap((revision) => revision.content.rules.map((rule) => ({ revision, rule })));
  const grouped = new Map<string, AppliedRule[]>();
  for (const item of applied) {
    const bucket = grouped.get(item.rule.ruleId) ?? [];
    bucket.push(item);
    grouped.set(item.rule.ruleId, bucket);
  }
  const issues: CheckIssue[] = [];
  const appliedRuleIds = new Map<RuleCategory, string[]>(
    categories.map((category) => [category, []]),
  );
  for (const [ruleId, bucket] of grouped) {
    const signatures = new Set(bucket.map((item) => definitionOf(item.rule)));
    const first = bucket[0]!;
    for (const category of categories)
      if (category === first.rule.category) appliedRuleIds.get(category)?.push(ruleId);
    if (signatures.size > 1) {
      // Same rule identity, different published definitions: the engine refuses to pick one.
      const revisions = [...new Set(bucket.map((item) => item.revision))].sort((a, b) =>
        a.revisionId < b.revisionId ? -1 : 1,
      );
      issues.push({
        checkId: `${quote.id}:${ruleId}:conflict`,
        category: first.rule.category,
        severity: "block",
        fieldPath: first.rule.field,
        message: `合成/知识冲突：同一规则 ${ruleId} 存在 ${signatures.size} 种已发布定义（${revisions
          .map((revision) => `v${revision.version}:${revision.revisionId.slice(-4)}`)
          .join(" / ")}），需人工裁决，未按任一条执行`,
        suggestedAction: "停止使用该规则并提交知识维护复核；裁决前不得据此判定通过或违规",
        evidence: revisions.map((revision) => {
          const matched = bucket.find((item) => item.revision.revisionId === revision.revisionId)!;
          return evidenceOf(revision, matched.rule);
        }),
      });
      continue;
    }
    if (!violated(first.rule, quote)) continue;
    issues.push({
      checkId: `${quote.id}:${ruleId}:violation`,
      category: first.rule.category,
      severity: first.rule.failureSeverity,
      fieldPath: first.rule.field,
      message: first.rule.message,
      suggestedAction: first.rule.suggestedAction,
      evidence: [evidenceOf(first.revision, first.rule)],
    });
  }
  const coverage: CheckCoverage[] = categories.map((category) => {
    const ids = (appliedRuleIds.get(category) ?? []).slice().sort();
    if (ids.length > 0) return { category, appliedRuleIds: ids, status: "checked" };
    issues.push({
      checkId: `${quote.id}:coverage:${category}:pending`,
      category,
      severity: "pending",
      fieldPath: "scenario.platform",
      message: `缺可用知识规则：本单 ${category} 未执行检查，不能视为通过`,
      suggestedAction: "补充并发布适用的已评审规则后重检",
      evidence: [],
    });
    return { category, appliedRuleIds: [], status: "pending" };
  });
  const usedRevisions = [...new Set(applied.map((item) => item.revision.revisionId))].sort();
  const report = CheckReportSchema.parse({
    reportId,
    quoteId: quote.rootId ?? quote.id,
    revisionId: quote.id,
    quoteVersion: quote.version,
    checkedAt,
    ruleRevisionIds: usedRevisions,
    coverage,
    issues: issues.slice().sort((a, b) => (a.checkId < b.checkId ? -1 : 1)),
  });
  return {
    report,
    annotations: report.issues.map((issue) => ({
      checkId: issue.checkId,
      fieldPath: issue.fieldPath,
    })),
  };
}
