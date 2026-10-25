---
title: C集成-迁移后执行准备
type: task
status: done
updated: 2026-10-23
verification:
  - wiki-repo:raw/c-migration-execution-plan-validation.json:1
sources:
  - packages/infrastructure/src/agent-run-store.ts:67
  - packages/infrastructure/src/run-event-store.ts:14
  - apps/desktop/src/workers/business.ts:19
  - wiki-repo:raw/c-migration-execution-plan-audit.json:1
---

# C集成-迁移后执行准备

## 目标

按用户要求在A方案确定前整理C的运行/事件不变量、桌面接线清单和迁移验证用例，同步Wiki供后续执行。不改历史迁移、不代签、不推送、不合入、不发送消息或真实模型复测。

## 范围

taskBase=b3bc98c2c4149a21ec70978c0dd73eea67e561c6；新独立工作树/Users/jason/.codex/worktrees/c-migration-execution-plan/tradequote-agent与codex/c-migration-execution-plan。C源码固定45fa03d，B回复固定f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef；只读已有本地Git对象，不fetch或导入B实现。原已推送协调分支保持b3bc98c。实际环境/文件hash见raw审计，仅Wiki与记录，不安装依赖/启动应用/运行模型或产品测试。

## 验收

既有事实有有效源码/测试入口，不把旧通过作用域扩大到新组合；列明运行/事件不变量、接口和信任边界、状态/身份/数据保持及失败恢复。迁移矩阵区分谱系、实际数据/账本、拒绝和完整升级，标明A待决定与A/B/C责任；未来用例全部not_run。准备材料完成与实施/人工验收分任务记录，旧源码/raw/log保持，生成/check/lint及固定基线sync实际通过。

## 改动

新增[[C迁移后运行与事件不变量]]I01～I16、[[C迁移后桌面接线清单]]D01～D12、[[C迁移联合验证用例]]M01～M14/F01～F07/J01～J08。明确C候选草稿校验与B已保存revision检查不能直接互换，迁移T1与启动恢复T2分开，历史SQL/账本不改写。新增实施任务[[C集成-迁移方案执行与联合验收]]保持active；协调材料、原实现知识页、依赖任务、CONTEXT/状态/索引/追加log同步入口，不形成迁移ADR决定或人员通过结论。

## 验证

本轮只读源码/原测试和固定证据核对见[准备审计](../../raw/c-migration-execution-plan-audit.json)。实际文档生成/只读check/lint、b3bc98c/654fecc/be53b98三基线同步、文件保留与diff检查见[本轮验证](../../raw/c-migration-execution-plan-validation.json)；完成前按真实结果更新任务。新的29个用例及12项接线未执行，不伪造产品suite结果，不把文档门禁当技术兼容/独立评审。

## 未完成项

A需交ADR/谱系/支持矩阵/登记与拒绝边界及固定实现，B需交最终适配/证据，C另行实现用例/组合迁移/桌面及macOS完整验证。人工审核发布、业务语义和实际非作者接收仍待；[[C集成候选-依赖与非作者签认]]/[[C04-收口签认]]保持active。未改号、历史SQL/公共契约/生产代码、未推送/合入/真实复测。

初次Wiki lint拒绝不变量表的缩写源码路径；辅助路径替换前两次因wiki-repo frontmatter和中文相邻文字匹配而未写入文稿，随后改为只处理正文ASCII源码路径并加inline code边界。初次及同样失败的重试门禁记录保留在[initial](../../raw/c-migration-execution-plan-initial-validation.json)/[retry](../../raw/c-migration-execution-plan-retry-validation.json)，最终门禁另记；未改源码或放宽检查。

最终准备门禁全部通过：225源码与45fa03d/b3bc98c一致，228非Wiki文件/190旧非生成raw/107324字节log前缀保持；生成、198页只读check/lint、b3bc98c/654fecc/be53b98同步及diff实际退出0。done仅材料整理；16条件、12接线、29用例在新组合均未执行，实施/人员任务继续active。
