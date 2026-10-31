---
title: A黑客松演示资料收口
type: module
status: active
updated: 2026-10-31
sources:
  - conversation:用户要求A完成黑客松演示资料最终收口（复核冻结清单、明确来源性质、明确知识发布状态）
  - wiki-repo:wiki/黑客松演示封板目标与ABC分工.md:1
  - wiki-repo:wiki/C黑客松整场彩排与恢复.md:1
  - wiki-project/demo_data/catalog_demo.csv:1
  - wiki-repo:wiki/M2真实报价V1.md:1
---

# A 黑客松演示资料收口

A 侧对黑客松演示资料做最终收口：复核 C 冻结的主演示样本、明确资料来源性质（采集/合成/未核实）、明确正式知识发布状态。维护证据修复继续按 B 的 `cdf3342` 政策推进，但不作为本次演示前置；维护入口保持关闭。

## 一、主演示冻结清单复核（通过）

对照 C 固定提交 `2c043834b78e9803df17f5113c5605dcc0258971` 中的 `catalog_demo.csv`，逐项核验如下，**未发现错误，冻结样本可上台**。

| 项 | 复核结果 |
|---|---|
| 数据行数 / SKU 数 | 14 数据行、4 SKU ✅ |
| 主演示 SKU | `1601053415993`（Men-T-Shirt）✅ |
| 币种 | CNY（主演示）／USD（不参与混币合计）✅ |
| 单位 | piece（CNY 服装）／m²（MDF）／kg（BOLT）✅ |
| 阶梯价（1601053415993） | 3→43.19、50→41.20、100→39.21、500→37.21 ✅ |
| V1 金额 | 100 × 39.21 = **3921.00 CNY** ✅ |
| V2/V3 金额 | 500 × 37.21 = **18605.00 CNY** ✅ |
| 有效期 | 全部 `2027-12-31` ✅ |
| 说明字段 | 每行 description 末尾固定「供应商/来源(URL)/采集日期」三段 ✅ |
| 字节一致性 | C 的 CSV 与 A 固定提交 `035e5f8` 逐字一致（SHA-256 相同）✅ |

SHA-256（`catalog_demo.csv`）：`7c13afc110c1cd7a6e31eb0ef94f6c0acd08b164b2a9669e9aee11bc9f4bf89b`

金额核算经 decimal 字符串独立验证：`100 × 39.21 = 3921.00`、`500 × 37.21 = 18605.00`，与 C 彩排证据 `raw/c-hackathon-rehearsal.json` 中 V1/V2/V3 检查点一致。USD 商品（MDF-001、BOLT-001）不参与混币合计、不做汇率换算，符合冻结约定。

## 二、资料来源性质（三类区分）

演示资料**全部为合成（synthetic）性质**，不是真实供应商事实。仅存在于 CSV 中的供应商名称、URL、认证、价格、有效期**不能视为真实**。具体三类：

### 1. 采集内容（引用真实权威来源的原文，但仍非"已发布知识"）

`demo_check_rules.csv` 中 `source_type=OFFICIAL_VERIFIED` 的 10 条规则，其 `source_quote` 为真实法规/官方原文摘录，来源为真实公开 URL：

- 欧盟纺织品纤维标注法规 **Reg (EU) 1007/2011**（R-EU-100 / R-EU-MULTI / R-EU-NAME / R-EU-LANG / R-EU-TOL / R-EU-SCOPE / R-EU-MISLEAD，7 条）
- 美国 trade.gov「Know Your Incoterms」官方说明（R-CT-PLACE / R-CT-VER / R-CT-NOCOVER，3 条）

**边界**：这些是 A 采集的法规/官方原文摘录，可追溯（有 URL 与条款号），但**尚未经人工审核发布为正式平台知识**（见第三节）。演示中它们是"合成规则投影"的输入，不是"平台已发布规则"。

### 2. 合成内容（团队自定/演示专用，非外部事实）

- `demo_check_rules.csv` 中 `source_type=TEAM_TEMPLATE` 的 6 条（R-IN-PAYSUM / R-IN-VALID / R-IN-MARGIN / R-IN-EVID / R-CU-CLAIM / R-CU-DE-FORMAL）：团队自定内部模板/禁用词表/商务写作约定，**非法规来源**。
- `catalog_demo.csv` 全部 14 行：供应商名称、URL、价格、阶梯、采集日期均为合成，`sourceStatus=synthetic`。
- `demo_inquiry_samples.csv` 10 条 RFQ：标题/数量/原文为"页面抄录"样式的合成样本，`annotation_basis` 已标注。

