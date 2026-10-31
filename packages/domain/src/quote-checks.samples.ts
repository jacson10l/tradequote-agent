import type {
  PublishedKnowledgeRevision,
  QuoteCheckInput,
  QuoteSnapshot,
  RuleDefinition,
} from "@tradequote/contracts";

/**
 * Fixed synthetic sample set for B01 rule checks. Every identifier, hash and clause is fabricated
 * for engineering review; nothing here is a real supplier term, market rule or approved knowledge.
 * `sampleVersion` is asserted by the regression so a silently edited sample fails the suite.
 */
export const sampleVersion = "b01-quote-checks-samples-v1";
const workspaceId = "00000000-0000-4000-8000-000000000101";
const scenarioId = "00000000-0000-4000-8000-000000000110";
const at = "2026-10-20T00:00:00.000Z";
const hash = (char: string) => char.repeat(64);
const paymentText =
  "合成付款条款（非真实供应商）：本单接受 30% 预付、余款发货前付清；不接受 100% 全额预付。付款条件须写明比例。";
const packagingText =
  "合成包装/材质条款（非真实供应商）：木质包装须提供熏蒸证明；改版后优先免熏蒸木托。";
const otherCategoryText = "合成板材条款（非真实供应商）：板材不接受 100% 预付，需按批次结算。";

const rulePayRatio: RuleDefinition = {
  ruleId: "00000000-0000-4000-8000-000000000201",
  category: "commercial_terms",
  title: "合成：禁止全额预付",
  message: "合成：付款条件出现 100%，与合成条款不符",
  suggestedAction: "改为分期付款（如 30% 预付）后重检",
  field: "payment",
  condition: { kind: "forbidden_literal", literal: "100%" },
  failureSeverity: "block",
};
const rulePayRequired: RuleDefinition = {
  ruleId: "00000000-0000-4000-8000-000000000202",
  category: "commercial_terms",
  title: "合成：须写明付款比例",
  message: "合成：付款条件为空，无法核对比例",
  suggestedAction: "补充付款比例与节点后重检",
  field: "payment",
  condition: { kind: "required" },
  failureSeverity: "warning",
};
/** Deliberately reused identity with a different published definition in the v2 document. */
const rulePackaging: RuleDefinition = {
  ruleId: "00000000-0000-4000-8000-000000000203",
  category: "platform_guidance",
  title: "合成：包装材质条款",
  message: "合成：包装材质与合成条款不符",
  suggestedAction: "按已裁决的包装条款修改后重检",
  field: "delivery",
  condition: { kind: "forbidden_literal", literal: "木质包装" },
  failureSeverity: "warning",
};
const rulePackagingRevised: RuleDefinition = {
  ...rulePackaging,
  condition: { kind: "forbidden_literal", literal: "免熏蒸木托" },
  failureSeverity: "block",
};
const ruleOtherCategory: RuleDefinition = {
  ruleId: "00000000-0000-4000-8000-000000000204",
  category: "commercial_terms",
  title: "合成：板材结算",
  message: "合成：板材不接受全额预付",
  suggestedAction: "改为按批次结算后重检",
  field: "payment",
  condition: { kind: "forbidden_literal", literal: "100%" },
  failureSeverity: "block",
};

function revision(
  documentId: string,
  revisionId: string,
  version: number,
  sourceText: string,
  sourceLabel: string,
  rules: RuleDefinition[],
  categories: string[] = ["合成针织衫"],
  sourceHash = hash("a"),
): PublishedKnowledgeRevision {
  return {
    revisionId,
    documentId,
    version,
    status: "published",
    sourceHash,
    createdAt: at,
    publishedAt: at,
    content: {
      title: sourceLabel,
      scope: { platforms: ["合成平台 RFQ"], markets: ["合成市场 DE"], categories },
      sourceStatus: "synthetic",
      sourceLabel,
      sourceText,
      location: { kind: "text", start: 0, end: sourceText.length },
      rules,
    },
  };
}

