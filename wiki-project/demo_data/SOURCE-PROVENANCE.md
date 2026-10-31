# 主演示样本来源映射清单（SOURCE-PROVENANCE）

> 本清单回应 C 的要求：补齐「原始采集文件/页面快照 + 字段来源映射」。
> 结论先行：主演示 4 个 SKU 中，**服装 2 个为真实采集，板材/紧固件 2 个为合成占位数据**。
> 资料口径统一为「**真实采集、真实性待审核**」——即便有真实 URL，字段值也未经人工逐项复核。

## 一、4 个 SKU 的来源证据链

| SKU | 品类 | 供应商 | 来源 URL | URL 性质 | 字段来源映射 |
| --- | --- | --- | --- | --- | --- |
| 1601053415993 | Men-T-Shirt | Guangzhou Hengdong Sports Goods Co., Ltd. | `…/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html` | ✅ 真实商品页 | ✅ `demo_products_sources.csv` |
| 1601926123092 | Men-Polo | Xiamen Wanhuayuan Cultural Media Co., Ltd. | `…/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html` | ✅ 真实商品页 | ✅ `demo_products_sources.csv` |
| MDF-001 | Board-MDF | Lisen Wood Industrial Shouguang Co., Ltd. | `…/_1600000001.html` | ⚠️ 合成占位符 | ❌ 无 |
| BOLT-001 | Hardware-Fastener | Handan Zhengfan Fasteners Co., Ltd. | `…/_1600000009.html` | ⚠️ 合成占位符 | ❌ 无 |

## 二、真实采集证据（服装 2 SKU）

`demo_products_sources.csv` 是字段来源映射文件（80 行，product_id 为键），
逐字段记录了从商品页抄录的原文（`material_page_raw` / `gsm_page_raw` / `certs_page_raw` /
`price_tiers_cny` / `supplier_company` / `sold_qty` / `conflict_flag` 等），并带冲突标记列。

两个服装 SKU 的关键字段映射：

| SKU | 材质原文 | 克重原文 | 认证原文 | 冲突标记 |
| --- | --- | --- | --- | --- |
| 1601053415993 | `95% cotton 5% spandex` | `180克` | `CE` | NO |
| 1601926123092 | `涤纶 棉`（页面未给比例） | `195克` | （空） | NO |

> 注：Polo 的 `材质` 原文为「涤纶 棉」，页面未标注具体比例——这正是主 CSV 中
> 「混纺比例待供应商确认」标注的事实依据，非数据缺失。

## 三、合成占位数据（板材/紧固件 2 SKU）

MDF-001 与 BOLT-001 的 `来源` 为 `_1600000001.html` / `_1600000009.html` 合成占位符，
**没有对应的真实商品页**，因此：

- **无原始页面快照可补**（采集时即无真实页面）；
- **无字段来源映射**（`demo_products_sources.csv` 仅收录真实 product_id，不含这两个自定义 id）；
- 供应商名称、价格阶梯、规格字段均为**演示用合成值**，真实性**待审核/未建立来源**。

### 合成占位的直接物证：生成脚本

以上结论并非"找不到证据就推说合成"，而是有**生成脚本为直接物证**：

- 脚本：`wiki-project/scripts/demo-tools/add_mdf_bolt.py`
- 该脚本将 MDF / 六角螺栓数据追加进 `catalog_converted.csv`，其中 `source_url` 字段
  全部为 `_1600000001.html` … `_1600000016.html` 这类**编造占位 URL**（真实商品页 URL
  是 13 位数字 product_id，如 `…_1601053415993.html`，而这里是无数字 ID 的 `_160000000X` 假格式）；
- 脚本头注释自述数据来源为「alibaba.com 搜索结果页（2026-10-29 采集）」，
  即**从搜索结果页手工归纳 + 生成占位 URL**，并非从某个具体商品详情页采集；
- 因此 MDF-001 / BOLT-001 的 `来源` 字段无真实页面可指向，与真实采集的服装 2 SKU 分属两层。

> 结论：MDF / BOLT 的"合成占位"性质由生成脚本直接佐证，**证据链闭合**；
> 与服装 2 SKU（有 `demo_products_sources.csv` 字段映射背书）形成清晰对比。

## 四、口径声明

1. 主演示样本**不冒称全部为真实采集**：服装 2 SKU 真实采集、板材/紧固件 2 SKU 合成占位，二者分层标注。
2. 即便真实采集的 SKU，字段值也**未经人工逐项复核**，统一口径「真实采集、真实性待审核」。
3. 采集日期：服装 2026-10-21，板材/紧固件 2026-10-29（占位数据日期无真实采集语义）。

## 五、待补（如实记录，不臆造）

- MDF-001 / BOLT-001 若需升级为「真实可发布」，须提供真实商品页 URL 或采集快照，并在
  `demo_products_sources.csv` 中补来源映射；在补齐前，二者保持「合成占位」标注。
- 服装 2 SKU 的页面快照（截图/HTML 存档）当前**未归档**到资料包。2026-10-31 尝试从真实 URL 直接抓取页面存档时，
  被 Alibaba **登录墙拦截**（返回 `login.alibaba.com` 登录跳转页，而非商品页内容），故无法离线补造页面快照。
  如需存档级证据，须由有登录态的真实浏览器采集，或由采集当时留存快照者提供；在此之前，仅能提供
  `demo_products_sources.csv` 字段级映射作为来源依据，不伪造页面快照。
