---
title: C人工验收操作手册编写
type: task
status: done
updated: 2026-11-01
verification:
  - wiki-repo:raw/c-manual-acceptance-validation.json:1
  - wiki-repo:raw/c-manual-version-limit-clarification-validation.json:1
sources:
  - apps/desktop/src/renderer/src/App.tsx:1
  - apps/desktop/src/renderer/src/features/workbench.tsx:1
  - apps/desktop/src/renderer/src/features/quotes.tsx:1
  - apps/desktop/src/renderer/src/features/model-settings.tsx:1
  - docs/roadshow/c07/catalog.csv:1
  - docs/roadshow/c07/inquiry.md:1
  - wiki-repo:wiki/M2真实报价V1.md:1
  - wiki-repo:wiki/M4模型与报价修订.md:1
  - wiki-repo:wiki/C07业务资料与路演收口.md:1
  - wiki-repo:wiki/MVP人工验收操作手册.md:1
---

# C 人工验收操作手册编写

## 目标

为当前 macOS 集成版本提供一份可现场执行的 MVP 人工验收手册，明确操作步骤、预期值、保存证据、安全边界与未验收事项。

## 范围

- 记录应用启动、独立工作区和业务场景、CSV 预览与人工发布、模型可选配置、报价 V1/V2/可选 V3、检查报告、客户回复草稿、重开及持久化检查。
- 使用 `docs/roadshow/c07/catalog.csv` 与 `docs/roadshow/c07/inquiry.md` 作为固定合成案例，不新增或重编商品资料。
- 不改产品代码，不把演示资料发布等同于真实性、供应商、认证或价格有效性审核。

## 验收

- 手册通过 Wiki 结构、链接和占位内容检查，新增页面可从 Wiki 导航到达。
- 操作步骤与桌面界面、固定询盘轮次和商品目录相符；金额只作为核对预期，不伪装成供应商承诺。
- 明确未确认条款、未知费用、客户数据/Key保护、复制与审批/发送边界，以及 Windows/签名包等未验收范围。
- Wiki 同步检查基线为本次改动前的 `HEAD`，且差异均有对应知识页内容更新。

## 改动

- 新增[[MVP人工验收操作手册]]，覆盖验收准备、桌面操作、证据记录、异常处理及验收记录模板。
- 主流程按 `inquiry.md` 的第 1 轮追问缺项、第 2 轮给出拟议条款并保存 300 件 V1、第 3 轮改为 500 件 V2 排列；付款、交期、EXW 地点保留待供应商确认状态。
- 明确 V3 为本次验收可选项而非版本上限；若 V3 不满足客户需求，可基于最新版本继续生成 V4、V5 等。
- 更新[[C07业务资料与路演收口]]、Wiki 首页、`CONTEXT.md` 和 `log.md`，添加操作入口与阶段记录。

## 验证

- 澄清后的实际复验命令、基线与结果记录在 `raw/c-manual-version-limit-clarification-validation.json`。

## 未完成项

- 手册是操作指南，不构成人工业务签认；执行结果须由验收者逐项记录为通过、失败或未执行。
- 真实商品与供应商资料、条款、认证、平台规则、正式审批/外发、Windows 和签名安装包仍需各自责任人验收。
- 当前交付仅为文档，不包含代码变更或人工业务验收签认；未提交、未推送。

关联：[[C07业务资料与路演收口]]、[[C集成-ABC合并与后续分工]]。
