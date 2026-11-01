---
title: Wiki 工作流与任务记录
type: meta
status: active
updated: 2026-10-30
sources:
  - wiki-repo:scripts/build-code-index.mjs:1
  - wiki-repo:scripts/lint-wiki.mjs:1
  - wiki-repo:raw/source-manifest.md:1
---

# Wiki 工作流与任务记录

## 2026-11-01 C15 图谱覆盖

为只读关系图谱的数据转换、布局、React/CSS、定向单元与原生 Electron 测试登记逐文件覆盖，统一指向 [[C15知识关系图谱]]；App、README、DESIGN 追加该知识页。图谱展示真实工程文档双链与已保存报价引用，两类范围明确分开，不以可视化替代企业知识闭环验收。覆盖配置变化运行维护回归，按 bc6ba9e 基线生成、只读 check/lint/sync；任务 [[C15-知识图谱紧急交付]] 保存实际验证证据。

## 2026-11-01 启动纸屑职责登记

后续用户修订为独立启动页，原纳管文件不变；更新其职责为StartupScreen阶段状态、inert工作台、品牌缓显与粒子结束后淡入，新增决策[[0034-独立启动页与工作台淡入]]并由导航入链。新验证记录单独保存，不覆盖第一轮JSON/截图或删除失败记录；仍按87106d1基线生成/只读check/lint/sync，配置描述变化复跑维护36项，不修改门禁算法。

为新增 startup-confetti.tsx、startup-confetti.test.tsx、tests/e2e/startup-confetti.spec.ts 和已确认方案计划登记逐文件职责，分别指向 [[桌面启动五彩纸屑]]、[[M1工作台]] 和 [[M1验证与协作]]；导航链接任务 [[C启动五彩纸屑动画]]。维护工具逻辑不变，配置变更仍运行 Wiki 回归、生成后只读 check/lint，以及固定 87106d1 基线 sync；实际证据与历史失败分列记录。

## B01 纯检查覆盖

第三切片新增 infrastructure/check-store.ts 及其测试，逐文件映射到 [[B规则检查实现]]，记录表字段/插入与不可变约束、同连接事务、共享幂等/重放、完整性校验和 A 尚未登记的生产迁移。同步 [[M1接口与持久化]]、B01 任务、状态、CONTEXT、导航和追加日志；raw/b01-storage-validation.json 单独保存本轮实际输出及旧 raw/hash 保留验证，旧两切片证据不重写。映射变动运行 Wiki 回归，生成清单后只读 check/lint/固定 654fecc sync，不改工具实现。

第二切片新增 renderer/features/quote-checks.tsx、组件测试和显式合成 fixture，逐文件映射到 [[B规则检查实现]]；quotes.tsx 保留原 M2 映射并追加该页，记录实际只读挂载。原始第一切片 JSON 保留，新证据 raw/b01-ui-validation.json 和三张合成浏览器截图单独纳管；状态/任务/log/导航同交付。机械清单重新生成后执行 check/lint/固定 654fecc sync 与映射回归，平台失败不改成通过，不以浏览器代替 Electron。

2026-10-22 新增 domain/quote-checks.ts 与 quote-checks.test.ts，逐文件映射到 [[B规则检查实现]]；domain 公共 index 同步本知识页，保留既有 M1 职责映射。新增 [[B01-规则检查与双反馈]] 实际开工/验证、索引导航、状态和追加日志；生成后执行只读 check/lint、654fecc 基线 sync 与映射相关 Wiki 回归，不把平台失败记为通过。原始输入、历史 raw 和旧日志保持；未修改维护算法。

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

本轮 B 增量把探针及其自检一并登记覆盖（`scripts/contract-review-probe.mjs` 与 `scripts/contract-review-probe.test.mjs` 映射到 [[B维护证据资格与规则样例]] 与 [[测试与验证地图]]），并把 `maintenance-evidence.test.ts`、`quote-checks*.ts` 纳入职责表；探针输出 `raw/b-contract-probe.json` 属生成证据而非知识页，只作验证记录引用。

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

