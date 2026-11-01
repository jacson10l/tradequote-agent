import { TradeBoardSchema } from "@tradequote/contracts";
import { expect, it } from "vitest";
import { summarizeQuoteBoard } from "./pet-quote-context";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    batchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sourceHash: "a".repeat(64),
    sourceName: "catalog",
    sourceStatus: "synthetic",
    sku: "SKU-1",
    name: "合成上衣",
    category: "服装",
    unit: "piece",
    currency: "USD",
    validUntil: "2099-12-31",
    description: "",
    tiers: [{ minQuantity: "1", unitPrice: "10", sourceRow: 2 }],
    ...overrides,
  };
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    number: "Q-001",
    version: 1,
    status: "draft",
    createdAt: "2026-10-31T00:00:00.000Z",
    scenario: {
      id: "33333333-3333-4333-8333-333333333333",
      version: 1,
      createdAt: "2026-10-31T00:00:00.000Z",
      name: "演示",
      targetUser: "x",
      platform: "x",
      market: "x",
      category: "x",
      locales: ["en"],
      sourceStatus: "synthetic",
    },
    buyer: "客户A",
    inquiry: "询盘",
    payment: "",
    delivery: "",
    currency: "USD",
    lines: [
      {
        product: product(),
        quantity: "10",
        tierMin: null,
        unitPrice: "10",
        amount: "100",
        reason: null,
      },
    ],
    goodsTotal: "100",
    pending: [],
    calculationPolicy: "sales-tiers-v1/line-half-up/goods-only",
    ...overrides,
  };
}

function board(fields: Record<string, unknown> = {}) {
  return TradeBoardSchema.parse({
    scenario: null,
    batches: [],
    products: [],
    quotes: [],
    turns: [],
    approvals: [],
    ...fields,
  });
}

it("空工作区（无场景/商品/报价）返回 undefined", () => {
  expect(summarizeQuoteBoard(board())).toBeUndefined();
});

it("报价总额为 null 时标注'总价待定'，不把未知当零", () => {
  const b = board({ quotes: [quote({ number: "Q-001", buyer: "客户A", goodsTotal: null })] });
  const text = summarizeQuoteBoard(b)!;
  expect(text).toContain("总价待定");
  expect(text).toContain("客户A");
  expect(text).not.toContain("0 USD");
});

it("报价总额确定时展示金额与币种", () => {
  const b = board({ quotes: [quote({ number: "Q-002", buyer: "客户B", goodsTotal: "1234.50" })] });
  const text = summarizeQuoteBoard(b)!;
  expect(text).toContain("1234.50 USD");
  expect(text).toContain("报价 Q-002");
});

it("商品目录提炼商品名，报价提炼客户", () => {
  const b = board({
    products: [product()],
    quotes: [quote({ number: "Q-003", buyer: "客户C", goodsTotal: "500" })],
  });
  const text = summarizeQuoteBoard(b)!;
  expect(text).toContain("合成上衣");
  expect(text).toContain("客户C");
});
