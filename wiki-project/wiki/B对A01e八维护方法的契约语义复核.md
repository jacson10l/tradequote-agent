---
title: B对A01e八维护方法的契约语义复核
type: interface
status: observed
updated: 2026-10-31
sources:
  - conversation:用户要求B针对A固定实现267f087复核同键重放OCC顺序影响目标身份hash处理证据资格分页快照问题去重并裁定合成样例
  - packages/contracts/src/protocol.ts:9
  - packages/contracts/src/knowledge-maintenance.ts:408
  - packages/domain/src/wiki-maintenance.ts:53
  - packages/infrastructure/src/wiki-store.ts:153
  - packages/infrastructure/src/wiki-store.ts:1439
  - packages/infrastructure/src/wiki-store.ts:1639
  - packages/infrastructure/src/wiki-store.ts:1676
  - packages/infrastructure/src/wiki-store.ts:1743
  - packages/infrastructure/src/wiki-store.ts:1879
  - packages/infrastructure/src/wiki-store.ts:1917
  - packages/infrastructure/src/wiki-store.ts:1949
  - packages/infrastructure/src/wiki-store.test.ts:1211
  - tests/fixtures/knowledge/sources/src-terms-payment-split.txt:1
  - wiki-repo:raw/b01-a01e-contract-review.json:1
---

# B 对 A01e 八维护方法的契约语义复核

## 复核对象与边界

固定点为 267f087490046955a0b4b1e6183caa163cc177c3（分支 codex/a01e-p1-fixes 的 docs-only 推送回执），其下固定实现为 dac69db4c527ee3484f3481f65c76d63649cd04c。按 A 在 log 中的声明，回执 SHA 不与实现 SHA 混用；本轮同时针对两者，结论只对这两个提交有效。A 后续 codex/a01e-p2-fixes 的 46939c3 不在本轮范围，未复核。

B 依据 [[B00a知识整理与维护协议]] 第 58、78、80、84、86、88、100 行附近的条款，读取公共 schema、store、service 与 A 的测试，并在本机独立 worktree（codex/b01-a01e-contract-review）用真实 `SqliteWorkspaceRepository` 跑既有 24 项和一份临时探针。探针文件不进入交付；实际返回值、命令与退出码见 [raw/b01-a01e-contract-review.json](../raw/b01-a01e-contract-review.json)。

本轮未修改 A 分支、未推送/合入/代签，未跑桌面 IPC/E2E 与全量 `pnpm check`，也未发生人工审核/发布/撤回/业务签认。

## 结论

**不通过，不能作为 A01e 合入、关闭或业务接线依据。** 方法面齐全、knowledge-wiki:9 可迁移、既有 24/24 通过，这些成立；但五个重点全部存在契约级偏差，其中三项阻断：

| 编号 | 结论 | 契约点 | 实际行为（本机复现） |
|---|---|---|---|
| B-A01E-01 | 阻断 | 写请求幂等、先回放后 OCC | 同 idempotencyKey 同 payload 二次提交返回 REVISION_CONFLICT，不返回原回执 |
| B-A01E-02 | 阻断 | 撤回状态须绑定同一持久事件 | 返回的 eventId 不在 outbox；7 条撤回事件中 0 条 payload eventId 与自身行一致 |
| B-A01E-03 | 阻断 | 列表绑定 workspace/查询/快照 | 续页可见首屏后新增的 4 条问题；换 states 复用旧 cursor 仍 ok |
| B-A01E-04 | 应修 | 固定目标版本/hash、核实新旧关系 | 伪造 artifactHash 被接受并回显；v2 以 v1 作 replacement 被接受 |
| B-A01E-05 | 应修 | 去重键规范集合 | 同一已撤回来源出现 2 条 issue；键含调用方可控 hash，缺 workspace 与触发事实 |
| B-A01E-06 | 应修 | resolve/dismiss 必有已存执行证据 | 随机 UUID 即可 resolve 成功并落库 |
| B-A01E-07 | 应修 | 影响完成/部分必须如实 | 消费者状态硬编码 unknown；条目解析失败被静默丢弃而总数照计 |
| B-A01E-08 | 应修 | 重建须构建并校验后原子切换 | 无任何投影表即返回 ready、generation=1；operationKey 由宿主随机生成 |
| B-A01E-09 | 应修 | 追加可回放的生命周期事件 | outbox 载荷只有 id，缺 entityVersion/evidenceIds/note；discovered 从不发 |
| B-A01E-10 | 应修 | workspace 作用域 | getImpact/getIndexRebuild 只按 id 读，不校验工作区 |

