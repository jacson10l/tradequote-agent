---
title: Wiki 工作流与任务记录
type: meta
status: active
updated: 2026-10-25
sources:
  - wiki-repo:scripts/build-code-index.mjs:1
  - wiki-repo:scripts/lint-wiki.mjs:1
  - wiki-repo:raw/source-manifest.md:1
---

# Wiki 工作流与任务记录

本次分支收口将B00与C01a覆盖映射按有效源码并集合并，保留停用workflow的删除，重新生成清单；日志按来源追加、raw非生成证据逐文件核对字节。CONTEXT仅保留最新状态，旧失败和阶段事实保留在原任务/log/raw。组合验证与清理流程见 [[分支收口与共同基线]]、[[2026-10-21-分支收口与集成验收]]，未修改维护脚本算法。

## P0 强制交付条件

用户明确要求所有成员编码完成后必须记录工程 Wiki，优先级为项目内最高。作者在同一交付中更新关联知识页正文、任务页和追加日志；重要决定写 ADR，状态与下一步变化更新 CONTEXT。评审者核对内容与实现一致。缺记录或门禁失败即未完成，不标 done、不合并；不能只改日期或重新生成快照。

新增 `check-wiki-sync.mjs` 对基线之后的提交、未提交及未跟踪代码检查：每个变更源文件至少关联一个正文发生变化的知识页，同时有任务更新和末尾追加日志；删除文件使用基线覆盖映射。Wiki 维护脚本变更必须更新本工作流页。当前日期/元数据或仅空白改动不计作正文更新。

```sh
node wiki-project/scripts/check-wiki-sync.mjs . --base <本次改动基线>
node --test wiki-project/scripts/wiki-tools.test.mjs wiki-project/scripts/wiki-sync.test.mjs
```

用户最新决定仅本机验收，仓库Actions关闭且本分支移除wiki.yml/engineering.yml，不设置Actions必需检查。PR清单在 `.github/pull_request_template.md`，全员规则见 [CONTRIBUTING](../../CONTRIBUTING.md)。生成、只读check/lint、维护回归与真实基线sync由作者本机执行，评审者核对证据与正文；脚本仍只检查结构性同步，语义真实性由作者和评审者负责。

本轮实施任务：[[2026-10-21-Wiki强制同步规则]]。

## 日常维护

维护只使用 Node 标准库，不依赖应用 node_modules。命令从项目根目录执行，也可把 `.` 换成任意项目绝对路径；项目配置及生成物位于该根目录内。

```sh
node wiki-project/scripts/build-code-index.mjs . --ingest
node wiki-project/scripts/build-code-index.mjs .
node wiki-project/scripts/build-code-index.mjs . --check
node wiki-project/scripts/lint-wiki.mjs .
node --test wiki-project/scripts/wiki-tools.test.mjs
node --check wiki-project/scripts/build-code-index.mjs
node --check wiki-project/scripts/lint-wiki.mjs
```

首次或需要新采集观察时显式 `--ingest`，更新来源清单中的基线区块和 baseline JSON。日常内容修改只运行普通生成器；`--check` 和 lint 全程只读，不自动修复、不刷新日期/HEAD，也不能同时传 --ingest。

Ingest：阅读改动→给新文件在 wiki-config.json 登记职责与知识页→核对对应语义页/任务/决定→生成→检查。新文件、修改 hash、错误覆盖目标和工具变动都会让漂移检查失败。不要仅修改机械快照掩盖语义遗漏。

Query：先查索引、项目状态、当前任务与日志，再回源码核对关键事实；稳定结论写回已有页。文件与行号真实并不保证证据支持结论，代码语义仍需人工审阅。

Lint：先检查生成物→schema/枚举/日期→双链/普通链接/图可达与入链→来源文件行号→覆盖→疑似敏感信息→占位内容/完成任务验证记录。只报路径与规则；固定外部原件保持原样，其内容示例不当作项目导航。

任务放 tasks，至少目标/范围/验收/改动/验证/未完成项；done 还须 verification 指向确实存在且 checks 全部退出 0 的 JSON 记录。重要取舍放四位序号决策页，写背景、决定、替代、后果与回滚方式。来源用项目相对路径加行号，Wiki 用 wiki-repo 前缀；用户决策用 conversation 前缀，不能充当实现证据。

本轮任务为 [[2026-10-21-工程Wiki补齐]]；M0 未完成项继续由 [[2026-10-21-M0技术验证]] 跟踪。新增内容的事实边界见 [[知识库可靠性与覆盖范围]]，逐项要求见 [[工程Wiki要求对照]]。

## M1 纳管更新