### 3. 未核实声明（待导入/未建模，演示中如实标识）

- `demo_check_rules.csv` 中 `source_type=NOT_MODELLED_YET` 的 2 条（R-PL-RFQ、R-PL-AMZ）：平台政策**尚未导入官方规则文档建模**，当前仅做结构提示，**不声称覆盖平台规则**。

### 结论

演示导入时明确选择"合成资料性质"；供应商、URL、认证、价格、有效期一律**不因存在于 CSV 而视为真实**。规则机制（阻断/提醒/固定来源引用）是可演示的，但**不证明正式平台规则或人工知识发布已经完成**。

## 三、正式知识发布状态（未完成，演示继续用合成投影）

当前彩排规则来自**离线合成已发布投影（seedPublished）**，**不构成人工审核/发布完成**。逐一说明：

| 资料/能力 | 是否已人工发布 | 说明 |
|---|---|---|
| `catalog_demo.csv` 目录 | ❌ 未发布 | 以合成资料导入，仅人工点击"确认发布"到本地演示库，非正式知识发布 |
| `demo_check_rules.csv` 规则 | ❌ 未发布 | 合成投影（seedPublished），非人工审核通过的正式平台规则 |
| A01b 人工审核发布入口 | ⚠️ 已实现、未实际发布 | `SqliteKnowledgeStore`/`createKnowledgeService` 已落地，但 review/publish/withdraw 仍返回 `CAPABILITY_UNAVAILABLE` 或未有真实人工发布动作 |
| 正式审批/导出入口 | ❌ 未完成 | 所有报价固定 draft，无可调用的最终审批/导出入口（见 [[M2真实报价V1]]） |
| 完整知识维护 | ❌ 未完成 | 维护入口保持关闭，13 项失败断言不进入演示路径 |

**演示应对策略**：继续使用明确标识为"合成"的规则投影与目录，UI 与演示脚本中如实标注"未审核/合成资料/未核实声明"，不冒称人工发布、正式审批或商业合规已完成。

## 四、交付物与固定 SHA

| 项 | 值 |
|---|---|
| 本收口分支 | `codex/a-hackathon-closeout` |
| 基线（C 固定提交） | `2c043834b78e9803df17f5113c5605dcc0258971` |
| 主演示 CSV SHA-256 | `7c13afc110c1cd7a6e31eb0ef94f6c0acd08b164b2a9669e9aee11bc9f4bf89b` |
| A 完整资料包固定提交 | `035e5f802d9dd1ec4e73ddf0ae3754b65e8b0c37` |

A 的完整资料包（11 文件：`catalog_demo.csv`、`catalog_converted.csv` 300 行备用、`demo_check_rules.csv` 19 条、`demo_inquiry_samples.csv` 10 条、`demo_products/demo_price_tiers` 等）保留在 A 分支 `035e5f8`，未被删除。C 的演示分支仅带主样本 `catalog_demo.csv` + `C-FROZEN-MANIFEST.md`，属有意裁剪（演示只跑 14 行主链），两者不冲突。

## 五、剩余问题（如实记录）

1. **正式知识发布未完成**：A01b 入口已实现但无真实人工发布动作；彩排依赖合成投影，人工审核/发布/业务签认仍待 A/B 完成，演示不冒称完成。
2. **维护证据修复未收口**：按 B `cdf3342` 政策推进中，事件证据三类（`source.validity_confirmed` / `source.integrity_reverified` / `issue.review_decision`）无持久化事实、`source_withdrawn` 矩阵 source 目标仅可 dismiss，待 B 确认；不影响本次演示，维护入口保持关闭。
3. **规则来源性质边界**：OFFICIAL_VERIFIED 规则虽引用真实法规原文，但未经人工审核发布；TEAM_TEMPLATE / NOT_MODELLED_YET 规则为自定/未建模，演示须如实标识。
4. **跨平台**：C 彩排证据为 macOS arm64；Windows 未验证，不冒称通过。

关联：[[黑客松演示封板目标与ABC分工]]、[[C黑客松整场彩排与恢复]]、[[M2真实报价V1]]、[[A01-知识发布与来源查询]]。A 的完整资料包冻结页「A01f演示资料包冻结」在 A 的 `codex/a01e-p3-fixes` 分支（提交 `a03fd92`），未纳入本收口分支；其内容已由本页第二节自包含承接。
