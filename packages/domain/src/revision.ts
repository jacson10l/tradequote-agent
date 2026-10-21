import {
  QuoteInputSchema,
  type QuoteSnapshot,
  QuoteSnapshotSchema,
  type RevisionProposal,
  RevisionProposalSchema,
} from "@tradequote/contracts";
import { calculateQuoteV1, TradeFault } from "./trade";
export function reviseQuote(
  base: QuoteSnapshot,
  proposal: RevisionProposal,
  metadata: { id: string; createdAt: string },
): QuoteSnapshot {
  const parsed = RevisionProposalSchema.parse(proposal);
  const input = QuoteInputSchema.parse({
    scenarioId: base.scenario.id,
    buyer: base.buyer,
    inquiry: base.inquiry,
    payment: base.payment,
    delivery: base.delivery,
    lines: base.lines.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
      unit: l.product.unit,
    })),
  });
  for (const patch of parsed.patches) {
    if (patch.op === "setPayment") input.payment = patch.value;
    else if (patch.op === "setDelivery") input.delivery = patch.value;
    else {
      const line = input.lines.find((l) => l.productId === patch.productId);
      if (!line) throw new TradeFault("NOT_FOUND", "修改包含不属于此报价的商品");
      line.quantity = patch.quantity;
    }
  }
  const next = calculateQuoteV1(
    input,
    base.scenario,
    base.lines.map((l) => l.product),
    { ...metadata, workspaceId: base.workspaceId },
  );
  if (
    JSON.stringify({ lines: next.lines, payment: next.payment, delivery: next.delivery }) ===
    JSON.stringify({ lines: base.lines, payment: base.payment, delivery: base.delivery })
  )
    throw new TradeFault("VALIDATION_ERROR", "没有产生字段变化，请补充修改要求");
  return QuoteSnapshotSchema.parse({
    ...next,
    number: base.number,
    rootId: base.rootId ?? base.id,
    parentId: base.id,
    version: base.version + 1,
  });
}
