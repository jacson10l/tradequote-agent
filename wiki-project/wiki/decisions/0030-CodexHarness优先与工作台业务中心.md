---
title: 0030-CodexHarness优先与工作台业务中心
type: decision
status: active
updated: 2026-10-31
sources:
  - conversation:用户明确CodexHarness为执行目标及页面职责与验收变更
  - packages/infrastructure/src/codex-harness.ts:1
  - apps/desktop/src/renderer/src/features/workbench.tsx:1
---

# 0030 Codex Harness 优先与工作台业务中心

## 背景

历史采用DeepSeek Harness实验与自建JSON执行器，没有证明真实Codex接入；首页布局预览与资料长页按钮串联偏离Agent中心。用户要求紧急纠偏且明确顺序。

## 决定

C优先验证Codex app-server真实原生工具调用及Electron/取消/恢复；再将业务搬至单据工作台。DeepSeek配置兼容性单独实测，不能由同名Harness或HTTP替身推断。A提供真实来源版本，B维护工具契约与规则/条款确认状态。正式验收从工作台业务目标开始。

## 替代方案

继续自建DeepSeek JSON循环无法满足指定Codex目标；仅更名或接口包装不成立。Codex SDK/exec可用于后台一次任务，但本轮采用app-server以直接处理原生工具与中断生命周期。既有业务服务完整复用，不复制金额、规则或存储服务。

## 后果

新增可审查的executionMode与原生适配；本机需安装并连接Codex。C05初轮不承诺旧设置兼容；C05b实测后按[[0031-DeepSeek原生Responses与运行报告复用]]受控复用，不迁移或改写保存Key。业务与资料页面分工改变，测试按新工作台入口验收。条款确认状态缺口仍须B解决，迁移页面不使其消失。

## 回滚方式

未推送或合入前保留独立候选；若Codex不具备运行条件则返回明确失败并保持旧快照，不静默切换为其他执行器。可撤回本切片恢复既有入口；旧实验和失败证据保留。

关联：[[C05CodexHarness与单据工作台]]、[[C05-CodexHarness纠偏与工作台迁移]]、[[M0平台验证记录]]。
