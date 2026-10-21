import { z } from "zod";
import { TradeResultSchema } from "./trade";

// Reuse the existing public failure shape, including conflict version and issues.
export const FailureSchema = TradeResultSchema.options[1];
export const PublicErrorSchema = FailureSchema.shape.error;
export const IssueSchema = PublicErrorSchema.shape.issues.element;
export const readEnvelope = { schemaVersion: z.literal(1), requestId: z.uuid() };
export const writeEnvelope = { ...readEnvelope, idempotencyKey: z.uuid() };
export function resultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.strictObject({
      ok: z.literal(true),
      data,
      warnings: z.array(IssueSchema),
      evidenceIds: z.array(z.string()),
    }),
    FailureSchema,
  ]);
}
