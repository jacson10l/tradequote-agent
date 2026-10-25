---
title: B谱系账本适配与P1回执交接
type: interface
status: observed
updated: 2026-10-25
sources:
  - packages/infrastructure/src/index.ts:1
  - packages/infrastructure/src/migration-lineage.ts:1
  - packages/infrastructure/src/migrations.ts:1
  - packages/infrastructure/src/check-lineage-integration.test.ts:1
  - packages/infrastructure/probes/migration-lineage.probe.ts:1
  - packages/contracts/src/knowledge-maintenance.ts:1
  - packages/contracts/src/knowledge-lint-review.test.ts:1
  - wiki-repo:raw/b01-lineage-p1-validation.json:1
  - wiki-repo:raw/b01-lineage-boundary-probe.json:1
---

# B 谱系账本适配与 P1 回执交接

2026-10-25 最新固定状态：已实际读取C 03b16b76ceb336d9f37692ee8b51046e90f328a0的B接收原文、来源审计及A910e626矩阵。M09-L01/L02、M13-Y01/Y02/Y03在后续C复验已关闭，固定A910e626保持107/107，X01～X11及Y10也在已测范围通过；不再等待163f7a4或要求A重修这些已关闭样本。C按原范围接收B121作者自验（HEAD067afc2、A依赖b9a0af7、证据5cdb2b1），本轮C未复跑；原A-W08技术确认与两次100项接收保持。B现于独立codex/b-a910-c03-combination组合A a2b050e（实现910e626）、B7f8afe6、C03b16b7，保留A迁移/B检查与P1/C运行及桌面出口；新九文件及兼容验证另存raw/b-a910-c03-combination-validation.json，不沿用原121作为新结果。完整迁移M/F/J、新组合独立接收、桌面/macOS联合、真实lint存储/人工发布、人员签认和业务验收仍未完成。详见[[B新固定组合与回归范围]]、[[B01-新固定组合回归]]。

以下较早结论保留为对应固定版本的历史，不作为当前等待条件。

2026-10-25 当前固定进度：A 41f0cdc4d2d8db931f00f4c2fc141e4274abf82b已推送，C固定356e4ca7557a3bef67a6898007504e657175655b独立验证X01～X11为11/11通过；当前阻断为M09-L01/L02、M13-Y01/Y02/Y03（扩展矩阵107项中102通过/5失败）。A本地163f7a4修复五项仅为用户转述，尚待取得推送后的固定实现及C复验。B保留5cdb2b15ddb267f9eea8d169a0dbe0c55c56f465、A-W08技术确认、原两次100/100和本轮121/121；121项仅登记为B作者自验，实际代码067afc283dd3026e21b5a443d90e00e9acdbbbc7，A依赖b9a0af76217e57e0ab22ba927de1a1a287b1145f，并非41f0cdc组合。本轮纯状态/材料更正不重跑121项，普通推送独立B分支供C接收，不合入。新A修正到位后在明确固定的新组合验证报告消费事务、旧库重开/幂等与P1回执，另记结果；迁移整体、新组合、macOS联合及人员/业务验收均未完成。详见[[B组合验证准备与固定输入]]及raw/b-combination-fixed-handoff-validation.json。

历史（5cdb2b1准备时的远端观察，已被上述状态取代）：

2026-10-25 B已取得C固定fd2fa2529d2ebc919ca669b16486b0bc87484c89并回读远端，A仍cece332，尚无X10/X11新修复。本轮在独立B分支准备[[B组合验证准备与固定输入]]，保留A-W08技术确认及原两次100/100；现有九文件121/121通过，新增纳入真实消费四处故障回滚的既有测试。此为旧B源码基线回归，未导入新A/C组合，不代表X01～X11、完整M/F/J或macOS桌面通过。报告/消费同事务、失败回滚、旧B7升级两次重开/首份重放及P1完整回执的可执行矩阵和新组合输入条件已列明；迁移整体保持active/WIP，实际签认、人工发布与业务验收分别待完成。证据raw/b-combination-regression-ready.json。

当前迁移进度以[[B对Ca633c428复核与公共契约确认]]顶部为准：已读取C固定abda94e90bf54786937510b802eb5d2479e01412，A cece332e41a230ebbeeaee64eb283b49a5d4fb43的X01～X09已由C全部复验通过，现阻断X10/X11；本页以下初轮失败保留为历史。B后续继续负责同事务、旧库升级重开及P1回执，新组合/macOS与实际人员签认另待。

## 历史：初轮固定输入与结论

