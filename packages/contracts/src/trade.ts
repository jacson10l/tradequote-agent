import { z } from "zod";
import { ErrorCodeSchema } from "./errors";
import { DecimalSchema, LocaleSchema } from "./values";

const text = z.string().trim().min(1).max(200);
export const InputDecimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/);
export const PositiveInputSchema = InputDecimalSchema.refine(
  (value) => /[1-9]/.test(value),
  "数量必须大于 0",
);
export const CurrencySchema = z.enum(["USD", "EUR", "CNY", "GBP", "JPY"]);
export const ScenarioInputSchema = z.strictObject({
  name: text,
  targetUser: text,
  platform: text,
  market: text,
  category: text,
  locales: z
    .array(LocaleSchema)
    .min(1)
    .max(8)
    .refine((items) => new Set(items).size === items.length, "语言不能重复"),
  sourceStatus: z.enum(["synthetic", "user_provided"]),
});
export const ScenarioSchema = ScenarioInputSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export const demoScenario: z.infer<typeof ScenarioInputSchema> = {
  name: "RFQ 询报价演示",
  targetUser: "中小出口企业业务员；采购确认；主管审核",
  platform: "阿里国际站 RFQ → 正式邮件",
  market: "德国（演示市场）",
  category: "成人定制服装（可替换样本）",
  locales: ["en", "de"],
  sourceStatus: "synthetic",
};
export const demoCatalogCsv = `sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description
DEMO-TEE,合成棉质上衣,服装,piece,USD,1,10,2099-12-31,仅为工程演示不代表真实商品
DEMO-TEE,合成棉质上衣,服装,piece,USD,100,9,2099-12-31,仅为工程演示不代表真实商品
DEMO-PANEL,合成板材,板材,m2,USD,1,12.5,2099-12-31,按面积计价的扩展样本
DEMO-FASTENER,合成紧固件,紧固件,kg,USD,1,,2099-12-31,缺价格用于验证未知状态`;
export const CatalogRowSchema = z.strictObject({
  row: z.number().int().min(2),
  sku: text,
  name: text,
  category: text,
  unit: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/),
  currency: CurrencySchema,
  minQuantity: PositiveInputSchema,
  unitPrice: InputDecimalSchema.nullable(),
  validUntil: z.iso.date(),
  description: z.string().trim().max(1000),
});
export const ImportIssueSchema = z.strictObject({
  row: z.number().int().positive(),
  field: z.string(),
  message: z.string(),
});
export const ImportBatchSchema = z.strictObject({
  id: z.uuid(),
  sourceName: text,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceStatus: z.enum(["synthetic", "user_provided"]),
  status: z.enum(["staged", "published"]),
  createdAt: z.iso.datetime(),
  rows: z.array(CatalogRowSchema).max(500),
  issues: z.array(ImportIssueSchema).max(1000),
});
export const ProductSchema = z.strictObject({
  id: z.uuid(),
  batchId: z.uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceName: text,
  sourceStatus: z.enum(["synthetic", "user_provided"]),
  sku: text,
  name: text,
  category: text,
  unit: CatalogRowSchema.shape.unit,
  currency: CurrencySchema,
  validUntil: z.iso.date(),
  description: z.string().max(1000),
  tiers: z
    .array(
      z.strictObject({
        minQuantity: PositiveInputSchema,
        unitPrice: InputDecimalSchema.nullable(),
        sourceRow: z.number().int().min(2),
      }),
    )
    .min(1)
    .max(500),
});
export const QuoteInputSchema = z.strictObject({
  scenarioId: z.uuid(),
  buyer: text,
  inquiry: z.string().trim().min(1).max(8000),
  lines: z
    .array(
      z.strictObject({
        productId: z.uuid(),
        quantity: PositiveInputSchema,
        unit: CatalogRowSchema.shape.unit,
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
      "同一商品请合并数量",
    ),
  payment: z.string().trim().max(1000),
  delivery: z.string().trim().max(1000),
});
export const QuoteV1Schema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  number: text,
  version: z.literal(1),
  status: z.literal("draft"),
  createdAt: z.iso.datetime(),
  scenario: ScenarioSchema,
  buyer: text,
  inquiry: z.string(),
  payment: z.string(),
  delivery: z.string(),
  currency: CurrencySchema,
  lines: z
    .array(
      z.strictObject({
        product: ProductSchema,
        quantity: PositiveInputSchema,
        tierMin: PositiveInputSchema.nullable(),
        unitPrice: InputDecimalSchema.nullable(),
        amount: DecimalSchema.nullable(),
        reason: z.string().nullable(),
      }),
    )
    .min(1)
    .max(50),
  goodsTotal: DecimalSchema.nullable(),
  pending: z.array(z.string()),
  calculationPolicy: z.literal("sales-tiers-v1/line-half-up/goods-only"),
});
export const QuoteSnapshotSchema = QuoteV1Schema.extend({
  version: z.number().int().positive(),
  rootId: z.uuid().optional(),
  parentId: z.uuid().optional(),
});
export const AgentTurnSchema = z.strictObject({
  id: z.uuid(),
  quoteId: z.uuid(),
  rootId: z.uuid(),
  baseId: z.uuid().nullable(),
  instruction: z.string().max(8000),
  summary: z.string().max(2000),
  model: z.string().max(128),
  createdAt: z.iso.datetime(),
});
export type QuoteSnapshot = z.infer<typeof QuoteSnapshotSchema>;
export type AgentTurn = z.infer<typeof AgentTurnSchema>;
export const TradeBoardSchema = z.strictObject({
  scenario: ScenarioSchema.nullable(),
  batches: z.array(ImportBatchSchema),
  products: z.array(ProductSchema),
  quotes: z.array(QuoteSnapshotSchema),
  turns: z.array(AgentTurnSchema).default([]),
});
const envelope = { schemaVersion: z.literal(1), requestId: z.uuid() };
const write = { ...envelope, idempotencyKey: z.uuid() };
export const TradeCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({ ...envelope, method: z.literal("trade.get") }),
  z.strictObject({
    ...write,
    method: z.literal("scenario.save"),
    payload: z.strictObject({
      expectedVersion: z.number().int().nonnegative(),
      scenario: ScenarioInputSchema,
    }),
  }),
  z.strictObject({
    ...write,
    method: z.literal("catalog.stage"),
    payload: z.strictObject({
      sourceName: text,
      sourceStatus: z.enum(["synthetic", "user_provided"]),
      csv: z.string().min(1).max(262144),
    }),
  }),
  z.strictObject({
    ...write,
    method: z.literal("catalog.publish"),
    payload: z.strictObject({ batchId: z.uuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
  z.strictObject({ ...write, method: z.literal("quote.createV1"), payload: QuoteInputSchema }),
]);
// Same error envelope as the workspace boundary; no untyped transport payloads.
export const TradeResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    data: TradeBoardSchema,
    warnings: z.array(z.never()),
    evidenceIds: z.array(z.string()),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: ErrorCodeSchema,
      message: z.string(),
      retryable: z.boolean(),
      issues: z.array(
        z.strictObject({
          code: z.string(),
          fieldPath: z.string().optional(),
          severity: z.enum(["info", "warning", "block", "pending"]),
          message: z.string(),
          evidenceIds: z.array(z.string()),
          suggestedAction: z.string().optional(),
        }),
      ),
      currentAggregateVersion: z.number().int().positive().optional(),
    }),
  }),
]);
export const CsvSelectionSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("selected"), name: text, csv: z.string().max(262144) }),
  z.strictObject({ status: z.literal("cancelled") }),
  z.strictObject({ status: z.literal("error"), message: z.string() }),
]);
export type ScenarioInput = z.infer<typeof ScenarioInputSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type CatalogRow = z.infer<typeof CatalogRowSchema>;
export type ImportIssue = z.infer<typeof ImportIssueSchema>;
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type QuoteInput = z.infer<typeof QuoteInputSchema>;
export type QuoteV1 = z.infer<typeof QuoteV1Schema>;
export type TradeBoard = z.infer<typeof TradeBoardSchema>;
export type TradeCommand = z.infer<typeof TradeCommandSchema>;
export type TradeWrite = Exclude<TradeCommand, { method: "trade.get" }>;
export type TradeResult = z.infer<typeof TradeResultSchema>;
export type CsvSelection = z.infer<typeof CsvSelectionSchema>;
export interface TradeClient {
  getTrade(): Promise<TradeResult>;
  saveScenario(command: Extract<TradeCommand, { method: "scenario.save" }>): Promise<TradeResult>;
  stageCatalog(command: Extract<TradeCommand, { method: "catalog.stage" }>): Promise<TradeResult>;
  publishCatalog(
    command: Extract<TradeCommand, { method: "catalog.publish" }>,
  ): Promise<TradeResult>;
  createQuoteV1(command: Extract<TradeCommand, { method: "quote.createV1" }>): Promise<TradeResult>;
  pickCatalogCsv(): Promise<CsvSelection>;
}
