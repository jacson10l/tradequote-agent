---
title: 0014-macOS优先与Windows验收后置
type: decision
status: observed
updated: 2026-10-21
sources:
  - conversation:用户明确先跳过Windows验证先完成需求开发默认以mac为主
  - AGENTS.md:27
  - .github/pull_request_template.md:13
---

# 0014 macOS 优先与 Windows 验收后置

## 背景

此前停用云端Actions时安排两平台分别本机验收；用户最新明确先完成需求开发，当前默认以macOS为主，先跳过Windows验证环节。本决定调整当前顺序与合入条件，不把未执行的测试记为通过。

## 决定

当前需求开发、C01a及后续PR以适用的macOS本机类型检查、测试、构建、实际Electron和Wiki证据为准；Windows验证后置，不阻塞当前开发或合入。保留P0代码/Wiki同交付、金额/状态/事务验证、非作者技术复审和独立分支规则。GitHub Actions继续关闭。

Windows仍记“未验证/后置”，不据macOS推断Windows兼容。核心需求完成后再由Windows开发者补本机运行/安装证据，跨平台目标保留；最终发布范围依据真实验收记录。

## 替代方案

继续要求每个当前PR先完成Windows验证会违背用户最新顺序；取消本机测试或伪记Windows通过会丢失真实证据。因此只调整Windows验证的时机和阻塞关系。

## 后果

PR#2不再缺Windows合入前置项，P2已修复且macOS证据保留，仍需非作者对最终版本复审。C01b/C01c、真实模型、完整恢复与正式导出等业务工作仍按原范围未完成，本决定不代表授权合并PR或改变B00/迁移依赖。

## 回滚方式

用户重新要求双平台阶段验收时，补齐对应Windows真实记录，再同步AGENTS、贡献/PR模板与任务/状态；保留本次决策和历史测试证据，不回写历史为通过。

关联 [[0013-本机双平台验收停用Actions]]、[[C01a-状态机与取消基础]]、[[M1验证与协作]]。
