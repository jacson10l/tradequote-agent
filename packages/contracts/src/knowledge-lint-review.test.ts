import { expect, it } from "vitest";
import {
  KnowledgeLintCheckSchema,
  type KnowledgeLintReport,
  KnowledgeLintReviewExchangeSchema,
  KnowledgeLintReviewInputExchangeSchema,
  type WikiReviewDecision,
  type WikiReviewInput,
} from "./index";

let nextId = 0;
const id = () => `00000000-0000-4000-8000-${(++nextId).toString().padStart(12, "0")}`;

function fixture() {
  const binding = {
    revisionId: id(),
    contentHash: "a".repeat(64),
    sourceSetHash: "b".repeat(64),
  };
  const receipt = {
    ...binding,
    receiptId: id(),
    workspaceId: id(),
    checkedAt: "2026-10-23T00:00:00.000Z",
    policyVersion: "synthetic-policy-v1",
    outcome: "passed" as const,
  };
  const report: KnowledgeLintReport = {
    reportId: receipt.receiptId,
    receipt,
    status: "completed",
    coverage: KnowledgeLintCheckSchema.options.map((check) => ({ check, status: "passed" })),
    issues: [],
    error: null,
  };
  const review: WikiReviewDecision = {
    ...binding,
    workspaceId: receipt.workspaceId,
    expectedLifecycleVersion: 1,
    decision: "approve",
    note: "synthetic approval",
    lintReceiptId: receipt.receiptId,
    lintReceipt: receipt,
    reviewId: id(),
    actorId: "synthetic-human",
    decidedAt: "2026-10-23T00:01:00.000Z",
  };
  return { report, review };
}
it("accepts a complete persisted report receipt at the P1-to-P0 review boundary", () => {
  expect(KnowledgeLintReviewExchangeSchema.safeParse(fixture()).success).toBe(true);
});

function inputExchange() {
  const { report, review } = fixture();
  const input: WikiReviewInput = {
    revisionId: review.revisionId,
    contentHash: review.contentHash,
    sourceSetHash: review.sourceSetHash,
    expectedLifecycleVersion: review.expectedLifecycleVersion,
    decision: review.decision,
    note: review.note,
    lintReceiptId: review.lintReceiptId,
  };
  return {
    report,
    input,
    context: {
      workspaceId: review.workspaceId,
      actorId: review.actorId,
      origin: "human_ui" as const,
      now: review.decidedAt,
    },
  };
}

it("accepts the existing strict P0 review payload with host context and a loaded P1 report", () => {
  const exchange = inputExchange();
  const parsed = KnowledgeLintReviewInputExchangeSchema.parse(exchange);
  expect(parsed.input).toEqual(exchange.input);
  expect(
    KnowledgeLintReviewInputExchangeSchema.safeParse({
      ...exchange,
      input: { ...exchange.input, lintReceipt: exchange.report.receipt },
    }).success,
  ).toBe(false);
});

it.each(["lintReceiptId", "revisionId", "contentHash", "sourceSetHash"] as const)(
  "rejects a review input that substitutes %s",
  (field) => {
    const exchange = inputExchange();
    expect(
      KnowledgeLintReviewInputExchangeSchema.safeParse({
        ...exchange,
        input: { ...exchange.input, [field]: field.endsWith("Hash") ? "c".repeat(64) : id() },
      }).success,
    ).toBe(false);
  },
);

it("rejects another workspace, future report and non-human review channels", () => {
  const exchange = inputExchange();
  for (const change of [
    { workspaceId: id() },
    { now: "2026-10-22T00:00:00.000Z" },
    { origin: "agent_tool" },
    { origin: "system_job" },
  ]) {
    expect(
      KnowledgeLintReviewInputExchangeSchema.safeParse({
        ...exchange,
        context: { ...exchange.context, ...change },
      }).success,
    ).toBe(false);
  }
});

it.each(["blocked", "partial", "failed"] as const)(
  "keeps a %s report recordable for rejection but unavailable for approval",
  (state) => {
    const exchange = inputExchange();
    const report: KnowledgeLintReport = {
      ...exchange.report,
      status: state === "blocked" ? "completed" : state,
      receipt: { ...exchange.report.receipt, outcome: state === "blocked" ? "blocked" : "unknown" },
      coverage: exchange.report.coverage.map((c, i) =>
        i === 0 ? { ...c, status: state === "blocked" ? "issues" : "not_run" } : c,
      ),
      issues:
        state === "blocked"
          ? [
              {
                issueKey: "c".repeat(64),
                check: "source_integrity",
                severity: "block",
                message: "Synthetic blocking evidence",
                sectionIds: [],
                sourceRevisionIds: [],
              },
            ]
          : [],
      error:
        state === "failed"
          ? {
              code: "STORAGE_ERROR",
              message: "Synthetic lint failure",
              retryable: false,
              issues: [],
            }
          : null,
    };
    expect(KnowledgeLintReviewInputExchangeSchema.safeParse({ ...exchange, report }).success).toBe(
      false,
    );
    expect(
      KnowledgeLintReviewInputExchangeSchema.safeParse({
        ...exchange,
        report,
        input: { ...exchange.input, decision: "reject" },
      }).success,
    ).toBe(true);
  },
);
it.each([
  "policyVersion",
  "checkedAt",
  "workspaceId",
  "revisionId",
  "contentHash",
  "sourceSetHash",
  "receiptId",
] as const)("rejects a self-consistent review that substitutes report receipt %s", (field) => {
  const { report, review } = fixture();
  const value =
    field === "checkedAt"
      ? "2026-10-23T00:00:30.000Z"
      : field.endsWith("Hash")
        ? "c".repeat(64)
        : field === "policyVersion"
          ? "different-policy"
          : id();
  const substituted = { ...review.lintReceipt, [field]: value };
  const rebound = {
    ...review,
    lintReceipt: substituted,
    ...(field === "receiptId"
      ? { lintReceiptId: value }
      : field === "workspaceId" || field === "revisionId" || field.endsWith("Hash")
        ? { [field]: value }
        : {}),
  };
  expect(KnowledgeLintReviewExchangeSchema.safeParse({ report, review: rebound }).success).toBe(
    false,
  );
});
it("allows a recorded rejection of incomplete checks but never an approval", () => {
  const { report, review } = fixture();
  const partial = {
    ...report,
    status: "partial",
    receipt: { ...report.receipt, outcome: "unknown" },
    coverage: report.coverage.map((c, i) => (i === 0 ? { ...c, status: "not_run" } : c)),
  };
  const rejection = { ...review, decision: "reject", lintReceipt: partial.receipt };
  expect(
    KnowledgeLintReviewExchangeSchema.safeParse({ report: partial, review: rejection }).success,
  ).toBe(true);
  expect(
    KnowledgeLintReviewExchangeSchema.safeParse({
      report: partial,
      review: { ...rejection, decision: "approve" },
    }).success,
  ).toBe(false);
});
