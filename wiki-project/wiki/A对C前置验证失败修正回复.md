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

## 修正后的实际验证证据

本机已实际运行（系统 Node v24.14.1，仓库 engines 22.22.0 不一致，如实标注；纯 Node vitest 用 Node ABI better-sqlite3）：

- `pnpm typecheck`：退出 0（11 类型错误全部修复）。
- 纯 Node 探针 [a01-migration-lineage-probe.json](../raw/a01-migration-lineage-probe.json)：退出 0，19 用例全过（指纹全匹配、分类/拒绝/追加全过，含 N07/N08/N09 负例）。
- 定向回归 `migration-ledger.test.ts`：3/3 通过（N10、N10 一致性、N11）。
- 整仓 infrastructure vitest：43 通过 / 2 既有失败，均非本切片引入（见下）。

## 保留的既有失败（非本切片引入）

- `storage.test.ts` symlink 断言在 Windows 因创建符号链接需管理员权限而 EPERM，属 Windows 权限问题。
- `wiki-store.test.ts` A-W08 断言 `CAPABILITY_UNAVAILABLE` 的 `retryable=false`，而 contracts `failure()` 实际置 `true`，属 A01c/B 契约语义（`failure()` 按 `code === "CAPABILITY_UNAVAILABLE"` 置 retryable）。由 A01c/B 协调处理，不在此迁移谱系切片范围。

## 未完成与后续责任

真实 Electron ABI 测试（`scripts/test-unit.mjs`）、B 接口/报告/消费适配与事务证据、C 完整迁移矩阵、桌面接线与 macOS 全量验收分别待完成；A 人工发布与业务验收仍待完成。本回复不替代 A 本人签认、非作者整体接收或业务验收。

关联：[[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]、[[A对C迁移协调草稿M1-M8回复]]。
