import {
  type CatalogRow,
  type ExecutionContext,
  failure,
  type ImportIssue,
  type Product,
  type QuoteInput,
  type QuoteV1,
  type Scenario,
  type TradeCommand,
  TradeCommandSchema,
  type TradeResult,
} from "@tradequote/contracts";
import Decimal from "decimal.js";

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const currencyScale = { USD: 2, EUR: 2, CNY: 2, GBP: 2, JPY: 0 } as const;
export class TradeFault extends Error {
  constructor(
    public readonly code: Parameters<typeof failure>[0],
    message: string,
  ) {
    super(message);
  }
}
export function validateCatalogRows(rows: CatalogRow[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const seen = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const previous = seen.get(row.sku) ?? [];
    const first = previous[0];
    if (
      first &&
      ["name", "category", "unit", "currency", "validUntil", "description"].some(
        (key) => Reflect.get(first, key) !== Reflect.get(row, key),
      )
    ) {
      issues.push({
        row: row.row,
        field: "sku",
        message: "同一 SKU 的名称、分类、单位、币种、有效期与描述必须一致",
      });
    }
    if (previous.some((prior) => new D(prior.minQuantity).eq(row.minQuantity)))
      issues.push({ row: row.row, field: "min_quantity", message: "同一 SKU 的数量档位重复" });
    previous.push(row);
    seen.set(row.sku, previous);
  }
  return issues;
}
export function sortedTiers(rows: CatalogRow[]): Product["tiers"] {
  return rows
    .map((row) => ({ minQuantity: row.minQuantity, unitPrice: row.unitPrice, sourceRow: row.row }))
    .sort((a, b) => new D(a.minQuantity).cmp(b.minQuantity));
}
export function calculateQuoteV1(
  input: QuoteInput,
  scenario: Scenario,
  products: Product[],
  metadata: { id: string; workspaceId: string; createdAt: string },
): QuoteV1 {
  if (input.scenarioId !== scenario.id)
    throw new TradeFault("REVISION_CONFLICT", "场景配置已变化，请重新加载后核对");
  const today = metadata.createdAt.slice(0, 10);
  const pending: string[] = [];
  const lines = input.lines.map((line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    if (!product) throw new TradeFault("NOT_FOUND", "商品未发布或已不存在，请重新加载");
    if (line.unit !== product.unit)
      throw new TradeFault("VALIDATION_ERROR", "数量单位与价目表不一致；本阶段不进行单位换算");
    const tier = [...product.tiers]
      .reverse()
      .find((candidate) => new D(line.quantity).gte(candidate.minQuantity));
    const reason =
      product.validUntil < today
        ? "价目表已过期，须重新确认资料"
        : !tier
          ? "数量未达到最小起订档位"
          : tier.unitPrice === null
            ? "该档位缺少价格"
            : null;
    if (reason) pending.push(`${product.sku}：${reason}`);
    const unitPrice = reason ? null : (tier?.unitPrice ?? null);
    return {
      product,
      quantity: line.quantity,
      tierMin: tier?.minQuantity ?? null,
      unitPrice,
      amount:
        unitPrice === null
          ? null
          : new D(line.quantity).mul(unitPrice).toFixed(currencyScale[product.currency]),
      reason,
    };
  });
  const currency = lines[0]?.product.currency;
  if (!currency) throw new TradeFault("VALIDATION_ERROR", "至少选择一行商品");
  if (lines.some((line) => line.product.currency !== currency))
    throw new TradeFault("VALIDATION_ERROR", "同一草稿只能包含同币种商品；本阶段未接入汇率换算");
  if (!input.payment) pending.push("付款条款待确认");
  if (!input.delivery) pending.push("交期与交货条件待确认");
  pending.push(
    "运费、税费及其他费用未核定；商品合计不是完整应付总额",
    "平台与目标市场规则尚未核验；仅可保存草稿",
  );
  if (
    scenario.sourceStatus === "synthetic" ||
    lines.some((line) => line.product.sourceStatus === "synthetic")
  )
    pending.push("来源未经业务确认，不可用于交易承诺");
  const goodsTotal = lines.some((line) => line.amount === null)
    ? null
    : lines
        .reduce((sum, line) => sum.plus(line.amount ?? "0"), new D(0))
        .toFixed(currencyScale[currency]);
  return {
    ...metadata,
    number: `Q-${metadata.id}`,
    version: 1,
    status: "draft",
    scenario,
    buyer: input.buyer,
    inquiry: input.inquiry,
    payment: input.payment,
    delivery: input.delivery,
    currency,
    lines,
    goodsTotal,
    pending,
    calculationPolicy: "sales-tiers-v1/line-half-up/goods-only",
  };
}
export interface TradeRepository {
  executeTrade(command: TradeCommand, context: ExecutionContext): TradeResult;
}
export function createTradeService(repository: TradeRepository) {
  return {
    execute(input: unknown, context: ExecutionContext): TradeResult {
      const parsed = TradeCommandSchema.safeParse(input);
      if (!parsed.success)
        return failure("VALIDATION_ERROR", "输入格式无效，请核对必填项、数量精度与字段");
      if (context.origin !== "human_ui")
        return failure("ACTION_NOT_ALLOWED", "本阶段场景、资料发布与报价创建仅允许人工操作");
      try {
        return repository.executeTrade(parsed.data, context);
      } catch (error) {
        return error instanceof TradeFault
          ? failure(error.code, error.message)
          : failure("STORAGE_ERROR", "本地保存失败，请保留输入并重试同一操作");
      }
    },
  };
}
