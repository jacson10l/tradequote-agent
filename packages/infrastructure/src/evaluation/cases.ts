// Synthetic buyer requirements, never customer data or actual platform policy.
export const categories = [
  {
    id: "apparel",
    sku: "DEMO-TEE",
    category: "服装",
    unit: "piece",
    totals: ["900.00", "1080.00", "1080.00"],
  },
  {
    id: "panel",
    sku: "DEMO-PANEL",
    category: "板材",
    unit: "m2",
    totals: ["1250.00", "1500.00", "1500.00"],
  },
  {
    id: "fastener",
    sku: "DEMO-FASTENER",
    category: "紧固件",
    unit: "kg",
    totals: [null, null, null],
  },
] as const;
export const languages = ["zh", "en", "de"] as const;
export type Language = (typeof languages)[number];
export const terms = {
  zh: { payment: "T/T", delivery: "30天", nextPayment: "30%预付，70%发货前", nextDelivery: "45天" },
  en: {
    payment: "T/T",
    delivery: "30 days",
    nextPayment: "30% advance, 70% before shipment",
    nextDelivery: "45 days",
  },
  de: {
    payment: "T/T",
    delivery: "30 Tage",
    nextPayment: "30% Anzahlung, 70% vor Versand",
    nextDelivery: "45 Tage",
  },
} as const;
export function instructions(sku: string, unit: string, language: Language) {
  const t = terms[language];
  if (language === "zh")
    return [
      `合成评估询盘：100 ${unit} ${sku}，付款${t.payment}，交期${t.delivery}。仅保存未审核草稿，不编造运税费。`,
      `仅把数量从100改为120 ${unit}；商品、付款和交期不变。`,
      `仅把付款改为“${t.nextPayment}”，交期改为“${t.nextDelivery}”；商品和120 ${unit}数量不变。`,
    ];
  if (language === "en")
    return [
      `Synthetic evaluation: quote 100 ${unit} of ${sku}, payment ${t.payment}, delivery ${t.delivery}. Save an unapproved draft only. Do not invent freight or taxes.`,
      `Change quantity only from 100 to 120 ${unit}. Keep product, payment and delivery unchanged.`,
      `Change payment only to "${t.nextPayment}" and delivery to "${t.nextDelivery}". Keep the product and quantity of 120 ${unit}.`,
    ];
  return [
    `Synthetische Bewertung: Angebot für 100 ${unit} ${sku}, Zahlung ${t.payment}, Lieferzeit ${t.delivery}. Nur ungeprüften Entwurf speichern. Keine Fracht oder Steuern erfinden.`,
    `Nur die Menge von 100 auf 120 ${unit} ändern. Artikel, Zahlung und Lieferzeit unverändert lassen.`,
    `Nur Zahlung auf „${t.nextPayment}“ und Lieferzeit auf „${t.nextDelivery}“ ändern. Artikel und Menge von 120 ${unit} unverändert lassen.`,
  ];
}
export const semanticCases = categories.flatMap((category) =>
  languages.map((language) => ({
    id: `${category.id}-${language}`,
    category,
    language,
    instructions: instructions(category.sku, category.unit, language),
  })),
);
export const failureCases = [
  "auth",
  "rate_limit",
  "server",
  "network",
  "invalid_json",
  "truncated",
  "oversized",
  "empty",
  "extra_field",
  "amount_injection",
  "unknown_tool",
  "false_complete",
  "tool_budget",
  "timeout",
  "cancel_late",
  "pre_cancel",
  "explicit_retry",
] as const;
export type FailureCase = (typeof failureCases)[number];
export const clarificationCases = {
  zh: "合成询盘：请报 DEMO-TEE，但数量未确定；先询问数量，不得保存或猜测。",
  en: "Synthetic inquiry: quote an unspecified product and quantity. Ask for clarification; do not guess or save.",
  de: "Synthetische Anfrage: Artikel und Menge fehlen. Bitte zuerst nachfragen, nichts erfinden oder speichern.",
} as const;

export const evaluationPlan = [
  ...semanticCases.flatMap((c) =>
    [1, 2, 3].map((v) => ({
      id: `${c.id}-v${v}`,
      kind: "semantic" as const,
      category: c.category.id,
      language: c.language,
    })),
  ),
  ...languages.map((language) => ({
    id: `clarification-${language}`,
    kind: "clarification" as const,
    category: null,
    language,
  })),
  {
    id: "rule-block",
    kind: "rule_block" as const,
    category: "apparel" as const,
    language: "en" as const,
  },
  ...failureCases.map((failure) => ({
    id: `failure-${failure}`,
    kind: "failure" as const,
    category: null,
    language: null,
  })),
];
