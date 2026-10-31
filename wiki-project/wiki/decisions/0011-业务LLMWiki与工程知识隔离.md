---
title: 0011-业务LLMWiki与工程知识隔离
type: decision
status: draft
updated: 2026-10-22
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


## 2026-10-22 B00a P0 落地取舍

在独立 knowledge-wiki 协议保留旧 strict B00 兼容，原件与 Markdown 分版本；不可变内容与审核发布生命周期分离，review/publish/withdraw 只允许人工。选择“先最新发布事实，后适用性过滤”，拒绝撤回/过期时回退旧版；历史读取单独标新引资格。稳定快照分页实时排除失效项，允许缩短页面，新增发布不插入旧快照。消费登记由宿主同步事务参与，不通过 renderer 独立成功响应伪造业务提交。

专用必填 WikiHostContext 承载 workspace/actor/origin/now，避免破坏旧全仓上下文；P0 只交审核必需 lint receipt，不扩展报价 AgentRun 承载 P1 知识整理。异步 artifact 校验后再执行同步事务，投影失败走 outbox；相较复用旧单来源 store，这增加 A 的显式适配工作，但保留历史 ID/hash、完整多来源与审批适用性。回滚可停用未接线的新命令而保留旧协议，不能删除已引用 revision 或重写旧来源。实现与限制见 [[B00a知识Wiki公共协议]]；实际 A/C 审核及合入仍是任务完成前提。


## 2026-10-22 P1 独立运行与维护

知识整理使用独立KnowledgeBuildRun和受限提案，局部键由宿主映射为权威身份；完成指未审核候选原子提交，不指报价或发布。冻结来源/基线与预算，重试显式新attempt并使用执行票据，恢复先查已提交回执，不自动继续收费模型任务。候选sourceSetHash按实际子集计算，另用inputSourceSetHash冻结允许集合，避免伪造全来源引用。

维护报告必须表达unknown/partial/failed；只有完整且无阻断的lint生成P0 passed回执。人工关闭问题不修改实际资格或旧审批；影响分析固定消费图快照，索引重建按当前任务/生成代原子切换。替代复用报价Run或“未实现返回空成功”的方式被拒绝，因为会混淆权威提交与恢复事实。回滚可停用尚未接线的P1命令并保留全部历史；协议与端口可独立评审，P1不阻塞P0。实现/限制 [[B00a知识整理与维护协议]]，本次不交运行/维护引擎。
