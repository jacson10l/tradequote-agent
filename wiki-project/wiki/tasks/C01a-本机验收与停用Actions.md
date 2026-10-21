---
title: C01a-本机验收与停用Actions
type: task
status: done
updated: 2026-10-21
verification:
  - wiki-repo:raw/local-verification-validation.json:1
sources:
  - conversation:用户不要Actions不用云端自动测试macOS和Windows开发者分别本机执行
  - package.json:1
  - .github/pull_request_template.md:1
  - wiki-repo:raw/local-verification-actions.json:1
---

# C01a 本机验收与停用 Actions

## 目标

按用户最新决定停止本仓库GitHub Actions及云端自动测试，保留本机质量与Wiki验收，移除“处理账单/等待远端CI后才能合入”的旧前提。

## 范围

负责人C（Codex实施），继续独立codex/c01-agent-recovery和PR#2，目标codex/m1-foundation，不合并。实际起点60c4489d458f341adddfd723c103e75751401048，PR merge-base45a9975506030170bcb8dc770919b7cb5de89fa6；macOS arm64/Node22.22.0/pnpm10.13.1/Electron44.9.2。

## 验收

1. GitHub仓库Actions回读enabled=false，无进行中的云端运行；本分支不保留可执行workflow。
2. 本地pnpm命令与测试源码保留；macOS与Windows分别由实际人员记录执行结果，不伪造Windows通过。
3. 贡献/PR/Wiki/任务/状态统一本机记录与非作者评审，旧CI失败证据保留。
4. 覆盖映射、生成/只读check/lint、Wiki回归和本次起点/PR起点sync通过；更新原PR，不合并。

## 改动

通过GitHub REST关闭仓库Actions并回读；移除两个workflow和当前覆盖映射。删除engineering workflow的有效语义同步M1验证页，删除wiki workflow同步Wiki工作流/分工页，旧源码来源指向60c4489的历史链接。更新AGENTS、CONTRIBUTING、README、PR模板、知识页、C任务、CONTEXT/项目状态、导航和ADR0013。

仓库规则集接口返回403（当前套餐不支持）；不据此宣称已设/已清理服务端分支保护。未修改其他权限、账单、预算、代码业务逻辑或本机测试实现。

## 验证

关闭Actions后已回读enabled=false、in_progress运行数0。当前改动仅配置/文档，本地业务代码与上一提交60c4489一致，其53项单测/5项实际Electron和类型/构建证据仍保留raw/c01a-p2-validation.json，不冒充本轮重新执行。此次pnpm check（Biome、6项工程、边界、Wiki生成只读校验/lint）、36项Wiki回归、生成器与60c4489/45a9975两套sync均退出0；确认业务与本地测试源码/命令未变，远端Actions disabled断言通过。实际命令/退出码记录raw/local-verification-validation.json。本配置子任务done，不代表C01a技术复审或Windows业务验收完成。

## 未完成项

Windows本机实际验证由Windows开发者执行并记录，当前未运行；真实DeepSeek、C01b持久化恢复、C01c运行UI及A/B集成仍未完成。C01a技术复审保持待办，PR不合并。本配置任务与C01总任务分别记录，不恢复云端CI。

关联 [[0013-本机双平台验收停用Actions]]、[[M1验证与协作]]、[[C01a-状态机与取消基础]]。