用户转交A的迁移方案后，B从f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef在独立B工作树建立codex/b01-lineage-p1-adaptation。依赖A的9cdd13a/a58e970/b9a0af7固定提交，按 [[0029-迁移谱系统一与拒绝边界]] 与 [[A01-迁移谱系支持与拒绝矩阵]] 实施适配；P1取自B已推送的87f05e3/19d60a8，保留原PR#8和其macOS证据。本地2100aa7仅保存A依赖组合WIP，不是合入共同分支或联合批准。

九能力和统一user_version=8、谱系身份和原SQL由A维护。本轮仅对A源码修正严格类型兼容和格式：capabilityId接受lineage/version的Pick、legacyMap使用CapabilityLineage、去掉未用import。九段SQL不改，不新增号位或另建账本；保留executeChecks与executeWiki，C的runStore/AgentRunCoordinator正式组合仍由C接入，不整文件覆盖C实现。

B正常接口/存储适配与P1回执边界已可复跑；A拒绝边界另有四类实际缺口，当前整体为WIP，不能进入正式接线/合并。诊断失败单列，不能以正常单元或构建通过覆盖。

## 报告、消费与迁移账本

新账本以(lineage,version)识别九能力，check-report:7与c-run:7共存，knowledge-wiki:6与c-run:6共存。B不再按user_version=7推断报告就绪，也不自行安装或维护schema_migration。旧B稀疏账本只作为历史事实保留；新增表由A迁移一次性补齐。消费仍使用现有knowledge_consumption的artifact消费者身份，未改成文件导出或新增公共DTO。

executeChecks保持同步CheckResult | CheckListResult，strict输入仅带revisionId；完整KnowledgeCitation包含全部来源。CheckStore/SqliteWikiCheckSource沿用同连接IMMEDIATE事务：报告、消费、两类outbox和首次成功幂等一起提交或全部回滚，无await。来源冲突为SOURCE_CONFLICT，真实SQL/损坏为STORAGE_ERROR；启动MigrationLineageError不伪装为检查成功，正式宿主错误分派仍由C完成。

新增check-lineage-integration.test.ts在实际旧B7六步schema与旧账本上，通过现有TradeStore/Wiki服务/CheckStore生成合成报价、多来源报告和消费，再经正式repository升级到8。逐表比较所有原行（包含JSON/hash/消费/来源/报价/幂等/outbox/旧账本），连续两次重开并同键重放首份报告，原行保持一致。fixture先生成旧业务事实再执行新迁移，没有把新库降版本伪装旧库。合成lifecycle直接提升仍是fixture，不是人工发布。

migrations.test.ts改为A方案的实际SQLite输入：empty、共同1/2/3、A01b4、C5/6/7、A6、B7共十种输入分别升级并重入；核对九个(lineage,version,sql_hash)和applied_at重入不变、历史workspace行保持。首装/C6坏SQL注入整体回滚后可重试；缺触发器、缺索引、高版本、旧/新账本错误hash在migrate层拒绝。它们不是C的实际run数据、断电恢复或macOS桌面验收。

## P1 lint 回执可用接口

公共出口已包含KnowledgeLintReportSchema、KnowledgeMaintenanceCommandSchema/ResultSchema和KnowledgeMaintenanceService；wiki.lint使用strict写封套、WikiReviewBinding与expectedLifecycleVersion，wiki.getLintReport按reportId读取。七类检查必须完整，partial/failed回执为unknown，完成且有block为blocked，只有完整无阻断才passed。报告身份reportId=receiptId，绑定workspace/revision/contentHash/sourceSetHash/policyVersion/checkedAt。

本轮新增公共KnowledgeLintReviewExchangeSchema，输入{report,review}直接复用P1完整报告与P0 WikiReviewDecision，逐字段验证完整receipt一致（含策略版本/检查时点），approve必须completed/passed。没有新增renderer命令或让renderer自造可信报告。P0审核schema本身仍保持兼容；A在服务内载入真实已存报告后调用该校验，并在提交前验证工作区权限、来源资格、生命周期OCC及审核时序。此校验只证明输入一致性，不能证明数据库已保存、人员实际批准或来源现实有效。

A的接入顺序：宿主执行并保存lint完整报告与幂等/outbox → 按lintReceiptId载入报告 → 使用P0绑定与本Exchange校验 → 人工human_ui执行审核/发布事务。B交付协议和反例；A仍需实现lint执行/存储及人工review/publish入口，C负责受控桌面桥接。不能把已有P1协议等同A01d/e服务已运行，也不应继续因“未取得P1类型”等待编号方案。

