import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "./catalog-csv";

describe("C08 A 目录生产复验", () => {
  it("catalog_converted.csv 经生产 parseCatalogCsv 解析为 285 行 / 82 SKU / 0 issue，隔离 SKU 不在", () => {
    const path = resolve("wiki-project/demo_data/catalog_converted.csv");
    const csv = readFileSync(path, "utf8");
    const parsed = parseCatalogCsv(csv);
    const skus = new Set(parsed.rows.map((row) => row.sku));
    expect(parsed.rows.length).toBe(285);
    expect(skus.size).toBe(82);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows.some((row) => row.sku === "1600614614202")).toBe(false);
    // 文件 SHA-256 记录（供 C08 A 交付固定证据）
    const sha = createHash("sha256").update(csv).digest("hex");
    expect(sha).toBe("0d73c71211cabcfd7775d4e6b0f4236b8849df108233a5195a5164ec37923fc9");
  });
});