## 双参考目标审阅与C02a覆盖

本轮补齐Solivio业务模块/Harness执行能力到有效源码、C00～C07任务/依赖/验收和延期恢复条件的映射，入口 [[双参考项目功能对照与C开发路线]]。新增read-tool-runtime及测试逐文件归属本路线/M4知识页；基础设施Zod依赖与锁文件同步M1工程基线。共同基线be53b98已纳入A的合成fixture但尚无覆盖，本轮读取后登记9项合成资产至路线/A知识页，保持8份原文，合成JSON仅格式归一，不代签业务正确性。

配置变更只增加职责映射，不改维护工具算法；运行完整Wiki工具回归、生成/只读check/lint和固定be53b98基线sync，证据raw/c-runtime-validation.json。保留上一轮C01b核查JSON原样并补任务中的时点说明；新的开发任务不以文档生成替代代码行为验收。关联 [[C02a-受限只读工具循环]]、[[C01b-依赖就绪核查]]。

首次登记A来源文本覆盖后生成报STALE_COVERAGE，因为默认扩展扫描不纳管.txt；已将8份合成原文显式加入extraFiles，既不移除来源映射也不放宽工具算法，随后重跑生成与维护回归。失败记录保留在本轮initial-validation。

本轮pnpm check与Electron构建并行时误扫构建的临时配置，另发现基线合成JSON未符合Biome格式；旧失败保存后等待构建结束再串行check。仅对合成draft JSON布局归一，并实际比较JSON解析值及8份原文字节均与be53b98相同，不加格式例外或弱化检查。

## C02b只读业务适配覆盖

本轮新增catalog-quote-read-agent.ts及测试，逐文件归 [[C02b商品与报价只读工具]]/M4知识页；ReadToolRuntime的hostContext增量同步原路线/M4正文。配置只增加两项coverage，不改维护算法；仍执行36项Wiki工具回归，保留上轮raw与log，固定本任务4a56a42和累计PR基线be53b98检查同步。知识/任务/0017决定已从index可达，状态/CONTEXT明确C02b部分完成和A/B未就绪接口，不以schema/mock冒充服务。验证见 [[C02b-商品与报价只读工具]]。

## C02b四工具正式桌面接线覆盖

新增read-tools契约/测试、只读服务/测试、Worker客户端测试、只读页面和Electron用例共7项逐文件映射至 [[C02b桌面只读助手]]/M4。原contracts index/mock、基础设施index、Main/worker/preload及App等继续使用原M1接口/工程/UI映射，实际正文均同步必要的只读协议、凭据/时钟/等待边界和页面行为；不是只改新页面绕过旧责任页。adapter改用共享公共schema，原C02b页明确后续已接正式入口，旧子任务证据保持原样。

本轮维护配置只增加coverage，不改变工具算法；运行36项Wiki工具回归、生成/只读check/lint，固定4324dc8任务基线和be53b98累计PR基线sync。初始截图的右对齐继承问题保留在.runtime初稿图后修正；最终命令与视觉检查记录raw/c02b-desktop-validation.json，任务 [[C02b-Worker与桌面只读入口]]。日志只追加，历史验证JSON按基线逐字节保留；真实供应商/恢复/Windows不冒领。


## C02c前置整合与覆盖

本轮合并A01b的真实知识实现/任务/日志，coverage按文件和pages取并集，A/C历史日志均保留；合成fixture两侧解析内容相同，保留当前格式，生成冲突由实际源码重建。新增agent-run-store及真实测试逐文件映射到 [[C02c持久运行与写入前置]]；旧契约、存储/迁移、金额、preload/Electron等文件继续同步原职责知识页。未改维护工具算法，映射变化仍运行36项回归。固定任务基线644c5ed和累计PR基线be53b98，命令及原失败记录见 [[C02c-持久运行与写入前置]]。


