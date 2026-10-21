---
title: Wiki 工作流与任务记录
type: meta
status: active
updated: 2026-10-21
sources:
  - wiki-repo:scripts/build-code-index.mjs:1
  - wiki-repo:scripts/lint-wiki.mjs:1
  - wiki-repo:raw/source-manifest.md:1
---

# Wiki 工作流与任务记录

## P0 强制交付条件

用户明确要求所有成员编码完成后必须记录工程 Wiki，优先级为项目内最高。作者在同一交付中更新关联知识页正文、任务页和追加日志；重要决定写 ADR，状态与下一步变化更新 CONTEXT。评审者核对内容与实现一致。缺记录或门禁失败即未完成，不标 done、不合并；不能只改日期或重新生成快照。

新增 `check-wiki-sync.mjs` 对基线之后的提交、未提交及未跟踪代码检查：每个变更源文件至少关联一个正文发生变化的知识页，同时有任务更新和末尾追加日志；删除文件使用基线覆盖映射。Wiki 维护脚本变更必须更新本工作流页。当前日期/元数据或仅空白改动不计作正文更新。

```sh
node wiki-project/scripts/check-wiki-sync.mjs . --base <本次改动基线>
node --test wiki-project/scripts/wiki-tools.test.mjs wiki-project/scripts/wiki-sync.test.mjs
```

CI 定义在 `.github/workflows/wiki.yml`，PR 清单在 `.github/pull_request_template.md`，全员规则见 [CONTRIBUTING](../../CONTRIBUTING.md)。本地完成这些检查不等于远端保护已开启：workflow 提交后由 GitHub 执行，管理员将 `Wiki / wiki-sync` 设置为必需检查并限制绕过。脚本只能检查结构性同步，语义真实性仍由作者和评审者负责。

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