export const samplePaymentRevision = revision(
  "00000000-0000-4000-8000-000000000301",
  "00000000-0000-4000-8000-000000000311",
  1,
  paymentText,
  "合成付款条款样例 v1（非真实供应商）",
  [rulePayRatio, rulePayRequired],
  ["合成针织衫"],
  hash("a"),
);
export const samplePackagingRevision = revision(
  "00000000-0000-4000-8000-000000000302",
  "00000000-0000-4000-8000-000000000312",
  1,
  packagingText,
  "合成包装条款样例 v1（非真实供应商）",
  [rulePackaging],
  ["合成针织衫"],
  hash("b"),
);
/** Same ruleId as v1 with a different literal and severity: a knowledge conflict, not a newer truth. */
export const samplePackagingConflictRevision = revision(
  "00000000-0000-4000-8000-000000000303",
  "00000000-0000-4000-8000-000000000313",
  2,
  packagingText,
  "合成包装条款样例 v2（非真实供应商，与 v1 冲突）",
  [rulePackagingRevised],
  ["合成针织衫"],
  hash("c"),
);
export const sampleOtherCategoryRevision = revision(
  "00000000-0000-4000-8000-000000000304",
  "00000000-0000-4000-8000-000000000314",
  1,
  otherCategoryText,
  "合成板材条款样例 v1（非真实供应商）",
  [ruleOtherCategory],
  ["合成板材"],
  hash("d"),
);

const product = {
  id: "00000000-0000-4000-8000-000000000401",
  batchId: "00000000-0000-4000-8000-000000000402",
  sourceHash: hash("e"),
  sourceName: "合成商品目录.csv",
  sourceStatus: "synthetic" as const,
  sku: "SAMPLE-KNIT",
  name: "合成针织衫",
  category: "合成针织衫",
  unit: "piece",
  currency: "USD" as const,
  validUntil: "2099-12-31",
  description: "仅为规则回归构造的合成商品",
  tiers: [{ minQuantity: "100", unitPrice: "9.5", sourceRow: 2 }],
};

export function sampleQuote(options: {
  id: string;
  version: number;
  payment: string;
  delivery: string;
  rootId?: string;
}): QuoteSnapshot {
  return {
    id: options.id,
    ...(options.rootId === undefined ? {} : { rootId: options.rootId }),
    workspaceId,
    number: `合成报价-${options.version}`,
    version: options.version,
    status: "draft",
    createdAt: at,
    scenario: {
      id: scenarioId,
      version: 1,
      createdAt: at,
      name: "合成规则回归场景",
      targetUser: "合成业务员",
      platform: "合成平台 RFQ",
      market: "合成市场 DE",
      category: "合成针织衫",
      locales: ["en"],
      sourceStatus: "synthetic",
    },
    buyer: "合成采购方",
    inquiry: "合成询盘：100 件针织衫，请报付款与包装条件",
    payment: options.payment,
    delivery: options.delivery,
    currency: "USD",
    lines: [
      {
        product,
        quantity: "100",
        tierMin: "100",
        unitPrice: "9.5",
        amount: "950.00",
        reason: null,
      },
    ],
    goodsTotal: "950.00",
    pending: [],
    calculationPolicy: "sales-tiers-v1/line-half-up/goods-only",
  };
}

export const sampleQuotes = {
  /** 100% prepayment + material clause that two published revisions disagree on. */
  blocking: sampleQuote({
    id: "00000000-0000-4000-8000-000000000501",
    version: 1,
    payment: "预付100%，余款见提单副本",
    delivery: "木质包装，出货前熏蒸",
  }),
  /** 30% prepayment + a packaging term that only the v1 rule forbids. */
  compliant: sampleQuote({
    id: "00000000-0000-4000-8000-000000000502",
    version: 1,
    payment: "预付30%，余款发货前付清",
    delivery: "免熏蒸木托",
  }),
  /** No published rule matches this scenario: coverage is unknown, never "passed". */
  uncovered: sampleQuote({
    id: "00000000-0000-4000-8000-000000000503",
    version: 1,
    payment: "预付30%",
    delivery: "板条箱",
  }),
  /** Revision 2 of the blocking quote after the payment ratio was corrected. */
  revised: sampleQuote({
    id: "00000000-0000-4000-8000-000000000504",
    version: 2,
    rootId: "00000000-0000-4000-8000-000000000501",
    payment: "预付30%，余款发货前付清",
    delivery: "木质包装，出货前熏蒸",
  }),
};

export const sampleReportIds = {
  blocking: "00000000-0000-4000-8000-000000000601",
  compliant: "00000000-0000-4000-8000-000000000602",
  uncovered: "00000000-0000-4000-8000-000000000603",
  revised: "00000000-0000-4000-8000-000000000604",
};

export const sampleCheckedAt = "2026-10-22T06:00:00.000Z";

export function sampleInput(
  quote: QuoteSnapshot,
  knowledge: PublishedKnowledgeRevision[],
  reportId: string,
): QuoteCheckInput {
  return { quote, knowledge, reportId, checkedAt: sampleCheckedAt };
}
