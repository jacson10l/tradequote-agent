---
title: 0011-业务LLMWiki与工程知识隔离
type: decision
status: draft
updated: 2026-10-21
sources:
  - conversation:用户要求A01按所附LLMWiki规范补齐业务方案与验收
  - wiki-repo:wiki/A业务LLMWiki方案.md:1
  - packages/contracts/src/knowledge.ts:35
  - packages/contracts/src/runs.ts:30
  - packages/infrastructure/src/artifacts.ts:9
---

# 0011-业务LLMWiki与工程知识隔离

## 背景

已有工程wiki-project按源码证据/语义页/任务决定/维护流程工作。B00和旧A01只覆盖结构化规则条目，缺少业务知识Markdown与AI增量整理；用户明确要求补齐完整业务LLM Wiki模式。

## 决定

工程Wiki继续跟代码；业务Wiki放当前workspace运行数据。原件与知识正文采用不可变artifact，SQLite管版本/审核发布/引用，Markdown目录与关键词索引为可重建视图。AI只生成候选，人工审核绑定内容与来源集合后另行发布；每次更新留新revision，检索返回固定版本与原件证据。持续维护形成问题和影响队列，不自动修改报价或旧审批。

保留B00旧协议，在B00a新增通用Wiki与知识整理命令/结果。非规则页不伪造RuleDefinition，知识运行不伪造报价committedRevisionId。原子性按先artifact后SQLite引用事务/outbox处理，不宣称跨文件与数据库天然同事务。

## 替代方案

仅把sourceText命名为Markdown不能区分原件和知识正文；直接把业务资料放工程Wiki会混淆访问与Git交付；将生成后的Markdown作为唯一权威会丢失审核、事务和结构化引用。首版强制向量库/定时Agent又会扩大交付依赖，故先关键词/导航及显式维护入口。

## 后果

A01范围比旧规则切片增加AI候选、审核、引用和维护；拆五个子切片，B先补P0/P1公共契约，C参与知识整理执行与桌面接线。已有报价/金额/AgentRun协议兼容，A01服务仍未实现。真实市场资料有效性和人工审阅不能由schema或合成fixture替代。

## 回滚方式

本轮仅文档，可在新的决策中缩减尚未实施范围但不得把缺项标完成。落地后不可覆盖或删除被引用的原件/知识版本；停用新生成入口、保留旧版回读与备份，迁移回退须另行验证。A/B/C确认字段和存储后再实施，现状与缺口见 [[B00知识契约差距与补充]]。

关联：[[A01-知识发布与来源查询]]、[[B00a-业务Wiki契约补充]]。
