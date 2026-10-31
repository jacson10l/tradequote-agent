---
title: C06下一轮ABC任务书
type: process
status: active
updated: 2026-10-31
sources:
  - conversation:用户要求结合A新回复整理下一轮ABC可执行任务并由C先做独立准备暂不合入集成
  - packages/contracts/src/runs.ts:1
  - packages/domain/src/trade.ts:1
  - tests/e2e/codex-workbench.spec.ts:1
  - wiki-repo:raw/c06-a-intake.json:1
---

# C06 下一轮 A/B/C 任务书

目标：在已实际接入的Codex工作台基础上补齐来源与条款语义，再验证真实业务闭环。金额仍由确定性业务工具计算；用户从工作台提目标，不按长表单逐项串流程。白色任务面板/输入区、暖色用户消息、常驻橙框保持。

技术：Electron44.9.2、React、TypeScript strict、SQLite、Node22.22.0、pnpm10.13.1；macOS优先。每人独立分支/工作树，本轮不合入codex/m1-foundation。不创建消息或代人员签认。

## 固定输入与 A 新回复的接收结论

- C已共享候选：1d140ed2003ccee7a45c23b25417b174753e3d2f；业务实现/535单元/12Electron/36Wiki证据固定在d62570a3c91890cc2aeb7ed8f971b275aaeac713，后续样式证据独立。
- A固定材料：codex/a01-maintenance-evidence的5c69b708ea796addd39493e4daaded66b9955c08。C实际ls-remote/fetch并只读Git blob核对：该提交仅改SOURCE-PROVENANCE、file-provenance与log三文件，来源说明登记hash=e5148a23f45a3fb4a35100f45968bf5707125eeb82f9a5e88d7bf918198d27c9，与固定blob一致。
- 80行/80个product_id字段映射存在，1601053415993在CSV第7行，1601926123092在第18行。Polo认证/销量为空；空值是未知，不能表示“已核实没有”。CSV是转录映射，尚不能独立证明原页面事实。
- 服装快照仍未提供；登录墙是A报告，C未重新联网采集或登录。不能用登录跳转页充当商品快照，也不能将今天的快照冒充2026-10-21原始采集。新采集必须记录新时间/版本及差异。
- MDF/BOLT合成分类有A明确说明和硬编码生成脚本支持；不以URL长度推导真假。脚本汇率/面积/估重注释是生成过程，非真实供应商确认。
- A回复同时称“lint干净”并列出失败项；本轮接收口径为“来源文件hash已核对，整支lint仍报告失败，预存归因待A提供基线对照”。不接收“完整证据链已闭合/已可交易”的结论，不关闭A-01/A-02。
- C只取只读审计摘要raw/c06-a-intake.json，不合并A维护分支、不运行其生成脚本，不导入来源未知资料到正式库。商品页当前内容/URL有效性未由C验证。

## 分工、依赖与完成门槛

| 任务 | 可立即执行 | 等待条件 | 交付与验收 |
|---|---|---|---|
| [[A06-来源证据与适用规则包]] | 整理固定资料、空字段、采集/生成边界和发布状态；提供清洁数据文档包 | 新快照需来源持有人/已登录人工采集；规则语义与B对齐；若需公共字段扩展先B契约 | 文件hash/版本/字段定位/审核与发布撤回事实齐全；缺原件仍待审核；无适用规则仍pending；不混入维护功能代码 |
| [[B06-条款确认与运行契约复核]] | 复现非空“未确认”丢pending；冻结显式确认语义；按C固定blob复核RunClient | 若确需DDL由A登记迁移；最终来源适用语义需A规则包 | 公共schema/领域/持久化/调用方/mock/测试一致；旧快照不变；新版本/检查/回复待确认一致；B本人给契约意见 |
| [[C06-独立准备与组合验收]] | 固定A只读审计、B契约审阅包、验收矩阵；修过期原生验收定位；本机基线回归 | 来源端到端依赖A包；条款/旧数据兼容依赖B实现及A迁移确认 | 先交独立准备证据；收到固定SHA后隔离组合、macOS与Computer Use复验；不另写条款关键词或资料库 |

建议顺序：A来源清单与B确认契约并行 → B冻结公共变更/迁移需求 → A/B各自交固定小切片 → C逐个核对、显式隔离组合 → 完整业务验收。只收到A说明时可审计来源，不能宣称B已修复或组合通过。C不等待上述完成才开始准备。

## 开工步骤与文件责任