以下按用户指定的五个重点展开，再给资料冲突样例裁定。

## 一、同键重放与 OCC 顺序

契约：写请求幂等作用域为 workspace，摘要含 method、规范化 payload、actor/origin，不含 requestId/now；控制请求先在当前权限下识别同键回放，再对新请求做 OCC，避免第一次递增版本导致自身重试冲突（B00a 第 58 行）。P0 信封已固定 `idempotencyKey`（packages/contracts/src/protocol.ts:9），八个写命令也都在 schema 中要求它（packages/contracts/src/knowledge-maintenance.ts:408 起）。

实现把信封丢了：`createKnowledgeMaintenanceService.execute` 只把 `command.payload` 和 context 交给 store（packages/domain/src/wiki-maintenance.ts:53），四个写方法签名没有 key 参数（packages/infrastructure/src/wiki-store.ts:1553、1676、1749、1949）。因此：

1. 同键同参重试没有回放，撤回第二次走到版本比较，返回 REVISION_CONFLICT；resolve 第二次返回 REVISION_CONFLICT；rebuild 第二次同样冲突。已成功的请求被当成失败，客户端只能人工判断是否重发。
2. 同键异参无法被识别为 IDEMPOTENCY_CONFLICT，因为键根本没参与。
3. 顺序无法满足“先回放后 OCC”：实现是先校验 expectedLifecycleVersion/expectedIssueVersion/expectedGeneration，再写；没有回放层。

A 在 [[A01c检索引用实现]] 中写“写方法一律不用 idempotency 表（与 lint 一致，走 OCC）”。B 不接受这个类推：lint 属于 P1 前方法，不能作为 P1 写幂等的豁免；契约的幂等要求覆盖所有写命令，OCC 只解决“基于哪个版本改”，不解决“这次请求是否已经成功过”。

要求：四个写方法接收信封 key；在同一事务内先按 `(workspaceId, key)` 查回放，命中同指纹返回首次结果，命中异指纹返回 IDEMPOTENCY_CONFLICT，未命中才做 OCC 与写入；指纹算法复用现有 `requestFingerprint` 口径，排除 requestId/now。

验收用例 A01e-5：同 key 同 payload 二次撤回返回首次 `state` 与 `event.eventId`，不新增 outbox 行；同 key 改 note 返回 IDEMPOTENCY_CONFLICT；崩溃后重试仍返回首次回执。

## 二、撤回事件身份

契约：`source.withdraw` 返回的 P0 withdrawn 状态必须与**同一** source.withdrawn 事件的身份/版本/时点对应（B00a 第 100 行）；结果 schema 也用 refine 校验 state 与 event 一致（packages/contracts/src/knowledge-maintenance.ts:484）。

实现先构造一个带 `randomUUID()` 的 event 对象（packages/infrastructure/src/wiki-store.ts:1592），只用于返回值；`emit()` 另行生成 outbox 的 `event_id`（packages/infrastructure/src/wiki-store.ts:183），落库的 payload 里虽然塞了这个 eventId，但与 outbox 行自身 id 不同（packages/infrastructure/src/wiki-store.ts:1604）。本机探针结果：返回 eventId 在 outbox 中不存在，7 条 source.withdrawn 行的 payload eventId 与自身 event_id 匹配数为 0。

后果不是文案问题：任何按事件 id 回读、对账、补偿或对外展示“撤回凭据”的消费者都拿不到真实事件；schema 的 refine 校验的是同一函数里一起构造的两个对象，只能证明自洽，不能证明与持久事实一致。

要求：先生成 eventId 并以该 id 写 outbox（emit 接受 eventId/entityVersion/evidenceIds/note），再返回同一对象；或落独立生命周期事件表并回读同一行。验收：`outbox.event_id === 返回值 event.eventId`，entityVersion 与 lifecycleVersion、occurredAt 与 changedAt 逐字一致。

## 三、分页快照与游标绑定

契约：维护列表按 issueId 升序、绑定 workspace/查询/快照，空页游标仍须严格前进；类型/状态过滤不能改变游标绑定；快照过期返回 REVISION_CONFLICT（B00a 第 80 行）。

