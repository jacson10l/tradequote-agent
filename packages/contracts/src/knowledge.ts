import { z } from "zod";
import type { ExecutionContext } from "./index";
import { readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import { SourceLocationSchema } from "./values";

const label = z.string().trim().min(1).max(200);
const message = z.string().trim().min(1).max(2000);
const scopeDimension = z
  .array(label)
  .max(20)
  .refine((items) => new Set(items).size === items.length, "适用范围不能重复");
export const KnowledgeScopeSchema = z.strictObject({
  platforms: scopeDimension,
  markets: scopeDimension,
  categories: scopeDimension,
});
export const RuleCategorySchema = z.enum(["commercial_terms", "platform_guidance"]);
export const RuleDefinitionSchema = z.strictObject({
  ruleId: z.uuid(),
  category: RuleCategorySchema,
  title: label,
  message,
  suggestedAction: message,
  field: z.enum(["payment", "delivery"]),
  condition: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("required") }),
    z.strictObject({ kind: z.literal("forbidden_literal"), literal: label }),
  ]),
  failureSeverity: z.enum(["warning", "block"]),
});
export const SourceHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const SourceStatusSchema = z.enum(["synthetic", "user_provided"]);
// B00/A01 accept text only. Other SourceLocation variants remain available to later importers.
export const KnowledgeLocationSchema = SourceLocationSchema.options[4];
export const KnowledgeContentSchema = z
  .strictObject({
    title: label,
    scope: KnowledgeScopeSchema,
    sourceStatus: SourceStatusSchema,
    sourceLabel: label,
    // Do not trim: location uses UTF-16 indices into this exact string; hash uses UTF-8 bytes.
    sourceText: z.string().min(1).max(32000),
    location: KnowledgeLocationSchema,
    rules: z
      .array(RuleDefinitionSchema)
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map((rule) => rule.ruleId)).size === items.length,
        "规则身份不能重复",
      ),
  })
  .refine((input) => {
    const { start, end } = input.location;
    const splitsSurrogate = (index: number) =>
      index > 0 &&
      index < input.sourceText.length &&
      /[\uD800-\uDBFF]/.test(input.sourceText[index - 1] ?? "") &&
      /[\uDC00-\uDFFF]/.test(input.sourceText[index] ?? "");
    return end <= input.sourceText.length && !splitsSurrogate(start) && !splitsSurrogate(end);
  }, "来源范围须在原文内且不能截断字符");
export const KnowledgeDraftInputSchema = KnowledgeContentSchema.safeExtend({
  documentId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
});
export const KnowledgeRevisionSchema = z
  .strictObject({
    revisionId: z.uuid(),
    documentId: z.uuid(),
    version: z.number().int().positive(),
    status: z.enum(["staged", "published"]),
    sourceHash: SourceHashSchema,
    createdAt: z.iso.datetime(),
    publishedAt: z.iso.datetime().nullable(),
    content: KnowledgeContentSchema,
  })
  .refine(
    (value) =>
      value.status === "staged"
        ? value.publishedAt === null
        : value.publishedAt !== null &&
          Date.parse(value.publishedAt) >= Date.parse(value.createdAt),
    "发布状态与时间不一致",
  );
export const PublishedKnowledgeRevisionSchema = KnowledgeRevisionSchema.refine(
  (value) => value.status === "published",
  "查询与检查只接受已发布知识",
);
export const KnowledgeQuerySchema = z.strictObject({
  scope: z.strictObject({ platform: label, market: label, category: label }),
  at: z.iso.datetime(),
});
export const KnowledgeEvidenceSchema = z.strictObject({
  revisionId: z.uuid(),
  ruleId: z.uuid(),
  sourceHash: SourceHashSchema,
  sourceLabel: label,
  sourceStatus: SourceStatusSchema,
  location: KnowledgeLocationSchema,
});
export const KnowledgePublishInputSchema = z.strictObject({
  revisionId: z.uuid(),
  sourceHash: SourceHashSchema,
});
export const KnowledgeCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledge.stage"),
    payload: KnowledgeDraftInputSchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledge.publish"),
    payload: KnowledgePublishInputSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("knowledge.query"),
    payload: KnowledgeQuerySchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("knowledge.getRevision"),
    payload: z.strictObject({ revisionId: z.uuid() }),
  }),
]);
export const KnowledgeRevisionResultSchema = resultSchema(
  z.strictObject({ kind: z.literal("revision"), revision: KnowledgeRevisionSchema }),
);
export const KnowledgeListResultSchema = resultSchema(
  z.strictObject({ kind: z.literal("list"), revisions: z.array(PublishedKnowledgeRevisionSchema) }),
);
export const KnowledgeResultSchema = z.union([
  KnowledgeRevisionResultSchema,
  KnowledgeListResultSchema,
]);
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type RuleCategory = z.infer<typeof RuleCategorySchema>;
export type KnowledgeContent = z.infer<typeof KnowledgeContentSchema>;
export type KnowledgeDraftInput = z.infer<typeof KnowledgeDraftInputSchema>;
export type KnowledgeRevision = z.infer<typeof KnowledgeRevisionSchema>;
export type PublishedKnowledgeRevision = z.infer<typeof PublishedKnowledgeRevisionSchema>;
export type KnowledgeQuery = z.infer<typeof KnowledgeQuerySchema>;
export type KnowledgeEvidence = z.infer<typeof KnowledgeEvidenceSchema>;
export type KnowledgePublishInput = z.infer<typeof KnowledgePublishInputSchema>;
export type KnowledgeCommand = z.infer<typeof KnowledgeCommandSchema>;
export type KnowledgeResult = z.infer<typeof KnowledgeResultSchema>;
export type KnowledgeRevisionResult = z.infer<typeof KnowledgeRevisionResultSchema>;
export type KnowledgeListResult = z.infer<typeof KnowledgeListResultSchema>;
export interface KnowledgeRepository {
  stage(
    input: KnowledgeDraftInput,
    context: ExecutionContext,
    idempotencyKey: string,
  ): KnowledgeRevisionResult;
  publish(
    input: KnowledgePublishInput,
    context: ExecutionContext,
    idempotencyKey: string,
  ): KnowledgeRevisionResult;
  findPublished(query: KnowledgeQuery): KnowledgeRevision[];
  getRevision(revisionId: string): KnowledgeRevision | null;
}
export interface KnowledgeClient {
  stageKnowledge(
    command: Extract<KnowledgeCommand, { method: "knowledge.stage" }>,
  ): Promise<KnowledgeRevisionResult>;
  publishKnowledge(
    command: Extract<KnowledgeCommand, { method: "knowledge.publish" }>,
  ): Promise<KnowledgeRevisionResult>;
  queryKnowledge(
    command: Extract<KnowledgeCommand, { method: "knowledge.query" }>,
  ): Promise<KnowledgeListResult>;
  getKnowledgeRevision(
    command: Extract<KnowledgeCommand, { method: "knowledge.getRevision" }>,
  ): Promise<KnowledgeRevisionResult>;
}