- [ ] A/B各自先确认干净工作树，fetch C共享候选，核对完整1d140ed SHA，在独立工作树从该明确候选建立codex/a06-source-evidence或codex/b06-confirmation-contract。该基线尚未合入集成，不隐瞒此依赖。记录本人实际taskBase/环境；若另选基线，列出与该候选兼容关系并由C再验证。
- [ ] A从固定5c69b70按文件白名单准备资料包，不把整个维护分支cherry-pick到新基线。交付清单见A任务；目录demo_data为历史工程路径，不在产品界面恢复demo字样。
- [ ] B先在packages/domain/src/trade.test.ts和packages/contracts/src/trade.ts相关契约测试写失败反例；运行失败留证，再实现最小状态改动。字段名称/向前兼容由B正式确定，C不预设DTO副本。定位packages/domain/src/trade.ts、packages/infrastructure/src/quote-draft-plan.ts、trade-store.ts、contracts/trade.ts及runs.ts；桥接主入口apps/desktop/src/main/index.ts、preload/index.ts由C协调。
- [ ] A/B影响同一公开文件时先记录所有权与预期变更，B维护公共契约、A维护迁移谱系。无迁移需求要明确说明原因，不凭编号预占DDL。
- [ ] 每人代码/Wiki同批；知识页写实际行为，任务页附命令/退出码，log追加；新增源码映射并生成。pnpm typecheck、适用单元/桌面、build、check、wiki:generate、wiki:check、wiki:sync --base本人真实taskBase、git diff --check；维护工具/覆盖改动再wiki:test。没有绿灯不能用“历史失败”替代；确有旧失败保留红色并给固定基线对照，未修复前不宣称全通过。
- [ ] 交付给C：作者/分支、完整材料SHA、实际验证源码SHA/清单hash、变更文件白名单、接口/数据/迁移影响、实际命令退出码、知识/任务/证据路径、未完项。提供本机证据，非作者/人员评审独立记录。只有本地材料时明确未推送，不编造远端状态。

## C验收矩阵与证据要求

| 用例 | 前置 | 从工作台执行与判定 |
|---|---|---|
| Q01 基线报价 | 明确隔离合成资料；现有能力即可 | “根据询盘报价，数量未知请追问”→真实工具查询→补数量→确定性核价/保存；原澄清仅成功后resolved，保留问题/答案与提交凭据 |
| Q02 修改与差异 | 同一报价已有V1 | “数量改为500，比较变化”→只新增一版、重检、新旧数量/单价/金额/待确认差异；旧报价/检查/回复产出不回写 |
| Q03 条款确认 | B新契约/实现 | 空白、未知、未确认、待客户确认都不能因非空消失；明确人工确认才按新契约收口；失败/取消不改确认事实。旧JSON读取/新JSON对旧二进制边界明确 |
| Q04 来源追溯 | A固定资料/发布事实，必要B契约 | 从商品/金额工具结果追到文件hash/版本/行或页面定位；缺快照显示其真实限制，不升级真实性；MDF/BOLT保持合成、无覆盖规则保持待核实 |
| Q05 只读 | 明确隔离业务库 | 查询并试算120件→工具依据和金额；trade报价/版本/报告完整快照前后相等；允许单独运行账本变化；停止先落状态、晚到结果忽略 |
| Q06 恢复与幂等 | 原运行/保存库 | 运行中退出重开→interrupted且不自动请求；显式重试新attempt；完成结果重开可见；重复补充/控制不重复保存，旧分支不能越过替代任务 |
| Q07 配置与业务文案 | 无配置/有保存配置分别验证 | 无保存配置拒绝、不回退本机；有配置走实际harness。日常界面无内核标签/演示默认值；两角色清晰、过程折叠；配色不再改 |

每例记录：应用源码SHA、资料/规则hash、环境、命令或Computer Use操作、runId/attempt、quoteId/version、工具名与关键结果、前后持久状态、实际截图/结果摘要。合成替身验证与真实供应商分列；只证实当前保存deepseek-flash及macOS，不泛化所有模型或Windows/签名包。收费真实模型仍走显式入口，不因文档检查自动执行。

## 本轮C准备与后续边界

准备分支codex/c06-abc-readiness，真实基线1d140ed2003ccee7a45c23b25417b174753e3d2f。raw/c06-a-intake.json为A证据审计；raw/c06-contract-review-packet.json冻结B可审阅文件及hash，不代表B已认可。

原tests/e2e/codex-workbench.spec.ts依赖已不存在的“未保存新版本”回复，且按用户article寻找兄弟助手中的停止按钮。现改为在同一个conversation-turn核对120件1080 USD/已完成、完整trade快照前后相等，取消也按会话容器定位。生产界面/契约/金额/数据库无改动。未通过真实模型重新执行该专项时只能标“已适配/待live复跑”，普通fixture/类型通过不能冒称该专项成功。实际检查见本轮任务与raw/c06-preparation-validation.json。

当前仅准备交付；Q03/Q04完整验收依赖A/B，整体active；不合入集成，不代签，不发送团队消息。旧来源/运行/验证证据不删除。
