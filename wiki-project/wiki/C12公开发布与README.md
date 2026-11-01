---
title: C12公开发布与README
type: process
status: observed
updated: 2026-11-01
sources:
  - wiki-repo:raw/c12-public-main-validation.json:1
  - conversation:用户授权将集成分支合入main公开GitHub并更新README且选择MIT
  - README.md:1
  - LICENSE:1
  - THIRD_PARTY_NOTICES.md:1
  - AGENTS.md:1
  - CONTRIBUTING.md:1
---

# C12公开发布与README

## 发布目的与分支职责

用户明确授权将 origin/codex/m1-abc-integration 合入 main、将 GitHub 仓库公开并更新 README，随后明确选择 MIT。实施起点为集成分支 3f3332b05ebf5527854685ac57e63a2586962961；远端 main 为 ef14fc3c1838f3b605956dd00922a2517f9144a6，比较为 main 独有0、集成独有213，适合快进且无需覆盖历史。独立任务分支 codex/c12-public-main 仅修改入口文档、许可与Wiki，不改业务代码。

main 成为公开默认入口，接收已验收集成成果；codex/m1-abc-integration 保留团队集成与人工验收基线。成员仍在独立任务分支开发，先集成并记录门禁，再按发布安排同步 main。AGENTS/贡献规范同步本次决策，历史任务保留原时点描述。

## README 面向首次访问者

旧入口堆叠M0/C02/C05历史状态，与当前工作台导航及已集成能力不一致。新版按产品定位、当前能力、准确环境、安装/模型配置/CSV/工作台流程、真实目录、架构、固定版本验证、边界和贡献组织。明确 Codex CLI 是外部运行前提，pnpm 不自动安装；用内联合成CSV，避免把来源商品目录误称合成资料。

英语/德语说明限定固定文案与待确认语义；原始商品/客户名和单位不凭空翻译。两个小人的运行状态、人设记忆、只读业务摘要和无写报价工具分别说明；启动页说明减少动态行为。保留人工审批、邮件/PDF、Windows/安装包和效率量化未完成边界。593/14/36注明功能固定00022ce的历史本机证据，首轮并发失败保留，不冒称本次文档改动重新全量验收。

## MIT 与第三方范围

用户选择后新增根 LICENSE：Copyright (c) 2026 TradeQuote contributors，使用标准 MIT 文本。上游副本和依赖保留原许可；供应商截图、网页快照及引用材料不纳入项目自有代码的 MIT 授权。根THIRD_PARTY_NOTICES同步此前“许可证未选择”的过时说法；详见 [[0035-main公开入口与MIT许可]]。

## 公开前检查及范围

通过GitHub CLI确认目标jacson10l/tradequote-agent为PRIVATE、默认main、尚无licenseInfo，Actions disabled。连接器返回404，故使用本机已登录CLI完成同一目标操作。扫描所有本地可达Git对象中的常见私钥、GitHub/provider/cloud token、长Bearer、URL口令及Cue分享密钥格式，仅输出文件/行与规则，不输出候选值。扫描结果和远端分支/可见性实测记录在本任务回执；模式检查不能保证不存在任何敏感内容，不冒称完整安全审计。运行数据库、配置凭据及生成安装包受既有忽略规则保护。

公开操作仅改可见性，保留Actions停用、分支历史与既有协作者，不创建发布标签、上传安装包或删除分支。分享密钥不写README或Git。实际完成状态以 [[C12-main公开与README更新]] 及后续远端回读为准。

关联 [[分支收口与共同基线]]、[[Wiki 工作流与任务记录]]、[[项目状态]]。


## 2026-11-01 C12公开发布完成

已将固定e33b68972a20d6c37270348fd3e5aeea2a2b3a32普通快进并原子推送至origin/main和origin/codex/m1-abc-integration，ls-remote两分支全SHA一致；原main历史完整保留。GitHub CLI可见性变更退出0，回读PUBLIC、默认main、MIT License，Actions仍disabled。无认证HTTPS读取仓库API、main的README与LICENSE均HTTP200，两个原文与本机逐字节一致。该任务已完成；下一文档提交仅保存回执，最终头部另行推送回读。代码能力和人工/Windows边界不变。证据见raw/c12-public-main-validation.json；关联[[C12公开发布与README]]、[[C12-main公开与README更新]]。