新反例覆盖receiptId、workspace/revision/contentHash/sourceSetHash、policyVersion、checkedAt替换，以及partial拒绝可记录但不可批准。既有P1整理/维护15个方法仍合法CAPABILITY_UNAVAILABLE、非法VALIDATION_ERROR且不发IPC；原Agent/Runtime/Worker/模型工具白名单不扩大，正式旧知识/报价兼容保留。

## 交回 A 的拒绝边界问题

实际原命令：ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run --config packages/infrastructure/probes/vitest.config.ts。测试配置显式独立，正常单元不会包含.probe.ts，结果和阻塞单列保留。七项中两项通过、五项失败，分为四类问题：

| 问题 | 实际观察 | 与A设计不符之处／A待修订 |
|---|---|---|
| 同名空触发器 | quote_check_report_no_delete替换成同名SELECT 1后migrate无异常 | 当前仅核对对象名称；必须核对实际保护语义/结构，不能把名字相同当不可变保护存在 |
| 旧账本声称不存在的能力 | 实际C6、旧账本写A6正确hash后migrate接受并升8 | hash正确不代表对应能力已执行；需把每条旧登记与实际present能力交叉核对，保留矛盾历史并拒绝 |
| 未知旧账本版本 | 统一库附version99未知旧条目后migrate接受 | verifyLegacyLedger遇未知号位continue；按固定支持/拒绝边界应拒绝未知登记，不能忽略 |
| 新账本预检遗漏 | 改check-report:7的registry hash后identify无异常；repository随后抛tampered，但原文件字节已变 | 新账本hash仅在读写真开/WAL之后核对；需在只读预检校验完整登记，再由写事务复核，满足“拒绝不改物理文件” |

前两项旧负向（未知v6、缺报告不可变触发器）现已拒绝，旧红色证据不覆盖；新结果保存raw/b01-lineage-boundary-probe.json。该文件schemaUnchanged在disk用例表示数据库字节保持，非仅sqlite_master比较；disk用例实测false。未使用真实用户库，未替A改识别策略/历史账本。A修订固定提交后B复跑同一负向命令，C再独立复验全矩阵及桌面。

## 验证和交付边界

2026-10-23 后续独立推进（本次基线 99ba7de97fd25f0843ccf63acfb8f97c374137f3）：P1 新增 KnowledgeLintReviewInputExchangeSchema，为 A 的已有审核 payload 提供载入报告后的前置一致性校验，最终决定仍用原完整 receipt Exchange；未改旧请求 DTO、mock、preload 或新增 IPC。B 报告端在 prepare 后、写入/register 前绑定宿主 reportId/checkedAt 与当前报价根/版本，错误为 SOURCE_CONFLICT。两项接口适配在原独立 B 工作树继续，不等待人工发布或业务验收，也不将它们标为完成。新增用法与反例见 [[B00a知识整理与维护协议]]、[[B规则检查实现]]。

本次 fetch 观察 A 远端仍 b9a0af7，C 新头 6f9287b 的独立前置验证也报告 changes_required；没有新的 A 固定修复供复验。原七项负向探针仍是上次实测 2/7，不把本次正常回归代替其修复。本次未运行该会写旧证据文件的探针，迁移源码与 99ba7de 字节一致；不复制 C 的代码或代签其验证。

实际命令、退出码、首次失败与修正后输出见raw/b01-lineage-p1-validation.json，所有旧A/B/P1证据逐字节保留。正常聚焦、类型、构建、工程和Wiki按本轮实际执行补记；旧Windows symlink EPERM如实保留。构建成功不代表Electron桌面行为通过，macOS、新组合C运行数据、人审发布、非作者整体接收与业务验收未执行。

原P1 PR#8仅作为协议来源；本分支未合入共同分支、未改PR状态、未代A/C签认、未发送外部消息、未调用真实模型。下一步A修四类边界，B在新固定提交复验，C先迁移后桌面。

本轮最终实测：95/95相关测试，typecheck/build/check通过；全量230/231及Wiki34/36剩余原Windows symlink EPERM，工程中macOS专用项1项跳过。最终显式负向2/7，五项失败仍阻塞接受。f2dfa5f任务基线和真实共同654fecc同步通过。raw/b01-lineage-p1-preservation.json记录B91/A78/P1 81份历史raw字节保持、日志非空行保持、九段SQL指纹一致与已测源码hash；未修改生产报告/消费/报价算法。记录中保留首轮Node测试依赖违规、临时运行器Path错误等失败及修正结果，不归为产品失败或删除。