本轮按正式模块逐文件加入 coverage，覆盖 root manifest/锁文件、desktop 进程与 UI、contracts/domain/infrastructure、测试及 CI；.node-version 通过 extraFiles 显式纳管。新增 M1 知识页、任务、ADR 和导航。配置指纹/源码快照重新生成；.node-version 交付门禁补齐后运行 35 项维护回归。P0 同步基线是已保存 M0 的 32d7e8c，检查包含未提交和未跟踪源文件。真实模块行为见 [[M1工程基线]]，验证交接见 [[M1验证与协作]]。

M1 新增 .node-version 后，P0 检查也明确把该无扩展名配置识别为代码变更，并补反向测试：单独更改运行时版本而无相关知识页/任务/日志仍失败。维护回归由 34 增至 35 项；不能只在生成器覆盖而漏掉交付门禁。


## 图标源码纳管

自有 SVG 也是产品源码，本轮将 .svg 同时纳入 wiki-lib 文本扫描和 check-wiki-sync 的代码扩展名，防止只改图标源而漏掉语义页/任务/追加日志；新增反向回归检查该缺失场景。图标二进制不按 UTF-8 采集，由生成脚本输出 hash 清单并由构建检查器验证，SVG、清单、生成/检查脚本及测试各有明确覆盖页。新增 contracts 的 values/quote/events/errors 和基础校验测试同步职责覆盖，保留原始证据与 ingest 基线。当前增量同步基线是初始化提交 7c5a2eb，维护回归应为 36 项。

开发应用命名修复新增两个启动脚本和原生名称回归，已在覆盖映射中分别归属 M1 工程基线与验证页；.runtime/desktop 是忽略的开发缓存，不纳入源码或交付安装包。当前修复与并行工作隔离验证，基线为 b69c4e5。


## 手工 V1 源码覆盖

本轮新增 contracts/trade、domain/trade 与金额测试、infrastructure CSV/TradeStore 及事务测试、renderer quotes 页面、Electron quote-v1 用例，逐文件映射至 [[M2真实报价V1]] 与 [[M1验证与协作]]。已有进程/接口/UI/依赖变更继续更新原职责页面。仅更新 wiki-config 覆盖，未更改维护工具算法；仍运行维护回归验证新覆盖不影响门禁。任务 [[2026-10-21-演示场景与报价V1]] 记录 b69c4e5 基线及上轮未提交文档的保留范围。

## 统一反馈组件覆盖

本次新增 shared/message.tsx、shared/notification.tsx 映射到 [[M1工作台]]，shared/feedback.test.tsx 与 Electron feedback.spec.ts 映射到 [[M1验证与协作]]。更新实际行为、任务和导航，随后生成清单与只读检查；本次不修改维护工具算法。工作区既有未提交增量保持，基线沿用 b69c4e5，详见 [[2026-10-21-统一消息与通知]]。


## 正式模型与两轮修订增量

本轮覆盖新增模型契约、纯领域修订、Provider/执行器/凭据存储、两页面与四组测试；逐文件映射到M4知识页，相关已有M1/M2接口页同步语义。生成器/检查器源码未更改，配置更新仍运行Wiki回归。并行反馈任务曾因这些新增文件尚无覆盖而失败，旧失败证据保留；本轮以新记录重新检验当前整仓。 细节与当前边界见 [[M4模型与报价修订]]，本轮验证见 [[2026-10-21-正式模型与两轮修订]]。


## 并行交接时的作者责任

本轮用户明确要求A/B/C独立分支，入口 [[三人并行开发交接]] 与 [[首批并行接口约定]]。README/AGENTS/CONTRIBUTING现统一共同起点、任务分支、公共文件协调和小PR流程。A01/B01/C01目前draft，领取人、taskBase和机器环境由本人填写；只有交接准备任务可在本轮实际验证后done，不能把计划接口写成已经部署。

每位作者在自己的feature分支同步知识、任务、log和覆盖，不由C事后代写。并行冲突中保留双方语义和旧证据，coverage合并按文件取并集、raw/generated重新生成，CONTEXT只压缩当前状态而不删除历史任务/raw。执行sync时取实际任务起点或PR merge-base，不复用交接准备的旧SHA。具体记录 [[2026-10-21-三人并行交接准备]]。


## B00契约覆盖

本批新增knowledge/checks/runs、protocol/pending-client、三组契约测试和preload回归，映射到 [[首批并行接口约定]]；index/mock/preload同步原M1语义页。新增B00任务与0010决定及导航，生成清单后执行只读check/lint/sync，配置变更运行Wiki回归；不改工具实现。A/C业务任务仍draft，不因接口代码可导入而提前完成，见 [[B00-首批公共契约]]。

## C01a 覆盖与同步记录

本轮在 wiki-config.json 为 domain/agent-run.ts 与测试新增逐文件覆盖，已有 Provider/执行器及测试追加 [[C运行恢复实现]]；domain 公共导出继续由 M1 接口页说明。配置变更只登记职责，不改采集、lint或同步算法。新知识/任务/ADR/评审页从 index 可达，生成物由本切片源码重新生成。

