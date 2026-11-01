---
title: B08拟议条款pending契约修复
type: task
status: active
updated: 2026-11-01
sources:
  - conversation:C08 A与B问题修复需求转达
  - packages/domain/src/trade.ts:1
  - packages/domain/src/trade.test.ts:1
  - packages/domain/src/revision.test.ts:1
  - packages/contracts/src/values.ts:1
  - wiki-repo:wiki/C07业务资料与路演收口.md:1
  - wiki-repo:wiki/tasks/B07契约集成非作者复核.md:1
---

# B08 拟议付款/交期 pending 契约修复

负责人 B。关闭 C08 转达的「B 拟议条款 pending 契约」阻断项：修复 `calculateQuoteV1` 对付款/交期只依赖固定词表、导致 C07 实际英文拟议文本漏进 pending 的生产路径缺口，并把契约语义与生产实现对齐。

## 目标

- 任何非空付款/交期自由文本，除非经过明确的人工受控确认入口，否则保持 `pending_confirmation`，绝不从 pending 消失。
- 冻结公共契约 `classifyTermConfirmation` 与生产 `calculateQuoteV1` 的调用关系，不再出现「契约声明非空默认 pending、生产只匹配少量词表」的矛盾。
- 覆盖 C07 实际英文反例（`30% deposit; 70% before dispatch`、`EXW Guangzhou, China; 21 days after deposit`、`Proposed`、`Subject to supplier confirmation`），并在 V1→V2→V3→重开版本链上保持。

## 范围

- 修改 `packages/domain/src/trade.ts`：付款/交期判定从 `isUnconfirmedTermText` 改为 `classifyTermConfirmation`（空白 → `blank`，其余非空 → `pending_confirmation`）。
- 修正 `packages/domain/src/trade.test.ts` 与 `packages/domain/src/revision.test.ts` 中把「具体拟议条款」当作「已确认条款」的错误预期，补 C07 英文反例回归。
- 同步 `M2真实报价V1.md`、`M4模型与报价修订.md`、`B07契约集成非作者复核.md`、`B对ABC集成非作者复核.md`、`CONTEXT.md`、`log.md` 与验证记录。
- 不修改 C 负责文件：`quote-delivery.ts`、`customer-reply-format.ts`、桌面 UI。`renderReply` 缺 pending 标注仍为 C 后续修复项。

## 验收

- 付款/交期任何非空拟议文本（含 C07 英文 `Proposed`/`Subject to supplier confirmation` 反例）在未经人工受控确认前进入 pending，空白仍进入 pending，并在 V1→V2→V3→重开后保持。
- `calculateQuoteV1` 与公共契约 `classifyTermConfirmation` 语义一致，不再只匹配少量词表。
- 提供固定提交 SHA、分支名、父提交与文件白名单；C 只读接收后组合门禁通过，才关闭本阻断项。

## 改动

1. `trade.ts`：`calculateQuoteV1` 中付款/交期改用 `classifyTermConfirmation(input.payment/delivery)`；非空 → "已填写但未获人工确认"，空白 → "待确认"。移除对 `isUnconfirmedTermText` 的依赖。
2. `trade.test.ts`：最后一个测试扩展为「具体条款（中文 + C07 英文拟议）都进入付款/交期 pending」，并断言 `运费、税费` 等原有 pending 仍保留。
3. `revision.test.ts`：把原「已确认的真实条款不进入 pending」测试改为「具体拟议条款未经人工受控确认始终进入 pending（含 C07 英文反例）」与「明确经人工受控确认入口才可离开 pending（当前阶段未接确认 DTO，锁定契约语义）」两项。

## 验证

- `trade.test.ts` 7 项、`revision.test.ts` 4 项、`foundation.test.ts` 4 项通过（15/15）。
- `packages/domain` + `packages/contracts` 定向全量：19 文件 155 项通过。
- `node node_modules/typescript/bin/tsc --noEmit` 退出 0。
- 生产逻辑变更说明：付款/交期从「仅固定词表命中 + 空值」扩展为「任何非空文本默认 pending」，与 `classifyTermConfirmation` 契约一致。

## 未完成项

- `quote-delivery.ts` 的 `renderReply` 缺 pending 标注（C 负责，需 C 协调修复）。
- 人工受控确认入口尚未接入报价输入 DTO（`QuoteInputSchema` 未携带确认事实字段），当前「已确认」只能由未来的人工入口显式写入，自由文本无法免除 pending。
- C 非作者只读接收与组合门禁、人工业务验收未完成。

关联：[[B07契约集成非作者复核]]、[[B对ABC集成非作者复核]]、[[M2真实报价V1]]、[[M4模型与报价修订]]、[[C07业务资料与路演收口]]。
