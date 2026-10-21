import { randomUUID } from "node:crypto";
import {
  FailureSchema,
  failure,
  ProductSchema,
  QuoteInputSchema,
  QuoteSnapshotSchema,
  QuoteV1Schema,
  type TradeBoard,
  TradeResultSchema,
} from "@tradequote/contracts";
import {
  calculateQuoteV1,
  TradeFault,
  type TradeRepository,
  type WorkspaceRepository,
} from "@tradequote/domain";
import { z } from "zod";
import type { DeepSeekProvider } from "./deepseek";
import { defineReadTool, ReadToolRuntime } from "./read-tool-runtime";

// Internal adapter scope supplied by the host, never part of a model tool input.
const scopeSchema = z.strictObject({
  workspaceId: z.uuid(),
  asOf: z.iso.datetime(),
  quoteRevisionIds: z.array(z.uuid()).max(50),
  productIds: z.array(z.uuid()).max(500).optional(),
});
const productIdsSchema = z
  .array(ProductSchema.shape.id)
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "商品标识不能重复");
const previewSchema = QuoteV1Schema.pick({
  createdAt: true,
  scenario: true,
  currency: true,
  lines: true,
  goodsTotal: true,
  pending: true,
  calculationPolicy: true,
});
function resultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), data, evidenceIds: z.array(z.string()) }),
    FailureSchema,
  ]);
}
const success = <T>(data: T, evidenceIds: string[]) => ({
  ok: true as const,
  data,
  evidenceIds: [...new Set(evidenceIds)],
});
const productEvidence = (products: TradeBoard["products"]) =>
  products.flatMap((product) => [product.id, product.batchId]);

/** Real read adapters over the existing public repository and pricing module. No IPC or writes. */
export class CatalogQuoteReadAgent {
  private readonly scope: z.output<typeof scopeSchema>;

  constructor(
    private readonly repository: TradeRepository & Pick<WorkspaceRepository, "read">,
    private readonly provider: Pick<DeepSeekProvider, "json">,
    scope: z.input<typeof scopeSchema>,
    private readonly limits: ConstructorParameters<typeof ReadToolRuntime>[2] = {},
  ) {
    this.scope = scopeSchema.parse(scope);
  }