实现只有“快照形状”，没有快照事实：snapshotId 在无 cursor 时随机生成并回显（packages/infrastructure/src/wiki-store.ts:1645），不冻结任何集合，续页直接对实时表重扫；`query.cursor.queryHash` 从未与本次查询比对（packages/infrastructure/src/wiki-store.ts:1644 与 1649 各算一次，没有分支）；游标过期没有判定。

本机探针：

- 首屏 limit=2 后新增 4 条问题，续页返回 6 条，其中 4 条是首屏之后创建的，checkedAt 也不同——快照没有冻结。
- 首屏 cursor 的 queryHash 为 5cc5…，改用 `states:["resolved"]` 复用同一 cursor，返回 ok，页面 queryHash 变为 8aaa…，且返回 resolved 条目——跨过滤条件静默换绑。
- `nextCursor` 在 `hasMore` 为真但条目解析失败时被置空（packages/infrastructure/src/wiki-store.ts:1660），违反“空页游标仍须严格前进”，并把剩余问题永久隐藏。

要求：首屏把匹配集合的 issueId 及当时 version/state 冻结（快照表或 cursor 内完整有序 id+版本），续页只读快照；校验 cursor 的 snapshotId 与 queryHash，不一致或过期返回 REVISION_CONFLICT；读取失败返回 STORAGE_ERROR，不得以空页终止。B 已在公共层给出 `MaintenanceExchangeSchema`（packages/contracts/src/knowledge-maintenance.ts:219），它当前全仓无调用点（见文档项 D4），修复时应由 store 或 service 实际调用。

## 四、影响目标身份/hash 与新旧关系

契约：analyzeImpact 固定触发的来源/知识版本/hash，宿主核实同一来源的新旧关系，不接受 self-replacement（B00a 第 84 行）；报告主题进入不可变报告，也会进入去重键。

实现只查存在性与同 sourceId（packages/infrastructure/src/wiki-store.ts:1750-1758），不比对存储的 artifactHash/contentHash/sourceSetHash，也不比较版本先后。本机探针：

- 对已撤回来源传 `artifactHash = ffff…`，分析返回 ok，报告 subject 原样回显伪造值；随后同一来源出现 2 条 source_withdrawn 问题。
- 对 v2 目标传 v1 作为 replacementRevisionId（source_updated），返回 ok。旧版本被当作“新版本”，影响方向被反转。

要求：事务内读取存储版本，逐字核对 target 的 hash 三元组；source_updated 要求 replacement.version > target.version、parentRevisionId 链一致且 replacement 非自身；不满足返回 REVISION_CONFLICT 或 SOURCE_CONFLICT，不能落报告。

## 五、处理证据资格与问题去重

契约：issue 固定 workspace/issueId/issueVersion/dedupKey、确切目标版本与 hash、证据与发现时点；去重键是“工作区＋固定目标身份/版本＋问题种类＋触发事实身份”的规范化集合 SHA-256，排除发现时间/请求键（第 78 行）；resolve/dismiss 必有已存执行证据，真正解决须核实新发布/来源复核/撤回等对应事实（第 80 行）。

实现：

- 证据只校验“非空 uuid 数组”（schema），写入时不查存在性，也不按 issue.kind 重读事实（packages/infrastructure/src/wiki-store.ts:1711-1717）。本机探针用随机 UUID 直接 resolve 成功；A 自己的 A01e-2 也用 `randomUUID()` 作为证据并通过（packages/infrastructure/src/wiki-store.test.ts:1297、1310、1325）。这等于把“处理完成”降级为一次表单提交。
- 去重键是 `hash(JSON.stringify({ kind, target }))`（packages/infrastructure/src/wiki-store.ts:1468），缺 workspaceId，缺触发事实身份（如 conflict 对端 revision、source_updated 的新版本、撤回事件），且依赖对象字面量顺序而非显式规范化。探针用伪造 hash 得到第二条同源 issue；同一文档的不同冲突会被合并成一条。
- 重复检测只刷新 lastDetectedAt 与 evidenceIds（packages/infrastructure/src/wiki-store.ts:1506），不重开已 resolved 的问题，这一点与契约“不创建重复任务、原事件保留”一致，可保留；但 target/severity/message 不再核对，触发事实变化时 issue 仍是旧描述。

