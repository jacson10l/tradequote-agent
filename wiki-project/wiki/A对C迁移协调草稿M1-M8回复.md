---
title: A对C迁移协调草稿M1-M8回复
type: process
status: draft
updated: 2026-10-23
sources:
  - packages/infrastructure/src/migration-lineage.ts:1
  - packages/infrastructure/src/migrations.ts:1
  - wiki-repo:wiki/decisions/0029-迁移谱系统一与拒绝边界.md:1
  - wiki-repo:wiki/A01-迁移谱系支持与拒绝矩阵.md:1
---

# A对C迁移协调草稿M1-M8回复

回复人/角色：A（ssyyy31，数据知识/迁移与知识存储负责人）。本页为 A 侧技术意见，由其协作环境按 A 决策整理；「本人签认时间」由本人另行记录，不代签、不自动发送、不合入、不发起真实模型复测。所回复对象为 C 未发送协调草稿（fd4b728，`C迁移协调请求草稿-AB谱系兼容`）与 d99f2b3 六组诊断；两者是协调输入，尚不是已批准方案。

证据基线：d99f2b32def756b6b4d4cc99fca75dd9511436d5；C 实现 45fa03d57d6fc405c2438c3b187f87838355a88b；B 代码/交接 330bff76615147ea9c2729cb144a18873a5251d0 / 6c76fb991f3135d6a48362c1b242e46af6641817；A01c 前驱 dd42b055efd409fa3c332c6cb1997c7a7638ca62。A 侧固定实现为 9cdd13a（分支 codex/a01-migration-lineage），已含决策 [[0029-迁移谱系统一与拒绝边界]]、矩阵 [[A01-迁移谱系支持与拒绝矩阵]]、设计 [[A01-追加迁移设计]] 与验证计划 [[A01-迁移验证计划]]。

## M1～M8 逐项意见

| 编号 | A 的意见与依据 |
|---|---|
| M1 | A 侧迁移代码可产出的旧库谱系为 common-v1/2/3、a01b-v4、a-v6；C 侧 c-v5/6/7 与 B 侧 b-v7 的实际存在范围由 B/C 各自确认（A 不接触用户库，只按脱敏 schema/hash/version 判定）。允许向前升级的谱系 11 类、安全拒绝 mixed/tampered/unknown，逐项见矩阵页。 |
| M2 | 识别只以实际 schema（表/索引/触发器/列）为准，user_version 仅交叉核对；表在但缺触发器/索引/列即 partial→tampered 拒绝；精确 present 集才归类谱系。判定在只读预检 `preflightMigration`（早于读写真开）完成，拒绝抛 `MIGRATION_LINEAGE_REJECTED:<lineage>` 且零写入（不建 -wal/-shm、不改 user_version、不建账本）。D2 静默缺表由「schema 判定而非编号判定」封死，D3 误引导由 `(lineage,version)` 账本主键封死。 |
| M3 | 统一目标 = 九能力齐备、user_version=8；追加按 `MIGRATION_STEPS` 顺序，编号保留原谱系编号不重排；执行身份 = 每步 lineage（common/c-run/knowledge-wiki/check-report）。新账本 `migration_registry(lineage,version,sql_hash,applied_at)`；旧 `schema_migration` 不删不改，`verifyLegacyLedger` 按固定映射交叉核对 hash，不符即 tampered 拒绝。 |
| M4 | 保留：历史 SQL/账本/业务事实不改写，不可变行（报价/修订/run/写回执/工具步骤/知识/来源/生命周期/报告/消费/outbox/幂等）不覆盖。新增：`migration_registry` 与缺失能力 DDL 追加，不重放同号异义 DDL、不用空迁移占位。 |
| M5 | A 提供存储入口（`SqliteWorkspaceRepository.executeWiki` 与统一 `migrate`/`preflightMigration`），识别/拒绝在存储边界抛 `MigrationLineageError`→公共 `STORAGE_ERROR`，不静默。公开契约 `executeChecks`/`executeWiki`/`runStore` 的最终形态由 B 维护、C 接线；renderer 不注入可信 context。 |
| M6 | 验证矩阵见 [[A01-迁移验证计划]]。A 已实际执行纯 Node 探针：9 指纹全匹配、16 分类用例全过、10 追加用例全过，证据 [a01-migration-lineage-probe.json](../raw/a01-migration-lineage-probe.json)。失败注入点：缺触发器/索引/列、混合谱系、user_version 不符、账本 hash 不符、追加中坏 SQL 回滚。事务单 `.immediate()` 整体回滚、重开幂等追加。typecheck/vitest 本机未复跑（无 node_modules），全矩阵 + macOS/Electron 由 C 在固定提交上执行。 |
| M7 | A 人工 review/publish 属 A01e，当前 `review/publish/withdraw` 返回 `CAPABILITY_UNAVAILABLE`，依赖 B 的 P1 lint 回执。A 计划在 B 固定 P1 后实现 `origin='human_ui'` 门禁的可审阅入口；合成 fixture 与人工操作以来源资格与真实签认区分。本迁移收敛切片不含该实现。 |
| M8 | A 已写 ADR 0029（迁移决定）。非作者评审（B/C）、A/B 本人签认、业务验收分别留证待完成；本回复不代签、不自动发送/合入/真实模型复测。 |

## 拟支持输入与结果

允许升级：empty、common-v1/2/3、a01b-v4、c-v5/6/7、a-v6、b-v7、unified（unified 为无操作）。安全拒绝：mixed（同时含 c-run 与知识/报告但非 unified 精确集）、tampered（缺触发器/索引/列）、unknown（含 user_version 与谱系不符，覆盖「未知 v6 被误接受」）。逐谱系 present 集与期望 user_version 见矩阵页。

## 建议方案与登记

选择 C 草稿方案一 + 方案二的组合，即 A 已实现的设计：可充分识别且明确支持的谱系定向向前追加；未知/混合/缺表/账本矛盾在修改前只读预检拒绝。登记采用 `(lineage,version)` 主键记录「原谱系 + 原编号 + sql_hash + applied_at」，不用单一 version 列合并冲突条目；识别条件、目标 schema、追加步骤与责任人见设计页。

## 历史不变量

- 历史 SQL 原文与编号保留，仅归一 CRLF→LF 后取指纹，不改语义。
- 旧 `schema_migration` 表不删不改；`migration_registry` 为追加账本，不覆盖旧账本。
- 不可变行与旧报价/金额、run/事件 seq、票据/写回执/步骤、知识/来源/生命周期、报告/消费、outbox、幂等事实不覆盖；新组合不得改写旧不可变结果。

## 失败/中断/回滚与验收

固定版本 9cdd13a 上 A 已执行探针（退出 0，指纹/分类/追加全过）。失败注入与中断在单 `.immediate()` 事务内整体回滚，不部分建表、不伪记已执行、不隐式换库；重开幂等。未执行项如实记录：typecheck、vitest、真实 Electron、macOS 全量、Windows 后置。

## 方案阶段结论

A 的迁移方案已固定实现（9cdd13a）并有探针证据，可进入 B/C 按职责核对与 C 独立组合验证。A 侧 typecheck/vitest 待本机补跑或由 C 组合验证覆盖；B 接口/报告/消费适配、C 非作者评审与 macOS 全量、A 人工发布与业务语义验收分别待完成。

## 未覆盖与后续责任

完整非作者评审、macOS/Electron 组合验证、人工发布/业务签认分别留证；Windows 的 EPERM 维护回归按原范围保留，不阻塞 macOS。本回复不替代 A/B 本人签认、非作者整体接收或业务验收。
