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
    intro: "Thank you for your inquiry. Below is our quotation for your review.",
    disclaimer:
      "This document is an engineering demonstration. Amounts are deterministically calculated; freight, tax and platform rules are not yet verified.",
  },
  de: {
    subject: "Angebotsübersicht",
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
    `Quote ${quote.number} · V${quote.version}`,
    `Buyer: ${quote.buyer}`,
    `Currency: ${currencyLabel(quote.currency)}`,
    ``,
    lines,
    ``,
    `Goods total (excl. freight/tax): ${total}`,
    `Payment: ${quote.payment || "to be confirmed"}`,
    `Delivery: ${quote.delivery || "to be confirmed"}`,
    ...(quote.pending.length ? [``, `Pending items:`, ...quote.pending.map((p) => `- ${p}`)] : []),
    ``,
    copy.disclaimer,
  ].join("\n");
  return { subject: `${copy.subject} — ${quote.number}`, body };
}

function renderReply(quote: QuoteSnapshot, locale: string): { subject: string; body: string } {
  const copy = copyFor(locale);
  const total =
    quote.goodsTotal === null ? "—" : `${quote.goodsTotal} ${currencyLabel(quote.currency)}`;
  const body = [
    copy.intro,
    ``,
    `We have prepared the following quotation for ${quote.buyer}:`,
    quote.lines
      .map((line) => {
        const amount =
          line.amount === null ? "—" : `${line.amount} ${currencyLabel(quote.currency)}`;
        return `- ${line.product.name} (${line.product.sku}): ${line.quantity} ${line.product.unit}, unit ${line.unitPrice ?? "—"}, line ${amount}`;
      })
      .join("\n"),
    ``,
    `Goods total: ${total}.`,
    `Payment terms: ${quote.payment || "to be confirmed"}.`,
    `Delivery: ${quote.delivery || "to be confirmed"}.`,
    ``,
    `This quotation is provided as a draft for your confirmation; the goods total excludes freight, tax and other charges, which remain to be verified.`,
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
