import { expect, it } from "vitest";
import {
  KnowledgeLintCheckSchema,
  type KnowledgeLintReport,
  KnowledgeLintReviewExchangeSchema,
  type WikiReviewDecision,
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
