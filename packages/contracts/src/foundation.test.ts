import { describe, expect, it } from "vitest";
import {
  ApprovalBindingSchema,
  classifyTermConfirmation,
  DecimalSchema,
  EvidenceSchema,
  factSchema,
  isUnconfirmedTermText,
  LocaleSchema,
  MoneySchema,
  PatchBatchSchema,
  patchToolJsonSchema,
  QuantitySchema,
  QuoteRevisionInputSchema,
  RunEventSchema,
  SourceLocationSchema,
  TermConfirmationStatusSchema,
  TypedPatchSchema,
} from "./index";
import { mockRevisionInput, mockRunEvent } from "./mock";

const id = mockRevisionInput.quoteId;
describe("M1 shared foundation", () => {
  it("keeps decimal strings, unknown facts and evidence distinct", () => {
    for (const value of [0, "-1", "+1", "01", "1e3", "NaN", "Infinity", "1,000", ""])
      expect(DecimalSchema.safeParse(value).success).toBe(false);
    expect(MoneySchema.parse({ amount: "0", currency: "CNY" }).amount).toBe("0");
    expect(QuantitySchema.safeParse({ value: "1", unitId: "" }).success).toBe(false);
    const fact = factSchema(MoneySchema);
    expect(fact.safeParse({ status: "missing", reason: "未提供价格" }).success).toBe(true);
    expect(
      fact.safeParse({ status: "missing", value: { amount: "0", currency: "USD" }, reason: "未知" })
        .success,
    ).toBe(false);
    expect(
      fact.safeParse({
        status: "confirmed",
        value: { amount: "0", currency: "USD" },
        evidenceIds: [],
      }).success,
    ).toBe(false);
    expect(
      fact.safeParse({
        status: "confirmed",
        value: { amount: "0", currency: "USD" },
        evidenceIds: [id],
      }).success,
    ).toBe(true);
    expect(SourceLocationSchema.safeParse({ kind: "pdf", page: 0, textSpanId: "s" }).success).toBe(
      false,
    );
    expect(SourceLocationSchema.safeParse({ kind: "docx" }).success).toBe(false);
    expect(SourceLocationSchema.safeParse({ kind: "text", start: 10, end: 2 }).success).toBe(false);
    expect(
      EvidenceSchema.safeParse({
        kind: "source",
        id,
        sourceRevisionId: id,
        location: { kind: "csv", row: 1, columns: ["price"] },
        excerptHash: "a".repeat(64),
      }).success,
    ).toBe(true);
    for (const locale of ["en", "de-DE", "zh-Hans-CN", "ar", "ja-JP", "pt-BR"])
      expect(LocaleSchema.safeParse(locale).success).toBe(true);
    expect(LocaleSchema.safeParse("not_a_locale").success).toBe(false);
  });
  it("accepts nine explicit operations and rejects computed/authority fields at every patch", () => {
    const patches = [
      mockRevisionInput.typedPatch[0],
      { op: "selectProduct", lineId: id, productRevisionId: id },
      { op: "selectPrice", lineId: id, priceRevisionId: id },
      {
        op: "setPackaging",
        lineId: id,
        description: "合成包装",
        quantityPerPack: { value: "12", unitId: "piece" },
      },
      { op: "setDeliveryTerm", term: "待业务确认的术语", place: "任意目标市场" },
      { op: "setCommercialTerm", key: "payment", value: "待确认" },
      { op: "addLine", lineId: id, quantity: { value: "1", unitId: "metre" } },
      { op: "removeLine", lineId: id },
      { op: "setPricingPolicy", pricingPolicyRevisionId: id },
    ];
    for (const patch of patches) {
      expect(TypedPatchSchema.safeParse(patch).success).toBe(true);
      for (const field of ["total", "approval", "actor", "contentHash"])
        expect(TypedPatchSchema.safeParse({ ...patch, [field]: "injected" }).success).toBe(false);
    }
    expect(PatchBatchSchema.safeParse({ patches: [] }).success).toBe(false);
    expect(PatchBatchSchema.safeParse({ patches: Array(51).fill(patches[0]) }).success).toBe(false);
    expect(QuoteRevisionInputSchema.safeParse(mockRevisionInput).success).toBe(true);
    expect(
      QuoteRevisionInputSchema.safeParse({ ...mockRevisionInput, expectedAggregateVersion: 0 })
        .success,
    ).toBe(false);
    const schema = JSON.stringify(patchToolJsonSchema());
    expect(schema).toContain('"additionalProperties":false');
    expect(schema).not.toMatch(/approval|actor|contentHash/);
    expect(
      ApprovalBindingSchema.safeParse({
        quoteId: id,
        revisionId: id,
        expectedAggregateVersion: 1,
        contentHash: "a".repeat(64),
        bundleId: id,
        bundleHash: "b".repeat(64),
        reviewNote: "人工入口使用",
      }).success,
    ).toBe(true);
    expect(
      ApprovalBindingSchema.safeParse({ quoteId: id, revisionId: id, bundleHash: "b".repeat(64) })
        .success,
    ).toBe(false);
  });
  it("checks event type against payload and rejects arbitrary data/identity", () => {
    const events = [
      mockRunEvent,
      { ...mockRunEvent, type: "step.started", payload: { stepId: id, label: "合成步骤" } },
      {
        ...mockRunEvent,
        type: "tool.completed",
        payload: { toolCallId: "provider-call-1", toolName: "get_quote", ok: true },
      },
      {
        ...mockRunEvent,
        type: "revision.created",
        payload: { quoteId: id, revisionId: id, aggregateVersion: 2 },
      },
      { ...mockRunEvent, type: "clarification.required", payload: { issueIds: [id] } },
      {
        ...mockRunEvent,
        type: "artifact.ready",
        payload: { revisionId: id, artifactId: id, bundleId: id },
      },
      { ...mockRunEvent, type: "run.completed", payload: { revisionId: null } },
      { ...mockRunEvent, type: "run.failed", payload: { code: "MODEL_TIMEOUT", message: "超时" } },
      { ...mockRunEvent, type: "run.cancelled", payload: { committedRevisionId: id } },
    ];
    for (const event of events) {
      expect(RunEventSchema.safeParse(event).success).toBe(true);
      expect(RunEventSchema.safeParse({ ...event, actor: "admin" }).success).toBe(false);
      expect(
        RunEventSchema.safeParse({ ...event, payload: { ...event.payload, arbitrary: true } })
          .success,
      ).toBe(false);
    }
    expect(RunEventSchema.safeParse({ ...mockRunEvent, type: "revision.created" }).success).toBe(
      false,
    );
    expect(RunEventSchema.safeParse({ ...mockRunEvent, seq: 0 }).success).toBe(false);
  });
  it("freezes term-confirmation semantics: non-empty text is never a confirmation fact", () => {
    // Six explicit states are the frozen vocabulary; nothing else is allowed.
    expect(TermConfirmationStatusSchema.options).toEqual([
      "unknown",
      "blank",
      "pending_confirmation",
      "confirmed",
      "withdrawn",
      "legacy_unstated",
    ]);
    for (const status of TermConfirmationStatusSchema.options)
      expect(TermConfirmationStatusSchema.safeParse(status).success).toBe(true);
    expect(TermConfirmationStatusSchema.safeParse("auto_confirmed").success).toBe(false);

    // Non-empty unconfirmed wording must keep flowing as pending, never be treated as confirmed.
    for (const text of [
      "待客户确认",
      "待确认",
      "未确认",
      "未知",
      "来源缺失",
      "模型建议",
      "待定",
      "TBC",
      "to be confirmed",
      "pending confirmation",
      "unconfirmed",
      "N/A",
      "not available",
    ])
      expect(isUnconfirmedTermText(text)).toBe(true);

    // Full-width / case / spacing normalization must not change the verdict.
    expect(isUnconfirmedTermText("ＴＢＣ")).toBe(true);
    expect(isUnconfirmedTermText("To Be Confirmed")).toBe(true);

    // A real, concrete term is not "unconfirmed wording" — but it is still pending by default,
    // because confirmation can only come from a human-controlled entry, never from text itself.
    expect(isUnconfirmedTermText("30%预付，70%发货前付清")).toBe(false);
    expect(classifyTermConfirmation("30%预付，70%发货前付清")).toBe("pending_confirmation");
    expect(classifyTermConfirmation("待客户确认")).toBe("pending_confirmation");
    expect(classifyTermConfirmation("")).toBe("blank");
    expect(classifyTermConfirmation("   ")).toBe("blank");

    // The classifier can never mint a "confirmed" fact from free text.
    for (const text of ["30%预付", "待客户确认", "", "   ", "模型建议"])
      expect(classifyTermConfirmation(text)).not.toBe("confirmed");
  });
});