首次基线同步因遗漏本工作流正文更新返回 RELATED_WIKI_BODY_UPDATE_REQUIRED，失败命令保留在 raw/c01a-initial-validation.json；补齐此处实际映射说明后重新执行，不删除旧证据或放宽门禁。机械清单、只读check/lint、Wiki维护回归和以45a9975506030170bcb8dc770919b7cb5de89fa6为基线的sync结果见 [[C01a-状态机与取消基础]]。后续合入B00/A时取覆盖并集再生成，不能用C分支覆盖其他作者条目。


## 本机验收替代云端workflow

本轮删除wiki.yml与engineering.yml，并在wiki-config.json移除两项当前覆盖；删除文件的同步仍使用60c4489基线中的原映射，分别更新本页/分工页与M1验证页，不能通过删映射规避文档。原workflow可以从60c4489历史读取，旧日志/CI失败/raw证据保留。PR模板新增macOS/Windows本机证据要求，贡献规范与根AGENTS同步最新用户决定。

维护脚本算法、pnpm命令和业务测试均未改变；映射变化仍执行36项Wiki回归、生成/只读check/lint和本次60c4489及PR45a9975两套sync。当前策略及证据见 [[0013-本机双平台验收停用Actions]]、[[C01a-本机验收与停用Actions]]。P0代码与Wiki同交付要求保持，不把停用云端等同免检。

