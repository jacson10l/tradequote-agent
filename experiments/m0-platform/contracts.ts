import { z } from "zod";
export const DecimalString = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const Quantity = z.strictObject({ value: DecimalString.refine(v => Number(v) > 0 && Number.isFinite(Number(v))), unitId: z.string().min(1) });
export const Patch = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("setQuantity"), lineId: z.uuid(), quantity: Quantity }),
  z.strictObject({ type: z.literal("selectPrice"), lineId: z.uuid(), priceRevisionId: z.uuid() }),
]);
export const Revise = z.strictObject({ quoteId: z.uuid(), baseRevisionId: z.uuid(), expectedAggregateVersion: z.int().nonnegative(), typedPatch: z.array(Patch).min(1), reason: z.string().min(1) });
export const ApprovalBinding = z.strictObject({ revisionId: z.uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), bundleHash: z.string().regex(/^[a-f0-9]{64}$/) });
// A probe subset, not the full T00 contract or a substitute for human review.
export type ReviseCommand = z.infer<typeof Revise>;
export const commandErrorCodes = ["VALIDATION_ERROR", "REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "ACTION_NOT_ALLOWED", "STORAGE_ERROR"] as const;
export const committedEvents = ["revision.created", "run.completed", "run.failed", "run.cancelled"] as const;
