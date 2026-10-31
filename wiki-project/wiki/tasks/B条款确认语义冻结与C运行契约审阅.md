---
title: B条款确认语义冻结与C运行契约审阅
type: task
status: active
updated: 2026-10-31
sources:
  - conversation:C06交付要求B修复未确认条款消失并审阅C运行契约
  - packages/contracts/src/values.ts:1
  - packages/contracts/src/index.ts:1
  - packages/domain/src/trade.ts:1
  - packages/contracts/src/foundation.test.ts:1
  - packages/domain/src/trade.test.ts:1
  - wiki-repo:wiki/M1接口与持久化.md:1
  - wiki-repo:wiki/M2真实报价V1.md:1
  - wiki-repo:wiki/B对C运行契约非作者审阅.md:1
---

# B 条款确认语义冻结与 C 运行契约审阅

负责人 B。C06 固定交付要求 B 修复"未确认条款消失"、冻结显式确认语义、保持旧数据兼容与失败/取消语义，并对 C 运行契约给出非作者审阅意见。本任务在既有 `codex/b-maintenance-evidence-increment` 分支追加，不新开分支（用户已确认沿用当前分支），不修改历史报价快照与历史证据，不代签 A 或人工评审。

## 目标

修复询报价中"非空文字被当作已确认"的漏洞：付款/交期字段填入"待客户确认/未确认/未知/来源缺失/模型建议"等文字时，必须继续出现在 pending 列表中；在契约层冻结六态确认语义，确保 `confirmed` 仅由人工受控入口产生；并对 C 运行契约给出 B 的非作者审阅意见。

## 范围

- 契约层：`values.ts` 新增 `TermConfirmationStatusSchema`（六态）、`isUnconfirmedTermText`、`classifyTermConfirmation`，`index.ts` 同步导出。
- 领域层：`domain/trade.ts` 的 `calculateQuoteV1` 修复——付款/交期非空但属未确认措辞时仍进入 pending。
- 测试：`foundation.test.ts` 新增确认语义正反例，`trade.test.ts` 新增 pending 反例。
- 审阅：新增 [[B对C运行契约非作者审阅]]，对 runs/events/read tools/pending-client/preload/Worker/Main、幂等/取消/中断/旧 JSON 兼容给非作者意见。
- 不修改：`runs.ts`/`events.ts`/`pending-client.ts`/迁移 1~3/`agent-executor.ts`/`trade-store.ts`（只读审阅，不改代码）。

## 验收

- 非空未确认措辞（"待客户确认/未确认/未知/来源缺失/模型建议/TBC"等）在 `calculateQuoteV1` 中仍进入 pending，不从待确认列表消失。
- `classifyTermConfirmation` 永不返回 `confirmed`；`confirmed` 仅由 human_ui 显式产生。
- 旧 JSON/旧快照字节不被改写，迁移 1~3 不动。
- contracts+domain 单测全通过，typecheck/biome/wiki check/lint/sync 全通过。

## 改动

- 契约：`TermConfirmationStatusSchema` 冻结 `unknown/blank/pending_confirmation/confirmed/withdrawn/legacy_unstated` 六态；`isUnconfirmedTermText` 对未确认字面量做 NFKC+大小写折叠+连续空白折叠确定性匹配；`classifyTermConfirmation` 永不返回 `confirmed`。
- 领域：`calculateQuoteV1` 由 `if (!input.payment)` 扩展为"空或未确认措辞都进 pending"，未确认措辞标注"已填写但未获人工确认"。

## 验证

`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run packages/contracts packages/domain` 13 文件 91 项全部通过（含新增 foundation 确认语义反例 + trade pending 反例）。`node node_modules/typescript/bin/tsc --noEmit` 退出 0；`node node_modules/@biomejs/biome/bin/biome check <改动文件>` 退出 0。本机 Windows 缺 VS C++ 未构建 better-sqlite3，Electron/e2e/build 未运行，不写成通过。

## 未完成项

- 真实 DeepSeek 语义核对、Electron 桌面验收（macOS）、Windows 安装/签名均未执行。
- 持久化 run 表、`agent.start/get/cancel/retry` IPC 接线、重启恢复属 C 待验收，B 只维护契约形状。
- A 存储/来源/发布语义评审与 T00 人工签字未完成。
- 本任务 done 不表示 C06 组合验收通过；C 组合接线与 macOS Q01~Q07 仍待 C 在收到本固定 SHA 后执行。

关联：[[M1接口与持久化]]、[[M2真实报价V1]]、[[B对C运行契约非作者审阅]]、[[B对A维护证据缺口裁定]]。
