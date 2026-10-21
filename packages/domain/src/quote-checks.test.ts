import {
  demoScenario,
  type KnowledgeRevision,
  type Product,
  type QuoteSnapshot,
} from "@tradequote/contracts";
import { expect, it } from "vitest";
import { quoteCheckService } from "./quote-checks";
import { calculateQuoteV1 } from "./trade";

const mockKnowledgeRevision: KnowledgeRevision = {
  revisionId: "00000000-0000-4000-8000-000000000010",
  documentId: "00000000-0000-4000-8000-000000000011",
  version: 1,
  status: "published",
  sourceHash: "3a9ad6bb6250754a93fbf03e01bb73f0df811c09fb35df3f0e913387bdf0acd8",
  createdAt: "2026-10-21T00:00:00.000Z",
  publishedAt: "2026-10-21T00:00:00.000Z",
  content: {
    title: "Synthetic payment rule",
    scope: { platforms: [], markets: [], categories: [] },
    sourceStatus: "synthetic",
    sourceLabel: "Synthetic fixture only",
    sourceText: "Synthetic source",
    location: { kind: "text", start: 0, end: 16 },
    rules: [
      {
        ruleId: "00000000-0000-4000-8000-000000000012",
        category: "commercial_terms",
        title: "Required payment",
        message: "Missing payment",
        suggestedAction: "Provide actual payment",
        field: "payment",
        condition: { kind: "required" },
        failureSeverity: "warning",
      },
    ],
  },
};
const now = "2026-10-22T00:00:00.000Z",
  id = "00000000-0000-4000-8000-000000000001";
const product: Product = {
  id,
  batchId: id,
  sourceHash: "a".repeat(64),
  sourceName: "synthetic",
  sourceStatus: "synthetic",
  sku: "SYNTHETIC",
  name: "合成",
  category: "跨品类",
  unit: "kg",
  currency: "USD",
  validUntil: "2099-01-01",
  description: "合成",
  tiers: [{ minQuantity: "1", unitPrice: null, sourceRow: 2 }],
};
function quote(payment = "", delivery = ""): QuoteSnapshot {
  return calculateQuoteV1(
    {
      scenarioId: id,
      buyer: "合成",
      inquiry: "合成",
      lines: [{ productId: id, quantity: "10", unit: "kg" }],
      payment,
      delivery,
    },
    { ...demoScenario, id, version: 1, createdAt: now },
    [product],
    { id, workspaceId: id, createdAt: now },
  );
}
const evaluate = (q: QuoteSnapshot, knowledge: KnowledgeRevision[]) =>
  quoteCheckService.evaluate({
    quote: q,
    knowledge,
    reportId: crypto.randomUUID(),
    checkedAt: now,
  });
it("required trims Unicode whitespace, uses stable revision/rule identity, and preserves unknown amounts and originals", () => {
  const original = quote("　\n");
  const before = JSON.stringify(original);
  const first = evaluate(original, [mockKnowledgeRevision]),
    second = evaluate(original, [mockKnowledgeRevision]);
  expect(first.issues.find((issue) => issue.category === "commercial_terms")).toMatchObject({
    checkId: `${id}:${mockKnowledgeRevision.revisionId}:${mockKnowledgeRevision.content.rules[0]!.ruleId}`,
    fieldPath: "payment",
    severity: "warning",
    evidence: [{ sourceStatus: "synthetic", sourceHash: mockKnowledgeRevision.sourceHash }],
  });
  expect(second.issues).toEqual(first.issues);
  expect(first.reportId).not.toBe(second.reportId);
  expect(original.goodsTotal).toBeNull();
  expect(JSON.stringify(original)).toBe(before);
});
it("literal comparison is NFKC plus lowercase, never a regular expression or inferred ratio rule", () => {
  const revision: KnowledgeRevision = {
    ...mockKnowledgeRevision,
    content: {
      ...mockKnowledgeRevision.content,
      rules: [
        {
          ...mockKnowledgeRevision.content.rules[0]!,
          field: "delivery",
          condition: { kind: "forbidden_literal", literal: "fob+" },
        },
      ],
    },
  };
  expect(
    evaluate(quote("10%+20%", "ＦＯＢ＋承诺"), [revision]).issues.some(
      (issue) => issue.fieldPath === "delivery",
    ),
  ).toBe(true);
  expect(
    evaluate(quote("10%+20%", "FOBBBB"), [revision]).issues.filter(
      (issue) => issue.category === "commercial_terms",
    ),
  ).toHaveLength(0);
  expect(evaluate(quote("10%+20%"), [mockKnowledgeRevision]).coverage[0]?.status).toBe("checked");
});
it("scope and publication time are rechecked before per-document newest matching revision selection", () => {
  const excluded: KnowledgeRevision = {
    ...mockKnowledgeRevision,
    revisionId: crypto.randomUUID(),
    version: 2,
    content: {
      ...mockKnowledgeRevision.content,
      scope: { platforms: ["other-platform"], markets: [], categories: [] },
    },
  };
  const future: KnowledgeRevision = {
    ...mockKnowledgeRevision,
    revisionId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    publishedAt: "2099-01-01T00:00:00.000Z",
  };
  const report = evaluate(quote(), [future, excluded, mockKnowledgeRevision]);
  expect(report.ruleRevisionIds).toEqual([mockKnowledgeRevision.revisionId]);
  expect(
    evaluate(quote(), [excluded, future]).coverage.every((item) => item.status === "pending"),
  ).toBe(true);
});
it("two empty coverage categories each have one pending issue with no fabricated evidence", () => {
  const report = evaluate(quote(), []);
  expect(report.coverage).toHaveLength(2);
  expect(report.issues).toHaveLength(2);
  expect(
    report.issues.every((issue) => issue.severity === "pending" && issue.evidence.length === 0),
  ).toBe(true);
  expect(report.ruleRevisionIds).toEqual([]);
});
it("new revision fixes a rule without changing the old report and rejects staged knowledge", () => {
  const v1 = quote(),
    old = evaluate(v1, [mockKnowledgeRevision]);
  const v2 = {
    ...v1,
    id: crypto.randomUUID(),
    rootId: v1.id,
    parentId: v1.id,
    version: 2,
    payment: "T/T",
  };
  const next = evaluate(v2, [mockKnowledgeRevision]);
  expect(next.revisionId).toBe(v2.id);
  expect(next.quoteId).toBe(v1.id);
  expect(next.issues.filter((issue) => issue.category === "commercial_terms")).toHaveLength(0);
  expect(old.issues.some((issue) => issue.fieldPath === "payment")).toBe(true);
  expect(() =>
    evaluate(v1, [{ ...mockKnowledgeRevision, status: "staged", publishedAt: null }]),
  ).toThrow();
});
