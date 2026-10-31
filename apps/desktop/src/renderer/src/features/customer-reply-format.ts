import { type CheckReport, CheckReportSchema, type QuoteSnapshot } from "@tradequote/contracts";

export type ReplyLanguage = "en" | "de";
const wording = {
  en: {
    draft: "Unreviewed draft",
    subject: "Quotation",
    greeting: "Dear",
    intro: "Thank you for your inquiry. Please review this quotation draft.",
    unknown: "Unknown",
    pending: "To be confirmed",
    goods: "Goods subtotal",
    exclusions: "Goods only; freight, taxes and other charges are not included.",
    payment: "Payment",
    delivery: "Delivery",
    conditions: "Pending items (original wording)",
    sources: "Frozen product sources",
    report: "Saved check report",
    noReport: "No saved check report; terms and rule coverage remain unverified.",
    unavailable: "Check report unavailable; terms and rule coverage remain unverified.",
    review: "Human review required before external use.",
    details: "Check details (original wording)",
    coverage: "Rule coverage",
    terms:
      "Terms and product names are reproduced in their original language; review translations before external use.",
    notSent: "This draft has not been approved or sent.",
    synthetic: "Unverified source; not for transactions",
    user: "User-provided data; authenticity not verified",
    sourceStatus: "Source status",
  },
  de: {
    draft: "Nicht geprüfter Entwurf",
    subject: "Angebot",
    greeting: "Guten Tag",
    intro: "Vielen Dank für Ihre Anfrage. Bitte prüfen Sie diesen Angebotsentwurf.",
    unknown: "Unbekannt",
    pending: "Noch zu bestätigen",
    goods: "Warenzwischensumme",
    exclusions: "Nur Warenwert; Fracht, Steuern und sonstige Kosten sind nicht enthalten.",
    payment: "Zahlung",
    delivery: "Lieferung",
    conditions: "Offene Punkte (Originalwortlaut)",
    sources: "Festgehaltene Produktquellen",
    report: "Gespeicherter Prüfbericht",
    noReport: "Kein gespeicherter Prüfbericht; Bedingungen und Regelabdeckung sind ungeprüft.",
    unavailable: "Prüfbericht nicht verfügbar; Bedingungen und Regelabdeckung sind ungeprüft.",
    review: "Vor externer Verwendung ist eine menschliche Prüfung erforderlich.",
    details: "Prüfhinweise (Originalwortlaut)",
    coverage: "Regelabdeckung",
    terms:
      "Bedingungen und Produktnamen bleiben in der Originalsprache; Übersetzungen vor externer Verwendung prüfen.",
    notSent: "Dieser Entwurf wurde weder genehmigt noch versendet.",
    synthetic: "Nicht bestätigte Quelle; nicht für Transaktionen",
    user: "Vom Nutzer bereitgestellte Daten; Echtheit ungeprüft",
    sourceStatus: "Quellenstatus",
  },
} as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Presentation only: copies frozen decimal strings, never calculates or approves. null means unavailable. */
export function createCustomerReplyDraft(
  quote: QuoteSnapshot,
  language: ReplyLanguage,
  reports: readonly CheckReport[] | null,
) {
  const w = wording[language];
  const valid =
    reports !== null &&
    new Set(reports.map((r) => r.reportId)).size === reports.length &&
    reports.every(
      (r) =>
        CheckReportSchema.safeParse(r).success &&
        r.quoteId === (quote.rootId ?? quote.id) &&
        r.revisionId === quote.id &&
        r.quoteVersion === quote.version,
    );
  const report = valid
    ? [...reports].sort(
        (a, b) =>
          Date.parse(b.checkedAt) - Date.parse(a.checkedAt) || compare(a.reportId, b.reportId),
      )[0]
    : undefined;
  const subject = `${w.subject} ${quote.number} · V${quote.version} · ${w.draft}`;
  const text = [
    subject,
    "",
    `${w.greeting} ${quote.buyer},`,
    w.intro,
    `ID: ${quote.id} · V${quote.version}`,
    "",
    ...quote.lines.map(
      (line) =>
        `${line.product.sku} · ${line.product.name}: ${line.quantity} ${line.product.unit} × ${line.unitPrice ?? w.unknown} ${quote.currency} = ${line.amount ?? w.unknown} ${quote.currency}`,
    ),
    `${w.goods}: ${quote.goodsTotal ?? w.unknown} ${quote.currency}`,
    w.exclusions,
    `${w.payment}: ${quote.payment || w.pending}`,
    `${w.delivery}: ${quote.delivery || w.pending}`,
    w.terms,
    "",
    w.review,
    `${w.conditions}:`,
    ...quote.pending.map((p) => `- ${p}`),
    "",
    report
      ? `${w.report}: ${report.reportId} · ${report.checkedAt}`
      : valid
        ? w.noReport
        : w.unavailable,
    ...(report
      ? [
          w.coverage +
            ": " +
            [...report.coverage]
              .sort((a, b) => compare(a.category, b.category))
              .map((c) => `${c.category}=${c.status}`)
              .join("; "),
          w.details + ":",
          ...[...report.issues]
            .sort((a, b) => compare(a.checkId, b.checkId))
            .flatMap((issue) => [
              `[${issue.severity}] ${issue.message} — ${issue.suggestedAction}`,
              ...[...issue.evidence]
                .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)))
                .map(
                  (e) =>
                    `  ${e.sourceLabel} · ${e.sourceStatus} · ${e.revisionId} · rule ${e.ruleId} · location ${JSON.stringify(e.location)} · SHA-256 ${e.sourceHash}`,
                ),
            ]),
          ...[...(report.wikiCitations ?? [])]
            .sort((a, b) => compare(a.revisionId + a.sectionId, b.revisionId + b.sectionId))
            .map(
              (c) =>
                `  Wiki ${c.revisionId} · ${c.sectionId} · ${JSON.stringify([...c.sourceRefs].sort((a, b) => compare(a.referenceId, b.referenceId)))}`,
            ),
        ]
      : []),
    "",
    `${w.sources}:`,
    ...quote.lines.map(
      ({ product, tierMin }) =>
        `${product.sku} · ${product.sourceName} · SHA-256 ${product.sourceHash} · ${w.sourceStatus}: ${product.sourceStatus === "synthetic" ? w.synthetic : w.user} · ${product.validUntil} · row ${product.tiers.find((t) => t.minQuantity === tierMin)?.sourceRow ?? w.unknown}`,
    ),
    "",
    w.notSent,
  ].join("\n");
  return {
    subject,
    text,
    revisionId: quote.id,
    quoteVersion: quote.version,
    reportId: report?.reportId ?? null,
    status: "unreviewed" as const,
  };
}
