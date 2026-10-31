---
title: C05-CodexHarness纠偏与工作台迁移
type: task
status: active
updated: 2026-10-31
sources:
  - conversation:用户要求C先真实Harness再工作台迁移及AB业务依据
  - packages/infrastructure/src/codex-harness.integration.test.ts:1
  - apps/desktop/src/renderer/src/features/workbench.tsx:1
---

# C05 Codex Harness 纠偏与工作台迁移

## 目标

负责人C；用户已明确顺序与页面职责。以工作台提出业务目标、真实Codex调用现有工具完成为验收，不以人工串联长页面按钮为闭环。

## 范围

### 基线

独立worktree /Users/jason/.codex/worktrees/c-codex-harness/tradequote-agent，分支codex/c-codex-harness；实际taskBase=24771fb8eb9c0ae80f29b7f9653794e3ba2886be（最新C候选）。聊天原目录654fecc是较旧共同基线，未在该目录开发、未覆盖其他成员分支。macOS arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2；本机Codex0.166.0-alpha.5.1。

## 设计与执行计划

1. 确认原Harness来源和现有工具/事务，取得Codex真实进程握手与协议类型；采用app-server原生动态工具，业务工具加前缀避免与内置apply_patch冲突。替代方案SDK/exec适合一次性脚本，但本次桌面需生命周期、进度与中断；不扩建自写模型循环。
2. 编写协议失败/取消/晚到写/超时回归；复用QuoteToolAgent现有工具与AgentRunCoordinator落库。没有保存凭据不得以文本答复完成。
3. 真实Codex驱动商品查询、核价、V1、500数量V2、缺项和旧快照保持；取消/失败重开后显式retry保持原operationKey，记录真实结果与失败。
4. 工作台整合任务对话、当前单据、中间预览、进度、澄清、规则、差异与回复；资料页只保留导入/发布/来源/历史入口。只读查询和试算复用原工具，明确不保存。
5. 实际Electron闭环与已有业务回归；同步Wiki知识/任务/ADR/CONTEXT/状态/log/覆盖，生成及只读check/lint/固定taskBase sync/维护回归。各步骤按实测结果更新，不因紧急跳过P0。

## 验收

从工作台提出任务→Codex实际原生工具调用→确定性金额与来源→保存草稿→数量500修订/重检/差异；取消不写、失败/重启不自动收费重试。DeepSeek兼容性只有实测才可声明。A来源/版本与B规则/确认状态不由C代签。

## 改动

实现与接口数据影响见[[C05CodexHarness与单据工作台]]。保留业务工具、旧报价不可变、事务、幂等、运行恢复与来源记录。公共契约最小增量需B复核；未合入、未推送。

## 验证

### 开工与初轮历史

安装冻结锁文件通过；开工全量505/505。真实Codex进程initialize握手通过。协议4项回归通过。首次真实V1经过5步工具完成900.00 USD且保留条款缺项；V2在写工具前ACTION_NOT_ALLOWED失败，已保留本轮失败，当时进入原生apply_patch命名冲突修正。最终命令/退出码及结果已在下方追加，本段保留初轮历史。

## 未完成项

C本机实现、真实Codex、正式Electron与独立Agent技术复核已完成本页最终范围；整体任务保持active，仍需B公共契约/条款确认语义复核与A真实业务来源签认。C05初轮未验证DeepSeek作为Codex供应商；后续C05b已对当前保存型号实测通过；B“非空未确认条款被视为已填”问题待其语义与状态契约，A真实来源/版本仍需资料作者验证；本次不冒充人员验收。Windows与签名安装后置。

关联：[[C05CodexHarness与单据工作台]]、[[C01-Agent运行恢复与集成]]、[[M1工作台]]。

## 最终本机结果与交接

2026-10-31 C完成本机最小纵向切片：真实Codex原生工具完成V1=900.00 USD，数量500的V2=4500.00 USD，旧V1快照不变。取消先等待首次真实业务工具，再取消活动turn，确认未保存；失败重开不自动重发，显式retry保留operationKey与attempt并只提交一版。实际非空model在turn前验证并写入已提交对话。

正式Electron专项从工作台业务目标开始，覆盖真实V1/500修订/差异/缺项、同处只读查询、取消、重开与历史返回工作台，1/1通过；原有12项Electron回归通过。最终单元514通过、3项真实Codex默认跳过后显式单独3/3通过。工作台3项回归覆盖询盘/修订澄清重开与跨单据隔离。类型、构建、工程/Wiki生成/只读check/lint/固定24771fb基线sync和36维护回归的最终命令/退出码见[本机验证](../../raw/c05-codex-workbench-validation.json)。已有Vite配置与bundle大小提示不视为安装验收。

独立只读Agent评审指出的信号清理、澄清恢复、读工具计数、执行锁、实际模型身份和跨报价上下文污染均已修正并验证；不冒充人员签认。空MCP表合并及宿主虚拟transport的初轮失败保留，现已盘点名称后为业务线程显式禁用所有既有服务器并给出有效禁用transport。盘点可能初始化用户配置连接，不向模型开放其工具或资源。

B问题已通过隔离合成业务服务复现：付款/交期均为“未确认”时两项pending均为false。该问题尚未修复，需B补显式确认状态与规则语义。A补来源原件/版本/人工发布依据；B复核executionMode、calculationPreview和工具契约；C不复制规则、不代签、不推送/合入。C05初轮未验证DeepSeek作为Codex供应商；后续C05b已对当前保存型号实测通过，Windows和签名包后置。

C05b继续验证已完成当前保存deepseek-flash原生Responses与Computer Use核价/修订/只读/取消恢复，实际首次失败和修复分别记录，不改本页C05原证据。详见[[C05b-DeepSeek兼容与电脑验收]]、[[0031-DeepSeek原生Responses与运行报告复用]]；A/B和生命周期剩余项保持active。
