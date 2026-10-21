---
title: B00a-业务Wiki契约补充
type: task
status: draft
updated: 2026-10-21
sources:
  - conversation:用户要求检查B00在业务LLMWiki模式下的契约缺口
  - wiki-repo:wiki/B00知识契约差距与补充.md:1
  - packages/contracts/src/knowledge.ts:35
  - packages/contracts/src/runs.ts:30
---

# B00a-业务Wiki契约补充

## 目标

负责人B，A审来源/存储/发布，C审AI运行和IPC。尚未开工/未签字。把已实现的规则切片契约补成业务LLM Wiki协议，字段和证据以 [[B00知识契约差距与补充]] 为设计输入。

## 范围

独立分支codex/b00a-knowledge-wiki-contracts；从已合入B00的最新共同基线开工并登记taskBase，B00未合入时只做字段评审，不宣称已解锁A依赖。先P0知识Markdown/多来源/审核/发布/检索引用与异步编排端口，再P1知识AI运行/维护契约；两个小PR可分批合入。P2不在本任务。

新增knowledge-wiki.ts、knowledge-build.ts及测试（均待创建），按需扩展checks与独立适配契约；index/mock/pending-client由B同步，preload精确方法名单由C复核。旧knowledge/runs不破坏；无业务服务/数据库/模型调用实现。迁移不由B00a执行。

## 验收

1. 非rule的SOP/术语能通过，无规则也不伪造规则；规则正文与结构化规则不混同。
2. 多来源Markdown段落可表达精确引用；原件hash、内容hash、摘录hash分别校验；缺失/未知来源、坏范围、重复身份拒绝。
3. 审核对象不可由模型伪造；修改后旧批准不能作为有效发布输入；包含拒绝/撤回/过期状态与并发、幂等契约样例。
4. 搜索/分页/有效性与历史引用协议完整，过期/撤回不能当新依据；CheckIssue规则证据与通用引用可无损关联。
5. KnowledgeBuildRun完成结果是候选知识版本，可取消/恢复，不要求报价ID；旧AgentRun/金额/报价测试保留。
6. maintenance/lint/impact/index结果可表述未完成、未知和失败，无假成功mock；新版只做显式能力门禁，不注册空业务IPC。
7. 所有调用方/mock/测试/Wiki与覆盖同步，实际typecheck、单元、Electron及门禁通过；A/C实际评审记录后才合入。

## 改动

本轮仅建立契约补充任务，未创建上述源码或修改B00协议。接口取舍见 [[0011-业务LLMWiki与工程知识隔离]]。

## 验证

本任务实现测试未运行。每个子PR记录自身taskBase和真实结果，不能复用B00的55项通过记录作为新增协议证据；代码作者自己完成Wiki闭环。

## 未完成项

全部P0/P1 schema、mock/测试和A/C评审待做。A01业务实现、C知识整理执行器及B规则消费适配分别交付，不归本任务冒领完成。

关联：[[B00-首批公共契约]]、[[A01-知识发布与来源查询]]、[[C01-Agent运行恢复与集成]]。