关联：[[B01-谱系账本适配与P1回执]]、[[B00a知识整理与维护协议]]、[[B规则检查实现]]、[[A01-迁移验证计划]]。

## 2026-10-24 接收 C20891fb 与 A-W08

新固定C20891fb/A9225526已取得，上文“未有新固定A修复”仅为2026-10-23历史状态。C独立报告原12项和N07～N11通过、M13有效约束四项失败；本次只读取证据，未将A9225526导入本B分支，不以旧A b9a0af7正常测试证明新组合。A-W08源于A公共failure()仍把能力不可用设为true，B330bff7已有false修正；新增公共调用方回归，A表达式受控复现后恢复，相关8文件111项及类型/构建通过。报告/消费与P1已有本地适配一并回归，不重复声称尚未开发，也不宣称已被C接收。新证据与最小修正入口见[[B对C20891fb复核与AW08语义回复]]。


## 2026-10-24 C第三轮接收

C固定a633c428/A65885ff已接收，B确认A-W08公共语义正确，并在既有8043afb源码上复跑报告/消费/P1等八文件100项。此本地适配仍依赖旧A b9a0af7，未与新A/C组合，不把回归解释为联合矩阵通过。C原M13四例关闭、五个变体X05～X09仍失败；A修复及C新组合/macOS验收保持待完成。详见[[B对Ca633c428复核与公共契约确认]]。


## 历史进度同步：当时C本地abda94e

2026-10-24 最新迁移进度（用户转述C本地abda94e，尚未推送）：C已接收并核对B固定b80ad4329e7a72f4990aea89eced0536d6ebba1d的Wiki、两次Windows八文件100/100、门禁、源码范围与引用hash，A-W08的CAPABILITY_UNAVAILABLE/retryable=false技术确认已登记，实际人员签认另待。M13-X01～X09已在A cece332上由C独立复验全部通过；当前阻断为X10（字符串RAISE误认保护函数）和X11（WHERE字符串大小写归一化误判），由A修正后C复验。B的100/100仅覆盖8043afb代码基线上的Windows回归，本轮不重跑，不外推新A/B/C组合或macOS桌面验收。B后续负责报告/消费同事务、旧库升级重开与P1回执边界，保留A迁移修正、C运行/桌面和B检查/P1公共出口。详情[[B对Ca633c428复核与公共契约确认]]、[[B01-谱系账本适配与P1回执]]；整体保持active/WIP，不合入、不代签、不自动发送或真实模型复测。

本次仅据用户转述更新，C本地记录未推送，B未读取新原始证据；历轮X05～X09失败保留为历史。B后续在新组合核对同事务提交/回滚、旧库升级重开/首份重放及P1报告到审核的完整回执边界，不以8043afb的Windows100项代替。参见[[B对Ca633c428复核与公共契约确认]]。


## 当前固定来源：C abda94e90bf54786937510b802eb5d2479e01412

来源已核对：B通过git fetch取得完整C提交abda94e90bf54786937510b802eb5d2479e01412并实际读取其[复核Wiki](https://github.com/jacson10l/tradequote-agent/blob/abda94e90bf54786937510b802eb5d2479e01412/wiki-project/wiki/Acece332迁移复验与B契约材料接收.md)、[X10/X11失败证据](https://github.com/jacson10l/tradequote-agent/blob/abda94e90bf54786937510b802eb5d2479e01412/wiki-project/raw/c-a-lineage-fourth-m13-extra.json)和[B材料接收记录](https://github.com/jacson10l/tradequote-agent/blob/abda94e90bf54786937510b802eb5d2479e01412/wiki-project/raw/c-b-third-feedback-intake.json)；另读取[九例复验原证据](https://github.com/jacson10l/tradequote-agent/blob/abda94e90bf54786937510b802eb5d2479e01412/wiki-project/raw/c-a-lineage-fourth-m13.json)，确认A完整基线cece332e41a230ebbeeaee64eb283b49a5d4fb43、X01～X09的9/9通过与X10/X11的0/2失败。读取固定C材料不等于B重跑C脚本，也不等于新组合或整体通过。原3256c74中“用户转述/未推送/未取得对象”是更新前的历史状态，原始状态同步JSON、旧raw和追加日志保留。

B已比对C所列B材料及八份源码/两次Windows100项输出hash；X10/X11待A修/C验，后续同事务/旧库重开/P1回执责任保持。新核对证据见raw/b-c-abda94e-fixed-source-validation.json，原状态与失败证据不改；详见[[B对Ca633c428复核与公共契约确认]]。
