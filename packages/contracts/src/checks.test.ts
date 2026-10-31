import { describe, expect, it } from "vitest";
import {
  CheckCommandSchema,
  CheckListResultSchema,
  CheckReportSchema,
  CheckResultSchema,
  demoScenario,
  failure,
  QuoteCheckInputSchema,
  type QuoteSnapshot,
} from "./index";
import {
  mockKnowledgeRevision as knowledge,
  mockWikiCommands,
  mockWorkspace,
  readonlyMockClient,
  mockCheckReport as report,
} from "./mock";

const id = mockWorkspace.id;
const quote: QuoteSnapshot = {
  id,
  workspaceId: id,
  number: "合成报价",
  version: 1,
  status: "draft",
  createdAt: report.checkedAt,
  scenario: { ...demoScenario, id, version: 1, createdAt: report.checkedAt },
  buyer: "合成采购方",
  inquiry: "询问报价",
  payment: "",
  delivery: "",
  currency: "USD",
  lines: [
    {
      product: {
        id,
        batchId: id,
        sourceHash: knowledge.sourceHash,
        sourceName: "合成商品",
        sourceStatus: "synthetic",
        sku: "TEST",
        name: "合成板材",
        category: "板材",
        unit: "m2",
        currency: "USD",
        validUntil: "2099-12-31",
        description: "合成",
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
describe("B00 quote checks boundary", () => {
  it("A-W08: unavailable failures agree across the public helper, mock and pending Wiki client", async () => {
    const review = mockWikiCommands.find((command) => command.method === "wiki.review")!;
    const results = [
      failure("CAPABILITY_UNAVAILABLE", "能力尚未接入"),
      await readonlyMockClient.createWorkspace({
        schemaVersion: 1,
        requestId: id,
        idempotencyKey: id,
        method: "workspace.create",
        payload: { name: "合成工作区" },
      }),
      await readonlyMockClient.executeWiki(review),
    ];
    for (const result of results)
      expect(result).toMatchObject({
        ok: false,
        error: { code: "CAPABILITY_UNAVAILABLE", retryable: false, issues: [] },
      });
    const invalidReview = { ...review, unexpected: true };
    expect(await readonlyMockClient.executeWiki(invalidReview)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
    expect(failure("REVISION_CONFLICT", "基线已变化", 2).error).toMatchObject({
      code: "REVISION_CONFLICT",
      retryable: false,
      currentAggregateVersion: 2,
    });
  });
  it("accepts V1 without rootId, retains unknown amounts and explicit test time", () => {
    const input = {
      quote,
      knowledge: [knowledge],
      reportId: report.reportId,
      checkedAt: report.checkedAt,
    };
    expect(QuoteCheckInputSchema.parse(input).quote.goodsTotal).toBeNull();
    expect(
      QuoteCheckInputSchema.safeParse({
        ...input,
        knowledge: [{ ...knowledge, status: "staged", publishedAt: null }],
      }).success,
    ).toBe(false);
    expect(
      QuoteCheckInputSchema.safeParse({ ...input, quote: { ...quote, goodsTotal: 0 } }).success,
    ).toBe(false);
    expect(QuoteCheckInputSchema.safeParse({ ...input, approval: "approved" }).success).toBe(false);
    expect(CheckReportSchema.safeParse({ ...report, quoteId: knowledge.documentId }).success).toBe(
      false,
    );
  });
  it("cannot turn empty rules into an all-clear report or hide missing coverage", () => {
    expect(CheckReportSchema.parse(report)).toEqual(report);
    for (const invalid of [
      { ...report, coverage: [] },
      { ...report, coverage: [report.coverage[0], report.coverage[0]] },
      { ...report, coverage: report.coverage.map((c) => ({ ...c, status: "checked" })) },
      { ...report, issues: [] },
      { ...report, issues: [...report.issues, report.issues[0]] },
      { ...report, ruleRevisionIds: [knowledge.revisionId] },
      { ...report, passed: true },
    ])
      expect(CheckReportSchema.safeParse(invalid).success).toBe(false);
  });
  it("binds rule issues to applied revisions and carries the same source to both feedback views", () => {
    const ruleId = knowledge.content.rules[0]?.ruleId;
    const issue = {
      checkId: `${id}:${knowledge.revisionId}:${ruleId}`,
      category: "commercial_terms",
      severity: "warning",
      fieldPath: "payment",
      message: "合成：缺付款条件",
      suggestedAction: "补充后检查",
      evidence: [
        {
          revisionId: knowledge.revisionId,
          ruleId,
          sourceHash: knowledge.sourceHash,
          sourceLabel: knowledge.content.sourceLabel,
          sourceStatus: "synthetic",
          location: knowledge.content.location,
        },
      ],
    };
    const checked = {
      ...report,
      ruleRevisionIds: [knowledge.revisionId],
      coverage: [
        { category: "commercial_terms", appliedRuleIds: [ruleId], status: "checked" },
        report.coverage[1],
      ],
      issues: [issue, report.issues[1]],
    };
    expect(CheckReportSchema.safeParse(checked).success).toBe(true);
    for (const invalid of [
      { ...checked, ruleRevisionIds: [] },
      { ...checked, ruleRevisionIds: [knowledge.revisionId, knowledge.revisionId] },
      { ...checked, issues: [{ ...issue, evidence: [] }, report.issues[1]] },
      { ...checked, issues: [{ ...issue, fieldPath: "goodsTotal" }, report.issues[1]] },
      {
        ...checked,
        issues: [
          { ...issue, evidence: [{ ...issue.evidence[0], revisionId: id }] },
          report.issues[1],
        ],
      },
    ])
      expect(CheckReportSchema.safeParse(invalid).success).toBe(false);
  });
  it("only accepts revision references from clients, never caller-supplied reports or amounts", () => {
    const command = {
      schemaVersion: 1,
      requestId: id,
      idempotencyKey: id,
      method: "quote.check",
      payload: { revisionId: id },
    };
    expect(CheckCommandSchema.safeParse(command).success).toBe(true);
    for (const extra of [
      { quote },
      { report },
      { goodsTotal: "0" },
      { checkedAt: report.checkedAt },
      { reportId: report.reportId },
    ])
      expect(
        CheckCommandSchema.safeParse({ ...command, payload: { ...command.payload, ...extra } })
          .success,
      ).toBe(false);
    const { idempotencyKey: _key, ...read } = command;
    expect(CheckCommandSchema.safeParse(read).success).toBe(false);
    expect(CheckCommandSchema.safeParse({ ...read, method: "quote.getChecks" }).success).toBe(true);
    expect(CheckCommandSchema.safeParse({ ...command, method: "quote.getChecks" }).success).toBe(
      false,
    );
    expect(
      CheckResultSchema.safeParse({ ok: true, data: report, warnings: [], evidenceIds: [] })
        .success,
    ).toBe(true);
    expect(
      CheckListResultSchema.safeParse({ ok: true, data: [report], warnings: [], evidenceIds: [] })
        .success,
    ).toBe(true);
    expect(CheckResultSchema.safeParse(failure("REVISION_CONFLICT", "基线已变化", 2)).success).toBe(
      true,
    );
  });
});
