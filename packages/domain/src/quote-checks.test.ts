import {
  CheckReportSchema,
  type KnowledgeRevision,
  type Product,
  type QuoteCheckInput,
  type RuleDefinition,
  type Scenario,
} from "@tradequote/contracts";
import { describe, expect, it } from "vitest";
import { calculateQuoteV1, quoteCheckService } from "./index";

const id = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000010";
const ruleId = "00000000-0000-4000-8000-000000000011";
const reportId = "00000000-0000-4000-8000-000000000020";
const now = "2026-10-22T00:00:00.000Z";
const scenario: Scenario = {
  id,
  version: 1,
  createdAt: now,
  name: "合成检查场景",
  targetUser: "合成采购员",
  platform: "RFQ",
  market: "Brazil",
  category: "板材",
  locales: ["pt-BR"],
  sourceStatus: "synthetic",
};
const product: Product = {
  id,
  batchId: id,
  sourceHash: "a".repeat(64),
  sourceName: "synthetic.csv",
  sourceStatus: "synthetic",
  sku: "SYNTHETIC-PANEL",
  name: "合成板材",
  category: "板材",
  unit: "m2",
  currency: "USD",
  validUntil: "2099-12-31",
  description: "仅供规则测试",
  tiers: [{ minQuantity: "1", unitPrice: null, sourceRow: 2 }],
};
const quote = calculateQuoteV1(
  {
    scenarioId: id,
    buyer: "合成采购方",
    inquiry: "询盘中引用的禁用词不属于待检查条款",
    lines: [{ productId: id, quantity: "1", unit: "m2" }],
    payment: "",
    delivery: "",
  },
  scenario,
  [product],
  { id, workspaceId: id, createdAt: now },
);
const requiredRule: RuleDefinition = {
  ruleId,
  category: "commercial_terms",
  title: "合成付款必填规则",
  message: "付款条件缺失",
  suggestedAction: "补充付款条件后重新检查",
  field: "payment",
  condition: { kind: "required" },
  failureSeverity: "block",
};
function knowledge(
  overrides: Partial<KnowledgeRevision> = {},
  rules: RuleDefinition[] = [requiredRule],
): KnowledgeRevision {
  const sourceText = "合成规则：付款条件必须填写。";
  return {
    revisionId,
    documentId: revisionId,
    version: 1,
    status: "published",
    sourceHash: "b".repeat(64),
    createdAt: "2026-10-21T00:00:00.000Z",
    publishedAt: "2026-10-21T01:00:00.000Z",
    content: {
      title: "合成商务条款",
      scope: { platforms: [], markets: [], categories: [] },
      sourceStatus: "synthetic",
      sourceLabel: "仅供测试的合成来源",
      sourceText,
      location: { kind: "text", start: 0, end: sourceText.length },
      rules: structuredClone(rules),
    },
    ...overrides,
  };
}
function input(revisions: KnowledgeRevision[] = []): QuoteCheckInput {
  return { quote: structuredClone(quote), knowledge: revisions, reportId, checkedAt: now };
}
function freeze(value: object) {
  for (const nested of Object.values(value))
    if (nested && typeof nested === "object") freeze(nested);
  Object.freeze(value);
}

