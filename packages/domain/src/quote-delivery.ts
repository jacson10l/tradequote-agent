import {
  type DeliveryKind,
  type QuoteApproval,
  type QuoteDelivery,
  type QuoteSnapshot,
} from "@tradequote/contracts";

/**
 * 对外产出（RFQ 摘要 / 客户回复）的确定性渲染。
 *
 * 金额、条款、来源均直接取自冻结的 QuoteSnapshot，只做语言与格式映射，
 * 不新增任何业务语义、不调用模型。合成边界与「未核验」始终显式标注，
 * 与 M2 的「未知不等于零、金额是算出来的」原则一致。
 */
const COPY = {
  en: {
    subject: "Quotation summary",
    quote: "Quote",
    buyer: "Buyer",
    currency: "Currency",
    total: "Goods total",
    excludedTotal: "Goods total (excl. freight/tax)",
    payment: "Payment terms",
    delivery: "Delivery",
    pending: "to be confirmed",
    pendingDetails: "Some details still require confirmation.",
    prepared: "We have prepared the following quotation for",
    unit: "unit",
    line: "line",
    names: "Product names are retained in their original language.",
    draft:
      "This quotation is provided as a draft for your confirmation; the goods total excludes freight, tax and other charges, which remain to be verified.",
    intro: "Thank you for your inquiry. Below is our quotation for your review.",
    disclaimer:
      "This document is an engineering demonstration. Amounts are deterministically calculated; freight, tax and platform rules are not yet verified.",
  },
  de: {
    subject: "Angebotsübersicht",
    quote: "Angebot",
    buyer: "Käufer",
    currency: "Währung",
    total: "Warenzwischensumme",
    excludedTotal: "Warenzwischensumme (ohne Fracht/Steuern)",
    payment: "Zahlungsbedingungen",
    delivery: "Lieferung",
    pending: "noch zu bestätigen",
    pendingDetails: "Einige Angaben sind noch zu bestätigen.",
    prepared: "Wir haben das folgende Angebot erstellt für",
    unit: "Einzelpreis",
    line: "Position",
    names: "Produktnamen bleiben in der Originalsprache.",
    draft:
      "Dieses Angebot ist ein Entwurf zur Bestätigung; die Warenzwischensumme enthält keine Fracht, Steuern oder sonstigen Kosten. Diese sind noch zu prüfen.",
    intro: "Vielen Dank für Ihre Anfrage. Nachfolgend unser Angebot zur Prüfung.",
    disclaimer:
      "Dieses Dokument ist eine technische Demonstration. Beträge werden deterministisch berechnet; Fracht, Steuern und Plattformregeln sind noch nicht geprüft.",
  },
} as const;

const currencyLabel = (currency: string) => currency;

function copyFor(locale: string) {
  return locale in COPY ? COPY[locale as keyof typeof COPY] : COPY.en;
}

function renderSummary(quote: QuoteSnapshot, locale: string): { subject: string; body: string } {
  const copy = copyFor(locale);
  const lines = quote.lines
    .map((line) => {
      const amount = line.amount === null ? "—" : `${line.amount} ${currencyLabel(quote.currency)}`;
      return `- ${line.product.sku} · ${line.product.name}: ${line.quantity} ${line.product.unit} × ${line.unitPrice ?? "—"} = ${amount}`;
    })
    .join("\n");
  const total =
    quote.goodsTotal === null ? "—" : `${quote.goodsTotal} ${currencyLabel(quote.currency)}`;
  const body = [
    copy.intro,
    `${copy.quote} ${quote.number} · V${quote.version}`,
    `${copy.buyer}: ${quote.buyer}`,
    `${copy.currency}: ${currencyLabel(quote.currency)}`,
    ``,
    lines,
    ``,
    `${copy.excludedTotal}: ${total}`,
    `${copy.payment}: ${quote.pending.some((item) => item.startsWith("付款条款待确认")) ? copy.pending : quote.payment || copy.pending}`,
    `${copy.delivery}: ${quote.pending.some((item) => item.startsWith("交期与交货条件待确认")) ? copy.pending : quote.delivery || copy.pending}`,
    ...(quote.pending.length ? [``, copy.pendingDetails] : []),
    ``,
    copy.names,
    copy.disclaimer,
  ].join("\n");
  return { subject: `${copy.subject} — ${quote.number}`, body };
}

function renderReply(quote: QuoteSnapshot, locale: string): { subject: string; body: string } {
  const copy = copyFor(locale);
  const total =
    quote.goodsTotal === null ? "—" : `${quote.goodsTotal} ${currencyLabel(quote.currency)}`;
  const paymentPending = quote.pending.some((item) => item.startsWith("付款条款待确认"));
  const deliveryPending = quote.pending.some((item) => item.startsWith("交期与交货条件待确认"));
  const payment = paymentPending || !quote.payment ? copy.pending : quote.payment;
  const delivery = deliveryPending || !quote.delivery ? copy.pending : quote.delivery;
  const body = [
    copy.intro,
    ``,
    `${copy.prepared} ${quote.buyer}:`,
    quote.lines
      .map((line) => {
        const amount =
          line.amount === null ? "—" : `${line.amount} ${currencyLabel(quote.currency)}`;
        return `- ${line.product.name} (${line.product.sku}): ${line.quantity} ${line.product.unit}, ${copy.unit} ${line.unitPrice ?? "—"}, ${copy.line} ${amount}`;
      })
      .join("\n"),
    ``,
    `${copy.total}: ${total}.`,
    `${copy.payment}: ${payment}.`,
    `${copy.delivery}: ${delivery}.`,
    ...(quote.pending.length ? ["", copy.pendingDetails] : []),
    ``,
    copy.draft,
    copy.names,
    copy.disclaimer,
  ].join("\n");
  return { subject: `${copy.subject} — ${quote.number}`, body };
}

function renderOne(
  quote: QuoteSnapshot,
  locale: string,
  kind: DeliveryKind,
  metadata: { id: string; generatedAt: string },
): QuoteDelivery {
  const rendered = kind === "summary" ? renderSummary(quote, locale) : renderReply(quote, locale);
  return {
    id: metadata.id,
    quoteId: quote.id,
    revisionId: quote.id,
    locale,
    kind,
    subject: rendered.subject,
    body: rendered.body,
    generatedAt: metadata.generatedAt,
    syntheticBoundary: true,
  };
}

function deliveryId(approvalId: string, sequence: number): string {
  return `${approvalId.slice(0, -12)}${sequence.toString(16).padStart(12, "0")}`;
}

/**
 * 轻量审批：人工确认后生成审批事实与确定性对外产出。
 * 不依赖尚未接通的知识规则检查；合成/未核验边界显式标注在产出上。
 */
export function approveQuote(
  quote: QuoteSnapshot,
  input: { approvedBy: string; note: string },
  metadata: { id: string; approvedAt: string },
): QuoteApproval {
  const locales = quote.scenario.locales.length ? quote.scenario.locales : ["en"];
  const kinds: DeliveryKind[] = ["summary", "reply"];
  const deliveries: QuoteDelivery[] = [];
  let sequence = 1;
  for (const locale of locales) {
    for (const kind of kinds) {
      deliveries.push(
        renderOne(quote, locale, kind, {
          id: deliveryId(metadata.id, sequence),
          generatedAt: metadata.approvedAt,
        }),
      );
      sequence += 1;
    }
  }
  return {
    id: metadata.id,
    quoteId: quote.id,
    revisionId: quote.id,
    quoteVersion: quote.version,
    approvedBy: input.approvedBy,
    note: input.note,
    approvedAt: metadata.approvedAt,
    deliveries,
  };
}
