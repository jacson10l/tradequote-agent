---
title: C集成-ABC合并与后续分工
type: task
status: active
updated: 2026-11-01
sources:
  - conversation:用户要求先合并推送再重新确定ABC任务
  - packages/domain/src/trade.ts:1
  - packages/domain/src/quote-delivery.ts:1
  - packages/contracts/src/values.ts:1
  - wiki-repo:wiki/tasks/A06-来源证据与适用规则包.md:1
  - wiki-repo:wiki/tasks/B06-条款确认与运行契约复核.md:1
  - wiki-repo:wiki/C07业务资料与路演收口.md:1
---

# C 集成：ABC 合并与后续分工

## 目标

在不重复分配已完成工作的前提下，将 A 来源证据、B 条款确认契约和 C07 业务路演候选统一到同一集成分支，完成 macOS MVP 门禁，并给 A/B/C 留下可执行的后续边界。

## 范围

- 集成基线：`codex/m1-foundation` 的 `654fecc4d93e4630ed4a0cf42f261d0d432e23d3`。
- A 固定交付：`4c622d04e1ae483b6c8649e09146f71b35ba33a9`。
- B 固定交付：`a4f2ba685b29438fd013373a146d40a68a093e68`。
- C07 候选：`8b53b1a`，统一合入 `codex/m1-abc-integration`；未将历史 WIP 分支无差别合入。

## 验收

- A/B/C 的代码、业务 Wiki、任务记录、生成快照和追加日志位于同一集成分支。
- A 的来源字段、价格样品隔离、哈希和统计修正被保留；B 的未确认付款/交期继续进入 `pending`；C 的 CNY 300→500 路演、版本差异、重开和客户回复边界保留。
- macOS MVP 门禁通过；Windows、签名安装包、正式审批/PDF、真实平台规则和真实供应商业务签认不冒称已完成。

## 改动

- 完成 A、B 两个固定交付的顺序合并，并解决 C07 与公共契约、知识维护快照、桌面回归的冲突。
- 修正 Electron bridge 期望名单、Wiki 源码覆盖映射、历史 demo-tools 文档重名、任务页导航和领域层 Node 依赖；报价对外产出 ID 改为审批 UUID 的确定性派生。
- 为 B 复核探针补齐 `QUOTE-01`～`QUOTE-06` 稳定案例 ID，保持其 18 项覆盖门禁有效。
- 修正 `quote-delivery.ts` 的客户回复渲染：未确认付款/交期不再把内部占位词直接输出，新增确定性回归测试。

## 验证

- `pnpm typecheck`：通过。
- `pnpm build`：通过；保留既有 renderer chunk 大于 500 kB 的提示。
- 低并发完整单测：561 通过、3 跳过；与 Electron 并行时曾出现 Worker 输出截断，串行复跑通过。
- `pnpm test:e2e`：12 通过、1 跳过。
- `pnpm check`、`pnpm wiki:check`、`pnpm wiki:test`：通过；Wiki 294 个 Markdown 全部可达、260 个语义页。
- 固定基线同步：在追加本页和日志后执行并通过，退出码为 0。
- B07 合入后，C 定向 domain 回归测试 `5/5` 通过；客户回复测试覆盖未确认词屏蔽和已确认条款保留。

## 未完成项

- A 的固定交付已完成，不重复分配 C06 修正；仅保留来源证据的真实业务缺口：大目录第 268 行 MOQ、服装原始快照、`valid_until` 原始依据、认证/供应商有效期和人工发布复核。
- B 的固定契约开发已完成，不重复开发；仅做集成后的非作者复核，重点验证 V1/V2/V3 与重开后的付款/交期 `pending`、正常规则案例和客户回复业务语义。
- C 已完成集成分支的最终提交与推送；后续负责统一路演演示路径、最终交接和人工验收准备，不把 A/B 已完成工作重新改写成新任务。
- `Quotation · V3` 是 C 的客户回复运行产物，不另拆成 B 的提交；运费、税费、审批发送和商业要约仍需人工确认。
- 仍需在 C 本轮 macOS 集成门禁中复跑完整单测、Electron、Wiki 回归和构建后再推送。

关联：[[C07业务资料与路演收口]]、[[B对C运行契约非作者审阅]]、[[B条款确认语义冻结与C运行契约审阅]]、[[项目状态]]。
