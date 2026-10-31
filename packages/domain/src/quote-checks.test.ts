import { CheckReportSchema } from "@tradequote/contracts";
import { describe, expect, it } from "vitest";
import { evaluateQuoteChecks } from "./quote-checks";
import {
  sampleCheckedAt,
  sampleInput,
  sampleOtherCategoryRevision,
  samplePackagingConflictRevision,
  samplePackagingRevision,
  samplePaymentRevision,
  sampleQuotes,
  sampleReportIds,
  sampleVersion,
} from "./quote-checks.samples";

const paymentRule = samplePaymentRevision.content.rules[0]!;
const packagingRule = samplePackagingRevision.content.rules[0]!;

describe("B01 quote rule samples and double feedback", () => {
  it("QUOTE-01 keeps the sample set synthetic, fixed and explicitly versioned", () => {
    expect(sampleVersion).toBe("b01-quote-checks-samples-v1");
    for (const revision of [
      samplePaymentRevision,
      samplePackagingRevision,
      samplePackagingConflictRevision,
      sampleOtherCategoryRevision,
    ]) {
      expect(revision.content.sourceStatus).toBe("synthetic");
      expect(revision.content.sourceLabel).toContain("非真实供应商");
      expect(revision.status).toBe("published");
    }
    expect(sampleQuotes.blocking.scenario.sourceStatus).toBe("synthetic");
  });
  it("QUOTE-02 reports a payment-ratio literal violation and the packaging conflict without picking a side", () => {
    const { report, annotations } = evaluateQuoteChecks(
      sampleInput(
        sampleQuotes.blocking,
        [samplePaymentRevision, samplePackagingRevision, samplePackagingConflictRevision],
        sampleReportIds.blocking,
      ),
    );
    expect(CheckReportSchema.safeParse(report).success).toBe(true);
    expect(report.quoteId).toBe(sampleQuotes.blocking.id);
    expect(report.revisionId).toBe(sampleQuotes.blocking.id);
    expect(report.coverage).toEqual([
      {
        category: "commercial_terms",
        appliedRuleIds: [paymentRule.ruleId, samplePaymentRevision.content.rules[1]!.ruleId].sort(),
        status: "checked",
      },
      { category: "platform_guidance", appliedRuleIds: [packagingRule.ruleId], status: "checked" },
    ]);
    const byId = new Map(report.issues.map((issue) => [issue.checkId, issue]));
    const violation = byId.get(`${sampleQuotes.blocking.id}:${paymentRule.ruleId}:violation`);
    expect(violation).toMatchObject({
      category: "commercial_terms",
      severity: "block",
      fieldPath: "payment",
    });
    expect(violation?.evidence).toHaveLength(1);
    expect(violation?.evidence[0]).toMatchObject({
      revisionId: samplePaymentRevision.revisionId,
      ruleId: paymentRule.ruleId,
      sourceStatus: "synthetic",
      sourceLabel: samplePaymentRevision.content.sourceLabel,
    });
    const conflict = byId.get(`${sampleQuotes.blocking.id}:${packagingRule.ruleId}:conflict`);
    expect(conflict).toMatchObject({ severity: "block", fieldPath: "delivery" });
    expect(conflict?.evidence.map((item) => item.revisionId).sort()).toEqual(
      [samplePackagingRevision.revisionId, samplePackagingConflictRevision.revisionId].sort(),
    );
    expect(conflict?.message).toContain("需人工裁决");
    expect(annotations).toEqual(
      report.issues.map((issue) => ({ checkId: issue.checkId, fieldPath: issue.fieldPath })),
    );
    expect(new Set(annotations.map((item) => item.checkId)).size).toBe(report.issues.length);
  });
  it("QUOTE-03 treats a clean quote as checked-and-clear only when rules actually applied", () => {
    const { report } = evaluateQuoteChecks(
      sampleInput(
        sampleQuotes.compliant,
        [samplePaymentRevision, samplePackagingRevision],
        sampleReportIds.compliant,
      ),
    );
    expect(report.issues).toEqual([]);
    expect(report.coverage.every((item) => item.status === "checked")).toBe(true);
    expect(report.ruleRevisionIds).toEqual(
      [samplePaymentRevision.revisionId, samplePackagingRevision.revisionId].sort(),
    );
  });
  it("QUOTE-04 never turns missing coverage into an all-clear report", () => {
    const { report } = evaluateQuoteChecks(
      sampleInput(sampleQuotes.uncovered, [sampleOtherCategoryRevision], sampleReportIds.uncovered),
    );
    expect(report.coverage.map((item) => item.status)).toEqual(["pending", "pending"]);
    expect(report.ruleRevisionIds).toEqual([]);
    expect(report.issues).toHaveLength(2);
    for (const issue of report.issues) {
      expect(issue).toMatchObject({ severity: "pending", fieldPath: "scenario.platform" });
      expect(issue.evidence).toEqual([]);
      expect(issue.checkId).toBe(`${sampleQuotes.uncovered.id}:coverage:${issue.category}:pending`);
    }
  });
  it("QUOTE-05 matches full-width, case and surrounding-space variants deterministically", () => {
    for (const payment of ["预付１００％", "预付 100%", "预付100％，余款见提单副本", "100% T/T"])
      expect(
        evaluateQuoteChecks(
          sampleInput(
            { ...sampleQuotes.blocking, payment },
            [samplePaymentRevision],
            sampleReportIds.blocking,
          ),
        ).report.issues.some((issue) => issue.checkId.endsWith(":violation")),
      ).toBe(true);
    for (const payment of ["预付30%，余款发货前付清", "预付三成", ""])
      expect(
        evaluateQuoteChecks(
          sampleInput(
            { ...sampleQuotes.blocking, payment },
            [samplePaymentRevision],
            sampleReportIds.blocking,
          ),
        )
          .report.issues.filter((issue) => issue.severity !== "pending")
          .map((issue) => issue.severity),
      ).toEqual(payment === "" ? ["warning"] : []);
  });
  it("QUOTE-06 keeps V1 results immutable and gives V2 a new revision-bound report", () => {
    const knowledge = [samplePaymentRevision, samplePackagingRevision];
    const before = JSON.stringify(knowledge);
    const v1 = evaluateQuoteChecks(
      sampleInput(sampleQuotes.blocking, knowledge, sampleReportIds.blocking),
    ).report;
    const snapshot = JSON.stringify(v1);
    const v2 = evaluateQuoteChecks(
      sampleInput(sampleQuotes.revised, knowledge, sampleReportIds.revised),
    ).report;
    expect(JSON.stringify(knowledge)).toBe(before);
    expect(JSON.stringify(v1)).toBe(snapshot);
    expect(v2.revisionId).toBe(sampleQuotes.revised.id);
    expect(v2.quoteId).toBe(sampleQuotes.blocking.id);
    expect(v2.quoteVersion).toBe(2);
    expect(v1.issues.map((issue) => issue.checkId)).toEqual(
      expect.arrayContaining([`${sampleQuotes.blocking.id}:${paymentRule.ruleId}:violation`]),
    );
    expect(v2.issues.map((issue) => issue.checkId)).toEqual(
      expect.arrayContaining([`${sampleQuotes.revised.id}:${packagingRule.ruleId}:violation`]),
    );
    expect(v2.issues.find((issue) => issue.category === "commercial_terms")).toBeUndefined();
    expect(new Set([...v1.issues, ...v2.issues].map((issue) => issue.checkId)).size).toBe(
      v1.issues.length + v2.issues.length,
    );
    expect(CheckReportSchema.safeParse(v2).success).toBe(true);
    expect(sampleCheckedAt).toBe(v2.checkedAt);
  });
});
