---
title: B对ABC集成非作者复核
type: process
status: active
updated: 2026-11-01
sources:
  - packages/domain/src/trade.ts:1
  - packages/domain/src/revision.ts:1
  - packages/domain/src/revision.test.ts:1
  - packages/domain/src/quote-delivery.ts:1
  - packages/contracts/src/values.ts:1
  - packages/domain/src/quote-checks.test.ts:1
  - wiki-repo:wiki/tasks/C集成-ABC合并与后续分工.md:1
---

# B 对 ABC 集成非作者复核

## 目标

在 C 完成 ABC 合并与推送后，B 以非作者身份核对集成分支、验证 V1/V2/V3 与重开后的付款/交期 `pending` 继承，复核规则案例与客户回复语义，并补齐 `reviseQuote` 的回归测试。不改 C 的生产逻辑。

## 范围

- 核对 `origin/codex/m1-abc-integration` 的合并结构、A/B/C 三个固定 SHA 与合并/任务提交。
- 验证 `calculateQuoteV1` 单点重算 + `reviseQuote` 复用后，V1/V2/V3/重开未确认条款仍进入 `pending`。
- 复核 QUOTE-01～06 规则案例与客户回复（`quote-delivery.ts`、`customer-reply-format.ts`）语义。
- 补 `revision.test.ts` 回归测试（V1→V2→V3→重开），不修改生产逻辑。

## 验收

- 集成分支核对与 C 声称一致：分支 `codex/m1-abc-integration`，tip `7688d3991dcf6fe4fb56132559ae02bd808857ea`。
- B 固定交付 `a4f2ba685b29438fd013373a146d40a68a093e68` 已作为合并提交 `201e471`（merge: integrate B contract semantics）的父提交正确合入。
- 新增 `revision.test.ts` 3 项测试通过，锁定 V1→V2→V3→重开后未确认付款/交期始终进入 pending。
- 记录两个缺口：`reviseQuote` 原无单元测试（本复核已补）；`quote-delivery.ts` 的 `renderReply` 缺 pending 标注（记录为 C 后续修复项，B 不改）。

## 改动

- 新增 `packages/domain/src/revision.test.ts`：3 项回归测试（未确认条款 V1→V2→V3→重开始终 pending；已确认真实条款修订后不进入 pending；无字段变化修订被拒绝）。
- `wiki-config.json` 为 `revision.test.ts` 登记覆盖映射（→ M4模型与报价修订.md）。
- `M4模型与报价修订.md` 补充 pending 继承回归测试说明。

## 验证

- `reviseQuote` 回归测试：`revision.test.ts` 3 项通过。
- `packages/domain` + `packages/contracts` 定向全量：19 文件 154 项通过（含新增 3 项）。
- Windows 10 22H2 本机缺 VS C++ 未编译 better-sqlite3，`pnpm build`、Electron 集成、`test:e2e`、完整门禁（`pnpm check`/`wiki:check`/`wiki:test`）**未运行**；以 C 的 macOS 结果为准，不冒称完成。

## 未完成项

- `quote-delivery.ts` 的 `renderReply` 用 `quote.payment || "to be confirmed"`，仅对空字符串降级；付款/交期填"待客户确认/未确认/来源缺失"等非空未确认措辞时会直接作为条款输出，且无 `Pending items` 列表。`renderSummary` 与前端 `customer-reply-format.ts` 均有 pending 标注，domain 层 `renderReply` 与之不一致。此为 **C 后续修复项**，B 不修改 C 的客户回复生产逻辑，由 C 决定是否在 MVP 收口前修复。
- 文本指令遵从性与真实模型评估仍需真实 DeepSeek 验证，本复核未涉及。
- Windows、签名安装包、正式审批/PDF、真实平台规则与真实供应商业务签认仍未计为完成。

关联：[[C集成-ABC合并与后续分工]]、[[B条款确认语义冻结与C运行契约审阅]]、[[M4模型与报价修订]]、[[项目状态]]。
