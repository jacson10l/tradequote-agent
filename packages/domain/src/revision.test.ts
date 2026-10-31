import { demoScenario, type Product, type Scenario } from "@tradequote/contracts";
import { describe, expect, it } from "vitest";
import { reviseQuote } from "./revision";
import { calculateQuoteV1, TradeFault } from "./trade";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const third = "00000000-0000-4000-8000-000000000003";
const fourth = "00000000-0000-4000-8000-000000000004";
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

describe("reviseQuote 未确认条款 pending 继承（B07 非作者集成复核）", () => {
  it("V1→V2→V3→重开后，付款/交期的未确认文字始终进入 pending", () => {
    // V1：付款填"待客户确认"，交期留空
    const v1 = calculateQuoteV1(
      {
        scenarioId: id,
        buyer: "客户A",
        inquiry: "询价",
        payment: "待客户确认",
        delivery: "",
        lines: [{ productId: id, quantity: "5", unit: "piece" }],
      },
      scenario,
      [product],
      { id, workspaceId: id, createdAt: now },
    );
    expect(v1.version).toBe(1);
    expect(v1.pending.join(" ")).toContain("付款条款待确认");
    expect(v1.pending.join(" ")).toContain("交期与交货条件待确认");

    // V2：修订交期为未确认措辞"来源缺失"
    const v2 = reviseQuote(
      v1,
      { patches: [{ op: "setDelivery", value: "来源缺失" }], summary: "复核交期" },
      { id: other, createdAt: now },
    );
    expect(v2.version).toBe(2);
    expect(v2.pending.join(" ")).toContain("付款条款待确认");
    expect(v2.pending.join(" ")).toContain("交期与交货条件待确认");

    // V3：修订付款为未确认措辞"模型建议30%预付"
    const v3 = reviseQuote(
      v2,
      { patches: [{ op: "setPayment", value: "模型建议30%预付" }], summary: "复核付款" },
      { id: third, createdAt: now },
    );
    expect(v3.version).toBe(3);
    expect(v3.pending.join(" ")).toContain("付款条款待确认");
    expect(v3.pending.join(" ")).toContain("交期与交货条件待确认");

    // 重开：再次修订（改数量），未确认条款不得因修订而消失
    const reopened = reviseQuote(
      v3,
      { patches: [{ op: "setQuantity", productId: id, quantity: "10" }], summary: "重开调整数量" },
      { id: fourth, createdAt: now },
    );
    expect(reopened.version).toBe(4);
    expect(reopened.pending.join(" ")).toContain("付款条款待确认");
    expect(reopened.pending.join(" ")).toContain("交期与交货条件待确认");
  });

  it("已确认的真实条款在修订后不进入 pending", () => {
    const v1 = calculateQuoteV1(
      {
        scenarioId: id,
        buyer: "客户A",
        inquiry: "询价",
        payment: "30% 预付，70% 尾款",
        delivery: "FOB 深圳，30 天内",
        lines: [{ productId: id, quantity: "5", unit: "piece" }],
      },
      scenario,
      [product],
      { id, workspaceId: id, createdAt: now },
    );
    expect(v1.pending.join(" ")).not.toContain("付款条款待确认");
    expect(v1.pending.join(" ")).not.toContain("交期与交货条件待确认");

    const v2 = reviseQuote(
      v1,
      { patches: [{ op: "setQuantity", productId: id, quantity: "10" }], summary: "调整数量" },
      { id: other, createdAt: now },
    );
    expect(v2.pending.join(" ")).not.toContain("付款条款待确认");
    expect(v2.pending.join(" ")).not.toContain("交期与交货条件待确认");
  });

  it("无字段变化的修订被拒绝，不产生新版本", () => {
    const v1 = calculateQuoteV1(
      {
        scenarioId: id,
        buyer: "客户A",
        inquiry: "询价",
        payment: "",
        delivery: "",
        lines: [{ productId: id, quantity: "5", unit: "piece" }],
      },
      scenario,
      [product],
      { id, workspaceId: id, createdAt: now },
    );
    expect(() =>
      reviseQuote(
        v1,
        { patches: [{ op: "setPayment", value: "" }], summary: "无变化" },
        { id: other, createdAt: now },
      ),
    ).toThrow(TradeFault);
  });
});