要求：按 kind 定义证据类型白名单（source_withdrawn 需来源复核或撤回事件；source_updated 需新发布回执；conflict 需对端版本与裁决记录），事务内按 id 读取并校验 workspace/版本，缺失返回 MISSING_FACTS；去重键改为显式字段数组（workspaceId、target.kind、目标 id+version+hash、issue kind、触发事实 id）排序后 SHA-256，并补回归：同事实不同调用路径（撤回命令与 analyzeImpact withdrawn）必须落到同一 issue。

## 六、影响报告完整性与索引重建

契约：completed 只有完整总数且无 unknownReasons；partial 的 totalItems 为 null 并写明缺失范围；有准确总数的首个终页必须返回全部结果；未知消费者页归 partial/failed（第 86 行）。rebuildIndex 须先异步构建并校验新视图，事务中原子切换；ready 须完整追上权威序列；构建期间新事实可致 stale；旧票据不得覆盖新生成代（第 88 行）。

实现：

- 扫描范围只有 `knowledge_wiki` 全表按 sourceRefs.sourceId 过滤，加 `knowledge_consumption` 全表（packages/infrastructure/src/wiki-store.ts:1784-1841）；关系、断链、报价草稿等其它消费面未扫描，却可以给出 completed 与准确总数，属于“未扫描当空集”。
- 消费者状态一律 `unknown`、`requiresReview` 一律 true（packages/infrastructure/src/wiki-store.ts:1835），无法区分草稿与最终历史；有消费者即 partial 的保守方向可接受，但不是“按事实派生”。
- 条目写入时 `safeParse` 失败被 `continue` 跳过（packages/infrastructure/src/wiki-store.ts:1862），而 totalItems 用的是跳过前的长度，completed 报告的总数可能大于可读条目，终页无法返回全部结果。
- rebuildIndex 同步把 generation+1、indexedSeq=authoritative、state=ready 写死（packages/infrastructure/src/wiki-store.ts:1976-1989），没有任何投影构建与校验；探针显示 generation=1、indexedSeq=0、state=ready，且库中不存在 knowledge_index_keyword/markdown 表。ticket 的 operationKey 是宿主 `randomUUID()`（packages/infrastructure/src/wiki-store.ts:1996），不是请求键；status.rebuildId 恒 null，state 永远不会是 rebuilding/stale/failed。公共 `KnowledgeIndexCommitExchangeSchema`（packages/contracts/src/knowledge-maintenance.ts:532）未被调用。
- A 在 46939c3 自述已修 M06 与投影，本轮不据此关闭；267f087 上确实没有。

要求：影响扫描按契约声明覆盖范围，未实现面写入 unknownReasons；条目校验失败必须回滚事务而不是跳过；rebuild 按异步票据 + 校验行数 + 原子切换实现，切换前校验 indexedSeq 不低于切换前值，构建期间新事实返回 stale，旧票据/旧代返回 REVISION_CONFLICT，崩溃先查已提交回执否则 interrupted。

## 七、事件、工作区与文档一致性

- 生命周期事件：resolve/rebuild 只往 outbox 写 `{issueId}` / `{index,rebuildId,generation}`（packages/infrastructure/src/wiki-store.ts:1731、2025），缺 entityVersion/evidenceIds/note，无法按 `KnowledgeMaintenanceLifecycleEventSchema` 回放；maintenance.discovered 从不发。要求补齐字段或落事件表。
- 工作区作用域：getImpact 与 getIndexRebuild 只按 id 读（packages/infrastructure/src/wiki-store.ts:1879、2042），不校验 workspace；单工作区阶段影响低，但多工作区演进会成为越权读取。要求补 workspace 过滤。
- 文档一致性（A 自述与实现不符，必须二选一改）：[[A01c检索引用实现]] 写“getMaintenance 按稳定游标分页（snapshot 固定）”而实现未冻结；“open→acknowledged→resolved”而实现是 open→in_progress；“重复撤回/已结案撤回按版本冲突拒绝”而实现是 ACTION_NOT_ALLOWED；“写方法一律不用 idempotency 表”与本复核第一节冲突。
- 迁移面：knowledge_maintenance_issue 没有 issue_version 列，版本只在 data_json；impact report 与 rebuild ticket 没有不可变触发器，与“不可变报告/票据”不符。可保留 JSON 权威，但需在 Wiki 明写“无 DB 级不可变”，且不能把该表当作审计证据。
- `hasSeqTable()` 在旧库静默返回 0（packages/infrastructure/src/wiki-store.ts:1439）：旧谱系未迁移时索引状态会显示 missing/ready 而不是失败。兼容口子可保留，但必须在 Wiki 声明“未迁移库不保证 staleness”，不得作为索引验收证据。
- A 的 24/24 只覆盖快乐路径。建议补 A01e-5 同键重放、A01e-6 跨页换过滤/空页前进、A01e-7 证据资格、A01e-8 去重规范化、A01e-9 伪造 hash/旧版本 replacement、A01e-10 投影构建与 stale。B 会在 A 给新固定提交后按这些用例复核，不复用本轮结论。

