import { z } from "zod";
import { FailureSchema, readEnvelope, resultSchema } from "./protocol";
import { ProductSchema, QuoteSnapshotSchema, QuoteV1Schema } from "./trade";

const ids = (maximum: number) =>
  z
    .array(z.uuid())
    .max(maximum)
    .refine((items) => new Set(items).size === items.length, "标识不能重复");
const toolResult = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), data, evidenceIds: z.array(z.string()) }),
    FailureSchema,
  ]);
export const CatalogSearchInputSchema = z.strictObject({
  query: z.string().trim().max(200).default(""),
  category: ProductSchema.shape.category.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  afterId: ProductSchema.shape.id.nullable().default(null),
});
export const ProductReadInputSchema = z.strictObject({
  productIds: ids(50).min(1),
});
export const QuoteReadInputSchema = z.strictObject({ revisionId: QuoteSnapshotSchema.shape.id });
export const CalculationPreviewSchema = QuoteV1Schema.pick({
  createdAt: true,
  scenario: true,
  currency: true,
  lines: true,
  goodsTotal: true,
  pending: true,
  calculationPolicy: true,
});
export const CatalogSearchResultSchema = toolResult(
  z.strictObject({
    items: z.array(ProductSchema).max(50),
    nextAfterId: z.uuid().nullable(),
    asOf: z.iso.datetime(),
  }),
);
export const ProductReadResultSchema = toolResult(
  z.strictObject({ products: z.array(ProductSchema).max(50), asOf: z.iso.datetime() }),
);
export const QuoteReadResultSchema = toolResult(
  z.strictObject({ quote: QuoteSnapshotSchema, isLatest: z.boolean(), asOf: z.iso.datetime() }),
);
export const CalculationPreviewResultSchema = toolResult(
  z.strictObject({
    kind: z.literal("calculation_preview"),
    calculation: CalculationPreviewSchema,
    asOf: z.iso.datetime(),
  }),
);
export const ReadToolObservationSchema = z.discriminatedUnion("tool", [
  z.strictObject({ tool: z.literal("search_catalog"), result: CatalogSearchResultSchema }),
  z.strictObject({ tool: z.literal("get_product_revisions"), result: ProductReadResultSchema }),
  z.strictObject({ tool: z.literal("get_quote"), result: QuoteReadResultSchema }),
  z.strictObject({ tool: z.literal("calculate_quote"), result: CalculationPreviewResultSchema }),
]);
const data = {
  workspaceId: z.uuid(),
  asOf: z.iso.datetime(),
  toolCalls: z.number().int().min(0).max(12),
  observations: z.array(ReadToolObservationSchema).max(12),
};
export const AgentReadDataSchema = z
  .discriminatedUnion("outcome", [
    z.strictObject({
      ...data,
      outcome: z.literal("completed"),
      summary: z.string().trim().min(1).max(2000),
    }),
    z.strictObject({
      ...data,
      outcome: z.literal("waiting_input"),
      clarification: z.string().trim().min(1).max(2000),
    }),
  ])
  .superRefine((value, context) => {
    if (value.toolCalls !== value.observations.length)
      context.addIssue({ code: "custom", message: "工具计数须与实际结果一致" });
    for (const observation of value.observations) {
      if (observation.result.ok && observation.result.data.asOf !== value.asOf)
        context.addIssue({ code: "custom", message: "工具结果须属于同一次读取日期" });
      if (
        observation.tool === "get_quote" &&
        observation.result.ok &&
        observation.result.data.quote.workspaceId !== value.workspaceId
      )
        context.addIssue({ code: "custom", message: "报价须属于当前工作区" });
    }
  });
export const AgentReadCommandSchema = z.strictObject({
  ...readEnvelope,
  method: z.literal("agent.read"),
  payload: z.strictObject({
    instruction: z.string().trim().min(1).max(8000),
    quoteRevisionIds: ids(50).default([]),
    productIds: ids(500).optional(),
  }),
});
export const AgentReadResultSchema = resultSchema(AgentReadDataSchema);
export type AgentReadCommand = z.infer<typeof AgentReadCommandSchema>;
export type AgentReadData = z.infer<typeof AgentReadDataSchema>;
export type AgentReadResult = z.infer<typeof AgentReadResultSchema>;
export type ReadToolObservation = z.infer<typeof ReadToolObservationSchema>;
export interface ReadAgentClient {
  readAgent(command: AgentReadCommand): Promise<AgentReadResult>;
}
