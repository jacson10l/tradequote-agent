---
title: A对C前置验证失败修正回复
type: process
status: draft
updated: 2026-10-24
sources:
  - packages/infrastructure/src/migration-lineage.ts:1
  - packages/infrastructure/src/migrations.ts:1
  - packages/infrastructure/src/migration-ledger.test.ts:1
  - packages/contracts/src/knowledge-wiki.ts:1
  - packages/contracts/src/index.ts:1
  - wiki-repo:scripts/a01-migration-lineage-probe.mjs:1
  - wiki-repo:wiki/decisions/0029-迁移谱系统一与拒绝边界.md:1
  - wiki-repo:wiki/A01-迁移验证计划.md:1
---

# A对C前置验证失败修正回复

回复人/角色：A（ssyyy31，数据知识/迁移与知识存储负责人）。本页为 A 侧技术回复，由其协作环境按 A 决策整理；「本人签认时间」由本人另行记录，不代签、不自动发送、不合入、不发起真实模型复测。

回复对象：C 在固定提交上完成的独立前置核验 [A迁移谱系固定提交接收与前置验证](https://github.com/jacson10l/tradequote-agent/blob/6f9287bbe81516faea8d884b2ba405e49d7b5d40/wiki-project/wiki/A迁移谱系固定提交接收与前置验证.md)（6f9287b）。该核验结论为「12 项中 7 通过、5 失败、类型检查 11 错误、changes_required」。本回复逐项对应队长转达的四类必改项：类型门禁、schema 约束识别、旧账本与 schema 一致性、新账本在读写真开前的校验；原失败记录（N07～N11 与 11 类型错误）保留在本页与 C 核验页，不删除。

## 逐项回复

| 核验项 | C 发现的问题 | A 的修正 | 证据 |
|---|---|---|---|
| 类型门禁 | 11 个类型错误：7 个 migrations.ts、4 个 wiki/wiki-store | 修复 `capabilityId` 签名、`legacyMap` 类型、导出 `WikiCitationResolveInput`、infrastructure 补 zod 依赖、移除 wiki-store 未用参数 | `pnpm typecheck`（tsc --noEmit）退出 0 |
| schema 约束识别（N07/N08/N09） | 列改名（agent_run.request_hash）、空触发器（同名触发器体 `SELECT 1`）、非唯一索引未被识别为 tampered | `capabilityStatus` 改为校验必要列存在、索引 `UNIQUE`/`partial`、触发器含 `RAISE`；三者任一不符即判 tampered 拒绝 | 探针新增 3 个负例用例，19 用例全过 |
| 旧账本与 schema 一致性（N11） | 旧 `schema_migration` 声称已执行 knowledge:6，但 schema 实际是 c-v7，未先拒绝 | `verifyLegacyLedger` 增加 `id.statuses[idKey] !== "present"` 交叉核对，登记能力在当前 schema 中确存在才通过 | `migration-ledger.test.ts` N11 用例通过 |
| 新账本在读写真开前的校验（N10） | `migration_registry` hash 被改时拒绝太晚（读写真开/WAL 之后才拒） | 新增 `verifyRegistryLedger`，在只读 `identify` 预检核对 hash 与登记能力存在性，拒绝不进入读写真开、不产生 -wal/-shm | `migration-ledger.test.ts` N10 + N10 一致性用例通过 |

## C 二轮复核：M13 有效约束与 A-W08

C 二轮独立复核（20891fb，`codex/c-a-lineage-revalidation`）确认 11 项类型错误已修正、原 N07～N11 样本在固定 9225526 关闭，但新增 M13 四项有效约束校验失败、A-W08 仍失败。C 要求「按固定原 DDL 和允许谱系补足有效定义判据与作者回归，拒绝发生在任何升级/登记写入前」。A 逐项修正：

| 项 | C 发现（合成损坏状态） | A 的修正 | 证据 |
|---|---|---|---|
| M13-X01 永假 WHEN | 同名 `agent_tool_step_no_delete` 含 RAISE 但 `WHEN 0` 永不触发 | `capabilityStatus` 对 raises 触发器校验 WHEN 谓词非永假（去括号/空白后为 `0`/`false`/`null` 即 tampered） | 探针 `tampered-constant-when-M13-X01` |
| M13-X02 永假 WHERE | 同名 `agent_write_once` 仍 UNIQUE 且含 WHERE，但 `WHERE 0` 不索引任何行 | 对 partial 索引校验 WHERE 谓词非永假 | 探针 `tampered-constant-where-M13-X02` |
| M13-X03 缺外键 | `agent_tool_step` 删除 run_id 外键仍被识别为 c-v7 并升级 | `CapabilitySpec` 新增 `foreignKeys`；`snapshotSchema` 收集 `PRAGMA foreign_key_list`，缺失即 partial/tampered | 探针 `tampered-missing-fk-M13-X03` |
| M13-X04 缺 CHECK | `agent_write_call` 删除 `attempt>0` CHECK 仍被接受 | `CapabilitySpec` 新增 `checks`（SQLite 无 CHECK 专用 PRAGMA，按表原文匹配谓词） | 探针 `tampered-missing-check-M13-X04` |

A-W08：`CAPABILITY_UNAVAILABLE` 的 `retryable` 语义统一为 `false`——能力尚未接入是确定状态而非瞬时故障，重试同一请求不会成功；与 [[B00a知识Wiki公共协议]]（retryable=false）、`pending-client.ts` 及 e2e/preload 测试一致。修正 `contracts` `failure()` 中唯一一处 `retryable: code === "CAPABILITY_UNAVAILABLE"` 特例。属公共契约单行修正，由 B 评审确认。

## C 三轮复核：M13 有效定义变体（X05～X09）

C 三轮独立复核（a633c42，`codex/c-a-lineage-third-validation`）确认原 M13-X01～X04 全部通过、A-W08 原失败已消失，但同一 M13 有效定义要求的五个变体仍失败（X05～X09）：每个损坏库都被 identify/migrate 接受升 8 并登记，随后实际操作绕过了保护。C 诊断：原 `isConstantFalse` 只识别去括号/空白后的 `0`/`false`/`null`，未拒绝等价的 `1=0`；索引只核 UNIQUE/WHERE 未核目标列与有效谓词；触发器未核事件/WHEN；CHECK 正则可命中注释。C 建议「复用规范参考 schema/可审阅结构判据，避免继续逐个扩充常量黑名单」，并请 A「明确允许的规范化形式」。

A 据此放弃关键词/常量黑名单，改为按规范参考结构精确核对有效定义：

| 项 | C 发现（合成损坏状态） | A 的修正 | 证据 |
|---|---|---|---|
| M13-X05 比较永假 WHEN | 同名 `agent_tool_step_no_delete` 含 RAISE 但 `WHEN 1=0` | `TriggerRequirement` 新增规范 `event` 与 `when`：事件必须匹配、`when:null` 必须无 WHEN，`WHEN 1=0` 即不符 | 探针 `tampered-constant-when-comparison-M13-X05` |
| M13-X06 比较永假 WHERE | `agent_write_once` 仍 UNIQUE 但 `WHERE 1=0` | `IndexRequirement` 新增规范 `where`：WHERE 谓词归一后精确匹配 `status IN ('prepared','committed')` | 探针 `tampered-constant-where-comparison-M13-X06` |
| M13-X07 索引增列/改谓词 | 同名 UNIQUE 索引多含 `tool_call_id` 列、`WHERE status='prepared'` | `IndexRequirement` 新增规范 `columns`（`run_id,attempt`）：目标列归一后精确匹配 | 探针 `tampered-index-extra-column-M13-X07` |
| M13-X08 触发器事件篡改 | 同名 `no_delete` 改为 `BEFORE UPDATE` 仍含 RAISE | `TriggerRequirement.event` 必须为规范事件（`no_delete`=DELETE），`BEFORE UPDATE` 即不符 | 探针 `tampered-trigger-event-M13-X08` |
| M13-X09 注释伪 CHECK | `attempt` 列仅在 SQL 注释含 `CHECK(attempt>0)`，无真实约束 | `stripComments` 去注释后再匹配表原文 CHECK，注释伪 CHECK 被剔除 | 探针 `tampered-check-in-comment-M13-X09` |

结构核对的归一规则（明确允许的规范化形式）：触发器事件按 `BEFORE/AFTER/INSTEAD OF` 之后的事件关键字提取并大小写归一；WHEN/WHERE/索引列按「小写 + 压缩空白」归一后与规范原文精确相等；CHECK 先 `stripComments`（`--` 行注释与 `/* */` 块注释，字符串/引号标识符原样保留）再匹配。`quote_check_report_revision` 的复杂校验 WHEN 不逐字编码，只核事件 INSERT + 含 RAISE（其 WHEN 属 B 的业务校验逻辑，非 A 迁移谱系识别范围）。这些判据以 `CAPABILITIES` 中的显式规范字段呈现，可逐行审阅，不再依赖常量黑名单。

## C 四轮复核：M13 字符串字面量与谓词大小写（X10/X11）

C 四轮独立复核（本地 abda94e，未推送）确认 cece332 的 M13-X01～X09 全部通过、正向谱系与原失败记录保留，但补充验证仍发现两项有效定义缺口（X10/X11）。C 要求「核对真实有效的保护定义，不能只匹配 RAISE 字样；规范化须保留字符串字面量的语义」，并增加有效原 schema 控制组。A 逐项修正：

| 项 | C 发现（合成损坏状态） | A 的修正 | 证据 |
|---|---|---|---|
| M13-X10 触发器体字符串字面量 | 同名 `agent_tool_step_no_delete` 体仅为 `SELECT 'RAISE';`，含 RAISE 字样但无真实 `RAISE(...)` 调用 | 新增 `stripTrivia` 去注释与字符串字面量（字符串内容替换为 `q+q` 空占位），RAISE 判据改为 `/\bRAISE\s*\(/i` 命中 `stripTrivia` 结果；`SELECT 'RAISE'` 字面量被清空即不命中 | 探针 `tampered-raise-string-literal-M13-X10` |
| M13-X11 索引谓词字符串大小写 | 同名 `agent_write_once` 的 WHERE 谓词改为 `status IN ('PREPARED','COMMITTED')`，被整体转小写后误认作规范谓词 | `normalizeSql` 改为逐字符归一，仅字符串/引号标识符之外小写，字符串字面量内容原样保留，故 `'PREPARED'` ≠ `'prepared'` | 探针 `tampered-predicate-case-M13-X11` |

CHECK 判据同步改用 `stripTrivia`（去注释与字符串）替换原 `stripComments`，与 RAISE 判定一致；结构判据其余字段（`event`/`when`/`columns`/`where`）不变。

新增有效原 schema 控制组（enforcement）两项，证明原保护真实生效而非仅识别通过：c-v7 上 `agent_tool_step_no_delete` 实际拒绝 `DELETE FROM agent_tool_step`；c-v6 上 `agent_write_once` 实际拒绝第二条 `prepared` 的 `agent_write_call` 插入。二者均以真实 DB 操作抛错验证。

## 修正后的实际验证证据

本机已实际运行（系统 Node v24.14.1，仓库 engines 22.22.0 不一致，如实标注；vitest 经 `ELECTRON_RUN_AS_NODE` 走 Electron 内嵌 Node ABI，与生产原生 better-sqlite3 一致）：

- `pnpm typecheck`（`tsc --noEmit`）：退出 0（含 M13-X01～X11/A-W08 修正后）。
- 纯 Node 探针 [a01-migration-lineage-probe.json](../raw/a01-migration-lineage-probe.json)：退出 0，30 分类/拒绝用例全过（指纹全匹配，含 N07/N08/N09 与 M13-X01～X11 共 14 个负例）、10 追加路径全过、2 有效原 schema 控制组全过。
- 定向回归 `migration-ledger.test.ts`：3/3 通过（N10、N10 一致性、N11）。
- `wiki-store.test.ts`：5/5 通过（A-W08 retryable=false 已随 `failure()` 修正转绿）。
- 整仓 infrastructure vitest：44 通过 / 1 既有失败（`storage.test.ts` symlink EPERM，Windows 权限，非本切片引入）。

## 保留的既有失败（非本切片引入）

- `storage.test.ts` symlink 断言在 Windows 因创建符号链接需管理员权限而 EPERM，属 Windows 权限问题，与迁移谱系识别无关，保留原失败记录。

## 未完成与后续责任

真实 Electron ABI 全量测试（`scripts/test-unit.mjs`，含 contracts/e2e）、B 接口/报告/消费适配与事务证据、C 完整迁移矩阵、桌面接线与 macOS 全量验收分别待完成；A-W08 的 `failure()` 公共契约修正需 B 评审确认。A 人工发布与业务验收仍待完成。本回复不替代 A 本人签认、非作者整体接收或业务验收。

关联：[[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]、[[A对C迁移协调草稿M1-M8回复]]。
