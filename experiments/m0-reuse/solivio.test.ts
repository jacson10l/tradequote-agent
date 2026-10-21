import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import { parseCsv, resolveColumnMap, extractProductRows, getMissingColumns } from "./vendor/solivio/productParser.ts";
import { calculateSubtotalNet, calculateNetTotal } from "./vendor/solivio/offerTotals.ts";

// These are characterization tests: a passing mismatch test confirms an observed
// limitation, NOT acceptance of the upstream behavior for our product.
const strictCsv = (text: string, delimiter = ",") =>
  parse(text, { columns: true, bom: true, delimiter, skip_empty_lines: true });

test("compatible: BOM, semicolon, Chinese category attributes", () => {
  const input = "\uFEFFsku;name;material\r\nP1;螺栓;不锈钢\r\n";
  assert.deepEqual(parseCsv(input).rows, strictCsv(input, ";"));
});

test("compatible: quoted comma, escaped quote and multiline cell", () => {
  const input = 'sku,name,description\nP1,"a,b","one ""quoted""\ntwo"\n';
  assert.deepEqual(parseCsv(input).rows, strictCsv(input));
});

test("compatible: tab-separated data", () => {
  const input = "sku\tname\nP1\t阀门\n";
  assert.deepEqual(parseCsv(input).rows, strictCsv(input, "\t"));
});

test("mismatch: delimiters inside quoted header defeat automatic detection", () => {
  const input = '"sku;a;b;c",name\nP1,阀门\n';
  assert.deepEqual(strictCsv(input), [{ "sku;a;b;c": "P1", name: "阀门" }]);
  assert.notDeepEqual(parseCsv(input).rows, strictCsv(input));
});

test("mismatch: unclosed quote is accepted without diagnostic", () => {
  const input = 'sku,name\nP1,"unfinished';
  assert.throws(() => strictCsv(input), { code: "CSV_QUOTE_NOT_CLOSED" });
  assert.deepEqual(parseCsv(input).rows, [{ sku: "P1", name: "unfinished" }]);
});

test("mismatch: extra cell is silently discarded", () => {
  const input = "sku,name\nP1,valve,unexpected\n";
  assert.throws(() => strictCsv(input), { code: "CSV_RECORD_INCONSISTENT_COLUMNS" });
  assert.deepEqual(parseCsv(input).rows, [{ sku: "P1", name: "valve" }]);
});

test("mismatch: extraction requires upstream VAT/gross/description schema", () => {
  const { headers, rows } = parseCsv("sku,name,price_net,currency,material\nP1,valve,12.50,USD,steel");
  const map = resolveColumnMap(headers);
  assert.deepEqual(getMissingColumns(map), ["description", "priceGross", "vatRate"]);
  // Upstream provides getMissingColumns; callers must invoke it explicitly.
  assert.deepEqual(extractProductRows(rows, map), { records: [], rowErrors: [] });
});

test("mismatch: Chinese column aliases require our mapping UI", () => {
  assert.deepEqual(resolveColumnMap(["商品编码", "名称", "币种", "销售单价"]), {});
});

test("mismatch: ambiguous price 1.234 becomes 1234, not three-decimal price", () => {
  const { headers, rows } = parseCsv("sku;name;description;price_net;price_gross;vat;currency\nP1;valve;demo;1.234;1.234;0;USD");
  const result = extractProductRows(rows, resolveColumnMap(headers));
  assert.equal(result.records[0].priceNet, 1234);
  assert.equal(new Decimal("1.234").toString(), "1.234");
});

test("mismatch: JS number sum fails exact decimal equality", () => {
  const value = calculateSubtotalNet([{ quantity: 1, unitPriceNet: 0.1 }, { quantity: 1, unitPriceNet: 0.2 }]);
  assert.equal(value, 0.30000000000000004);
  assert.equal(new Decimal("0.1").plus("0.2").toFixed(2), "0.30");
});

test("mismatch: totals helper assumes validated quantity and discount", () => {
  assert.equal(calculateSubtotalNet([{ quantity: -1, unitPriceNet: 100 }]), -100);
  assert.equal(calculateNetTotal(100, 150), -50);
});