  async run(instruction: string, cancellation?: AbortSignal) {
    if (cancellation?.aborted) throw new TradeFault("CANCELLED", "只读任务已取消，未读取业务资料");
    const checkWorkspace = () => {
      const workspace = this.repository.read();
      if (!workspace) throw new TradeFault("NOT_FOUND", "请先创建工作区");
      if (workspace.id !== this.scope.workspaceId)
        throw new TradeFault("REVISION_CONFLICT", "工作区已变化，请重新创建只读任务");
    };
    // Read one consistent published board before the first model call. Never forward batches/CSV/turns.
    let board: TradeBoard;
    try {
      checkWorkspace();
      const result = TradeResultSchema.parse(
        this.repository.executeTrade(
          { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
          { actorId: "local-user", origin: "agent_tool" },
        ),
      );
      if (!result.ok) throw new TradeFault(result.error.code, "无法读取工作区业务资料");
      board = result.data;
      checkWorkspace();
    } catch (error) {
      if (error instanceof TradeFault) throw error;
      throw new TradeFault("STORAGE_ERROR", "业务资料读取失败，请重开工作区后重试");
    }
    const products = board.products
      .filter((p) => this.scope.productIds === undefined || this.scope.productIds.includes(p.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const quotes = board.quotes.filter(
      (q) => q.workspaceId === this.scope.workspaceId && this.scope.quoteRevisionIds.includes(q.id),
    );
    const asOf = this.scope.asOf;
    const observations: { tool: string; result: unknown }[] = [];
    // A business failure is an explicit validated tool result, distinct from an empty successful page.
    const read = <T>(tool: string, operation: () => T) => {
      let result;
      try {
        checkWorkspace();
        result = operation();
      } catch (error) {
        result =
          error instanceof TradeFault
            ? failure(error.code, error.message)
            : failure("STORAGE_ERROR", "业务只读操作失败，请重开工作区后重试");
      }
      observations.push({ tool, result: structuredClone(result) });
      return result;
    };
    const tools = [
      defineReadTool({
        name: "search_catalog",
        description:
          "检索当前已发布商品快照（不含暂存资料）。按ID稳定分页；返回来源hash、批次和价格行。过期资料可读，有效性由核价重新检查。",
        inputSchema: z.strictObject({
          query: z.string().trim().max(200).default(""),
          category: ProductSchema.shape.category.optional(),
          limit: z.number().int().min(1).max(50).default(20),
          afterId: ProductSchema.shape.id.nullable().default(null),
        }),
        outputSchema: resultSchema(
          z.strictObject({
            items: z.array(ProductSchema).max(50),
            nextAfterId: z.uuid().nullable(),
            asOf: z.iso.datetime(),
          }),
        ),
        execute: async ({ query, category, limit, afterId }) =>
          read("search_catalog", () => {
            const term = query.toLocaleLowerCase("en-US");
            const matched = products.filter(
              (p) =>
                (category === undefined || p.category === category) &&
                [p.sku, p.name, p.category, p.description].some((text) =>
                  text.toLocaleLowerCase("en-US").includes(term),
                ),
            );
            const position = afterId === null ? -1 : matched.findIndex((p) => p.id === afterId);
            if (afterId !== null && position < 0)
              throw new TradeFault(
                "VALIDATION_ERROR",
                "分页标识不属于当前查询，请从第一页重新读取",
              );
            const items = matched.slice(position + 1, position + 1 + limit);
            const nextAfterId =
              position + 1 + items.length < matched.length ? (items.at(-1)?.id ?? null) : null;
            return success({ items, nextAfterId, asOf }, productEvidence(items));
          }),
      }),
      defineReadTool({
        name: "get_product_revisions",
        description:
          "按已发布商品快照ID精确读取，保留sourceHash与价格来源行；全部ID须在宿主授权范围。当前没有独立商品历史版本服务。",
        inputSchema: z.strictObject({ productIds: productIdsSchema }),
        outputSchema: resultSchema(
          z.strictObject({ products: z.array(ProductSchema).max(50), asOf: z.iso.datetime() }),
        ),
        execute: async ({ productIds }) =>
          read("get_product_revisions", () => {
            const selected = productIds.map((id) => products.find((p) => p.id === id));
            if (selected.some((p) => p === undefined))
              throw new TradeFault("NOT_FOUND", "商品不存在或不在当前只读范围");
            const found = selected.filter((p) => p !== undefined);
            return success({ products: found, asOf }, productEvidence(found));
          }),
      }),
      defineReadTool({
        name: "get_quote",
        description:
          "按宿主授权的报价修订ID读取精确历史快照，返回是否当前最新；不改写、重算或批准旧报价。",
        inputSchema: z.strictObject({ revisionId: QuoteSnapshotSchema.shape.id }),
        outputSchema: resultSchema(
          z.strictObject({
            quote: QuoteSnapshotSchema,
            isLatest: z.boolean(),
            asOf: z.iso.datetime(),
          }),
        ),
        execute: async ({ revisionId }) =>
          read("get_quote", () => {
            const quote = quotes.find((q) => q.id === revisionId);
            if (!quote || quote.workspaceId !== this.scope.workspaceId)
              throw new TradeFault("NOT_FOUND", "报价修订不存在或不在当前只读范围");
            const root = quote.rootId ?? quote.id;
            const isLatest = !board.quotes.some(
              (q) => (q.rootId ?? q.id) === root && q.version > quote.version,
            );
            return success({ quote, isLatest, asOf }, [
              quote.id,
              ...productEvidence(quote.lines.map((line) => line.product)),
            ]);
          }),
      }),
    ];
    const scenario = board.scenario;
    if (scenario)
      tools.push(
        defineReadTool({
          name: "calculate_quote",
          description:
            "调用既有价目表确定性核价，仅返回未保存计算预览。核价日期由宿主固定；未知/过期/MOQ不填零；不创建报价ID或修订。",
          inputSchema: QuoteInputSchema,
          outputSchema: resultSchema(
            z.strictObject({
              kind: z.literal("calculation_preview"),
              calculation: previewSchema,
              asOf: z.iso.datetime(),
            }),
          ),
          execute: async (input) =>
            read("calculate_quote", () => {
              const quote = calculateQuoteV1(input, scenario, products, {
                id: randomUUID(),
                workspaceId: this.scope.workspaceId,
                createdAt: asOf,
              });
              // Strip temporary QuoteV1 identity so the model cannot mistake a calculation for a saved revision.
              const calculation = previewSchema.parse({
                createdAt: quote.createdAt,
                scenario: quote.scenario,
                currency: quote.currency,
                lines: quote.lines,
                goodsTotal: quote.goodsTotal,
                pending: quote.pending,
                calculationPolicy: quote.calculationPolicy,
              });
              return success(
                { kind: "calculation_preview" as const, calculation, asOf },
                productEvidence(quote.lines.map((line) => line.product)),
              );
            }),
        }),
      );
    const outcome = await new ReadToolRuntime(this.provider, tools, this.limits, {
      workspaceId: this.scope.workspaceId,
      asOf,
      snapshot: "当前已发布业务快照；asOf为核价日期，不提供历史时点检索",
      scenario: scenario
        ? {
            id: scenario.id,
            version: scenario.version,
            platform: scenario.platform,
            market: scenario.market,
            category: scenario.category,
            locales: scenario.locales,
          }
        : null,
      readableQuotes: quotes.map((q) => ({
        revisionId: q.id,
        number: q.number,
        version: q.version,
      })),
      unavailableTools: ["search_knowledge", "validate_quote"],
    }).run(instruction, cancellation);
    return { ...outcome, workspaceId: this.scope.workspaceId, asOf, observations };
  }
}
