import { z } from "zod";
import { PositiveInputSchema, QuoteInputSchema, TradeResultSchema } from "./trade";

const envelope = { schemaVersion: z.literal(1), requestId: z.uuid(), idempotencyKey: z.uuid() };
export const AgentCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...envelope,
    method: z.literal("agent.understand"),
    payload: z.strictObject({
      executionMode: z.enum(["tool_loop", "codex_harness"]).optional(),
      scenarioId: z.uuid(),
      buyer: QuoteInputSchema.shape.buyer,
      inquiry: QuoteInputSchema.shape.inquiry,
    }),
  }),
  z.strictObject({
    ...envelope,
    method: z.literal("agent.revise"),
    payload: z.strictObject({
      executionMode: z.enum(["tool_loop", "codex_harness"]).optional(),
      baseId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      instruction: z.string().trim().min(1).max(8000),
    }),
  }),
]);
export const RevisionPatchSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("setQuantity"),
    productId: z.uuid(),
    quantity: PositiveInputSchema,
  }),
  z.strictObject({ op: z.literal("setPayment"), value: z.string().trim().max(1000) }),
  z.strictObject({ op: z.literal("setDelivery"), value: z.string().trim().max(1000) }),
]);
export const UnderstandingSchema = z.strictObject({
  lines: QuoteInputSchema.shape.lines,
  payment: QuoteInputSchema.shape.payment,
  delivery: QuoteInputSchema.shape.delivery,
  summary: z.string().trim().min(1).max(2000),
});
export const RevisionProposalSchema = z.strictObject({
  patches: z
    .array(RevisionPatchSchema)
    .min(1)
    .max(50)
    .refine((items) => {
      const keys = items.map((p) => (p.op === "setQuantity" ? `${p.op}:${p.productId}` : p.op));
      return new Set(keys).size === keys.length;
    }, "同一字段不能重复修改"),
  summary: z.string().trim().min(1).max(2000),
});
export const ClarificationSchema = z.strictObject({
  clarification: z.string().trim().min(1).max(2000),
});
export type AgentCommand = z.infer<typeof AgentCommandSchema>;
export type RevisionProposal = z.infer<typeof RevisionProposalSchema>;
export type Understanding = z.infer<typeof UnderstandingSchema>;
export const ModelCredentialsSchema = z.strictObject({
  key: z.string().trim().min(1).max(4096),
  model: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/),
});
export const SavedCredentialsSchema = z.strictObject({
  encrypted: z.string().max(20000),
  model: ModelCredentialsSchema.shape.model,
});
export type ModelCredentials = z.infer<typeof ModelCredentialsSchema>;
export const ModelSettingsCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("model.status") }),
  z.strictObject({
    method: z.literal("model.save"),
    key: z.string().trim().max(4096),
    model: ModelCredentialsSchema.shape.model,
  }),
  z.strictObject({ method: z.literal("model.clear") }),
  z.strictObject({ method: z.literal("model.test") }),
]);
export const ModelStatusSchema = z.strictObject({
  hasKey: z.boolean(),
  model: z.string(),
  storage: z.enum(["encrypted", "memory"]),
  verifiedAt: z.iso.datetime().nullable(),
});
export const ModelResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    data: ModelStatusSchema,
    warnings: z.array(z.never()),
    evidenceIds: z.array(z.string()),
  }),
  TradeResultSchema.options[1],
]);
export type ModelResult = z.infer<typeof ModelResultSchema>;
export type ModelSettingsCommand = z.infer<typeof ModelSettingsCommandSchema>;
export interface AgentClient {
  understandInquiry(
    command: Extract<AgentCommand, { method: "agent.understand" }>,
  ): Promise<z.infer<typeof TradeResultSchema>>;
  reviseQuote(
    command: Extract<AgentCommand, { method: "agent.revise" }>,
  ): Promise<z.infer<typeof TradeResultSchema>>;
  modelSettings(command: ModelSettingsCommand): Promise<ModelResult>;
}
