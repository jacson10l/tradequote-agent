# 主演示样本来源映射清单（SOURCE-PROVENANCE）

> 本清单回应 C 的要求：补齐「原始采集文件/页面快照 + 字段来源映射」。
> 结论先行：主演示 4 个 SKU 全部为真实采集——服装 2 个、板材 1 个、紧固件 1 个（2026-10-31 截图）。备用全量目录 `catalog_converted.csv` 中板材 6 个、紧固件 7 个 SKU 亦均为真实采集。
> 资料口径统一为「**真实采集、真实性待审核**」——即便有真实 URL，字段值也未经人工逐项复核。

## 一、4 个 SKU 的来源证据链

| SKU | 品类 | 供应商 | 来源 URL | URL 性质 | 字段来源映射 |
| --- | --- | --- | --- | --- | --- |
| 1601053415993 | Men-T-Shirt | Guangzhou Hengdong Sports Goods Co., Ltd. | `…/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html` | ✅ 真实商品页 | ✅ `demo_products_sources.csv` |
| 1601926123092 | Men-Polo | Xiamen Wanhuayuan Cultural Media Co., Ltd. | `…/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html` | ✅ 真实商品页 | ✅ `demo_products_sources.csv` |
| 1601359234640 | Board-MDF | Linyi Chanta International Trading Co., Ltd. | `…/Good-Price-Exporter-Gloss-Mdf-Board_1601359234640.html` | ✅ 真实商品页（2026-10-31 截图） | ✅ [MDF 采集记录](source-archive/MDF-REAL-DATA.md) |
| 1600593893760 | Hardware-Fastener | Taizhou Fengye Metal Products Co., Ltd. | `…/Fastener-Product-Din933-Hex-Bolt-M6_1600593893760.html` | ✅ 真实商品页（2026-10-31 截图） | ✅ [BOLT 采集记录](source-archive/BOLT-REAL-DATA.md) |

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

## 三、合成占位数据的清理（MDF 与 BOLT 均已替换为真实采集）

板材（MDF）与紧固件（BOLT）原为合成占位数据，2026-10-31 已由阿里国际站真实商品页截图**全部替换为真实采集**：
- 板材证据链见 [MDF 采集记录](source-archive/MDF-REAL-DATA.md)（6 个真实 product_id 与截图归档）；
- 紧固件证据链见 [BOLT 采集记录](source-archive/BOLT-REAL-DATA.md)（7 个真实 product_id 与截图归档）。

原 `MDF-001`~`MDF-008`、`BOLT-001`~`BOLT-008` 的 `来源` 均为 `_1600000001.html`…`_1600000016.html` 合成占位符，
现已全部替换，无残留。

### 合成占位的历史物证：生成脚本

原合成占位数据并非"找不到证据就推说合成"，而是有**生成脚本为直接物证**：

- 脚本：`wiki-project/scripts/demo-tools/add_mdf_bolt.py`
- 该脚本将 MDF / 六角螺栓数据追加进 `catalog_converted.csv`，其中 `source_url` 字段
  全部为 `_1600000001.html` … `_1600000016.html` 这类**编造占位 URL**（真实商品页 URL
  是 13 位数字 product_id，如 `…_1601053415993.html`，而这里是无数字 ID 的 `_160000000X` 假格式）；
- 脚本头注释自述数据来源为「alibaba.com 搜索结果页（2026-10-29 采集）」，
  即**从搜索结果页手工归纳 + 生成占位 URL**，并非从某个具体商品详情页采集。
- 该脚本保留原样作为历史物证，未改。

> 结论：MDF 与 BOLT 的"合成占位"性质由生成脚本直接佐证，**证据链闭合**；
> 现已由真实截图替换，与服装 2 SKU 同属真实采集层。

## 四、口径声明

1. 主演示 4 个 SKU **均为真实采集**：服装 2 SKU（2026-10-21）、板材 1 SKU（2026-10-31 截图）、紧固件 1 SKU（2026-10-31 截图）；备用全量目录中板材 6 SKU、紧固件 7 SKU 亦均真实采集。
2. 即便真实采集的 SKU，字段值也**未经人工逐项复核**，统一口径「真实采集、真实性待审核」。
3. 采集日期：服装 2026-10-21，板材/紧固件 2026-10-31（真实截图采集）。

## 五、待补（如实记录，不臆造）

- 板材 MDF 6 个、紧固件 BOLT 7 个 SKU 的字段值来自截图，已归档至 `source-archive/`，但**未逐项人工复核**，仍标注「真实采集、真实性待审核」。
- 紧固件中 1 个 product_id 为 11 位（`62245798159`，316 六角螺栓，阿里站原样即为 11 位），按截图原样记录，未臆造补齐；其余 6 个紧固件 product_id 均为完整 13 位。
- 服装 2 SKU 的页面快照（截图/HTML 存档）当前**未归档**到资料包。2026-10-31 尝试从真实 URL 直接抓取页面存档时，
  被 Alibaba **登录墙拦截**（返回 `login.alibaba.com` 登录跳转页，而非商品页内容），故无法离线补造页面快照。
  如需存档级证据，须由有登录态的真实浏览器采集，或由采集当时留存快照者提供；在此之前，仅能提供
  `demo_products_sources.csv` 字段级映射作为来源依据，不伪造页面快照。

## 六、平台权威来源（规则与跨境供应链）

商品采集所依据的阿里国际站平台规则与跨境供应链服务入口（均为可访问的官方页面，2026-10-31 核验）：

- 阿里国际站平台规则（规则中心）：https://rulechannel.alibaba.com/icbu
  - 含商品召回规则、禁限售规则、类目资质准入、限售规则等；商品页字段合规口径据此制定。
- 阿里国际站跨境供应链（OneTouch / 一达通）：https://onetouch.alibaba.com/
  - 含订单洽谈、支付结算、跨境物流、数智报关、财税服务、信用保障（Trade Assurance）、超级信用证、生意贷等外贸履约服务。
