---
title: 0013-本机双平台验收停用Actions
type: decision
status: observed
updated: 2026-10-21
sources:
  - conversation:用户明确不要Actions和云端自动测试由本人macOS与Windows开发者本机验收
  - package.json:1
  - .github/pull_request_template.md:1
  - wiki-repo:raw/local-verification-actions.json:1
---

# 0013 本机双平台验收停用 Actions

## 背景

此前 C01a PR 的 Actions 因账户付款/额度在启动前失败，历史证据保留。用户现明确决定不使用 GitHub Actions 或云端自动测试；本人在 macOS、另一位开发者在 Windows，本机分别验收。

## 决定

关闭本仓库 Actions（API回读enabled=false），在C分支移除engineering.yml与wiki.yml及当前覆盖条目，通过原PR交付。删除workflow是用户主动选定本机工作流，不把历史startup_failure改写成通过，不再要求恢复付款/提高额度来合入。

保留全部pnpm命令、测试、构建、边界和P0 Wiki门禁；README/贡献规范/AGENTS/PR模板与协作页统一为本机证据加非作者评审。每个平台记录OS/CPU、Node/pnpm/Electron版本、实际提交、命令/退出码、行为结果和未完成项；Windows由Windows开发者补真实记录，不以macOS结果代签。

## 替代方案

仅删除workflow不能阻止其他未合入分支现存workflow触发；因此同步禁用仓库Actions。只停工程matrix却保留Wiki云端检查仍违背用户不使用Actions的决定。仅取消测试会失去金额/状态/持久化的本机验证，因此本地测试和Wiki检查保持。

## 后果

Actions关闭后PR没有云端自动门禁，评审者必须核对本机记录；无绿色远端检查不再是阻塞项，也不能宣称CI通过。C01a仍待技术复审和适用平台验收，C01整体与真实模型/持久化恢复边界不变。未修改GitHub账单、付款、预算或其他仓库权限；已产生的历史费用状态不在本决定范围。

## 回滚方式

仅在用户重新明确要求后恢复workflow及覆盖/导航、重新生成Wiki，并恢复仓库Actions设置和相应评审规则。保留本次与历史验证记录，不自动恢复或重跑。

关联 [[M1验证与协作]]、[[Wiki 工作流与任务记录]]、[[C01a-本机验收与停用Actions]]。


## 后续阶段顺序更新

用户随后明确先macOS需求开发、跳过当前Windows验证，详见 [[0014-macOS优先与Windows验收后置]]。本决定中停用Actions与本机质量/Wiki/复审继续有效；Windows当前不阻塞开发/合入，双平台真实记录保留为后续目标。
