import type { CheckListResult, CheckReport, QuoteSnapshot } from "@tradequote/contracts";

export function checksList(reports: CheckReport[]): CheckListResult {
  return { ok: true, data: reports, warnings: [], evidenceIds: [] };
}

// Explicit synthetic data for component tests and the local visual preview only.
export const checksQuote: QuoteSnapshot = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  number: "SYNTHETIC-CHECKS-001",
  version: 1,
  status: "draft",
  createdAt: "2026-10-22T00:00:00.000Z",
  scenario: {
    id: "00000000-0000-4000-8000-000000000003",
    version: 1,
    createdAt: "2026-10-22T00:00:00.000Z",
    name: "合成双反馈场景",
    targetUser: "合成采购员",
    platform: "RFQ",
    market: "Brazil",
    category: "板材",
    locales: ["pt-BR"],
    sourceStatus: "synthetic",
  },
  buyer: "合成采购方",
  inquiry: "请核对付款及交货安排",
  payment: "",
  delivery: "保证三天到货",
  currency: "USD",
  lines: [
    {
      product: {
        id: "00000000-0000-4000-8000-000000000004",
        batchId: "00000000-0000-4000-8000-000000000005",
        sourceHash: "a".repeat(64),
        sourceName: "合成商品.csv",
        sourceStatus: "synthetic",
        sku: "SYNTHETIC-PANEL",
        name: "合成板材",
        category: "板材",
        unit: "m2",
        currency: "USD",
        validUntil: "2099-12-31",
        description: "仅用于组件验证",
        tiers: [{ minQuantity: "1", unitPrice: null, sourceRow: 2 }],
      },
      quantity: "1",
      tierMin: null,
      unitPrice: null,
      amount: null,
      reason: "缺价格",
    },
  ],
  goodsTotal: null,
  pending: ["缺价格"],
  calculationPolicy: "sales-tiers-v1/line-half-up/goods-only",
};

const knowledgeId = "00000000-0000-4000-8000-000000000010";
const paymentRule = "00000000-0000-4000-8000-000000000011";
const deliveryRule = "00000000-0000-4000-8000-000000000012";
export const checksReport: CheckReport = {
  reportId: "00000000-0000-4000-8000-000000000020",
  quoteId: checksQuote.id,
  revisionId: checksQuote.id,
  quoteVersion: 1,
  checkedAt: "2026-10-22T01:00:00.000Z",
  ruleRevisionIds: [knowledgeId],
  coverage: [
    { category: "commercial_terms", appliedRuleIds: [paymentRule], status: "checked" },
    { category: "platform_guidance", appliedRuleIds: [deliveryRule], status: "checked" },
  ],
  issues: [
    {
      checkId: `${checksQuote.id}:${knowledgeId}:${paymentRule}`,
      category: "commercial_terms",
      severity: "block",
      fieldPath: "payment",
      message: "付款条件缺失",
      suggestedAction: "补充付款条件后重新检查",
      evidence: [
        {
          revisionId: knowledgeId,
          ruleId: paymentRule,
          sourceHash: "b".repeat(64),
          sourceLabel: "合成商务条款 V1",
          sourceStatus: "synthetic",
          location: { kind: "text", start: 0, end: 12 },
        },
      ],
    },
    {
      checkId: `${checksQuote.id}:${knowledgeId}:${deliveryRule}`,
      category: "platform_guidance",
      severity: "warning",
      fieldPath: "delivery",
      message: "交货承诺需要核实",
      suggestedAction: "人工核实交期依据后修订条款",
      evidence: [
        {
          revisionId: knowledgeId,
          ruleId: deliveryRule,
          sourceHash: "b".repeat(64),
          sourceLabel: "合成商务条款 V1",
          sourceStatus: "synthetic",
          location: { kind: "text", start: 12, end: 24 },
        },
      ],
    },
  ],
};

export const checksPendingReport: CheckReport = {
  ...checksReport,
  ruleRevisionIds: [],
  coverage: [
    { category: "commercial_terms", appliedRuleIds: [], status: "pending" },
    { category: "platform_guidance", appliedRuleIds: [], status: "pending" },
  ],
  issues: (["commercial_terms", "platform_guidance"] as const).map((category) => ({
    checkId: `${checksQuote.id}:coverage:${category}`,
    category,
    severity: "pending",
    fieldPath: "scenario.platform",
    message: category === "commercial_terms" ? "缺少商务条款规则" : "缺少平台指引规则",
    suggestedAction: "发布适用规则后重新检查",
    evidence: [],
  })),
};
