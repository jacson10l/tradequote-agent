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