## C02c运行协调后续

本轮[[C02c-统一调度与强杀恢复]]逐文件登记协调器、Worker独占、真实进程fixture、草稿账本与桌面运行记录；受影响源码追加对应新知识页，保留其他职责映射及所有旧证据。未修改Wiki工具算法；配置变化仍运行工具回归、生成/只读check/lint及67c69c7与be53b98双基线同步。


## C02c多步闭环后续

本轮[[C02c-多步报价工具闭环]]为纯规则、候选授权、循环服务及合成seed/模型和强杀测试逐文件登记覆盖，受影响源码追加新知识页，保留既有职责与旧证据。未修改采集/lint/sync算法；映射变化仍执行Wiki工具回归、生成/只读check/lint和4c09785/be53b98双基线同步。


## C04评估切片

[[C04模型评估与脱敏报告]]提供独立fixture优先入口、三品类中英德两轮修订/澄清/规则与17类失败控制、48点脱敏报告。复用真实Provider解析和生产业务服务，不新增IPC/迁移/公共DTO；真实DeepSeek未运行，CLI明确not_run退出2。内部宿主真实模式尚未接正式设置UI，不能用fixture宣称供应商通过。范围/实际验证/剩余项见[[C04-评估样本与脱敏报告]]。


## C04正式评估入口

[[C04正式设置评估入口]]已从febd14d接入正式模型设置：用户保存模型并确认可能计费后显式启动，独立进程/临时工作区，取消、历史和原生保存脱敏报告；页面重开不发模型请求。报告/计划schema集中contracts，原CLI继续区分fixture与未运行真实模式。环回HTTP验收强制fixture标记，真实账户验证仍由用户启动，不能据本机fixture标真实供应商通过。当前范围/验证及剩余项见[[C04-正式设置与显式真实评估]]。

## C04失败收敛覆盖与历史保持

后续C04阶段证据切片新增diagnostics.test.ts、retest-regressions.test.ts逐文件映射至[[C04失败阶段诊断与二轮收敛]]和原评估知识页；原C04契约/协调器/runtime/QuoteToolAgent/runner/report/renderer/Electron用例追加相关职责页，保留旧映射。配置只增覆盖，不改维护算法，仍跑36项Wiki回归、生成/只读check/lint及3a476a3/be53b98固定同步。新fixture报告和八项重建证据独立命名并入导航，旧真实报告/旧日志保留，不反填诊断或拼接多轮通过项；实际命令/退出码见[[C04-失败阶段证据与八项回归]]。以下是前轮记录。

新增failure-regressions.test.ts映射至[[C04失败收敛与本地回归]]/原评估知识页，runtime、只读测试及QuoteToolAgent追加受限纠正职责页，旧覆盖保留。配置只加映射，不改采集/lint/sync算法；继续运行36项维护回归与b231181/be53b98固定同步。新增fixture报告使用独立文件名且由知识页链接，初轮遗漏Markdown入链触发lint及复制库维护回归失败，补真实导航后再跑，不降低可达要求。86份旧raw逐字节、57373字节旧log完整前缀及正式评估样本/期望/锁文件均保持；六项合成重建不替代原真实失败报告。实际记录见[[C04-失败收敛]]。


## C04三项剩余边界覆盖

新增remaining-regressions.test.ts逐文件映射到[[C04剩余失败证据与收敛]]及原评估页；Provider/运行核/草稿Agent/runner/契约及相关单元/Electron回归追加本页职责映射，原映射保留。只改覆盖配置，不改维护算法，仍运行36项Wiki回归和生成/只读check/lint、b28b702/be53b98固定同步。fixture和三项边界证据独立入raw，旧三轮真实/日志保持；实际验证见[[C04-三项失败回归与最小修复]]。


## C04动作与澄清回归覆盖

