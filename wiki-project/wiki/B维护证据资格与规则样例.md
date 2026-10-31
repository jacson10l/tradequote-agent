---
title: B维护证据资格与规则样例
type: interface
status: observed
updated: 2026-10-31
sources:
  - packages/contracts/src/knowledge-maintenance.ts:545
  - packages/contracts/src/knowledge-maintenance.ts:656
  - packages/contracts/src/knowledge-maintenance.ts:836
  - packages/contracts/src/knowledge-maintenance.ts:882
  - packages/contracts/src/knowledge-maintenance.ts:943
  - packages/domain/src/quote-checks.ts:86
  - packages/domain/src/quote-checks.samples.ts:13
  - packages/contracts/src/maintenance-evidence.test.ts:1
  - packages/domain/src/quote-checks.test.ts:1
  - scripts/contract-review-probe.mjs:1
---

# B维护证据资格与规则样例

本页记录 B 本轮三项交付的可执行定义：维护问题 resolve/dismiss 的**事件证据资格**、可复跑的**复核探针**、以及报价**规则样例与双反馈回归**。全部为契约、纯函数、合成样例和探针脚本；没有实现维护引擎、检查存储、IPC 或界面，A/C 仍需在自己的写入事务与接线中调用。规范背景见 [[B00a知识整理与维护协议]]，报价任务见 [[B01-规则检查与双反馈]]。

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

## 事件 vs 证据：术语裁决（A 实现必读）

源码里有两个都叫"事件"但语义不同的实体，A 落库时必须分开两张表/两套身份，`wiki.resolveMaintenance` 的 `evidenceIds` **只解析到前者**：

1. **证据事件（evidence，`MaintenanceEvidenceSchema`）**——`resolveMaintenance` 的**已存执行证据白名单**。六类已发生事实（`knowledge.revision_published` / `source.revised` / `source.validity_confirmed` / `source.integrity_reverified` / `index.rebuilt` / `issue.review_decision`），各自携带独立 `evidenceId`。请求里的 `evidenceIds` 必须能逐条解析到这类已存记录；解析不到（候选、模型提案、报价、审批、或指向生命周期事件）即 `evidence_not_decisive`/`evidence_kind_not_eligible`，不进入白名单。

2. **生命周期事件（lifecycle event，`KnowledgeMaintenanceLifecycleEventSchema`）**——维护问题**自身状态流转**的 append 记录（`maintenance.discovered` / `in_progress` / `resolved` / `dismissed` / `source.withdrawn` / `index.rebuilt`）。它是 `MaintenanceResolutionExchangeSchema.event` 字段，是本次处理动作落库时**产出的结果**，不是 resolve/dismiss 的**依据**。它不能反过来充当证据白名单成员。

两者不是一回事：证据事件回答"凭什么关闭"，生命周期事件回答"谁在何时把问题推进到哪一步"。`event.evidenceIds` 引用的是证据事件的 `evidenceId`（见下），不引用其他生命周期事件。

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

A 的写入事务须同时满足：

- **证据事件持久化**：六类证据各按自身字段落库（如 `knowledge.revision_published` 存 documentId/revisionId/version/contentHash/sourceSetHash/publishedAt），`evidenceId` 全局唯一、不可被篡改或复用；证据的 `workspaceId` 必须等于问题工作区。
- **证据绑定**：每条证据必须针对问题的固定目标版本——发布证据同 documentId 且 revisionId/contentHash 不同于旧版本；来源更新证据的 `previousSourceRevisionId` 必须等于问题固定旧版本；完整性复核证据须匹配记录 hash；有效性确认须 confirmed 且区间覆盖处理时点；重建证据须 `indexedSeq === authoritativeSeq` 且 generation ≥ 1；裁决证据须绑定 issueId+issueVersion。
- **生命周期事件绑定**：`event.workspaceId`/`entityId(=issueId)`/`entityVersion(=next.issueVersion，版本+1 后)`/`actorId`/`occurredAt(=resolvedAt)` 必须与本次处理一致；`event.evidenceIds` 与 intent 证据的 `evidenceId` 集合排序后逐字节一致；`event.type` 必须与动作对应（resolve→`maintenance.resolved`、dismiss→`maintenance.dismissed`、start_review→`maintenance.in_progress`）。
- **首错顺序**：权限（actor_not_human）→ 工作区（workspace_mismatch / evidence_workspace_mismatch）→ 版本（issue_version_stale / issue_already_closed）→ 时点（evidence_predates_detection / evidence_after_resolution）→ kind（evidence_kind_not_eligible）→ 目标绑定（evidence_target_mismatch / evidence_snapshot_mismatch / evidence_not_decisive）→ 有效期（evidence_void）。任一步失败整体回滚，不产生半闭问题或孤儿证据。

