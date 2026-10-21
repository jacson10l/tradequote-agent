import { type CatalogRow, CatalogRowSchema, type ImportIssue } from "@tradequote/contracts";
import { validateCatalogRows } from "@tradequote/domain";
import { parse } from "csv-parse/sync";

export function parseCatalogCsv(csv: string): { rows: CatalogRow[]; issues: ImportIssue[] } {
  const rows: CatalogRow[] = [];
  const issues: ImportIssue[] = [];
  const required = [
    "sku",
    "name",
    "category",
    "unit",
    "currency",
    "min_quantity",
    "unit_price",
    "valid_until",
    "description",
  ];
  if (csv.includes("\uFFFD") || csv.includes("\0"))
    return {
      rows,
      issues: [{ row: 1, field: "csv", message: "文件含无效编码，请转换为 UTF-8 CSV" }],
    };
  try {
    const records: unknown = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 8192,
      info: true,
    });
    if (!Array.isArray(records)) throw new Error("records");
    // csv-parse info.lines records the physical ending line, including quoted multiline fields.
    const header = records.shift() as { record: string[]; info: { lines: number } } | undefined;
    if (
      !header ||
      header.record.length !== required.length ||
      required.some((name) => header.record.filter((v) => v === name).length !== 1)
    )
      return {
        rows,
        issues: [{ row: 1, field: "header", message: `列名须完整且唯一：${required.join(",")}` }],
      };
    if (records.length === 0 || records.length > 500)
      return { rows, issues: [{ row: 1, field: "csv", message: "每次导入须包含 1～500 行数据" }] };
    for (const entry of records) {
      const item = entry as { record: string[]; info: { lines: number } };
      const row = item.info.lines;
      const fields = Object.fromEntries(header.record.map((key, i) => [key, item.record[i]]));
      const result = CatalogRowSchema.safeParse({
        row,
        sku: fields.sku,
        name: fields.name,
        category: fields.category,
        unit: fields.unit,
        currency: fields.currency,
        minQuantity: fields.min_quantity,
        unitPrice: fields.unit_price === "" ? null : fields.unit_price,
        validUntil: fields.valid_until,
        description: fields.description,
      });
      if (result.success) rows.push(result.data);
      else
        for (const issue of result.error.issues)
          issues.push({
            row,
            field: issue.path.join("."),
            message:
              "字段无效：请检查必填值、单位代码、币种、日期和十进制格式（最多9位整数4位小数）",
          });
      if (issues.length >= 500) break;
    }
    issues.push(...validateCatalogRows(rows));
  } catch {
    issues.push({ row: 1, field: "csv", message: "CSV 结构不合法：请检查引号、列数或过长内容" });
  }
  return { rows, issues: issues.slice(0, 1000) };
}
