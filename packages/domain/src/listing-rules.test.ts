import type { CatalogRow } from "@tradequote/contracts";
import { expect, it } from "vitest";
import { validateListingCompliance } from "./listing-rules";

const base = (over: Partial<CatalogRow> = {}): CatalogRow => ({
  row: 2,
  sku: "A",
  name: "Men T-Shirt",
  category: "Men-T-Shirt",
  unit: "piece",
  currency: "USD",
  minQuantity: "10",
  unitPrice: "12.5",
  validUntil: "2099-01-01",
  description: "Plain cotton T-shirt",
  ...over,
});

it("blocks CJK titles as required-English on Alibaba.com (R-PL-TITLE-ZH)", () => {
  const issues = validateListingCompliance([base({ name: "棉质T恤" })]);
  expect(issues.some((i) => i.ruleId === "R-PL-TITLE-ZH" && i.severity === "block")).toBe(true);
  expect(
    validateListingCompliance([base({ name: "Cotton T-Shirt" })]).some(
      (i) => i.ruleId === "R-PL-TITLE-ZH",
    ),
  ).toBe(false);
});

it("flags self-defined category tags lacking a leaf category id (R-PL-CAT-LEAF)", () => {
  const issues = validateListingCompliance([base()]);
  expect(issues.some((i) => i.ruleId === "R-PL-CAT-LEAF" && i.message.includes("叶子类目"))).toBe(
    true,
  );
});

it("flags multi-row SKU price tiers as duplicate-listing risk (R-PL-DUP-SKU)", () => {
  const one = validateListingCompliance([base()]);
  expect(one.some((i) => i.ruleId === "R-PL-DUP-SKU")).toBe(false);
  const multi = validateListingCompliance([
    base({ minQuantity: "10", unitPrice: "12.5" }),
    base({ row: 3, minQuantity: "100", unitPrice: "11" }),
  ]);
  expect(multi.some((i) => i.ruleId === "R-PL-DUP-SKU" && i.message.includes("聚合"))).toBe(true);
});

it("reviews low MOQ or sub-5 minimum price as potentially fake (R-PL-MOQ-REAL)", () => {
  const lowMoq = validateListingCompliance([base({ minQuantity: "5", unitPrice: "20" })]);
  expect(lowMoq.some((i) => i.ruleId === "R-PL-MOQ-REAL" && i.severity === "review")).toBe(true);
  const lowPrice = validateListingCompliance([base({ minQuantity: "100", unitPrice: "4.9" })]);
  expect(lowPrice.some((i) => i.ruleId === "R-PL-MOQ-REAL")).toBe(true);
  const ok = validateListingCompliance([base({ minQuantity: "10", unitPrice: "12.5" })]);
  expect(ok.some((i) => i.ruleId === "R-PL-MOQ-REAL")).toBe(false);
});

it("blocks descriptions reproducing third-party supplier page + URL (R-PL-3RD-PARTY)", () => {
  const issues = validateListingCompliance([
    base({
      description: "供应商: XX Co. 来源 https://www.alibaba.com/product/123.html",
    }),
  ]);
  expect(issues.some((i) => i.ruleId === "R-PL-3RD-PARTY" && i.severity === "block")).toBe(true);
  expect(
    validateListingCompliance([base({ description: "100% cotton, machine washable" })]).some(
      (i) => i.ruleId === "R-PL-3RD-PARTY",
    ),
  ).toBe(false);
});

it("warns on mixed currencies across a catalog (R-PL-CURR-MIX)", () => {
  const issues = validateListingCompliance([base(), base({ sku: "B", currency: "CNY" })]);
  expect(issues.some((i) => i.ruleId === "R-PL-CURR-MIX" && i.severity === "warn")).toBe(true);
  expect(
    validateListingCompliance([base(), base({ sku: "B", currency: "USD" })]).some(
      (i) => i.ruleId === "R-PL-CURR-MIX",
    ),
  ).toBe(false);
});

it("blocks capture-metadata descriptions without product content (R-PL-DESC-METADATA)", () => {
  const issues = validateListingCompliance([
    base({ description: "gsm:180 材质:cotton 供应商:A 来源:url 采集日期:2026-10-21" }),
  ]);
  expect(issues.some((i) => i.ruleId === "R-PL-DESC-METADATA" && i.severity === "block")).toBe(
    true,
  );
});

it("registers unmodelled listing fields once rather than inventing per-row evidence", () => {
  const issues = validateListingCompliance([base()]);
  const unmodelled = issues.filter((i) => i.ruleId === "R-PL-UNMODELLED");
  expect(unmodelled).toHaveLength(1);
  expect(unmodelled[0]?.message).toContain("未建模");
});