工作区来自宿主上下文而非请求体；问题版本、目标身份、首次发现时间、原始证据列表在交换对象中不可改写，`issueVersion` 必须恰好 +1，生命周期事件的 entityVersion/actor/occurredAt/evidenceIds 必须与本次处理一致。

同键异参：`maintenanceResolutionPayload` 生成规范化幂等摘要（workspace/method/actor/origin/issueId/expectedIssueVersion/action/note + 去重排序后的 evidenceIds），**不含 requestId 与宿主时钟**；`MaintenanceResolutionReplaySchema` 只承认三种结果——无记录为 new、同键同参为 replay、同键异参为 idempotency_conflict。

## 正反例（A 可直接运行）

`packages/contracts/src/maintenance-evidence.test.ts` 中 EVID-01～12 是给 A 的正反例，同时被探针按 caseId 采集：

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

## 报价规则样例与双反馈

`evaluateQuoteChecks` 是纯函数：输入报价快照 + 调用方按本单解析到的已发布知识，输出 `CheckReport` 与逐条批注定位；风险标记和文本批注读同一份 `checkId`，不存在两套结果。

样例固定为 `b01-quote-checks-samples-v1`（`quote-checks.samples.ts`），全部 UUID/hash/条款均为合成、标注"非真实供应商"，回归会断言版本串与 synthetic 来源，防止样例被静默改写。

- **付款比例**：规则以字面 `100%` 禁止全额预付；`预付100%` 违规、`预付30%` 通过、`预付１００％`（全角）与 `100% T/T` 同样命中——匹配前做 NFKC、大小写折叠和空白压缩。**不做数值比较**：`预付三成`不会被推断为 30%。
- **材质/包装冲突**：两个已发布版本复用同一 `ruleId` 但定义了不同字面与严重度。引擎不择一，输出 block 冲突批注并引用两个版本，提示人工裁决；这是"同键异参"在规则层的表现，不是材质库比对。
- **未知覆盖**：本单没有任何适用范围匹配的已发布规则时，两类检查各出一条 pending 批注（定位 `scenario.platform`、无虚构来源、ruleRevisionIds 为空），绝不输出全部通过。
- **版本不变**：V2 修复后生成绑定新 revisionId 的报告，V1 报告与输入知识在重复计算后逐字节不变，checkId 不复用。

已知边界：合同字段目前只有 payment/delivery，`QuoteSnapshot` 也没有材质字段，因此本批不实现材质字段级校验；需要扩展字段和规则的，另立契约变更，不在此伪造。

## 复核探针

```sh
node scripts/contract-review-probe.mjs --out wiki-project/raw/b-contract-probe.json
node scripts/contract-review-probe.mjs --list
```

探针固定运行三份套件（证据资格、既有 P1 维护契约、报价规则样例），记录 `git rev-parse HEAD`、分支、工作区是否 dirty、被测源码与测试文件的 SHA-256、Node/平台版本、完整命令、逐 case 状态与失败信息；覆盖轴（权限、证据不匹配、同键异参、交换完整性、资格矩阵、报价样例）是**显式声明**的，删掉 case 会以 `missingCaseIds` 暴露而不是悄悄变少。结果写入 `wiki-project/raw/b-contract-probe.json`，含 `status`/`checks` 退出码与逐文件 hash（`role: test|source`），可直接作为本轮验证证据；`scripts/contract-review-probe.test.mjs` 只跑 `--list` 守卫声明覆盖，不重复启动 vitest。

## 未完成项

- 维护写入、事务、证据查表、OCC 与 outbox 属 A 的实现；本页只给契约、判定函数和交换对象。
- `quote.check` 业务编排、检查存储、面板与真实知识查询（A01）仍未接线，B01 只完成纯规则子切片。
- 未执行 Electron 桌面路径与真实模型；本机 Windows 未能构建 better-sqlite3，infrastructure/Electron 套件未运行。

关联：[[B00a知识整理与维护协议]]、[[B00a-P1知识整理与维护契约]]、[[B01-规则检查与双反馈]]、[[测试与验证地图]]。
