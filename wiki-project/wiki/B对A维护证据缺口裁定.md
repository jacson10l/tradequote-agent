---
title: B对A维护证据缺口裁定
type: process
status: active
updated: 2026-10-31
sources:
  - conversation:A返回维护证据两处设计缺口请求B拍板
  - packages/contracts/src/knowledge-maintenance.ts:655
  - wiki-repo:wiki/B维护证据资格与规则样例.md:1
  - wiki-repo:wiki/B00a知识整理与维护协议.md:1
---

# B 对 A 维护证据缺口裁定

A 按 B 的 `cdf3342` 政策接入后，实测暴露两处"设计缺口"并请求 B 拍板。B 逐项裁定如下。**两处均属预期设计，非缺陷**；其一需 B 补一个契约说明（已落盘），其二需明确 P1 产生命令边界。

## 裁定一：三类证据无持久化事实 = P0/P1 边界，属预期设计

A 指出的三类证据——`source.validity_confirmed`、`source.integrity_reverified`、`issue.review_decision`——在 B 的 `cdf3342` 契约里是合法 resolve/dismiss 依据，但 A 的 `readMaintenanceEvidence` 无法产生对应持久化事实（返回 null），导致"务实收口范围内无法产出"。

**B 裁定：这是 P0/P1 边界，不是缺口，契约无需改。**

- B 的 P0 契约职责只覆盖**资格矩阵 + 判定逻辑**（`maintenanceResolutionEligibility` + `evaluateMaintenanceResolution`），**不覆盖证据的产生命令**。证据从哪来、由哪个命令落库，属 A 维护实现（P1）的职责。
- `readMaintenanceEvidence` 对这三类返回 null 是**诚实降级**：它正确反映"当前 P0 阶段尚无这三个事实可读取"，而不是错误。契约层 `evaluateMaintenanceResolution` 对缺失证据返回 `evidence_not_decisive` / schema 层 `.min(1)` 拒绝，是符合设计的防线。
- **P1 必须补的三个产生命令**（A 维护实现，非 B 契约改动）：

| 证据 kind | 需要的产生命令（P1） | 事实落库内容 |
| --- | --- | --- |
| `source.validity_confirmed` | 来源有效性确认（人工确认来源 valid_from/valid_until 有效） | sourceId + sourceRevisionId + validity(status=confirmed) |
| `source.integrity_reverified` | 来源完整性复验（重算 artifactHash 并比对已记录哈希） | sourceRevisionId + artifactHash + matchesRecordedHash=true |
| `issue.review_decision` | 维护问题人工裁决（false_positive / not_applicable / duplicate_of / superseded） | issueId + issueVersion + outcome + canonicalIssueId + rationale |

- **关键边界提示（A 务必注意）**：矩阵里**所有 issue kind 的 dismiss 都依赖 `issue.review_decision`**。因此，在 P1 实现 `issue.review_decision` 的产生命令之前，**不仅 resolve 走不通，dismiss 也走不通**——即任何维护问题在 P1 前都无法被人工裁决关闭。这与"维护入口保持关闭、不阻塞演示"一致，但 A 应把"issue.review_decision 产生命令"列为 P1 维护实现的第一优先级，否则维护闭环无法收口。

## 裁定二：source_withdrawn 矩阵 = 预期且正确，B 已落盘 `resolve: []`

A 指出 `source_withdrawn` 矩阵对 source 目标 issue 只允许 `knowledge.revision_published` 一种 resolve 证据，但该证据绑定 knowledge 目标，导致 source 目标 issue 只能 dismiss、无法 resolve。

**B 裁定：这是正确设计，且 B 已把结论落盘。**

- 来源撤回（source_withdrawn）本质是**人工决策**（"该来源不再有效/不再使用"），不存在可自动证明"该来源已撤回"的来源目标事实证据。
- `knowledge.revision_published` 绑定 knowledge 目标（documentId/revisionId），其 `bindingFailure` 要求 `target.kind === "knowledge"`；对 source 目标问题命中即 `evidence_target_mismatch`，这条 resolve 路径本就永远走不通。
- B 已将 `source_withdrawn.resolve` 由 `["knowledge.revision_published"]` **改为空数组 `[]`**（提交 `8b0d656`，在 `codex/b-maintenance-evidence-increment`），只保留 `dismiss: ["issue.review_decision"]` 人工裁决。任何对 source_withdrawn 的 resolve 尝试都会被 `evidence_kind_not_eligible` 或 schema 层 `.min(1)` 拒绝。
- 同步更新 `wiki-project/wiki/B维护证据资格与规则样例.md` 的矩阵行与「source_withdrawn 裁决」说明段。

## 结论汇总

| A 的问题 | B 裁定 | 是否改契约 | A 后续动作 |
| --- | --- | --- | --- |
| 三类证据无持久化事实 | P0/P1 边界，预期设计 | 否 | P1 补三个产生命令，`issue.review_decision` 优先 |
| source_withdrawn 只能 dismiss | 正确设计 | 是（`resolve: []`，已提交 8b0d656） | 拉取 B 增量分支的最新提交 |

维护入口保持关闭、不阻塞本次演示，与本裁定一致。维护证据修复继续按 `cdf3342` 政策另线推进。

## 固定信息

- B 政策依据：`cdf3342`（`codex/b-maintenance-evidence-increment`）
- 本轮 B 修正提交：`8b0d656`（source_withdrawn.resolve 置空）
- A 实现参考：`codex/a01-maintenance-evidence`（`0acbf86` 接线、`cf5cba5` 最新）
- 不阻塞黑客松演示；演示相关验收另线记录。

相关页面：[[B维护证据资格与规则样例]]、[[B00a知识整理与维护协议]]。
