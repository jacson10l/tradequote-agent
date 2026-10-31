import { expect, it } from "vitest";
import { createCustomerReplyDraft } from "./customer-reply-format";
import { checksPendingReport, checksQuote, checksReport } from "./quote-checks.fixture";

it("preserves unknown money, original terms and frozen sources in EN/DE without translating facts", () => {
  for (const locale of ["en", "de"] as const) {
    const quote = structuredClone(checksQuote);
    const before = JSON.stringify(quote);
    const draft = createCustomerReplyDraft(quote, locale, []);
    expect(draft.status).toBe("unreviewed");
    expect(draft.revisionId).toBe(quote.id);
    expect(draft.text).toContain(
      locale === "en" ? "Goods subtotal: Unknown USD" : "Warenzwischensumme: Unbekannt USD",
    );
    expect(draft.text).toContain(quote.delivery);
    expect(draft.text).toContain(quote.lines[0]!.product.sourceHash);
    expect(draft.text).toContain(
      locale === "en" ? "No saved check report" : "Kein gespeicherter Prüfbericht",
    );
    expect(draft.text).toContain(locale === "en" ? "Unreviewed draft" : "Nicht geprüfter Entwurf");
    expect(JSON.stringify(quote)).toBe(before);
  }
});

it("uses exact saved decimals and binds V3 checks, risks of all severities and evidence", () => {
  const quote = {
    ...checksQuote,
    version: 3,
    rootId: checksQuote.id,
    payment: "30% deposit",
    goodsTotal: "1080.00",
  };
  const report = { ...checksReport, quoteVersion: 3 };
  const draft = createCustomerReplyDraft(quote, "en", [report]);
  expect(draft.text).toContain("1080.00 USD");
  expect(draft.text).toContain("V3");
  expect(draft.text).toContain("[block] 付款条件缺失");
  expect(draft.text).toContain("[warning] 交货承诺需要核实");
  expect(draft.text).toContain(report.issues[0]!.suggestedAction);
  expect(draft.text).toContain(report.issues[0]!.evidence[0]!.sourceHash);
  expect(draft.text).toContain(report.reportId);
  expect(draft.text).toContain("Human review required");
});

it("selects newest deterministically and never uses stale, mismatched or duplicate checks", () => {
  const older = {
    ...checksReport,
    checkedAt: "2026-10-21T00:00:00.000Z",
    reportId: "00000000-0000-4000-8000-000000000099",
  };
  expect(createCustomerReplyDraft(checksQuote, "en", [older, checksReport]).reportId).toBe(
    checksReport.reportId,
  );
  for (const reports of [
    [{ ...checksReport, quoteVersion: 2 }],
    [checksReport, checksReport],
    [{ ...checksReport, quoteId: older.reportId }],
  ]) {
    const draft = createCustomerReplyDraft(checksQuote, "en", reports);
    expect(draft.reportId).toBeNull();
    expect(draft.text).toContain("Check report unavailable");
  }
});

it("warns on pending coverage, supports unavailable reads and clean reports never approve", () => {
  expect(createCustomerReplyDraft(checksQuote, "de", null).text).toContain(
    "Prüfbericht nicht verfügbar",
  );
  const clean = { ...checksReport, issues: [] };
  expect(createCustomerReplyDraft(checksQuote, "en", [clean]).text).toContain("Unreviewed draft");
  const pending = createCustomerReplyDraft(checksQuote, "en", [checksPendingReport]);
  expect(pending.reportId).toBe(checksPendingReport.reportId);
  expect(pending.text).toContain("commercial_terms=pending");
  expect(pending.text).toContain("[pending] 缺少商务条款规则");
});

it("breaks equal-time report ties by ID and retains full rule/location identity", () => {
  const earlierId = { ...checksReport, reportId: "00000000-0000-4000-8000-000000000019" };
  const a = createCustomerReplyDraft(checksQuote, "en", [checksReport, earlierId]);
  const b = createCustomerReplyDraft(checksQuote, "en", [earlierId, checksReport]);
  expect(a).toEqual(b);
  expect(a.reportId).toBe(earlierId.reportId);
  const evidence = checksReport.issues[0]!.evidence[0]!;
  expect(a.text).toContain(evidence.ruleId);
  expect(a.text).toContain(JSON.stringify(evidence.location));
});

it("freezes exact English template text for a saved quote with unknown pricing", () => {
  expect(createCustomerReplyDraft(checksQuote, "en", []).text).toMatchInlineSnapshot(`
    "Quotation SYNTHETIC-CHECKS-001 · V1 · Unreviewed draft

    Dear 合成采购方,
    Thank you for your inquiry. Please review this quotation draft.
    ID: 00000000-0000-4000-8000-000000000001 · V1

    SYNTHETIC-PANEL · 合成板材: 1 m2 × Unknown USD = Unknown USD
    Goods subtotal: Unknown USD
    Goods only; freight, taxes and other charges are not included.
    Payment: To be confirmed
    Delivery: 保证三天到货
    Terms and product names are reproduced in their original language; review translations before external use.

    Human review required before external use.
    Pending items (original wording):
    - 缺价格

    No saved check report; terms and rule coverage remain unverified.

    Frozen product sources:
    SYNTHETIC-PANEL · 合成商品.csv · SHA-256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · Source status: Synthetic demonstration data · 2099-12-31 · row Unknown

    This draft has not been approved or sent."
  `);
});
it("freezes exact German template text for a saved quote with unknown pricing", () => {
  expect(createCustomerReplyDraft(checksQuote, "de", []).text).toMatchInlineSnapshot(`
    "Angebot SYNTHETIC-CHECKS-001 · V1 · Nicht geprüfter Entwurf

    Guten Tag 合成采购方,
    Vielen Dank für Ihre Anfrage. Bitte prüfen Sie diesen Angebotsentwurf.
    ID: 00000000-0000-4000-8000-000000000001 · V1

    SYNTHETIC-PANEL · 合成板材: 1 m2 × Unbekannt USD = Unbekannt USD
    Warenzwischensumme: Unbekannt USD
    Nur Warenwert; Fracht, Steuern und sonstige Kosten sind nicht enthalten.
    Zahlung: Noch zu bestätigen
    Lieferung: 保证三天到货
    Bedingungen und Produktnamen bleiben in der Originalsprache; Übersetzungen vor externer Verwendung prüfen.

    Vor externer Verwendung ist eine menschliche Prüfung erforderlich.
    Offene Punkte (Originalwortlaut):
    - 缺价格

    Kein gespeicherter Prüfbericht; Bedingungen und Regelabdeckung sind ungeprüft.

    Festgehaltene Produktquellen:
    SYNTHETIC-PANEL · 合成商品.csv · SHA-256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · Quellenstatus: Synthetische Demonstrationsdaten · 2099-12-31 · row Unbekannt

    Dieser Entwurf wurde weder genehmigt noch versendet."
  `);
});
