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

## 2026-11-01 C08 修复：非空拟议条款默认 pending（关闭 C07 英文反例）

C08 指出前一版只处理"未确认措辞字面量"（`isUnconfirmedTermText` 词表），真实拟议文本 `Proposed` / `Subject to supplier confirmation` / `30% deposit; 70% before dispatch` 因不命中词表而漏出 pending。本修复把 `calculateQuoteV1` 的付款/交期判定从词表匹配改为 `classifyTermConfirmation` 语义——**任何非空文本都默认 `pending_confirmation` 进入 pending**，只有人工受控入口（human_ui 审批）能产生 confirmed 事实。

- **契约**：未改 `values.ts`（`classifyTermConfirmation` 语义已正确冻结）；修正的是 `domain/trade.ts` 未调用该契约、仍用词表的问题。
- **领域**：`calculateQuoteV1` 对 payment/delivery 改为 `classifyTermConfirmation(...) === "blank"` 区分空白与非空；空白 →「付款条款待确认」/「交期与交货条件待确认」，非空 →「…（已填写但未获人工确认）」。删除 `isUnconfirmedTermText` 引用。
- **回归**：`trade.test.ts` 新增 C07 英文反例（deposit/EXW/proposed/subject to supplier confirmation + 空值），并把原「具体条款不进 pending」的错误断言改为「具体条款仍 pending」。
- **验证**：contracts+domain 单测通过；全量单测 564 通过，仅 2 项 Windows symlink EPERM（storage.test.ts / worker-migration-gates.test.ts，预存在环境限制，与本改动无关）；`tsc --noEmit` 退出 0；改动文件 biome 全过。
- **版本链**：pending 由 `calculateQuoteV1` 每次重算，`reviseQuote`（V2/V3/V4/重开）复用同一计算路径，故未确认付款/交期在版本链与重开后不消失；旧快照/检查报告/来源快照不被回写。
- **仍未完成**：真实 DeepSeek 语义核对、macOS Electron 桌面验收、Windows 验证后置；`confirmed` 事实的完整人工受控入口仍只有 `quote.approve`，付款/交期的逐条人工确认 UI 尚未单独建模。

关联：[[M1接口与持久化]]、[[M2真实报价V1]]、[[B对C运行契约非作者审阅]]、[[B对A维护证据缺口裁定]]。