describe("B01 pure quote checks", () => {
  it("QUOTE-01 reports both missing rule categories as pending instead of an all-clear", () => {
    const result = quoteCheckService.evaluate(input());
    expect(result).toMatchObject({
      reportId,
      quoteId: id,
      revisionId: id,
      quoteVersion: 1,
      checkedAt: now,
      ruleRevisionIds: [],
      coverage: [
        { category: "commercial_terms", appliedRuleIds: [], status: "pending" },
        { category: "platform_guidance", appliedRuleIds: [], status: "pending" },
      ],
      issues: [
        {
          checkId: `${id}:coverage:commercial_terms`,
          category: "commercial_terms",
          severity: "pending",
          fieldPath: "scenario.platform",
          evidence: [],
        },
        {
          checkId: `${id}:coverage:platform_guidance`,
          category: "platform_guidance",
          severity: "pending",
          fieldPath: "scenario.platform",
          evidence: [],
        },
      ],
    });
    expect(CheckReportSchema.safeParse(result).success).toBe(true);
  });

  it.each(["", " \t\n　"])("flags a missing payment (%j) with its fixed source", (payment) => {
    const request = input([knowledge()]);
    request.quote.payment = payment;
    const result = quoteCheckService.evaluate(request);
    expect(result.coverage[0]).toEqual({
      category: "commercial_terms",
      appliedRuleIds: [ruleId],
      status: "checked",
    });
    expect(result.issues[0]).toEqual({
      checkId: `${id}:${revisionId}:${ruleId}`,
      category: "commercial_terms",
      severity: "block",
      fieldPath: "payment",
      message: "【合成规则】付款条件缺失",
      suggestedAction: requiredRule.suggestedAction,
      evidence: [
        {
          revisionId,
          ruleId,
          sourceHash: "b".repeat(64),
          sourceLabel: "仅供测试的合成来源",
          sourceStatus: "synthetic",
          location: { kind: "text", start: 0, end: "合成规则：付款条件必须填写。".length },
        },
      ],
    });
  });

  it.each([
    ["Guaranteed delivery", "guaranteed"],
    ["ＧＵＡＲＡＮＴＥＥＤ delivery", "guaranteed"],
    ["guaranteed delivery", "ＧＵＡＲＡＮＴＥＥＤ"],
    ["保证三天到货", "三天到货"],
  ])("checks delivery literals using NFKC and lowercase (%s)", (delivery, literal) => {
    const revision = knowledge({}, [
      {
        ...requiredRule,
        category: "platform_guidance",
        field: "delivery",
        condition: { kind: "forbidden_literal", literal },
        failureSeverity: "warning",
      },
    ]);
    const request = input([revision]);
    request.quote.delivery = delivery;
    expect(quoteCheckService.evaluate(request).issues).toContainEqual(
      expect.objectContaining({
        checkId: `${id}:${revisionId}:${ruleId}`,
        category: "platform_guidance",
        severity: "warning",
        fieldPath: "delivery",
        evidence: [expect.objectContaining({ revisionId, ruleId })],
      }),
    );
  });

  it.each([
    { platforms: ["rfq"], markets: [], categories: [] },
    { platforms: [], markets: ["Germany"], categories: [] },
    { platforms: [], markets: [], categories: ["服装"] },
    { platforms: ["RFQ"], markets: ["Brazil"], categories: ["服装"] },
  ])("keeps mismatched scope pending without consuming the source (%j)", (scope) => {
    const revision = knowledge();
    revision.content.scope = scope;
    const result = quoteCheckService.evaluate(input([revision]));
    expect(result.ruleRevisionIds).toEqual([]);
    expect(result.coverage.map((entry) => entry.status)).toEqual(["pending", "pending"]);
    expect(result.issues.every((issue) => issue.evidence.length === 0)).toBe(true);
  });

  it("QUOTE-02 does not use a publication from after the explicit check time", () => {
    const result = quoteCheckService.evaluate(
      input([knowledge({ publishedAt: "2026-10-23T00:00:00.000Z" })]),
    );
    expect(result.ruleRevisionIds).toEqual([]);
    expect(result.coverage.map((entry) => entry.status)).toEqual(["pending", "pending"]);
  });

  it("QUOTE-03 keeps issue order and IDs stable when query order changes or a rule ID is reused", () => {
    const secondId = "00000000-0000-4000-8000-000000000030";
    const second = knowledge({ revisionId: secondId, documentId: secondId });
    const first = knowledge();
    const result = quoteCheckService.evaluate(input([second, first]));
    expect(result).toEqual(quoteCheckService.evaluate(input([first, second])));
    expect(result.ruleRevisionIds).toEqual([revisionId, secondId]);
    expect(result.coverage[0]?.appliedRuleIds).toEqual([ruleId]);
    expect(result.issues.slice(0, 2).map((issue) => issue.checkId)).toEqual([
      `${id}:${revisionId}:${ruleId}`,
      `${id}:${secondId}:${ruleId}`,
    ]);
  });

  it("QUOTE-04 rejects ambiguous duplicate revisions and multiple versions of the same document", () => {
    const first = knowledge();
    for (const second of [
      structuredClone(first),
      knowledge({ revisionId: "00000000-0000-4000-8000-000000000030", version: 2 }),
    ])
      expect(() => quoteCheckService.evaluate(input([first, second]))).toThrow();
  });

  it("QUOTE-05 rejects a revised quote without a root identity instead of inventing a new root", () => {
    const request = input([knowledge()]);
    request.quote.version = 2;
    request.quote.parentId = id;
    request.quote.id = "00000000-0000-4000-8000-000000000040";
    expect(() => quoteCheckService.evaluate(request)).toThrow();
  });

  it.each([".*", "^付款$", "guaranteed"])(
    "treats %s as literal text only in the targeted quote field",
    (literal) => {
      const request = input([
        knowledge({}, [
          {
            ...requiredRule,
            condition: { kind: "forbidden_literal", literal },
            field: "delivery",
          },
        ]),
      ]);
      request.quote.delivery = "普通交货安排";
      request.quote.payment = literal;
      request.quote.inquiry = literal;
      expect(quoteCheckService.evaluate(request).issues.map((issue) => issue.severity)).toEqual([
        "pending",
      ]);
    },
  );

  it("QUOTE-06 checks both categories when exact scope matches and valid terms meet their rules", () => {
    const revision = knowledge({}, [
      requiredRule,
      { ...requiredRule, ruleId: reportId, field: "delivery", category: "platform_guidance" },
    ]);
    revision.content.scope = {
      platforms: ["Email", "RFQ"],
      markets: ["Brazil"],
      categories: ["板材"],
    };
    const request = input([revision]);
    request.quote.payment = " 电汇 ";
    request.quote.delivery = "按人工确认的交期";
    const result = quoteCheckService.evaluate(request);
    expect(result.issues).toEqual([]);
    expect(result.coverage.map((entry) => entry.status)).toEqual(["checked", "checked"]);
    expect(result.ruleRevisionIds).toEqual([revisionId]);
  });

  it("preserves V1 and unknown money while fixing terms on a separately bound V2 report", () => {
    const original = input([knowledge()]);
    const before = structuredClone(original);
    freeze(original);
    const originalReport = quoteCheckService.evaluate(original);
    const originalReportBefore = structuredClone(originalReport);
    const revised = input([knowledge()]);
    const v2Id = "00000000-0000-4000-8000-000000000040";
    revised.quote = {
      ...revised.quote,
      id: v2Id,
      rootId: id,
      parentId: id,
      version: 2,
      payment: "电汇",
    };
    revised.reportId = v2Id;
    const revisedReport = quoteCheckService.evaluate(revised);
    expect(revisedReport).toMatchObject({
      quoteId: id,
      revisionId: v2Id,
      quoteVersion: 2,
      issues: [expect.objectContaining({ category: "platform_guidance", severity: "pending" })],
    });
    expect(original).toEqual(before);
    expect(originalReport).toEqual(originalReportBefore);
    expect(originalReport.issues[0]?.severity).toBe("block");
    expect(revised.quote.goodsTotal).toBeNull();
    expect(revised.quote.lines[0]?.amount).toBeNull();
    expect(revised.quote.status).toBe("draft");
  });

  it("keeps check IDs independent of report metadata and changes IDs for a new knowledge version", () => {
    const first = input([knowledge()]);
    const retry = { ...first, reportId: id, checkedAt: "2026-10-22T00:10:00.000Z" };
    expect(quoteCheckService.evaluate(first).issues.map((issue) => issue.checkId)).toEqual(
      quoteCheckService.evaluate(retry).issues.map((issue) => issue.checkId),
    );
    const nextId = "00000000-0000-4000-8000-000000000030";
    const newKnowledge = input([knowledge({ revisionId: nextId, version: 2 })]);
    expect(quoteCheckService.evaluate(newKnowledge).issues[0]?.checkId).toBe(
      `${id}:${nextId}:${ruleId}`,
    );
  });

  it("rejects unpublished or malformed knowledge and authority fields before issuing a report", () => {
    for (const revision of [
      knowledge({ status: "staged", publishedAt: null }),
      knowledge({ sourceHash: "not-a-hash" }),
    ])
      expect(() => quoteCheckService.evaluate(input([revision]))).toThrow();
    expect(() =>
      quoteCheckService.evaluate({ ...input(), approved: true } as QuoteCheckInput),
    ).toThrow();
    const invalid = input([knowledge()]);
    invalid.knowledge[0]!.content.rules[0]!.condition = {
      kind: "forbidden_literal",
      literal: "　",
    };
    expect(() => quoteCheckService.evaluate(invalid)).toThrow();
  });

  it("preserves real-source labels and caps synthetic messages at the public report limit", () => {
    const revision = knowledge();
    revision.content.sourceStatus = "user_provided";
    expect(quoteCheckService.evaluate(input([revision])).issues[0]?.message).toBe("付款条件缺失");
    const synthetic = knowledge({}, [{ ...requiredRule, message: "长".repeat(2000) }]);
    const issue = quoteCheckService.evaluate(input([synthetic])).issues[0];
    expect(issue?.message.startsWith("【合成规则】")).toBe(true);
    expect(issue?.message).toHaveLength(2000);
  });
});
