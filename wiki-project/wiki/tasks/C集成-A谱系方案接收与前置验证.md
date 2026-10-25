---
title: C集成-A谱系方案接收与前置验证
type: task
status: done
updated: 2026-10-23
verification:
  - wiki-repo:raw/c-a-lineage-wiki-validation.json:1
sources:
  - wiki-repo:raw/c-a-lineage-intake.json:1
  - wiki-repo:raw/c-a-lineage-native-validation.json:1
---

# C集成-A谱系方案接收与前置验证

## 目标

接收用户提供的A固定谱系方案，按C执行准备做首轮独立前置核验，保存失败/通过真实证据与后续责任。材料核验不代A/B/人员签认，不推送/合入/发送或真实模型复测。

## 范围

taskBase=1f6fbbbfd0e7ba8076f8d3a924779efa03818ed4，新独立codex/c-a-lineage-validation/worktree /Users/jason/.codex/worktrees/c-a-lineage-validation/tradequote-agent。A实现9cdd13a3755b4bd1d0a4ac300785021e47ed4a88、回复a58e97097994491a9e49c085ae9369ef9bd08019、取得远端头b9a0af76217e57e0ab22ba927de1a1a287b1145f。未合A/B代码，实际测试只在忽略目录的A原始archive/合成库内进行；生产/历史迁移源码不改。

## 验收

核对远端完整hash/祖先、A固定源码及九SQL指纹，区分原探针与生产migrate/repository；本机typecheck/原探针/原生聚焦验证均记录实际命令/退出码/完整脱敏输出，不把失败写成通过。已证实问题可定位到固定源码与可重现case，未运行的完整矩阵/桌面/人工项保持待办。C旧源码/raw/log保持，文档生成/check/lint、固定任务/目标/累计sync与diff通过后仅本记录任务可done。

## 改动

新增[[A迁移谱系固定提交接收与前置验证]]及接收/最终原生/初次原生/本轮Wiki验证记录；向运行不变量/接线/用例/协调与实施任务、人员任务及导航/状态/CONTEXT/追加log同步本轮结论。A方案已取得，完整实施仍需修正前置门禁及B适配，不再写成未取得A方案。

## 验证

见[接收/命令](../../raw/c-a-lineage-intake.json)、[原生最终失败](../../raw/c-a-lineage-native-validation.json)及[首轮夹具记录](../../raw/c-a-lineage-native-initial-validation.json)。固定A安装退出0；原探针9指纹/16分类/10追加复现一致；实际A typecheck退出1/11错误；实际迁移与repository原生12项7通过5失败，最终无harnessError，changes_required。新组合完整29用例、全量vitest/桌面/Electron UI/macOS联合未运行，Electron Node原生核验不能替代它们。

文档门禁单独见raw/c-a-lineage-wiki-validation.json，不能拿其passed替代上述失败。完成记录任务只表示取证与Wiki闭环，迁移实现/联合验收仍未完成。

## 未完成项

A需修类型/结构判据/旧账本一致性/新账本只读预检并补作者验证，B需报告消费适配及P1 lint回执，C再做完整迁移→桌面→macOS组合；A人工发布与业务语义/实际非作者分别留证。[[C集成-迁移方案执行与联合验收]]、[[C集成候选-依赖与非作者签认]]、[[C04-收口签认]]继续active；不改历史SQL、不推送/合入/代签/自动发送/真实复测。

记录收口：225纳管源码/228非Wiki文件、194旧非生成raw、109073字节log前缀保持；生成/200页只读check/lint与1f6fbbb/654fecc/be53b98同步、diff实际退出0。done仅接收/取证/Wiki闭环；A typecheck失败与原生12项7通过5失败仍保留，实施/人工任务active，未放行接线或真实模型。
