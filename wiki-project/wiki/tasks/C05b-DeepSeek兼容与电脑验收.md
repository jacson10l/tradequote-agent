---
title: C05b-DeepSeek兼容与电脑验收
type: task
status: active
updated: 2026-10-31
sources:
  - conversation:用户要求继续验证现有DeepSeek配置再用computeruse验证偏离
  - packages/infrastructure/src/codex-harness.ts:1
  - tests/fixtures/codex-provider-host.cjs:1
  - https://api-docs.deepseek.com/guides/responses_api/
---

# C05b DeepSeek兼容与电脑验收

## 目标

继续C05同一独立codex/c-codex-harness工作树，taskBase仍24771fb8eb9c0ae80f29b7f9653794e3ba2886be，保留C05所有未提交成果和旧验证证据。本轮先验证已保存DeepSeek配置能否真实驱动Codex，再使用Computer Use操作正式Electron，确认业务目标没有再次退化成表单串联。

## 范围

本机macOS arm64，Node22.22.0/pnpm10.13.1/Electron44.9.2/Codex0.166.0-alpha.5.1。使用已有应用Main的ModelSettingsStore受控入口，不读取凭据文件、解密内容或真实业务库；新acceptance宿主只隔离Chromium会话与Business Worker数据库，保留生产设置入口。只发送明确合成业务文本，不修改用户保存Key/模型或全局Codex配置。

## 验收

1. 现有Chat连接控制成功，同一保存模型与Key通过原生Responses及Codex动态业务工具完成；不是转换代理或自建JSON模型循环。
2. 密钥只在已有宿主和子进程环境中使用，不在argv、模型上下文、数据库、证据或renderer响应中出现；配置固定api.deepseek.com，不静默回退到其他模型。
3. Computer Use在隔离真实窗口完成资料准备后，从工作台任务出发验证查询/缺项追问、补充数量保存、500修订/差异、来源与回复草稿、取消和重开；记录发现的偏离和修复边界。
4. 同步Wiki、真实命令/结果、追加日志、覆盖与所有适用门禁；不替A/B签认真实业务依据或确认语义。

## 改动

CodexTask新增仅宿主内可见的凭据快照，QuoteToolAgent/读服务从已有Main→Worker受控快照传递；Codex子进程采用DeepSeek原生Responses provider，Key通过环境变量提供，不落Codex配置、不进入命令参数。默认优先复用保存配置，没有配置时沿用本机Codex；配置存在但失败时明确失败，不切换供应商。UI连接说明随实际行为更新。

实际DeepSeek提前调用search_knowledge曾使ACTION_NOT_ALLOWED终止，修正为在12次原预算内向Codex反馈阶段失败和可用工具，不执行提前工具、不放宽写授权。工作台检查与回复复用持久saved_revision报告，严格版本绑定且不掩盖正式查询失败/已有报告。重试开始即锁住父工作台，返回成功直接绑定run；延迟IPC回归覆盖。只读进度和资料页移除与实际职责不符文案。

## 验证

生产设置入口状态为已保存deepseek-flash/encrypted，原Chat控制和原生Codex只读turn均成功，实际search_catalog两次；未读取Key原文。本机provider-report保留脱敏观测，提交版在raw/c05b-deepseek-computer-use.json。官方Responses/Codex资料与实际代码互证，不用Chat成功推断工具成功。

Computer Use通过cua_repl直接操作原生Electron窗口，隔离业务库和Chromium会话但使用正式Main设置。人工预览/发布合成CSV后，工作台缺数量追问→补100件V1 900.00 USD→改500件V2 4500.00与版本差异；两次首轮阶段失败保留，经显式重试恢复。600件修改在两次实际工具后取消，无V3；退出重开V2和运行记录恢复，不自动发请求。自动检查报告e9446bc8-3481-40c3-b538-4e95dcf697e1在报价面板和English回复一致，无手工补检查；规则覆盖pending，未当作通过。只读DEMO-PANEL 20m2返回250.00，当前V2仍4500.00，未保存新版本。来源为synthetic CSV与固定hash，不作为真实商业依据。

红绿证据：provider配置先红1/6再绿6/6；阶段纠正先红1/7再绿7/7；报告回显先红2/23再绿24/24（其中一项断言API误用另已修正）；重试锁先红1/4再绿4/4。完整单元520通过/3显式live跳过，build通过。最终门禁已完成：pnpm typecheck/build/check均退出0，pnpm wiki:test为36/36，pnpm exec playwright test --grep-invert 原生专项为12/12；wiki:generate后只读check/lint通过，wiki:sync固定24771fb8eb9c0ae80f29b7f9653794e3ba2886be基线通过（36源码/13知识页/2任务），git diff --check退出0。逐命令与本机日志路径在raw/c05b-deepseek-computer-use.json。新增重试测试初次typecheck因fixture缺clarification和误用workspace success类型失败，已修正后typecheck退出0，失败未冒称通过。

独立只读Agent复核指出重试IPC期间未锁父层，修正后再次复核未发现新增具体竞态；复核者未代跑本机测试。源码与Wiki保持同一交付，不推送/合入。

## 未完成项

本轮仅当前保存deepseek-flash与本机macOS场景，其他型号/Windows/签名安装未验；不替代旧C04全部语义矩阵。B非空“未确认”条款从pending消失仍待状态契约修复，A真实来源/规则和人员签认仍待。只读请求无公开取消与持久恢复；补充任务保存成功后旧waiting_input run仍为历史等待用户输入，是会话连续性欠账。C05整体保持active，不称全面无偏离。

关联：[[C05CodexHarness与单据工作台]]、[[C05-CodexHarness纠偏与工作台迁移]]、[[M4模型与报价修订]]、[[0031-DeepSeek原生Responses与运行报告复用]]。
