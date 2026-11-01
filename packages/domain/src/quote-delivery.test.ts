import { demoScenario, type Product, type Scenario } from "@tradequote/contracts";
import { describe, expect, it } from "vitest";
import { approveQuote } from "./quote-delivery";
import { calculateQuoteV1 } from "./trade";

const id = "00000000-0000-4000-8000-000000000001";
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
  tiers: [{ minQuantity: "1", unitPrice: "10", sourceRow: 2 }],
};

function reply(payment: string, delivery: string) {
  const quote = calculateQuoteV1(
    {
      scenarioId: id,
      buyer: "合成客户",
      inquiry: "询价",
      payment,
      delivery,
      lines: [{ productId: id, quantity: "5", unit: "piece" }],
    },
    scenario,
    [product],
    { id, workspaceId: id, createdAt: now },
  );
  return approveQuote(
    quote,
    { approvedBy: "人工审核", note: "演示" },
    { id, approvedAt: now },
  ).deliveries.find((delivery) => delivery.kind === "reply" && delivery.locale === "en")?.body;
}

describe("approved customer reply pending terms", () => {
  it("does not expose unconfirmed payment or delivery placeholders", () => {
    const body = reply("待客户确认", "来源缺失");
    expect(body).toContain("Payment terms: to be confirmed.");
    expect(body).toContain("Delivery: to be confirmed.");
    expect(body).toContain("Some details still require confirmation.");
    expect(body).not.toContain("待客户确认");
    expect(body).not.toContain("来源缺失");
  });

  it("does not treat free-text payment and delivery as confirmed", () => {
    const body = reply("30% prepayment, 70% before shipment", "FOB Shenzhen, 30 days");
    expect(body).toContain("Payment terms: to be confirmed.");
    expect(body).toContain("Delivery: to be confirmed.");
    expect(body).not.toContain("30% prepayment, 70% before shipment");
    expect(body).not.toContain("FOB Shenzhen, 30 days");
  });
});

it("localizes both German outputs and hides unconfirmed source terms without mutating quotes", () => {
  const quote = calculateQuoteV1(
    {
      scenarioId: id,
      buyer: "Testkunde",
      inquiry: "Inquiry",
      payment: "30%预付",
      delivery: "确认后30天交货",
      lines: [{ productId: id, quantity: "5", unit: "piece" }],
    },
    { ...scenario, locales: ["en", "de"] },
    [product],
    { id, workspaceId: id, createdAt: now },
  );
  const before = JSON.stringify(quote);
  const approval = approveQuote(
    quote,
    { approvedBy: "Reviewer", note: "" },
    { id, approvedAt: now },
  );
  for (const output of approval.deliveries) {
    expect(output.body).not.toContain(quote.payment);
    expect(output.body).not.toContain(quote.delivery);
    expect(output.body).not.toContain("付款条款待确认");
    expect(output.body).toContain(product.name);
    expect(output.body).toContain("50.00 USD");
    if (output.locale === "de") {
      expect(output.body).toContain("noch zu bestätigen");
      expect(output.body).not.toMatch(
        /Buyer:|Currency:|Goods total|Payment|Delivery:|Pending items|We have prepared|unit |line |Some details|This quotation/,
      );
    }
  }
  expect(JSON.stringify(quote)).toBe(before);
});
