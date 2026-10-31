---
title: C02b-Worker与桌面只读入口
type: task
status: done
updated: 2026-10-21
verification:
  - wiki-repo:raw/c02b-desktop-validation.json:1
sources:
  - conversation:用户要求C02b接正式Worker桌面入口四工具实际使用知识规则不注册代码测试Wiki同步
  - packages/contracts/src/read-tools.ts:1
  - packages/infrastructure/src/catalog-quote-read-service.ts:1
  - apps/desktop/src/workers/business.ts:1
  - apps/desktop/src/renderer/src/features/read-assistant.tsx:1
  - tests/e2e/read-assistant.spec.ts:1
---

# C02b Worker与桌面只读入口

## 目标

将四个已有真实只读工具接到正式Worker和桌面入口，用户可在应用里操作、核对事实和来源；知识/规则保持未注册，不改变原报价保存协议。只完成本用户授权的四工具桌面切片，不关闭完整T41/C01恢复。

## 范围

执行者Codex（C），沿用本聊天独立worktree /Users/jason/.codex/worktrees/c-runtime-roadmap/tradequote-agent。上轮只读adapter已保存为本地提交4324dc85bdd00657831f7428496c60e5332bb428；新分支codex/c02b-desktop-read-tools，taskBase即4324dc8，共同/PR基线仍be53b98。环境macOS arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2。用户本轮授权正式接线，因此必要contracts/公共导出/调用方/mock/测试同批同步，不冒充B/A人工签字。无新依赖/迁移/数据库写入口/真实Key或用户运行库访问，不推送或合并。

## 验收

- [x] 独立strict agent.read/readAgent及四工具结果统一导出；Main/Worker/preload均校验，拒绝客户端workspace/asOf/credentials/工具/权限注入，旧报价路径兼容。
- [x] Worker使用真实repository、宿主workspace/时钟与Main凭据；只读并发门禁/同ID在途去重/失败释放，无隐式重试、持久化或报价写入。
- [x] 页面选择授权报价、填写任务并运行，能读四工具结果/来源/金额/错误；未保存预览、模型说明与澄清区分，空/错/忙/禁用/键盘和窄屏实际验证。
- [x] Electron真实设置/Worker/SQLite链路展示900.00原报价、1080.00核价预览，前后板面一致；缺凭据/知识规则拒绝/NOT_FOUND/澄清/401/重开不重发通过。
- [x] typecheck、适用单元/含build的全部Electron、工程与Wiki维护/生成/check/lint，以及固定taskBase和累计PR基线sync均有实际退出码和结果。

## 改动

新增contracts/read-tools及测试，共享命令、四类输入/结果/观测，adapter删掉内部重复schema并复用公共定义。新增CatalogQuoteReadService及测试与公共导出，Worker接独立分支，Main开放精确agent.read并注入凭据，preload新增严格readAgent，readonlyMock明确不可用。Main只读传输等待135秒，覆盖原120秒运行预算，保留旧60/15秒；进程退出/超时不误称保存未知或自动重发。

新增侧栏“只读助手”及独立页面，实际结果/来源与模型说明分开。新增Worker等待/退出测试、preload边界测试与真实Electron四工具流程；细节见 [[C02b桌面只读助手]]、[[0018-独立只读命令与桌面接线]]。同步旧C02b页的阶段边界、路线、M1/M4/接口/能力、状态/CONTEXT/README、覆盖与追加日志。

## 验证

本轮实际结果见[验证记录](../../raw/c02b-desktop-validation.json)。首轮104项单元已通过；定向真实Electron四工具用例已通过（本地HTTP合成动作，业务为真实SQLite/领域金额）。截图检查发现旧basis样式导致事实正文右对齐，改用独立分隔区，文本左对齐、数量金额右对齐；保留初始截图后全量复验。最终104单元、含build的全部6项Electron、6项工程、36项Wiki工具及类型/生成/check/lint/双基线sync均退出0；宽屏表单与900px结果截图已实际复查。done只指本任务授权的四工具正式桌面切片，知识/规则与完整T41仍待实现。真实DeepSeek与Windows/签名安装未运行。

## 未完成项

知识/规则服务仍缺，生产模型账户的语义/效果未评估；无只读任务持久化/跨重启重放/公开取消和事件，重新运行可能再次收费。C01b/c、C02c、C03不因只读页面完成而关闭。完整C02b仍部分（知识/规则未接），本任务done仅限四工具正式Worker/桌面入口。无新数据库/依赖升级，无推送、PR或合并；仍需非作者按实现/Wiki/本机证据复核。

关联 [[C02b桌面只读助手]]、[[C02b-商品与报价只读工具]]、[[双参考项目功能对照与C开发路线]]、[[Wiki 工作流与任务记录]]。

首次全量回归发现旧workspace Electron精确桥接名单遗漏readAgent，6项中5通过/1失败；旧失败保留raw/c02b-desktop-initial-validation.json。只补这一授权方法，未放宽Node/任意IPC等断言，随后复跑完整六项。
