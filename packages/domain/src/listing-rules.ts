import type { CatalogRow, ListingIssue } from "@tradequote/contracts";
import Decimal from "decimal.js";

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * 阿里国际站发品（listing）合规校验 —— catalog.stage 导入时执行。
 *
 * 规则来源：`wiki-project/demo_data/demo_check_rules.csv` 中
 * `category=platform_policy` 且 `source_type=OFFICIAL_VERIFIED` 的 13 条规则
 * （依据《阿里巴巴国际站规则》第 21–33 条 + 官方《商品信息滥发处罚规则解读》）。
 *
 * 与 `validateCatalogRows`（结构性校验，产出 `ImportIssue` 并阻塞发布）不同，
 * 本函数产出 `ListingIssue`，携带平台规则严重度（block/warn/review），
 * 作为发品前置门禁与界面展示的输入，**不**并入结构性 issue 通道。
 *
 * 说明：catalog.stage 的输入是 `CatalogRow`（sku/name/category/unit/currency/
 * min_quantity/unit_price/valid_until/description 共 9 字段）。13 条规则中，
 * 能由这 9 个字段直接判定的有 7 条；其余 6 条（图片/关键词/结构化属性/发货字段/
 * 纤维成分/证书）在 catalog.stage 层没有对应字段，本函数**不**凭空判定，
 * 只登记一条「该层字段未建模」的说明，避免误报或臆造证据；由含扩展字段的
 * 更上层发品前置校验负责。
 *
 * 纯函数、确定性、无 IO。
 */
export function validateListingCompliance(rows: CatalogRow[]): ListingIssue[] {
  if (rows.length === 0) return [];
  const issues: ListingIssue[] = [];

  // ── R-PL-TITLE-ZH：标题（name）含 CJK 字符 → 国际站须英文标题，block ──
  const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  for (const row of rows) {
    if (cjk.test(row.name))
      issues.push({
        ruleId: "R-PL-TITLE-ZH",
        severity: "block",
        row: row.row,
        field: "name",
        message: "商品名称含中文，国际站标题须为英文；中文原名请移至 name_zh 等本地化字段",
      });
  }

  const skus = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const list = skus.get(row.sku) ?? [];
    list.push(row);
    skus.set(row.sku, list);
  }

  // ── R-PL-CAT-LEAF：category 为自由文本、无平台叶子类目 ID → block ──
  for (const [sku, group] of skus) {
    const first = group[0];
    if (!first) continue;
    issues.push({
      ruleId: "R-PL-CAT-LEAF",
      severity: "block",
      row: first.row,
      field: "category",
      message: `SKU ${sku} 的类目「${first.category}」是自由文本标签，未映射到平台叶子类目 ID；发品前须映射到最小叶子类目`,
    });
  }

  // ── R-PL-DUP-SKU：同一 SKU 多行仅价格档不同 → 重复铺货，block ──
  for (const [sku, group] of skus) {
    if (group.length <= 1) continue;
    issues.push({
      ruleId: "R-PL-DUP-SKU",
      severity: "block",
      row: group[0]?.row ?? 0,
      field: "sku",
      message: `SKU ${sku} 展开为 ${group.length} 行价格档；发品须聚合为 1 个 listing + N 档阶梯价，禁止按行发布`,
    });
  }

  // ── R-PL-MOQ-REAL：MOQ ≤ 5 或最低档价 < 5 → 须真实可成交，review ──
  for (const [sku, group] of skus) {
    const minMoq = group.reduce(
      (m, r) => (new D(r.minQuantity).lt(m) ? r.minQuantity : m),
      group[0]?.minQuantity ?? "1",
    );
    const minPrice = group.reduce<string | null>((m, r) => {
      if (r.unitPrice === null) return m;
      if (m === null) return r.unitPrice;
      return new D(r.unitPrice).lt(m) ? r.unitPrice : m;
    }, null);
    const lowMoq = new D(minMoq).lte(5);
    const lowPrice = minPrice !== null && new D(minPrice).lt(5);
    if (lowMoq || lowPrice)
      issues.push({
        ruleId: "R-PL-MOQ-REAL",
        severity: "review",
        row: group[0]?.row ?? 0,
        field: "min_quantity",
        message: `SKU ${sku} 最低 MOQ=${minMoq}${lowMoq ? "（≤5）" : ""}、最低档价=${minPrice ?? "—"}${
          lowPrice ? "（<5）" : ""
        }；低 MOQ/极低价须逐条确认真实可成交，否则判定虚假价格/MOQ`,
      });
  }

  // ── R-PL-3RD-PARTY：description 含供应商名 + 来源 URL → 侵权，block ──
  for (const row of rows) {
    if (
      /https?:\/\/|www\./i.test(row.description) &&
      /供应商|supplier|alibaba\.com/i.test(row.description)
    )
      issues.push({
        ruleId: "R-PL-3RD-PARTY",
        severity: "block",
        row: row.row,
        field: "description",
        message:
          "描述疑似整段搬用第三方商品页并保留公司名/来源 URL；发品描述只留商品信息，来源移入独立来源表",
      });
  }

  // ── R-PL-CURR-MIX：同一目录混排 CNY/USD → 语义不一致，warn ──
  const currencies = new Set(rows.map((r) => r.currency));
  if (currencies.size > 1)
    issues.push({
      ruleId: "R-PL-CURR-MIX",
      severity: "warn",
      row: rows[0]?.row ?? 0,
      field: "currency",
      message: `目录混排 ${[...currencies].join("/")} 币种；发品前须统一为平台标价币种并逐条明示`,
    });

  // ── R-PL-DESC-METADATA：description 是采集元数据而非商品内容，block ──
  const captureMarkers = /(供应商|supplier|来源|source|采集|crawl|date|2026-\d{2}-\d{2})/i;
  const contentMarkers =
    /(功能|使用|规格|特点|说明|包装|配件|尺寸|sizes?|features?|specifications?|instructions?|packaging|accessor)/i;
  for (const row of rows) {
    if (captureMarkers.test(row.description) && !contentMarkers.test(row.description))
      issues.push({
        ruleId: "R-PL-DESC-METADATA",
        severity: "block",
        row: row.row,
        field: "description",
        message:
          "描述仅为采集元数据（供应商/来源/日期），缺少功能/材质/包装/配件说明；发品须重写为商品详情",
      });
  }

  // ── 未建模规则（结构性字段缺失，本层不逐 SKU 判定，只登记一次）──
  issues.push({
    ruleId: "R-PL-UNMODELLED",
    severity: "review",
    row: rows[0]?.row ?? 0,
    field: "csv",
    message:
      "发品合规另 6 类字段（图片/关键词/结构化属性/发货字段/纤维成分/证书）在目录 CSV 中未建模，本层不判定；补字段后由发品前置校验覆盖",
  });

  return issues.slice(0, 1000);
}
