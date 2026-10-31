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

/**
 * 条款确认状态（询报价事实字段，如付款条款/交期交货条件）的显式语义。
 *
 * 关键约束：非空文字绝不等于"已确认"。一个字段携带 "待客户确认"/"未确认"/"未知"/
 * "来源缺失"/"模型建议" 等文字时，仍是未确认状态，必须继续出现在 pending 列表中，
 * 不能因为字段非空就从待确认项里消失。
 *
 * - `unknown`：来源缺失/未知，无可用事实（区别于"尚未填写"的空白）。
 * - `blank`：尚未填写（空字符串），属于待确认的一种，但不等同于"来源缺失"。
 * - `pending_confirmation`：有文字但尚未经人工确认（含模型建议、待客户确认等措辞）。
 * - `confirmed`：仅由人工受控入口（human_ui）产生；模型输出、Agent 输出或普通文字
 *   不能自行产生人工确认事实。
 * - `withdrawn`：曾确认后又撤回，重新回到待确认。
 * - `legacy_unstated`：历史数据未记录确认状态，读取时按未确认处理，但不得回写改写旧数据。
 */
export const TermConfirmationStatusSchema = z.enum([
  "unknown",
  "blank",
  "pending_confirmation",
  "confirmed",
  "withdrawn",
  "legacy_unstated",
]);
export type TermConfirmationStatus = z.infer<typeof TermConfirmationStatusSchema>;

/**
 * 未确认措辞集合（确定性匹配，不做词义/文化推断）。
 *
 * 这些文字是业务层的"尚未确认"表述，不能被当作已确认。匹配先做 NFKC 归一 + 大小写折叠 +
 * 连续空白折叠，使全角/半角、大小写差异不改变判定结果。若原文本身为空或纯空白，单独由
 * `classifyTermConfirmation` 处理为 `blank`。
 */
const UNCONFIRMED_TERM_LITERALS: readonly string[] = [
  "待客户确认",
  "待确认",
  "未确认",
  "未知",
  "来源缺失",
  "缺失",
  "模型建议",
  "待定",
  "tbc",
  "to be confirmed",
  "pending confirmation",
  "unconfirmed",
  "unknown",
  "n/a",
  "not available",
];

const normalizeTermText = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

/**
 * 判定一段非空文字是否属于"未确认措辞"。
 *
 * 纯确定性判定：精确/子串匹配上述字面量集合。返回 `true` 表示该文字不能作为已确认事实。
 * 空白字符串由调用方先归类为 `blank`，本函数只处理非空文字。
 */
export function isUnconfirmedTermText(value: string): boolean {
  const normalized = normalizeTermText(value);
  if (normalized.length === 0) return true; // 空白等同未确认，交由调用方按 blank 归类
  return UNCONFIRMED_TERM_LITERALS.some((literal) => normalized.includes(literal));
}

/**
 * 把询报价事实字段的当前值归类为显式确认状态。
 *
 * 规则（顺序即优先级）：
 * 1. 空白 → `blank`；
 * 2. 非空但命中未确认措辞 → `pending_confirmation`；
 * 3. 其余非空文字 → 仍是 `pending_confirmation`（默认未确认）。
 *
 * 注意：本函数**永远不会**返回 `confirmed`。`confirmed` 只能由人工受控入口显式写入，
 * 不能从自由文本自动推导——非空文字不能自行证明其已获人工确认。
 */
export function classifyTermConfirmation(value: string): TermConfirmationStatus {
  if (value.trim().length === 0) return "blank";
  return "pending_confirmation";
}
