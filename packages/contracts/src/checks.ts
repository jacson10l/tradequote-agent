import { z } from "zod";
import {
  KnowledgeEvidenceSchema,
  PublishedKnowledgeRevisionSchema,
  RuleCategorySchema,
} from "./knowledge";
import { KnowledgeCitationSchema, WikiCitationResolutionSchema } from "./knowledge-wiki";
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
export const WikiCheckEvidenceSchema = KnowledgeEvidenceSchema.safeExtend({
  citation: KnowledgeCitationSchema,
  referenceId: z.uuid(),
}).refine(
  (value) =>
    value.revisionId === value.citation.revisionId &&
    value.citation.sourceRefs.some(
      (ref) =>
        ref.referenceId === value.referenceId &&
        ref.artifactHash === value.sourceHash &&
        ref.location.start === value.location.start &&
        ref.location.end === value.location.end,
    ),
  "报告来源须保留准确的完整知识引用",
);
export const CheckIssueSchema = z
  .strictObject({
    checkId: z.string().min(1).max(200),
    category: RuleCategorySchema,
    severity: z.enum(["warning", "block", "pending"]),
    fieldPath: z.enum(["payment", "delivery", "scenario.platform"]),
    message: z.string().trim().min(1).max(2000),
    suggestedAction: z.string().trim().min(1).max(2000),
    evidence: z.array(z.union([WikiCheckEvidenceSchema, KnowledgeEvidenceSchema])).max(100),
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
    wikiCitations: z.array(KnowledgeCitationSchema).max(100).optional(),
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
    if (report.wikiCitations) {
      const citations = report.wikiCitations;
      if (
        new Set(citations.map((c) => `${c.revisionId}:${c.sectionId}`)).size !== citations.length ||
        citations.some((c) => !report.ruleRevisionIds.includes(c.revisionId)) ||
        report.ruleRevisionIds.some((id) => !citations.some((c) => c.revisionId === id))
      )
        invalid("报告须完整保留所有已应用规则段落的引用");
      for (const issue of report.issues)
        for (const evidence of issue.evidence) {
          if (
            !("citation" in evidence) ||
            !citations.some((c) => JSON.stringify(c) === JSON.stringify(evidence.citation))
          )
            invalid("Wiki规则问题不得降级或丢失来源引用");
        }
      for (const issue of report.issues) {
        const referenced = new Map<string, (typeof citations)[number]>();
        const refs = new Set<string>();
        for (const evidence of issue.evidence)
          if ("citation" in evidence) {
            const key = `${evidence.citation.revisionId}:${evidence.citation.sectionId}`;
            referenced.set(key, evidence.citation);
            if (refs.has(`${key}:${evidence.referenceId}`)) invalid("问题来源定位不能重复");
            refs.add(`${key}:${evidence.referenceId}`);
          }
        for (const [key, citation] of referenced)
          if (citation.sourceRefs.some((ref) => !refs.has(`${key}:${ref.referenceId}`)))
            invalid("问题批注须展示规则段落的全部来源");
      }
    } else if (report.issues.some((issue) => issue.evidence.some((e) => "citation" in e)))
      invalid("Wiki来源须同时登记在报告引用集合");
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
export const QuoteWikiCheckInputSchema = z.strictObject({
  quote: QuoteSnapshotSchema,
  resolutions: z.array(WikiCitationResolutionSchema).max(100),
  reportId: z.uuid(),
  checkedAt: z.iso.datetime(),
});
export type QuoteWikiCheckInput = z.infer<typeof QuoteWikiCheckInputSchema>;
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
