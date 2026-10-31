---
title: B维护证据资格与规则样例
type: interface
status: observed
updated: 2026-10-31
sources:
  - packages/contracts/src/knowledge-maintenance.ts:524
  - packages/contracts/src/knowledge-maintenance.ts:590
  - packages/contracts/src/knowledge-maintenance.ts:701
  - packages/contracts/src/knowledge-maintenance.ts:881
  - packages/contracts/src/knowledge-maintenance.ts:935
  - packages/contracts/src/maintenance-evidence.test.ts:1
  - packages/infrastructure/src/wiki-store.ts:1583
  - packages/infrastructure/src/wiki-store.ts:1940
---

# B维护证据资格与规则样例

本页记录维护问题 resolve/dismiss 的**事件证据资格**政策，以及 A 侧在 `wiki-store.ts` 的落地。规范背景见 [[B00a知识整理与维护协议]]，任务见 [[B00a-P1知识整理与维护契约]]。

## 证据资格：谁能关闭维护问题

`MaintenanceEvidenceSchema` 只接受六类**已发生事实**，不接受候选、模型提案、报价修改或审批事件——这些都不改变来源/知识事实本身。类型封闭是拒绝的第一层：未知 kind 直接 schema 失败。

- `knowledge.revision_published`：同 document 的新发布版本（新 revisionId 且 contentHash 变化）。
- `source.revised`：来源新版本，且 `previousSourceRevisionId` 必须是问题固定的旧版本。
- `source.validity_confirmed`：确认过的有效期，`status` 必须 confirmed（unknown/conflict 在 schema 层即被拒）。
- `source.integrity_reverified`：按记录 hash 复核一致（`matchesRecordedHash` 固定为 true）。
- `index.rebuilt`：重建后 `indexedSeq === authoritativeSeq` 且 generation ≥ 1。
- `issue.review_decision`：人工裁决记录，必须绑定 issueId + issueVersion，`duplicate_of` 必须指向另一问题。

`maintenanceResolutionEligibility` 给出逐问题种类的可由矩阵（同一份定义被测试断言为全覆盖，新增种类不登记会失败）：

| 问题种类 | 可用 resolve 依据 | 可用 dismiss 依据 |
|---|---|---|
| source_updated | 知识新发布、来源更新 | 人工裁决 |
| source_withdrawn | 知识新发布（移除该来源） | 人工裁决 |
| expired | 知识新发布、来源更新、有效性确认 | 人工裁决 |
| unknown_validity | 有效性确认、来源更新、知识新发布 | 人工裁决 |
| conflict | 知识新发布（单一裁决版本） | 人工裁决 |
| broken_reference | 知识新发布 | 人工裁决 |
| hash_mismatch | 完整性复核、来源更新、知识新发布 | 人工裁决 |
| orphan | 知识新发布 | 人工裁决 |
| duplicate | 人工裁决（duplicate_of / superseded） | 人工裁决（false_positive / not_applicable） |
| index_stale | 索引重建完成 | 人工裁决 |

结论：**dismiss 永远需要人工裁决记录**，事实事件只能证明"已修复"（resolve），不能证明"不必处理"。resolve 也不接受 false_positive/not_applicable；只有 duplicate 允许用 duplicate_of/superseded 结案。

## 绑定与必须拒绝的情况

`evaluateMaintenanceResolution` 是确定性首错判定，宿主必须在写入事务内调用；`MaintenanceResolutionExchangeSchema` 再把 before/after 问题、生命周期事件和证据绑成一个可校验的交换对象。

| 拒绝原因 | 触发条件 | 公开错误码 |
|---|---|---|
| actor_not_human | origin 不是 human_ui | ACTION_NOT_ALLOWED |
| workspace_mismatch | 请求工作区 ≠ 问题工作区 | ACTION_NOT_ALLOWED |
| evidence_workspace_mismatch | 任一条证据属于其他工作区 | ACTION_NOT_ALLOWED |
| issue_version_stale | expectedIssueVersion ≠ 当前 issueVersion | REVISION_CONFLICT |
| issue_already_closed | 已 resolved/dismissed 再次处理 | REVISION_CONFLICT |
| evidence_predates_detection | 证据早于或等于 lastDetectedAt | REVISION_CONFLICT |
| evidence_after_resolution | 证据晚于处理时点 | VALIDATION_ERROR |
| evidence_kind_not_eligible | 该问题种类/动作不接受此 kind | VALIDATION_ERROR |
| evidence_target_mismatch | 证据不是针对本问题的固定来源/文档版本 | REVISION_CONFLICT |
| evidence_snapshot_mismatch | 裁决绑定的 issueId/issueVersion 不是当前版本 | REVISION_CONFLICT |
| evidence_not_decisive | 重发同版本、重复裁决指向自身、裁决结果与动作不符 | VALIDATION_ERROR |
| evidence_void | 确认的有效期未覆盖处理时点 | SOURCE_CONFLICT |

