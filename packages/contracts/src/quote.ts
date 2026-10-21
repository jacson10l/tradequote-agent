import { z } from "zod";
import { QuantitySchema } from "./values";

const text = z.string().trim().min(1).max(2000);
export const TypedPatchSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("setQuantity"), lineId: z.uuid(), quantity: QuantitySchema }),
  z.strictObject({ op: z.literal("selectProduct"), lineId: z.uuid(), productRevisionId: z.uuid() }),
  z.strictObject({ op: z.literal("selectPrice"), lineId: z.uuid(), priceRevisionId: z.uuid() }),
  z.strictObject({
    op: z.literal("setPackaging"),
    lineId: z.uuid(),
    description: text,
    quantityPerPack: QuantitySchema.optional(),
  }),
  z.strictObject({ op: z.literal("setDeliveryTerm"), term: text, place: text.optional() }),
  z.strictObject({
    op: z.literal("setCommercialTerm"),
    key: z.string().trim().min(1).max(64),
    value: text,
  }),
  z.strictObject({
    op: z.literal("addLine"),
    lineId: z.uuid(),
    productRevisionId: z.uuid().optional(),
    quantity: QuantitySchema,
  }),
  z.strictObject({ op: z.literal("removeLine"), lineId: z.uuid() }),
  z.strictObject({ op: z.literal("setPricingPolicy"), pricingPolicyRevisionId: z.uuid() }),
]);
export const PatchBatchSchema = z.strictObject({
  patches: z.array(TypedPatchSchema).min(1).max(50),
});
export const QuoteRevisionInputSchema = z.strictObject({
  quoteId: z.uuid(),
  baseRevisionId: z.uuid(),
  expectedAggregateVersion: z.number().int().positive(),
  typedPatch: z.array(TypedPatchSchema).min(1).max(50),
  reason: text,
});
export const ApprovalBindingSchema = z.strictObject({
  quoteId: z.uuid(),
  revisionId: z.uuid(),
  expectedAggregateVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  bundleId: z.uuid(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewNote: text,
});
export const patchToolJsonSchema = () => z.toJSONSchema(PatchBatchSchema, { target: "draft-7" });
export type TypedPatch = z.infer<typeof TypedPatchSchema>;
export type QuoteRevisionInput = z.infer<typeof QuoteRevisionInputSchema>;