## 八、资料冲突的样例资格（B 裁定）

本条回答“哪些资料冲突可以作为报价规则样例，哪些只能标为待核对”。裁定同时约束 B01 规则样例与 A01e 维护队列，避免用标签替代真实性。

可以作为报价规则样例（可直接驱动规则/检查/双反馈演示）：

1. 明确 `sourceStatus=synthetic`、绑定固定 revisionId/contentHash 的合成规则文本，冲突点落在确定性字段。仓库现有样例即属此类：`tests/fixtures/knowledge/sources/src-terms-payment-split.txt`（预付与尾款合计须为 100%）、`src-terms-fibre-conflict.txt`（宣称单一纤维但规格含第二种纤维应阻断）、`src-terms-validity.txt`（有效期与币种缺失应阻断）。
2. 同一条规则的两个合成版本给出不同阈值或不同措辞（例如付款比例 30/70 与 50/50），用于验证系统能暴露冲突、能定位双方 revision。此类样例只能证明“检出能力”，不能择一作为默认值、审批依据或对外报价口径。
3. 同一版本内正文与结构化 rules 不一致、section 引用缺失等机械可判定的矛盾，用于 lint duplicates_conflicts 与规则映射样例。

作为样例的四个必要条件：来源标记为 synthetic 且保留原文；双方 revisionId/contentHash 固定可复现；样例与真实客户/供应商数据物理隔离（tests/fixtures 与工作区运行库分开）；界面与报告显示“合成样例，非真实政策”。

只能标为待核对，不得作为报价规则样例背书：

1. 真实客户/供应商原件、报价单、合同、认证与合规声明；未脱敏或未获授权的资料不得入库。
2. 价格、成本、有效期、付款比例、原产地、关税、认证状态等实质结论，即使来自“真实”资料，未经人工对照也属待核对。
3. 现实有效性只能是 unknown 的声明；模型 `inference` 与 `fact` 混用而未人工确认的条目。
4. 冲突双方都没有人工裁决或来源复核记录的情形；此时只能进冲突/维护队列，不能生成 block 级规则，不能写入默认值。
5. 维护队列中的 synthetic fixture 标识不能充当 resolve 证据；解决必须引用真实的发布回执、来源复核或撤回事件（对应第 5 节 B-A01E-06）。

**synthetic 标签的性质**：它只证明“这是测试文本、不是真实政策/合同/供应商承诺”，不证明来源真实，也不证明内容正确；反之，真实资料未经人工核对也不是“已核实”。`knowledge-drafts.a01a.json` 的 `_comment` 已自述 never real compliance claims。lint passed、维护 resolved、样例被引用，都不构成来源真实性证明。当前实现允许随机证据结案，正是把“待核对”洗成“已核对”的通道，必须先堵住再谈样例扩充。

## 九、给 A 的修复顺序

1. 先修 B-A01E-01/02/03 三项阻断，给新固定提交；其余项可同批但不得用阻断未修的状态宣称可用。
2. 再修 04/05/06（目标身份、去重规范、证据资格）并补 A01e-5～A01e-8 回归。
3. 最后修 07/08/09/10 与迁移/文档一致性，补 A01e-9/10 与投影构建用例。
4. B 按新固定提交重新复核，重新跑探针；本轮结论不自动延续，也不能作为 A01e 关闭依据。

## 未完成与边界

未修改 A 分支、未推送、未合入、未代签；未跑桌面 IPC、E2E、全量 `pnpm check` 与 Windows；未复核 46939c3。A01 任务页与 A01c 页的状态由 A 自己更新，B 不代改。人工审核、发布、撤回与业务签认仍未发生。

关联：[[B00a知识整理与维护协议]]、[[A01c检索引用实现]]、[[B01-规则检查与双反馈]]、[[知识库可靠性与覆盖范围]]。