工作区来自宿主上下文而非请求体；问题版本、目标身份、首次发现时间、原始证据列表在交换对象中不可改写，`issueVersion` 必须恰好 +1，生命周期事件的 entityVersion/actor/occurredAt/evidenceIds 必须与本次处理一致。

同键异参：`maintenanceResolutionPayload` 生成规范化幂等摘要（workspace/method/actor/origin/issueId/expectedIssueVersion/action/note + 去重排序后的 evidenceIds），**不含 requestId 与宿主时钟**；`MaintenanceResolutionReplaySchema` 只承认三种结果——无记录为 new、同键同参为 replay、同键异参为 idempotency_conflict。

## A 侧落地（本分支）

A 在 `wiki-store.ts` 将 `resolveMaintenance` 接入裁决器，三点验收如下：

1. **权威读取**：`readMaintenanceEvidence` 把 `evidenceIds` 解析为六类证据事实之一；生命周期事件、候选/模型提案/报价/审批、lint 回执/消费/影响报告均返回 null，resolve/dismiss 直接以 `NOT_FOUND` 拒绝。
2. **工作区/目标版本绑定**：证据工作区须等于问题工作区；逐类针对固定目标版本（`source.revised` 的 `previousSourceRevisionId` 绑定被替换旧版本、`knowledge.revision_published` 绑定同一 document 的新版本）。
3. **资格核验**：事务内调用 `evaluateMaintenanceResolution`，首错判定，任一失败整体回滚（better-sqlite3 `.transaction().immediate()`）。

当前存储可立即产出三类证据：`knowledge.revision_published`（取 `knowledge_lifecycle` 发布事件，含真实 actorId/occurredAt）、`source.revised`（取带前驱的来源版本行）、`index.rebuilt`（取 completed 的重建结果）。`source.validity_confirmed` / `source.integrity_reverified` / `issue.review_decision` 尚无持久化事实，暂不可产，属已知缺口。

## 正反例（可直接运行）

`packages/contracts/src/maintenance-evidence.test.ts` 中 EVID-01～12 是契约层的正反例；`wiki-store.test.ts` 的 A01e-2 是事务层回归：

| caseId | 场景 | 期望 |
|---|---|---|
| EVID-01 | source_updated 用同文档新发布版本解决 | 通过，交换对象有效 |
| EVID-02 | 来源更新/完整性复核/索引重建/重复合并四种 resolve | 各自通过 |
| EVID-03 | 证据或请求跨工作区 | 拒绝（ACTION_NOT_ALLOWED） |
| EVID-04 | 证据早于最近发现 / 晚于处理时点 | 拒绝 |
| EVID-05 | 重发同一 revision/content 冒充修复 | 拒绝（evidence_not_decisive） |
| EVID-06 | 用发布事实 dismiss、用误报裁决 resolve | 拒绝（kind_not_eligible） |
| EVID-07 | 裁决绑定旧 issueVersion / 重复指向自身 | 拒绝 |
| EVID-08 | 有效性 unknown 或区间不覆盖 | 拒绝（SOURCE_CONFLICT） |
| EVID-09 | 非人工入口、旧版本、已关闭、重复证据 | 拒绝 |
| EVID-10 | 交换对象改写目标/首发现时间、跳版本、事件不匹配 | 全部拒绝；start_review 只转 in_progress |
| EVID-11 | 同键同参回放、同键异参冲突 | 三种结果各自成立，错误组合被拒 |
| EVID-12 | 伪造证据记录（未知 kind、索引未追平、裁决缺 canon） | schema 拒绝；矩阵覆盖全部问题种类 |

## 未完成项

- `source.validity_confirmed` / `source.integrity_reverified` / `issue.review_decision` 三类证据的持久化事实尚未落地，需新增可查询证据行与写入路径后方可产出。
- `source.withdrawn` 类问题仅能以 `knowledge.revision_published` resolve，但该证据绑定要求 knowledge 目标，来源目标的问题实际只能走 dismiss（人工裁决），需 B 确认矩阵语义。

关联：[[B00a知识整理与维护协议]]、[[B00a-P1知识整理与维护契约]]。
