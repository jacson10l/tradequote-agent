import { z } from "zod";
import {
  KnowledgeEvidenceSchema,
  PublishedKnowledgeRevisionSchema,
  RuleCategorySchema,
} from "./knowledge";
import { readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import { QuoteSnapshotSchema } from "./trade";

const ruleIds = z
  .array(z.uuid())
  .refine((ids) => new Set(ids).size === ids.length, "规则ID不能重复");
export const CheckCoverageSchema = z
  .strictObject({
    category: RuleCategorySchema,
    appliedRuleIds: ruleIds,
    status: z.enum(["checked", "pending"]),
  })
  .refine(
    (value) => (value.status === "pending") === (value.appliedRuleIds.length === 0),
    "无适用规则必须待确认",
  );
export const CheckIssueSchema = z
  .strictObject({
    checkId: z.string().min(1).max(200),
    category: RuleCategorySchema,
    severity: z.enum(["warning", "block", "pending"]),
    fieldPath: z.enum(["payment", "delivery", "scenario.platform"]),
    message: z.string().trim().min(1).max(2000),
    suggestedAction: z.string().trim().min(1).max(2000),
    evidence: z.array(KnowledgeEvidenceSchema).max(100),
  })
  .refine(
    (value) =>
      value.severity === "pending"
        ? value.fieldPath === "scenario.platform" && value.evidence.length === 0
        : value.fieldPath !== "scenario.platform" && value.evidence.length > 0,
    "规则问题必须有来源，缺覆盖问题使用平台定位且无虚构来源",
  );
export const CheckReportSchema = z
  .strictObject({
    reportId: z.uuid(),
    quoteId: z.uuid(),
    revisionId: z.uuid(),
    quoteVersion: z.number().int().positive(),
    checkedAt: z.iso.datetime(),
    ruleRevisionIds: z
      .array(z.uuid())
      .refine(
        (ids) => ids.every((id, i) => i === 0 || (ids[i - 1] ?? "") < id),
        "知识版本ID须排序去重",
      ),
    coverage: z
      .array(CheckCoverageSchema)
      .length(2)
      .refine(
        (items) => new Set(items.map((item) => item.category)).size === 2,
        "必须覆盖两类规则",
      ),
    issues: z
      .array(CheckIssueSchema)
      .refine(
        (issues) => new Set(issues.map((issue) => issue.checkId)).size === issues.length,
        "问题ID不能重复",
      ),
  })
  .superRefine((report, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    if (report.quoteVersion === 1 && report.quoteId !== report.revisionId)
      invalid("V1根ID须为自身revisionId");
    for (const coverage of report.coverage) {
      const issues = report.issues.filter((issue) => issue.category === coverage.category);
      const pending = issues.filter((issue) => issue.severity === "pending");
      if (
        coverage.status === "pending"
          ? pending.length !== 1 || issues.length !== 1
          : pending.length !== 0
      )
        invalid("缺覆盖必须产生一条待确认批注，已检查不可含缺覆盖批注");
      for (const issue of issues) {
        for (const evidence of issue.evidence) {
          if (
            !report.ruleRevisionIds.includes(evidence.revisionId) ||
            !coverage.appliedRuleIds.includes(evidence.ruleId)
          )
            invalid("问题来源须属于本报告已应用规则");
        }
      }
    }
    if (
      report.coverage.some((item) => item.status === "checked") &&
      report.ruleRevisionIds.length === 0
    )
      invalid("已检查必须引用知识版本");
    if (
      report.coverage.every((item) => item.status === "pending") &&
      report.ruleRevisionIds.length !== 0
    )
      invalid("无适用规则不可声明使用知识版本");
  });
export const QuoteCheckInputSchema = z.strictObject({
  quote: QuoteSnapshotSchema,
  knowledge: z.array(PublishedKnowledgeRevisionSchema),
  reportId: z.uuid(),
  checkedAt: z.iso.datetime(),
});
export const CheckCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("quote.check"),
    payload: z.strictObject({ revisionId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("quote.getChecks"),
    payload: z.strictObject({ revisionId: z.uuid() }),
  }),
]);
export const CheckResultSchema = resultSchema(CheckReportSchema);
export const CheckListResultSchema = resultSchema(z.array(CheckReportSchema));
export type CheckCoverage = z.infer<typeof CheckCoverageSchema>;
export type CheckIssue = z.infer<typeof CheckIssueSchema>;
export type CheckReport = z.infer<typeof CheckReportSchema>;
export type QuoteCheckInput = z.infer<typeof QuoteCheckInputSchema>;
export type CheckCommand = z.infer<typeof CheckCommandSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type CheckListResult = z.infer<typeof CheckListResultSchema>;
export interface QuoteCheckService {
  evaluate(input: QuoteCheckInput): CheckReport;
}
export interface CheckClient {
  checkQuote(command: Extract<CheckCommand, { method: "quote.check" }>): Promise<CheckResult>;
  getQuoteChecks(
    command: Extract<CheckCommand, { method: "quote.getChecks" }>,
  ): Promise<CheckListResult>;
}
