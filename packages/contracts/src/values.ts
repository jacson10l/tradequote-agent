import { z } from "zod";

export const DecimalSchema = z
  .string()
  .max(64)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const QuantitySchema = z.strictObject({
  value: DecimalSchema,
  unitId: z.string().trim().min(1).max(64),
});
export const MoneySchema = z.strictObject({
  amount: DecimalSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const LocaleSchema = z
  .string()
  .min(2)
  .max(80)
  .refine((value) => {
    try {
      return Intl.getCanonicalLocales(value).length === 1;
    } catch {
      return false;
    }
  }, "语言须为有效的 BCP 47 标识");
const reason = z.string().trim().min(1).max(2000);
export function factSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("confirmed"),
      value,
      evidenceIds: z.array(z.uuid()).min(1),
    }),
    z.strictObject({ status: z.literal("proposed"), value, evidenceIds: z.array(z.uuid()) }),
    z.strictObject({ status: z.literal("missing"), reason }),
    z.strictObject({
      status: z.literal("conflict"),
      candidateEvidenceIds: z.array(z.uuid()).min(2),
      reason,
    }),
    z.strictObject({ status: z.literal("not_applicable"), reason }),
  ]);
}
export const SourceLocationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("sheet"),
    sheet: z.string().min(1),
    cellRange: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("csv"),
    row: z.number().int().positive(),
    columns: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    kind: z.literal("pdf"),
    page: z.number().int().positive(),
    textSpanId: z.string().min(1),
    bbox: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
      .optional(),
  }),
  z
    .strictObject({
      kind: z.literal("docx"),
      paragraphId: z.string().min(1).optional(),
      tableId: z.string().min(1).optional(),
      cell: z.string().min(1).optional(),
    })
    .refine(
      (value) => value.paragraphId || (value.tableId && value.cell),
      "DOCX 位置须指定段落或表格单元格",
    ),
  z
    .strictObject({
      kind: z.literal("text"),
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
    })
    .refine((value) => value.end > value.start, "文本范围不能为空或倒序"),
]);
export const EvidenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("source"),
    id: z.uuid(),
    sourceRevisionId: z.uuid(),
    location: SourceLocationSchema,
    excerptHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal("human_confirmation"),
    id: z.uuid(),
    actorId: z.string().min(1),
    timestamp: z.iso.datetime(),
    note: reason,
  }),
]);
export type Quantity = z.infer<typeof QuantitySchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