新增action-regressions.test.ts逐文件映射到[[C04动作与澄清失败收敛]]，C04契约/运行核/QuoteToolAgent/诊断测试追加本页覆盖，旧责任映射全部保留。只改配置、不改维护算法；仍跑36项Wiki回归、生成/只读check/lint及5afc425/be53b98固定同步。新fixture/合成/初始失败证据独立命名，原raw/log字节保留；实际执行和未完成项见[[C04-动作澄清与规则失败收敛]]。


## C03事件覆盖与C04状态同步

新run-events契约/回归、run-event-store与事务回归、桌面feed/回放组件及标签/测试逐文件归[[C03持久事件与桌面重连]]；原RunEvent/公共导出/门禁、运行存储/协调器、Main/Worker/preload/运行列表与两份Electron回归保留原映射并追加本页。README同时关联[[C04收口与验收边界]]，不是用状态文字替代源码说明。只改覆盖配置、不改维护算法，仍跑36项维护回归及机械生成/只读check/lint、64f2e2d/be53b98同步。旧raw/log逐字节保留，C04签认不伪造；实际结果见[[C03-持久事件与桌面重连]]。


## 产品HTML交互演示纳管

本轮新增experiments/product-walkthrough/index.html、check.mjs与README.md，逐文件映射至 [[产品交互演示]]，覆盖离线交互行为、关键状态/金额测试和启动说明。同步 [[项目说明书]]、任务、导航、状态和追加日志；生成清单后运行只读check/lint与固定e0f9336基线sync。映射变更运行现有Wiki工具回归，未修改维护工具算法。当前HTML为合成教学样机，不与正式Electron或业务验收混计，实际结果见 [[2026-10-21-产品HTML交互演示]]。


## B00a P0 覆盖增量

新增 contracts/knowledge-wiki.ts、wiki-integrity.ts 和 knowledge-wiki.test.ts，逐文件登记版本/来源/审核/检索/引用/消费协议及完整性反向回归；公共 index/mock/pending-client 和 preload 门禁测试追加同一实际知识页映射。没有新增业务存储/IPC，也没有改变维护算法。导航新增 [[B00a知识Wiki公共协议]]，任务 [[B00a-业务Wiki契约补充]] 更新实际 taskBase、A/C 对齐与本机证据；映射变更仍运行 Wiki 工具回归、生成、只读 check/lint 和固定基线 sync。

## A01c 检索引用覆盖增量

本轮新增 domain/wiki.ts、infrastructure/wiki-store.ts 与 wiki-store.test.ts，逐文件映射至 [[A01c检索引用实现]]；domain/infrastructure 的 index.ts 与 migrations.ts 追加同一知识页，说明 executeWiki 接线与迁移 6。测试同时映射 [[M1验证与协作]]。没有新增业务 IPC，也没有改变维护工具算法；配置变更只登记职责。导航新增 A01c 知识页，任务 [[A01-知识发布与来源查询]] 记录 A01c 改动/验证/未完成，随后生成清单并运行只读 check/lint 与 4d3b213 基线 sync。

## 2026-10-23 A+B 联调并集与覆盖

基于A01c dd42b05复制原B01未提交代码/Wiki/非生成raw并集，原工作树保持。新增wiki-quote-checks、wiki-check-source、check-report-schema、wiki-check-integration.test、migrations.test与wiki-test.fixture的逐文件职责映射；旧报告存储映射更新到实际迁移7。更新受影响A/B知识、任务、M1接口/验证、协议、ADR、CONTEXT与状态，合并日志不删除任一方历史。新证据单独raw/b01-wiki-integration-validation.json，旧raw保持字节。生成清单后执行只读check/lint、真实PR merge-base 654fecc最终sync（dd42b05仅为诊断），映射变化运行Wiki回归；不修改维护工具或放宽门禁。

## 2026-10-23 B迁移协调覆盖

