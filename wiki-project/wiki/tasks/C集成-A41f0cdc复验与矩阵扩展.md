---
title: C集成-A41f0cdc复验与矩阵扩展
type: task
status: active
updated: 2026-10-25
sources:
  - conversation:用户交付A41f0cdc授权后推送回执并要求独立复验后推进矩阵
  - wiki-repo:raw/c-a41f0cdc-intake.json:1
  - wiki-repo:raw/c-a41f0cdc-m13.json:1
  - wiki-repo:raw/c-a41f0cdc-matrix.json:1
  - wiki-repo:raw/c-a41f0cdc-wiki-validation.json:1
---

# C集成-A41f0cdc复验与矩阵扩展

## 目标

取得A固定修正后独立复验X01～X11，通过后继续完整迁移矩阵。X01～X11复验已通过，矩阵扩展发现5项新阻断，本任务保持active，不将限定通过当迁移整体完成。

## 范围

taskBase=fd2fa2529d2ebc919ca669b16486b0bc87484c89，独立分支codex/c-a41f0cdc-validation，工作树/Users/jason/.codex/worktrees/c-a41f0cdc-validation/tradequote-agent。固定A41f0cdc4d2d8db931f00f4c2fc141e4274abf82b与远端完整SHA一致；A175份非Wiki文件与Git blob一致。环境macOS26.4 arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2/内嵌Node24.22.0；SQLite版本见原始证据。没有将A/B生产实现导入C，也没有创建新公共出口/DTO。

## 验收

原九样本与X10/X11断言保留，控制组必须真实拒绝，损坏库只读/写迁移均拒绝且无未声明副作用；再按[[C迁移联合验证用例]]实际推进M/F矩阵、保留原SQL/行与幂等事实。所有失败/未测范围显式记录，旧raw/源码/log不改。知识页和本任务、状态/导航/log及真实基线门禁同交付。

## 改动

新增[[A41f0cdc独立复验与迁移矩阵阻断]]和四份原始JSON（intake/native/m13/matrix），完整脚本嵌入证据可复跑；同步[[C迁移联合验证用例]]、[[C迁移后运行与事件不变量]]、[[C迁移后桌面接线清单]]、当前任务入口和CONTEXT/项目状态/索引/追加log。只修改Wiki/证据，不改生产/测试/迁移/维护脚本或覆盖映射。

## 验证

实际命令/argv/cwd/环境覆盖/起止时间/退出码/stdout/stderr/hash见raw/c-a41f0cdc-intake.json。pnpm install --frozen-lockfile、pnpm typecheck、A作者探针、原样infrastructure构建、C原12项、M13四项/五变体/两修正、macOS infrastructure45与contracts35均退出0。作者探针30分类/10追加/2控制组与固定作者原证据结构一致；原12项12/12，X01～X11 11/11（全部控制组真实保护）通过。A只读Wiki check/lint和固定cece332 sync最终通过；首次归档Git上下文错误及Python解包参数错误作为运行器失败保留。

matrix实际Electron命令退出1；107项102通过/5失败，无harnessError。11条支持SQL输入与重开保留通过；M09-L01/L02、M13-Y01/Y02/Y03误接受升8。Y01/Y02实际删掉4条旧步骤、Y03实际同attempt两条prepared，原控制组拒绝。F01十条路线8个选定边界80/80、F02 C7四个真实SIGKILL点4/4；未覆盖所有逐DDL/登记/谱系/并发检查点。SQL级syntheticJSON保留不是领域有效业务fixture/实际人工发布或组合验收。

本轮生成/只读check/lint、固定taskBase及共同目标654fecc与累计be53b98 sync、diff与原证据保留检查另存raw/c-a41f0cdc-wiki-validation.json；文档门禁不得覆盖产品失败。未修改维护工具/映射，不额外运行其回归。

## 未完成项

A修M09账本异常/明确已知历史映射和拒绝策略、M13有效体与真实目标表判据并提供新固定实现；C复验5失败并保持X01～X11、已有升级/回滚/强杀回归，然后补完整M/F。B新组合报告/消费/P1同事务与旧业务回放，C运行恢复/Worker互斥/正式接线/D/J/macOS联合及各实际人员签认/业务验收仍待。B材料已接收，不重复核验或混用平台成绩。不推送、合入、外发消息或真实模型复测。

关联：[[A41f0cdc独立复验与迁移矩阵阻断]]、[[C集成-迁移方案执行与联合验收]]。

最终文档门禁实跑通过：生成225文件、只读check、lint（209 Markdown/181语义页）、固定fd2fa25/真实共同merge-base654fecc/累计be53b98三套sync、diff均退出0。215份旧raw、228份非Wiki和120107字节旧log前缀保持。复核后为提交后丢回复/重试/强杀重开补显式原列值比较，最终矩阵重跑仍107项102通过/5失败（前次命令输出保留）。产品与人员任务保持active；文档门禁通过不代表联合迁移通过。
