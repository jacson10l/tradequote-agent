---
title: B对C运行契约非作者审阅
type: process
status: active
updated: 2026-10-31
sources:
  - packages/contracts/src/runs.ts:1
  - packages/contracts/src/events.ts:1
  - packages/contracts/src/pending-client.ts:1
  - packages/contracts/src/protocol.ts:1
  - packages/infrastructure/src/agent-executor.ts:1
  - packages/infrastructure/src/trade-store.ts:1
  - packages/infrastructure/src/migrations.ts:1
  - apps/desktop/src/preload/index.ts:1
  - apps/desktop/src/main/index.ts:1
  - apps/desktop/src/workers/business.ts:1
---

# B 对 C 运行契约非作者审阅

B 作为契约维护方，对 C 运行契约（`runs`/`events`/read tools/`pending-client`/preload/Worker/Main、continue/read/resolved、幂等/取消/中断/提交凭据、旧 JSON 与旧二进制兼容边界）给出非作者审阅意见。本审阅**不代签 C 的实现**，也不覆盖 A 的存储/来源/发布语义评审；结论按"已审阅文件 / 不修改文件 / 可接入公开接口 / 仍需 A 或人工确认 / 前置条件"五类给出。

## 结论概览

| 范围 | 结论 |
| --- | --- |
| `runs`/`events` 契约形状 | 契约侧无阻断；取消/完成事实语义已在 schema 层冻结 |
| read tools / `pending-client` | 契约侧就绪；服务未接入时诚实返回不可用，符合门禁 |
| preload / Worker / Main 接线 | 契约侧无阻断；身份/白名单/凭据边界符合约定 |
| continue/read/resolved 幂等 | 契约侧已定义；持久化运行/重启恢复属 C 实现待验收 |
| 旧 JSON / 旧二进制兼容 | 迁移 1~3 不改写旧字节；快照不可变触发器到位 |

## 已审阅文件

以下文件已逐份核对（含类型、schema、幂等、状态机与兼容边界）：

- `packages/contracts/src/runs.ts` — `AgentRunSchema`、`RunCommandSchema`、`RunClient`
- `packages/contracts/src/events.ts` — `RunStatusSchema`、`RunEventSchema`
- `packages/contracts/src/pending-client.ts` — `unavailableFirstBatchClient` 门禁
- `packages/contracts/src/protocol.ts` — 公共失败/Issue/read-write envelope
- `packages/infrastructure/src/agent-executor.ts` — 进程内取消、幂等回放、提交临界区
- `packages/infrastructure/src/trade-store.ts` — 同事务业务/outbox/幂等提交、旧快照不可变
- `packages/infrastructure/src/migrations.ts` — 迁移 1~3 与不可变触发器
- `apps/desktop/src/preload/index.ts` — 客户端校验与 IPC 桥接
- `apps/desktop/src/main/index.ts` — 来源校验、方法白名单、凭据边界
- `apps/desktop/src/workers/business.ts` — Worker 消息分发与命令再校验

## 不修改文件

本审阅是**只读复核**，未修改上述任何源码、迁移、mock 或测试。B 本轮对 C 运行契约不产生代码改动；以下内容留待 C 自身或 A 处理，B 不代写：

- `run` 表、持久化运行、重启恢复（`runs` 的持久化属 C01b，B 只维护契约形状）
- `agent.start/get/cancel/retry` 的 Main/IPC 实际接线（当前未开放，见下）
- 迁移编号分配（`knowledge`/`run` 存储迁移编号由 A 维护序列）

## C 可接入的公开接口

B 已在 `@tradequote/contracts` 公开并测试以下契约，C 可据此接线，无需复制 DTO：

| 公开接口 | 位置 | 说明 |
| --- | --- | --- |
| `AgentRunSchema` / `RunCommandSchema` / `RunClient` | `runs.ts` | run 数据、start/get/cancel/retry 命令与客户端端口 |
| `RunStatusSchema` / `RunEventSchema` | `events.ts` | 状态枚举与九类事件的 strict payload |
| `resultSchema` / `FailureSchema` / `IssueSchema` / `read-write envelope` | `protocol.ts` | 统一成功/失败与幂等 envelope |
| `unavailableFirstBatchClient` | `pending-client.ts` | 服务未接入时的诚实门禁（合法请求不可用、非法请求校验错误） |

C 接线时应复用上述导出，不应在 renderer/worker 侧另建一套 DTO 或自行放宽 schema。

## 仍需 A 或人工确认的部分

1. **`run` 表与运行持久化的迁移编号**：`runs.ts` 的 `AgentRun` 目前只有契约形状，无存储表。落地时迁移编号（迁移 4+）须由 A 登记，C 不得自行假设编号或另开数据库连接。
2. **`pending-client` 的 read tools 服务端语义**：`quote.getChecks`/`agent.get` 等只读命令的"当前工作区"解析，由宿主（Main/Worker）注入，A 需确认查询 workspace 的绑定方式，B 契约只保证命令形状。
3. **`continue/read/resolved` 的持久化语义**：契约已定义 `resolved` 只由成功完成进入、`completed` 必携 `committedRevisionId`，但"重启后如何从持久化 run 恢复 continue/read"属 C 实现，需 C 给出本机复验证据，B 不代验。
4. **人工签字**：本审阅不构成 A 的存储/来源/发布语义评审，也不构成 T00 人工业务验收。

## 前置条件（ABI、迁移、持久化）

C 接入运行契约前，需满足以下前置，B 在此明确列出，避免误接：

1. **旧 JSON 兼容**：迁移 1~3 的 `quote_v1`/`quote_revision`/`agent_turn` 均带不可变触发器（`BEFORE UPDATE/DELETE ... RAISE(ABORT)`），旧快照字节不可改写。新增 run 表必须**追加**，不得改动迁移 1~3 或历史 `data_json`。
2. **旧二进制兼容**：新增 `RunClient` 方法通过 `DesktopClient` 的 spread 与 `unavailableFirstBatchClient` 兼容，preload 不新增未接线的 IPC；旧 `agent.understand/revise` 白名单保持。C 扩展 worker 白名单时须同步 preload 精确名单与测试。
3. **幂等/取消/中断**：契约已冻结——取消发生在提交后须保留 `completed` 与 `committedRevisionId`；失败/取消不产生新版本；重试用同 `operationKey`、报价提交只一次。C 的 `AgentExecutor` 已实现进程内取消临界区（`cancellable=false` 后同步提交），持久化运行的取消/中断仍是 C 待验收项。
4. **提交凭据**：凭据只经 Main 在 Agent 请求时注入 `WorkerRequest.credentials`，不落 `run` 表、不进 `command` JSON；C 不得把 Key 写入任何持久化字段。

## 与本轮确认语义的关系

C 运行契约的"完成事实"与 B 本轮冻结的"条款确认语义"是**两个独立维度**：运行是否 `completed` 表示"本次执行是否成功提交"，不表示"报价条款已被人工确认"。`completed` + `committedRevisionId` 只能证明"新版本已保存"，不能推导出任何条款处于 `confirmed` 状态——后者只由 `human_ui` 入口产生。此边界在 C 接线与展示时不可混淆。

相关页面：[[B00-C接口评审]]、[[C运行恢复实现]]、[[首批并行接口约定]]、[[C01b存储接口与事务方案]]。