新增B迁移协调回复、任务与两份独立原始证据，新增两个probe源逐文件覆盖到协调/验证知识页；原代码/旧raw不覆盖。0016状态改draft，真实生产迁移与编号不改；状态/CONTEXT明确A审批和C原文缺失，正式组合不可放行。生成清单、只读check/lint、固定6c76fb9及目标merge-base654fecc同步按实际执行，覆盖变化运行Wiki回归，不改门禁算法。


## 迁移谱系识别探针

新增 `scripts/a01-migration-lineage-probe.mjs`（纯 Node，仅 `node:sqlite` + 导入真实 `migration-lineage.ts`）作为一次性质证脚本：内联九段迁移 SQL 与 C/B 固定指纹，构造 16 个分类用例与 10 个追加用例，输出 `raw/a01-migration-lineage-probe.json`。该脚本不属于标准维护工具链，不进入 `build-code-index.mjs` 的 toolchain 指纹；但仍受 lint-wiki 的 scripts 目录敏感内容/行尾空白检查。业务代码新增 `migration-lineage.ts` 及 `migrations.ts` 谱系重写按 P0 登记覆盖并映射到 [[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]，见对应任务与 log。



## B00a P1 覆盖与独立基线

新增knowledge-build/knowledge-maintenance两份schema与两组测试逐文件映射到 [[B00a知识整理与维护协议]]；index/mock/pending-client、preload/Electron桥接回归追加相同职责页，维护算法不变。任务 [[B00a-P1知识整理与维护契约]] 使用真实ae1af9d基线，并另以共同56c909e复验；不在PR#7混入P1提交。作者生成清单、运行只读check/lint/sync和映射回归，保留P0既有raw与追加日志，不能借旧P0通过记录代替新协议证据。


## B接收统一谱系与P1回执的Wiki闭环

本轮本地依赖整合A b9a0af7与B P1 19d60a8，coverage取并集，历史log/raw保留；新增check-lineage-integration.test.ts与knowledge-lint-review.test.ts分别映射B报告适配和P1协议。migrations/migration-lineage/index及显式负向probe追加[[B谱系账本适配与P1回执交接]]职责来源，机械清单重建。映射与A维护探针纳入本次改动，必须重跑Wiki工具回归并保留Windows EPERM，不修改维护算法或删旧证据。

任务基线f2dfa5f，不能以中途依赖WIP提交2100aa7作为本次sync基线规避已提交代码。新任务[[B01-谱系账本适配与P1回执]]记录正常验证、独立已知红色探针及未完成项，状态active。

新增 `scripts/a01-migration-lineage-probe.mjs`（纯 Node，仅 `node:sqlite` + 导入真实 `migration-lineage.ts`）作为一次性质证脚本：内联九段迁移 SQL 与 C/B 固定指纹，输出 `raw/a01-migration-lineage-probe.json`。该脚本不属于标准维护工具链，不进入 `build-code-index.mjs` 的 toolchain 指纹；但仍受 lint-wiki 的 scripts 目录敏感内容/行尾空白检查。业务代码新增 `migration-lineage.ts` 及 `migrations.ts` 谱系重写按 P0 登记覆盖并映射到 [[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]，见对应任务与 log。

2026-10-24 修正 C 首轮核验：探针扩至 19 用例（新增 N07 列改名/N08 空触发器/N09 非唯一索引三个负例），`wiki-config.json` 为新增 `migration-ledger.test.ts`（N10/N11 账本一致性定向回归）登记覆盖，映射到 [[A01-迁移验证计划]]、[[M1验证与协作]] 与 [[A对C前置验证失败修正回复]]。配置仅登记职责，未改维护工具算法；本轮 sync 基线为 b9a0af7。

2026-10-24 修正 C 二轮 M13 核验：探针再扩至 23 用例（新增 M13-X01 永假 WHEN / M13-X02 永假 WHERE / M13-X03 缺外键 / M13-X04 缺 CHECK 四个负例），`capabilityStatus` 补有效定义判据（谓词非永假 + `PRAGMA foreign_key_list` 外键 + 表原文 CHECK 匹配），`snapshotSchema` 收集外键；`contracts` `failure()` 统一 `CAPABILITY_UNAVAILABLE` 的 `retryable=false`（A-W08）。未新增源码文件，覆盖映射不变；本轮 sync 基线为 9225526。

2026-10-24 修正 C 三轮 M13 核验：探针再扩至 28 用例（新增 M13-X05 `WHEN 1=0` / M13-X06 `WHERE 1=0` / M13-X07 索引增列改谓词 / M13-X08 触发器事件篡改 / M13-X09 注释伪 CHECK 五个负例），`capabilityStatus` 改为按规范参考结构核对有效定义（`TriggerRequirement.event`/`when`、`IndexRequirement.columns`/`where`、`stripComments` 去注释后匹配 CHECK），放弃常量黑名单；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 65885ff。

2026-10-24 修正 C 四轮 M13 核验：探针再扩至 30 用例并新增 2 项有效原 schema 控制组（新增 M13-X10 触发器体 `SELECT 'RAISE'` 字符串字面量 / M13-X11 索引谓词字符串字面量大小写两个负例，以及 c-v7 拒绝 DELETE、c-v6 拒绝重复 prepared 两项控制），`capabilityStatus` 的 RAISE 判据改为 `/\bRAISE\s*\(/i` 命中 `stripTrivia`（去注释与字符串字面量）结果、`normalizeSql` 只小写字符串外内容（字符串字面量大小写保留）、CHECK 判据同步改用 `stripTrivia`；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 cece332。

2026-10-25 修正 C 五轮 M13/账本核验：探针再扩至 33 用例（新增 M13-Y01 `CASE WHEN 0 THEN RAISE(...)` 不可达 RAISE / M13-Y02 同名触发器挂错表 agent_run / M13-Y03 同名唯一索引建旁表 synthetic_index_target 三个负例），`capabilityStatus` 的 RAISE 判据收紧为 `/\bSELECT\s+RAISE\s*\(/` 直接保护体（`SELECT CASE` 不命中）、`TriggerRequirement`/`IndexRequirement` 各新增 `table` 并从 sqlite_master `tbl_name` 核对目标表；`migrations.ts` 的 `verifyLegacyLedger` 对映射外 version（M09-L01）与重复 version（M09-L02）一律拒绝；`migration-ledger.test.ts` 增至 5 用例（新增 M09-L01/L02）。未新增源码文件，覆盖映射不变；本轮 sync 基线为 41f0cdc。

2026-10-25 修正 C 六轮 M13 保护体核验：探针再扩至 37 用例（新增 M13-Y04a `SELECT RAISE(...) WHERE 0` / M13-Y04b `LIMIT 0` / M13-Y05 `UPDATE OF` 列范围 / M13-Y06 AFTER 时机 + `RAISE(IGNORE)` 四个负例），`capabilityStatus` 新增 `extractTriggerBody`/`hasBareAbortRaise`（保护体须为裸 `SELECT RAISE(ABORT,'')`，取代关键词命中）、`extractTriggerTiming`（时机必须 BEFORE）并对 UPDATE 触发器拒绝 `UPDATE OF <列>`；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 163f7a4。

2026-10-25 修正 C 七轮 M13 注释词法核验：探针再扩至 40 用例（新增 M13-Y07 注释伪造保护体 / M13-Y08 注释分隔 `UPDATE OF` / M13-Y09 注释伪造事件三个负例），`capabilityStatus` 新增 `stripComments`（去 `--` 行注释/块注释，字符串/引号标识符原样保留，注释补空格保持词法边界），触发器与索引的结构识别（保护体/事件/时机/`UPDATE OF`/`UNIQUE`/列/谓词）一律先剥离注释再匹配；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 e73d177。

2026-10-25 修正 C 八轮 M13 方括号标识符核验：探针再扩至 42 用例（新增 M13-Y10 方括号列名 `[CHECK(attempt>0)] TEXT` 伪造 CHECK 负例，及「额外方括号列 + 真实 CHECK 并存」有效控制组），`stripTrivia` 新增方括号引号标识符 `[name]` 剥离（内容去除、占位 `[]`）、`stripComments` 同步识别 `[name]`（内容原样保留），CHECK 判据按去注释/字符串/方括号标识符后的表原文匹配，方括号列名中的 `CHECK(attempt>0)` 文本不再被误认作真实约束，额外方括号列与真实 CHECK 并存的合法库仍识别为原谱系（不禁止所有额外列）；`migration-lineage.ts` 未新增文件、覆盖映射不变。本轮 sync 基线为 1c890dc。

2026-10-30 A01e 维护快照与索引投影（knowledge-wiki:10）：`a01-migration-lineage-probe.mjs` 探针扩至 v9/v10——内联 knowledge-wiki:9/v10 三段 SQL 与两枚指纹、UPGRADEABLE 集与 LINEAGE_BUILD 增 a-v9/a-v10、分类（2a）与追加循环同步，指纹匹配/分类/追加/控制全过（13 可升级谱系追加全过）；输出仅内联指纹，不改维护工具算法。业务侧 [[A01-迁移谱系支持与拒绝矩阵]]、[[A01c检索引用实现]]、[[A01-知识发布与来源查询]] 2026-10-30 段同步，本轮 sync 基线为 267f087。

## C集成候选的两侧覆盖与证据保留

[[C集成候选与依赖收口]]组合9e8695b与654fecc，coverage按源码path及pages取并集，保留C纳管A原文TXT与共享产品HTML/B00a P0映射，不移动旧职责或修改工具算法。16项冲突中的生成物由实际组合源码/配置重新生成；共同目标654fecc log完整前缀及C侧独有历史原字节均保留，双方非生成raw逐文件核对，旧真实/失败证据不反填。

公共index/pending-client变更同时更新M1接口、本协议、B00a页与本候选知识正文；新增任务/评审说明/JSON和fixture Markdown均有导航/入链。运行维护36回归及生成、只读check/lint，固定654fecc/be53b98双基线sync（9e8695b仍为taskBase与增量/保留审计基线）；本次增量与目标完整范围分开。实际检查见[[C集成候选-准备与组合验证]]，签认独立保留active，不用机械汇总代替语义评审。


## 2026-10-25 B固定新组合适配

本次独立候选合并A/B/C覆盖映射时，对同路径pages取并集、保留两方公共模块职责；新增quote-checks-runtime-compat.test.ts逐文件映射B规则检查及C02c多步闭环。raw/generated由最终组合源码重生成，旧非生成raw保留，log以原B7f8afe6完整字节前缀加各来源历史增量追加。映射有变运行维护回归，工具算法不变；新状态/任务/日志和真实B7f8afe6基线sync必须同行，不能以临时WIP merge提交作任务基线。

来源审计发现A/B同名探针JSON版本不同：恢复B原a01-migration-lineage-probe.json字节，A a2b050e新原件另存a01-migration-lineage-probe-a2b050e.json并记录原blob/hash；不以同路径覆盖删除B旧证据。原raw与旧日志保留检查覆盖A78/B108/C254份，映射与工具测试结果各按实际退出码登记。

详见[[B新固定组合与回归范围]]、[[B01-新固定组合回归]]及raw/b-a910-c03-combination-validation.json。


## C旧业务库与Worker门禁覆盖

本轮新增worker-migration-gates.test.ts及worker-gates-host.ts，分别纳管领域有效旧库/实际Worker验证与隔离Electron测试宿主；映射到[[C领域旧库回放与Worker启动门禁]]。worker-ownership.ts保留原C02c职责页并增加本轮缺陷与真实验证来源。仅增加覆盖配置、不改维护算法；仍运行维护回归、生成/只读check/lint及cb90e9f真实基线sync，任务[[C集成-领域旧库与Worker启动恢复门禁]]保留初始失败与未完成人员项。


## 2026-10-26 已保存报价检查接线

新增tests/e2e/quote-checks.spec.ts、tests/fixtures/quote-checks-data.ts逐文件覆盖至[[C已保存报价检查桌面切片]]。前者是实际Electron人工检查/原子保存/双反馈/重开；后者只在关闭桌面后准备明确合成发布/撤回投影及只读核对，不进入生产IPC。现有C接线/契约/组件源码增加本轮知识页职责，相关M1/B页、任务与状态/log同步，维护算法不变；覆盖变动运行Wiki回归及本次c6f6788基线sync。


## 2026-10-27 A01e固定接收

本次A01e接收对八个infra源码/测试增加[[Ae7a9439接收与P1接线阻断复核]]覆盖；A原迁移探针位于Wiki/scripts，按既有维护脚本指纹机制检查，不误登记为业务源码；没有新业务文件或新权限。复制B两份原raw/知识/任务为原文，A/C旧同名证据不覆盖，原307份raw和旧log前缀保持。脚本为A更新的十能力探针原字节，实际输出单存C新raw，Wiki工具算法不变；映射/维护增量运行维护回归、生成/check/lint和真实739基线sync。WIP含明确P1失败，不标done、不放行。

## 2026-10-31 维护工具排除 .workbuddy

wiki-lib.mjs 的 ignoredDirs 增 .workbuddy（WorkBuddy IDE 项目数据目录），与 .git/.runtime/.cache 同类，避免其 memory 工作日志被源码覆盖扫描误纳管为未覆盖文件；.gitignore 同步排除。维护算法不变，仅排除一个 IDE 数据目录；见 [[A01e快照绑定与事件证据交接]]。

## 2026-10-31 演示数据包 demo_data 归档登记

`wiki-config.json` 的 `archivalMarkdown` 增 `demo_data/MANIFEST.md`：演示数据包（来自 `codex/demo-data-catalog` 分支，含 `catalog_demo.csv` 主样本、`catalog_converted.csv` 300 行备用、规则/询盘/商品配套 CSV 及生成脚本）的清单文件按归档来源文档处理，不参与文档导航；`raw/file-provenance.json` 同步登记其 sha256。导航算法不变，仅登记一个新归档清单，见 [[A01f演示资料包冻结]]。

## 2026-11-01 虚拟形象看板娘板块与覆盖映射

新增虚拟形象看板娘（报价小人）的 8 个源码/测试文件逐文件覆盖映射：契约 `packages/contracts/src/pet.ts`、基础设施 `pet-memory-store.ts`（及测试）、`pet-quote-context.ts`（及测试）、渲染层 `pet-assistant.tsx`、`pet-mascot.tsx`、`use-speech-recognition.ts`，分别映射到知识板块 [[报价小人人设]]、[[报价小人记忆]] 与方案页 [[虚拟形象与记忆方案]]。同时新建知识板块 `wiki-project/wiki/pet/`（人设 + 长期记忆，进 git）与任务页 [[虚拟形象看板娘]]。维护算法不变，仅增覆盖配置并重新生成清单；见 [[虚拟形象与记忆方案]]。


## 2026-11-01 C12 公开发布覆盖

新增根LICENSE纳入已有显式LICENSE采集规则，coverage指向[[C12公开发布与README]]与[[0035-main公开入口与MIT许可]]；不改维护算法。README/AGENTS/CONTRIBUTING更新公开入口与集成分支职责，第三方声明保留来源权利。任务[[C12-main公开与README更新]]记录固定3f3332b基线、生成/只读check/lint/sync及因覆盖变化执行维护回归，发布状态必须由GitHub实测回读补记。