移除前的[wiki workflow](https://github.com/jacson10l/tradequote-agent/blob/60c4489d458f341adddfd723c103e75751401048/.github/workflows/wiki.yml)仅作历史来源；当前执行方式以本页本机命令与贡献规范为准。


## macOS优先阶段的Wiki记录

用户将当前验证顺序调整为先macOS需求开发，Windows后置，不阻塞当前PR。根AGENTS、贡献规范、README和PR模板同步这一阻塞关系；P0本机生成/只读check/lint/真实基线sync保持，Windows仍明写未验证而非通过。此次仅文档调整，不改维护算法、覆盖映射、业务或测试源码，执行适用Wiki检查，记录raw/mac-first-validation.json。详见 [[0014-macOS优先与Windows验收后置]]、[[C01a-状态机与取消基础]]。


## 产品HTML交互演示纳管

本轮新增experiments/product-walkthrough/index.html、check.mjs与README.md，逐文件映射至 [[产品交互演示]]，覆盖离线交互行为、关键状态/金额测试和启动说明。同步 [[项目说明书]]、任务、导航、状态和追加日志；生成清单后运行只读check/lint与固定e0f9336基线sync。映射变更运行现有Wiki工具回归，未修改维护工具算法。当前HTML为合成教学样机，不与正式Electron或业务验收混计，实际结果见 [[2026-10-21-产品HTML交互演示]]。


## B00a P0 覆盖增量

新增 contracts/knowledge-wiki.ts、wiki-integrity.ts 和 knowledge-wiki.test.ts，逐文件登记版本/来源/审核/检索/引用/消费协议及完整性反向回归；公共 index/mock/pending-client 和 preload 门禁测试追加同一实际知识页映射。没有新增业务存储/IPC，也没有改变维护算法。导航新增 [[B00a知识Wiki公共协议]]，任务 [[B00a-业务Wiki契约补充]] 更新实际 taskBase、A/C 对齐与本机证据；映射变更仍运行 Wiki 工具回归、生成、只读 check/lint 和固定基线 sync。

## A01c 检索引用覆盖增量

本轮新增 domain/wiki.ts、infrastructure/wiki-store.ts 与 wiki-store.test.ts，逐文件映射至 [[A01c检索引用实现]]；domain/infrastructure 的 index.ts 与 migrations.ts 追加同一知识页，说明 executeWiki 接线与迁移 6。测试同时映射 [[M1验证与协作]]。没有新增业务 IPC，也没有改变维护工具算法；配置变更只登记职责。导航新增 A01c 知识页，任务 [[A01-知识发布与来源查询]] 记录 A01c 改动/验证/未完成，随后生成清单并运行只读 check/lint 与 4d3b213 基线 sync。

## 迁移谱系识别探针

新增 `scripts/a01-migration-lineage-probe.mjs`（纯 Node，仅 `node:sqlite` + 导入真实 `migration-lineage.ts`）作为一次性质证脚本：内联九段迁移 SQL 与 C/B 固定指纹，输出 `raw/a01-migration-lineage-probe.json`。该脚本不属于标准维护工具链，不进入 `build-code-index.mjs` 的 toolchain 指纹；但仍受 lint-wiki 的 scripts 目录敏感内容/行尾空白检查。业务代码新增 `migration-lineage.ts` 及 `migrations.ts` 谱系重写按 P0 登记覆盖并映射到 [[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]，见对应任务与 log。

2026-10-24 修正 C 首轮核验：探针扩至 19 用例（新增 N07 列改名/N08 空触发器/N09 非唯一索引三个负例），`wiki-config.json` 为新增 `migration-ledger.test.ts`（N10/N11 账本一致性定向回归）登记覆盖，映射到 [[A01-迁移验证计划]]、[[M1验证与协作]] 与 [[A对C前置验证失败修正回复]]。配置仅登记职责，未改维护工具算法；本轮 sync 基线为 b9a0af7。

2026-10-24 修正 C 二轮 M13 核验：探针再扩至 23 用例（新增 M13-X01 永假 WHEN / M13-X02 永假 WHERE / M13-X03 缺外键 / M13-X04 缺 CHECK 四个负例），`capabilityStatus` 补有效定义判据（谓词非永假 + `PRAGMA foreign_key_list` 外键 + 表原文 CHECK 匹配），`snapshotSchema` 收集外键；`contracts` `failure()` 统一 `CAPABILITY_UNAVAILABLE` 的 `retryable=false`（A-W08）。未新增源码文件，覆盖映射不变；本轮 sync 基线为 9225526。

2026-10-24 修正 C 三轮 M13 核验：探针再扩至 28 用例（新增 M13-X05 `WHEN 1=0` / M13-X06 `WHERE 1=0` / M13-X07 索引增列改谓词 / M13-X08 触发器事件篡改 / M13-X09 注释伪 CHECK 五个负例），`capabilityStatus` 改为按规范参考结构核对有效定义（`TriggerRequirement.event`/`when`、`IndexRequirement.columns`/`where`、`stripComments` 去注释后匹配 CHECK），放弃常量黑名单；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 65885ff。

2026-10-24 修正 C 四轮 M13 核验：探针再扩至 30 用例并新增 2 项有效原 schema 控制组（新增 M13-X10 触发器体 `SELECT 'RAISE'` 字符串字面量 / M13-X11 索引谓词字符串字面量大小写两个负例，以及 c-v7 拒绝 DELETE、c-v6 拒绝重复 prepared 两项控制），`capabilityStatus` 的 RAISE 判据改为 `/\bRAISE\s*\(/i` 命中 `stripTrivia`（去注释与字符串字面量）结果、`normalizeSql` 只小写字符串外内容（字符串字面量大小写保留）、CHECK 判据同步改用 `stripTrivia`；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 cece332。

2026-10-25 修正 C 五轮 M13/账本核验：探针再扩至 33 用例（新增 M13-Y01 `CASE WHEN 0 THEN RAISE(...)` 不可达 RAISE / M13-Y02 同名触发器挂错表 agent_run / M13-Y03 同名唯一索引建旁表 synthetic_index_target 三个负例），`capabilityStatus` 的 RAISE 判据收紧为 `/\bSELECT\s+RAISE\s*\(/` 直接保护体（`SELECT CASE` 不命中）、`TriggerRequirement`/`IndexRequirement` 各新增 `table` 并从 sqlite_master `tbl_name` 核对目标表；`migrations.ts` 的 `verifyLegacyLedger` 对映射外 version（M09-L01）与重复 version（M09-L02）一律拒绝；`migration-ledger.test.ts` 增至 5 用例（新增 M09-L01/L02）。未新增源码文件，覆盖映射不变；本轮 sync 基线为 41f0cdc。

2026-10-25 修正 C 六轮 M13 保护体核验：探针再扩至 37 用例（新增 M13-Y04a `SELECT RAISE(...) WHERE 0` / M13-Y04b `LIMIT 0` / M13-Y05 `UPDATE OF` 列范围 / M13-Y06 AFTER 时机 + `RAISE(IGNORE)` 四个负例），`capabilityStatus` 新增 `extractTriggerBody`/`hasBareAbortRaise`（保护体须为裸 `SELECT RAISE(ABORT,'')`，取代关键词命中）、`extractTriggerTiming`（时机必须 BEFORE）并对 UPDATE 触发器拒绝 `UPDATE OF <列>`；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 163f7a4。

2026-10-25 修正 C 七轮 M13 注释词法核验：探针再扩至 40 用例（新增 M13-Y07 注释伪造保护体 / M13-Y08 注释分隔 `UPDATE OF` / M13-Y09 注释伪造事件三个负例），`capabilityStatus` 新增 `stripComments`（去 `--` 行注释/块注释，字符串/引号标识符原样保留，注释补空格保持词法边界），触发器与索引的结构识别（保护体/事件/时机/`UPDATE OF`/`UNIQUE`/列/谓词）一律先剥离注释再匹配；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 e73d177。
