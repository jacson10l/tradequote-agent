import {
  demoScenario,
  type Product,
  type QuoteInput,
  QuoteInputSchema,
  type Scenario,
  TradeCommandSchema,
} from "@tradequote/contracts";
import { expect, it, vi } from "vitest";
import { calculateQuoteV1, createTradeService, validateCatalogRows } from "./trade";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const now = "2026-10-21T00:00:00.000Z";
const scenario: Scenario = { ...demoScenario, id, version: 1, createdAt: now };
const product: Product = {
  id,
  batchId: id,
  sourceHash: "a".repeat(64),
  sourceName: "synthetic.csv",
  sourceStatus: "synthetic",
  sku: "A",
  name: "合成商品",
  category: "任意分类",
  unit: "piece",
  currency: "USD",
  validUntil: "2026-10-21",
  description: "合成",
  tiers: [
    { minQuantity: "1", unitPrice: "10", sourceRow: 2 },
    { minQuantity: "100", unitPrice: "9", sourceRow: 3 },
  ],
};
const input: QuoteInput = {
  scenarioId: id,
  buyer: "合成客户",
  inquiry: "询问商品",
  lines: [{ productId: id, quantity: "99", unit: "piece" }],
  payment: "",
  delivery: "",
};
const metadata = { id, workspaceId: id, createdAt: now };
it("selects tier at the exact boundary and freezes inputs without turning unknown charges into a final total", () => {
  expect(calculateQuoteV1(input, scenario, [product], metadata).goodsTotal).toBe("990.00");
  const quote = calculateQuoteV1(
    { ...input, lines: [{ productId: id, quantity: "100", unit: "piece" }] },
    scenario,
    [product],
    metadata,
  );
  expect(quote.goodsTotal).toBe("900.00");
  expect(quote.lines[0]).toMatchObject({
    tierMin: "100",
    unitPrice: "9",
    product: { sourceHash: "a".repeat(64) },
  });
  expect(quote.pending).toContain("付款条款待确认");
  expect(quote.pending.join(" ")).toContain("不是完整应付总额");
  expect(product.tiers[0]?.unitPrice).toBe("10");
});
it("rounds each line HALF_UP and distinguishes zero, absent, expired and below-MOQ prices", () => {
  const fractional = {
    ...product,
    tiers: [{ minQuantity: "1", unitPrice: "0.335", sourceRow: 2 }],
  };
  const three = { ...input, lines: [{ productId: id, quantity: "3", unit: "piece" }] };
  expect(calculateQuoteV1(three, scenario, [fractional], metadata).goodsTotal).toBe("1.01");
  expect(
    calculateQuoteV1(
      input,
      scenario,
      [{ ...product, tiers: [{ minQuantity: "1", unitPrice: "0", sourceRow: 2 }] }],
      metadata,
    ).goodsTotal,
  ).toBe("0.00");
  for (const invalid of [
    { ...product, tiers: [{ minQuantity: "1", unitPrice: null, sourceRow: 2 }] },
    { ...product, validUntil: "2026-10-20" },
    { ...product, tiers: [{ minQuantity: "100", unitPrice: "9", sourceRow: 2 }] },
  ]) {
    const quote = calculateQuoteV1(input, scenario, [invalid], metadata);
    expect(quote.goodsTotal).toBeNull();
    expect(quote.lines[0]?.reason).toBeTruthy();
  }
});
it("adds independently rounded lines, respects JPY scale and keeps large decimal values exact", () => {
  const p = { ...product, tiers: [{ minQuantity: "1", unitPrice: "0.335", sourceRow: 2 }] };
  const two = {
    ...input,
    lines: [
      { productId: id, quantity: "3", unit: "piece" },
      { productId: other, quantity: "3", unit: "piece" },
    ],
  };
  expect(
    calculateQuoteV1(two, scenario, [p, { ...p, id: other, sku: "B" }], metadata).goodsTotal,
  ).toBe("2.02");
  expect(
    calculateQuoteV1(
      { ...input, lines: [{ productId: id, quantity: "3", unit: "piece" }] },
      scenario,
      [{ ...p, currency: "JPY" }],
      metadata,
    ).goodsTotal,
  ).toBe("1");
  expect(
    calculateQuoteV1(
      { ...input, lines: [{ productId: id, quantity: "999999999.9999", unit: "piece" }] },
      scenario,
      [{ ...p, tiers: [{ minQuantity: "1", unitPrice: "999999999.9999", sourceRow: 2 }] }],
      metadata,
    ).goodsTotal,
  ).toBe("999999999999800000.00");
});
it("rejects unreviewed scenario versions, unavailable products, unit mismatch and mixed currency", () => {
  expect(() =>
    calculateQuoteV1({ ...input, scenarioId: other }, scenario, [product], metadata),
  ).toThrow("场景配置已变化");
  expect(() => calculateQuoteV1(input, scenario, [], metadata)).toThrow("商品未发布");
  expect(() =>
    calculateQuoteV1(
      { ...input, lines: [{ productId: id, quantity: "1", unit: "kg" }] },
      scenario,
      [product],
      metadata,
    ),
  ).toThrow("数量单位");
  expect(() =>
    calculateQuoteV1(
      { ...input, lines: [...input.lines, { productId: other, quantity: "1", unit: "piece" }] },
      scenario,
      [product, { ...product, id: other, currency: "EUR" }],
      metadata,
    ),
  ).toThrow("同币种");
});
it("rejects decimal/identity/total injections and agent publication before storage", () => {
  for (const quantity of [0, "0", "-1", "1e2", "1,000", "01", "NaN", "1.00001", "1000000000"])
    expect(
      QuoteInputSchema.safeParse({ ...input, lines: [{ productId: id, quantity, unit: "piece" }] })
        .success,
    ).toBe(false);
  const command = {
    schemaVersion: 1,
    requestId: id,
    idempotencyKey: id,
    method: "quote.createV1",
    payload: input,
  };
  for (const bad of [
    { ...command, actorId: "admin" },
    { ...command, payload: { ...input, goodsTotal: "0" } },
    { ...command, payload: { ...input, approval: true } },
  ])
    expect(TradeCommandSchema.safeParse(bad).success).toBe(false);
  const executeTrade = vi.fn();
  const service = createTradeService({ executeTrade });
  expect(service.execute(command, { actorId: "agent", origin: "agent_tool" })).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  expect(executeTrade).not.toHaveBeenCalled();
});
it("reports inconsistent SKU attributes and numerically duplicate tiers with source rows", () => {
  const row = {
    row: 2,
    sku: "A",
    name: "商品",
    category: "品类",
    unit: "kg",
    currency: "USD" as const,
    minQuantity: "1",
    unitPrice: "2",
    validUntil: "2099-01-01",
    description: "",
  };
  expect(validateCatalogRows([row, { ...row, row: 3, unit: "piece", minQuantity: "1.0" }])).toEqual(
    [
      expect.objectContaining({ row: 3, field: "sku" }),
      expect.objectContaining({ row: 3, field: "min_quantity" }),
    ],
  );
});
it("keeps non-empty unconfirmed terms in pending instead of treating them as confirmed", () => {
  for (const payment of ["待客户确认", "未确认", "未知", "来源缺失", "模型建议", "TBC"]) {
    const quote = calculateQuoteV1(
      { ...input, payment, delivery: "" },
      scenario,
      [product],
      metadata,
    );
    expect(quote.pending.join(" ")).toContain("付款条款待确认");
  }
  for (const delivery of ["待客户确认", "未确认", "未知", "模型建议"]) {
    const quote = calculateQuoteV1(
      { ...input, payment: "", delivery },
      scenario,
      [product],
      metadata,
    );
    expect(quote.pending.join(" ")).toContain("交期与交货条件待确认");
  }
  // 具体条款（无论中文还是 C07 实际英文拟议文本）在未经人工受控确认入口之前，
  // 同样必须保持待确认，绝不从 pending 消失——这是 B08 修复的核心语义。
  for (const payment of [
    "30%预付，70%发货前付清",
    "30% deposit; 70% before dispatch",
    "30% deposit; 70% before dispatch (proposed)",
    "30% deposit; 70% before dispatch — subject to supplier confirmation",
  ]) {
    const quote = calculateQuoteV1(
      { ...input, payment, delivery: "确认后30天" },
      scenario,
      [product],
      metadata,
    );
    expect(quote.pending.join(" ")).toContain("付款条款待确认");
  }
  for (const delivery of [
    "确认后30天",
    "EXW Guangzhou, China; 21 days after deposit and specification confirmation",
    "EXW Guangzhou, China; 21 days after deposit (subject to supplier confirmation)",
  ]) {
    const quote = calculateQuoteV1(
      { ...input, payment: "", delivery },
      scenario,
      [product],
      metadata,
    );
    expect(quote.pending.join(" ")).toContain("交期与交货条件待确认");
  }
  const concrete = calculateQuoteV1(
    { ...input, payment: "30%预付，70%发货前付清", delivery: "确认后30天" },
    scenario,
    [product],
    metadata,
  );
  expect(concrete.pending.join(" ")).toContain("付款条款待确认");
  expect(concrete.pending.join(" ")).toContain("交期与交货条件待确认");
  expect(concrete.pending.join(" ")).toContain("运费、税费及其他费用未核定");
});
