---
title: A知识发布实现
type: module
status: observed
updated: 2026-10-21
sources:
  - packages/infrastructure/src/knowledge-store.ts:1
  - packages/domain/src/knowledge.ts:1
  - packages/infrastructure/src/knowledge-store.test.ts:1
  - packages/infrastructure/src/migrations.ts:36
---

# A知识发布实现

A01b 在 codex/a01b-knowledge-store 实现 [[首批并行接口约定]] 中 KnowledgeRepository 的存储与服务：SQLite 知识版本库、human_ui 审核发布、hash 绑定、事务与幂等。这是 A01 五切片中"人工审核发布"的 B00 规则切片，不含 AI 整理、检索引用或持续维护（A01c/d/e）。

## 当前实现

- 服务 createKnowledgeService（packages/domain/src/knowledge.ts）：先用 KnowledgeCommandSchema 校验再按方法分发；stage/publish 仅 human_ui（agent_tool/system_job 返回 ACTION_NOT_ALLOWED），query/getRevision 开放只读。
- 存储 SqliteKnowledgeStore（packages/infrastructure/src/knowledge-store.ts）：复用现有单 worker 同连接，不另开业务 DB。stage 计算真实 UTF-8 sha256 sourceHash 写 staged 行；publish 校验 hash 后原地把 staged 转为 published，revisionId 稳定，发布行由 no-update 触发器锁定。幂等重放/同键异参冲突/outbox 事件/写事务 immediate 与 TradeStore 一致。
- 迁移 4（packages/infrastructure/src/migrations.ts）：新建 knowledge_revision 表与 document 索引，不可变触发器（发布后禁改、禁删）。
- 查询 findPublished 先按 publishedAt≤at 与 scope 过滤（空维度=通用），再按 document 取最新已发布版本；getRevision/findPublished 均按当前 workspace 隔离。
- 测试（packages/infrastructure/src/knowledge-store.test.ts）：A01-1～A01-4、A01-6～A01-8 共 7 项，覆盖 staged 不可见、human-only、hash 门禁、同键重放/异键冲突、追加版本、旧版本按 ID 回读、scope 回退与通用维度、不可变触发器。

## 边界与未完成

- 本模块对应 B00 规则切片，不含 B00a 的 Markdown 版本、AI 候选、检索与维护契约；审核人/说明字段属 [[B00a-业务Wiki契约补充]]，当前只记录 publishedAt 与 outbox context。
- 本机未安装 node_modules，store 测试与 typecheck 未在修改后复跑（见 [[A01-知识发布与来源查询]] 验证段）。

关联：[[首批并行接口约定]]、[[A01-知识发布与来源查询]]、[[A业务LLMWiki方案]]。


## C02c候选整合后的验证与修正

C02c前置候选从A01b/0f613b8整合本模块和真实迁移4，知识模型工具与IPC仍未注册。整合审阅发现已发布版本异键重复publish在hash校验前返回成功，本轮将hash校验移到published分支之前，错误hash仍报SOURCE_CONFLICT；增加真实SQLite回归。源码格式按现有Biome归一，不改查询范围规则或原版本身份。原“未安装依赖/未复跑”保留作为A当时记录；本候选实际安装并重新运行类型及知识回归，证据见 [[C02c-持久运行与写入前置]]，不代签A完整知识业务验收。
