---
title: B对A01e八维护方法的契约语义复核
type: interface
status: observed
updated: 2026-10-31
sources:
  - conversation:用户要求B针对A固定实现267f087复核同键重放OCC顺序影响目标身份hash处理证据资格分页快照问题去重并裁定合成样例
  - conversation:用户要求B收紧首轮复核措辞、保存可复跑探针与断言并给出确定性正反例
  - packages/contracts/src/protocol.ts:9
  - packages/contracts/src/knowledge-maintenance.ts:219
  - packages/contracts/src/knowledge-maintenance.ts:340
  - packages/contracts/src/knowledge-maintenance.ts:408
  - packages/contracts/src/knowledge-maintenance.ts:532
  - packages/domain/src/wiki-maintenance.ts:53
  - packages/infrastructure/src/migrations.ts:271
  - packages/infrastructure/src/wiki-store.ts:1468
  - packages/infrastructure/src/wiki-store.ts:1501
  - packages/infrastructure/src/wiki-store.ts:1604
  - packages/infrastructure/src/wiki-store.ts:1644
  - packages/infrastructure/src/wiki-store.ts:1863
  - packages/infrastructure/src/wiki-store.ts:1926
  - packages/infrastructure/src/wiki-store.ts:1966
  - packages/infrastructure/probes/a01e-contract.probe.ts:1
  - wiki-repo:raw/b01-a01e-contract-probe.json:1
  - wiki-repo:raw/b01-a01e-contract-review.json:1
---

# B 对 A01e 八维护方法的契约语义复核

## 复核对象与边界

固定点为 267f087490046955a0b4b1e6183caa163cc177c3（分支 codex/a01e-p1-fixes 的 docs-only 推送回执），其下固定实现为 dac69db4c527ee3484f3481f65c76d63649cd04c；两个 SHA 按 A 的声明分开记录，不混用。本轮所有结论只对这两个提交有效。A 后续 46939c3（codex/a01e-p2-fixes，自述修 M06 快照与索引投影）不在复核范围，见文末边界。

证据不再是临时脚本：探针固定在 `packages/infrastructure/probes/a01e-contract.probe.ts`，配置 `a01e-contract.vitest.config.ts`，产物 `raw/b01-a01e-contract-probe.json`。它不进常规 unit 套件，必须显式运行；通过＝18 项都与契约一致，失败＝列出已复现偏差编号。本轮实测 18 项中 16 项偏离契约、2 项符合（P11、P16）。

## 本轮更正：首轮措辞与证据的收敛

首轮把若干“实现方式不同”写成了“事实缺失”，本轮逐条按代码与探针结果更正；原有失败记录保留，不删除。

| 首轮说法 | 更正 | 依据 |
|---|---|---|
| 撤回事件身份“不入库” | 事件 `eventId` 已写入 outbox 的 payload；真实缺口是它与 outbox 行 `event_id` 不是同一个值，因此无法按返回 ID 回读、对账或重放，而不是完全没有持久化 | P04：2 个返回 eventId 在 outbox 命中 0；2 行 payload 与本行 id 一致 0 |
| 索引 `state` 永远不会是 stale/failed | `getIndexStatus` 已按 `indexedSeq < authoritativeSeq` 派生 stale；缺的是 rebuilding/failed 状态、投影构建与切换前校验 | P16：权威序列前进后实际 `state=stale`（1/2） |
| 去重键“缺 workspaceId”导致跨工作区合并 | 查询按 `workspace_id` 过滤，且有 `UNIQUE(workspace_id, dedup_key)`；跨工作区不会合并。真问题是键材料只有 `{kind,target}`，缺触发事实身份与显式规范化，同一事实因入口不同而分裂 | `packages/infrastructure/src/migrations.ts:288`、`packages/infrastructure/src/wiki-store.ts:1501`；P12：同一撤回事实 2 条、dedupKey 不同 |
| `knowledge_maintenance_issue` 无 `issue_version` 列是缺陷 | JSON 权威、派生列可接受；单独缺列不算错。错的是缺 DB 级不可变/版本约束却把它当审计证据使用 | `packages/infrastructure/src/migrations.ts:279`，与 `knowledge_lint` 的不可变触发器对照 |
| 跨工作区“越权读取” | 单工作区库无第二个工作区，**未复现越权**。可观测的只是 `getImpact/getIndexRebuild` 不与宿主上下文比对；这是待修口径，不是已发生的数据泄露 | P18：上下文工作区不一致仍返回 ok |
| 公共 Exchange 校验器“无调用点”即缺陷 | 不成立。契约允许宿主内联等价校验；判据应是它保护的不变量是否实际缺失，见“公共校验器”一节 | `packages/contracts/src/knowledge-maintenance.ts:219`、`:324`、`:532`，仅被 contracts 测试引用 |

## 结论

**不通过，不能作为 A01e 合入、关闭或业务接线依据。** 方法面齐全、knowledge-wiki:9 可迁移、A 的 24/24 快乐路径回归通过，这些都成立；但三项阻断、六项应修与一项观察在固定基线上可稳定复现。表中“证据”指 `raw/b01-a01e-contract-probe.json` 的观察编号。

| 编号 | 级别 | 契约点 | 实际行为（本轮复现） | 证据 |
|---|---|---|---|---|
| B-A01E-01 | 阻断 | 写请求幂等，先回放后 OCC | 信封 `idempotencyKey` 在 service 被丢弃；同键同参二次撤回返回 REVISION_CONFLICT，outbox 不增但不回放；同键异参也返回 REVISION_CONFLICT 而非 IDEMPOTENCY_CONFLICT | P01、P02、P03 |
| B-A01E-02 | 阻断 | 撤回状态绑定同一持久事件 | 返回 eventId 与 outbox 行 id 不一致，按返回 ID 查不到事件；payload 与本行一致的 0/7 | P04 |
| B-A01E-03 | 阻断 | 列表绑定 workspace/查询/快照 | 首屏 2 条后新增 3 条，续页 7 条且含全部新增；换 states 复用旧 cursor 返回 ok 且 queryHash 改变；条目解析失败时返回空页并置空游标，剩余问题被永久隐藏 | P05、P06、P07 |
| B-A01E-04 | 应修 | 固定目标版本/hash、核实新旧关系 | 伪造 artifactHash 被接受并在报告 subject 回显；target v2 + replacement v1 被接受，影响方向反转 | P08、P09 |
| B-A01E-05 | 应修 | 去重键规范集合 | 同一撤回事实由命令与 analyzeImpact 两个入口产生 2 条问题（键材料缺触发事实）；工作区隔离本身成立 | P12 |
| B-A01E-06 | 应修 | 处理必有已存执行证据 | 随机 UUID 即可 resolve 成功；该 UUID 在来源/知识/outbox 三个事实表中命中 0 条 | P10 |
| B-A01E-07 | 应修 | 影响覆盖与 unknown 消费者 | 知识版本有 `supersedes` 关系边时仍返回 completed、totalItems=1、unknownReasons=0；消费者状态恒为 unknown（后者方向可接受，但需与 C3 条件一致） | P13 |
| B-A01E-08 | 应修 | 重建须构建并校验后原子切换 | 无任何 keyword/markdown 投影表仍返回 completed/ready、generation=1；operationKey 为宿主随机值而非请求键；状态永不进入 rebuilding | P14、P15（P16 为符合项） |
| B-A01E-09 | 应修 | 追加可回放的生命周期事件 | `maintenance.resolved` 载荷只有 `issueId`，缺 entityVersion/evidenceIds/note；`maintenance.discovered` 从未发出 | P17 |
| B-A01E-10 | 观察 | 读方法核对宿主工作区 | `getImpact/getIndexRebuild` 只按 id 读，不比对 context.workspaceId；单库无法证明越权，按演进风险处理，不列阻断 | P18 |

修复只用这一张表即可定位，下面五节给出 B 的确定性裁定与正反例，A 可直接照此实现与补测。

## 一、幂等与 OCC 的顺序（B 裁定）

规则：

- **I1** 幂等域是 `(workspaceId, idempotencyKey)`；指纹含 method、规范化 payload、actorId/origin，**不含** requestId 与 now。
- **I2** 同一事务内顺序固定：①按 key 查回放 → ②同指纹返回首次结果（不再 OCC、不再写业务行、不再 emit、不 bump seq）→ ③异指纹返回 IDEMPOTENCY_CONFLICT → ④未命中才做 OCC 与写入。
- **I3** 回放结果逐字等于首次（eventId、issueVersion、checkedAt 都用首次值），不得因重试时 now 不同而变化。
- **I4** 只有成功结果入回放表，且与业务写同事务；失败（REVISION_CONFLICT/ACTION_NOT_ALLOWED）不留键，允许人工修正后重发。
- **I5** 幂等键属于信封，不属于 payload；service 必须把它传给 store，不能“因为 lint 不用幂等表”推广到 P1 写命令。

正例（必须通过）：

1. 撤回同 key 同 payload 两次 → 第二次 ok，`event.eventId` 与首次相同，outbox 行数不变。
2. 撤回同 key、note 改变 → IDEMPOTENCY_CONFLICT，业务状态不变。
3. resolve 同 key 两次 → 第二次返回首次 `issueVersion`，不增事件。
4. 进程崩溃后重启重试同 key → 命中已提交回放，不重复撤回、不重复登记问题。

反例（当前实现）：P01 第二次 REVISION_CONFLICT；P02 同键异参 REVISION_CONFLICT；P03 重放 REVISION_CONFLICT。根因是 `packages/domain/src/wiki-maintenance.ts:53` 只传 `command.payload`，四个写方法签名也没有 key 参数。

## 二、处理证据的资格与归属（B 裁定）

规则：

- **E1** `evidenceIds` 必须指向**已存事实**（来源版本、知识版本、撤回/发布事件、冲突裁决记录），不能是调用方自造 UUID。
- **E2** 按 `issue.kind` 限定可接受证据类型，跨类证据无效：

| issue.kind | 允许的证据 | 额外前置 |
|---|---|---|
| source_updated | 新来源版本 revisionId + 发布/复核回执 | replacement.version > target.version，同 sourceId |
| source_withdrawn | 撤回事件 eventId（outbox 行） | 事件 entityId/entityVersion 与来源一致 |
| conflict | 双方 revisionId + 裁决记录 | 两侧 hash 与 issue.target 一致 |
| expired / unknown_validity | 来源版本 + 有效期证据 | 不得用“已核对”结论替代 unknown |
| hash_mismatch / broken_reference / orphan / duplicate | 对应事实行 + 复算用的内容/来源集 hash | 复算必须用同一算法与同一输入 |
| index_stale | 重建票据 rebuildId + 切换后状态 | indexedSeq 追上 authoritativeSeq |

- **E3** 证据必须属于同一 workspace，并与 issue.target 相关；全局存在但无关的证据无效。
- **E4** 证据校验在事务内按 id 读取并复算，缺失返回 MISSING_FACTS；不得只依赖 schema 的“非空 UUID 数组”。
- **E5** fixture 标识、文件名、synthetic 标签、lint passed、问题被引用，都不能充当处理执行证据。

正例：用真实撤回事件的 eventId resolve 一个 source_withdrawn 问题 → ok；用别的来源的证据 → MISSING_FACTS；resolve 后重扫同一事实 → 不重开（P11 已符合）。反例：P10 随机 UUID 直接结案；A 自己的 A01e-2 也用 `randomUUID()` 作证据并通过，说明测试把错误行为固化了。

## 三、结案与重扫（B 裁定）

规则：

- **R1** 同一事实重扫只更新 `lastDetectedAt` 与 `evidenceIds`，不重开、不改 `issueVersion`、不新建行（P11 通过，保留）。
- **R2** 触发事实变化（新 revision/hash、冲突对端改变、撤回后重新发布）→ 新 dedupKey → 新问题；旧问题保留原事件与结论，不合并、不覆盖。
- **R3** dismiss 只关闭处理项，不解除实际阻断：来源仍 withdrawn、检查/报价仍须阻断；不得因 dismiss 恢复旧审批。
- **R4** 结案必须有 E1–E4 证据；读取时发现证据缺失或事实不成立，应按未结案处理并返回明确错误，不能静默降级为已解决。
- **R5** 不得通过编辑旧知识/旧报价来消除影响；处理动作只改维护队列与事件。

正例：撤回 → 用撤回事件结案 → 再跑 analyzeImpact 同一来源 → 仍 1 条 resolved（不重开）；撤回后重新发布新版本 → 新 source_updated 问题出现，旧 resolved 保持。

## 四、快照与游标的生命周期（B 裁定）

规则：

- **S1** 首屏无 cursor 时生成 snapshotId 并**冻结集合**（快照表，或 cursor 内完整有序 issueId+version/state），不能只回显随机 ID。
- **S2** 续页只读快照；`cursor.snapshotId` 与 `queryHash` 必须与本次查询逐字一致，不一致返回 REVISION_CONFLICT。
- **S3** 快照过期（超过 TTL 或权威序列落后）返回 REVISION_CONFLICT，不得静默重扫当新快照。
- **S4** 有匹配但条目读取失败 → STORAGE_ERROR 并回滚，不得返回空页 + null 游标把剩余问题隐藏。
- **S5** `checkedAt` 若代表快照时点，续页必须与首屏一致；若代表读取时点，字段语义要在契约中写明，不能两页不同却仍称快照。

正例：首屏 2 条后新增 3 条 → 续页仍 4 条且不含新增；换 states 复用旧 cursor → REVISION_CONFLICT；游标过期 → REVISION_CONFLICT；空页且确无匹配 → nextCursor=null 合法。

反例（当前）：P05 续页 7 条含 3 条新增、checkedAt 变化；P06 换过滤 ok 且 queryHash 从 5cc5365b 变 8aaa9886；P07 损坏行导致空页 + null 游标（`packages/infrastructure/src/wiki-store.ts:1655` 至 `1663` 的过滤与游标计算）。

## 五、影响完整覆盖与未知消费者（B 裁定）

规则：

- **C1** 扫描面固定为：来源 → 知识（含 `sourceRefs` 与 `relations` 的 related/supersedes 边）→ 消费登记（quote/artifact）及其 draft/final 状态。关系边属于知识图，必须遍历或显式声明未遍历。
- **C2** 任一扫描面未实现、断链或无法判定 → status=partial，并在 unknownReasons 写明缺失面；不得把未扫描当空集。
- **C3** completed 的四个条件同时成立：有准确 totalItems、unknownReasons 为空、无未知消费者、无条目被解析跳过。
- **C4** 消费者状态按事实派生 draft/final/unknown；final 只报告影响，不改写金额/审批/历史产出。
- **C5** 出现未知消费者 → 该报告与页归 partial（或 failed），不能包装成 completed；这是当前实现已做对的方向，保留。
- **C6** 条目校验失败必须回滚整个报告事务，不能 `continue` 跳过而总数照计（`packages/infrastructure/src/wiki-store.ts:1863`）。

正例：只有知识版本、无消费 → completed 且 totalItems=知识版本数；有消费但状态未知 → partial + unknownReasons；关系边存在但未遍历 → partial 并写明“关系未遍历”。

反例（当前）：P13 关系边存在仍 completed、totalItems=1、unknownReasons=0——缺口不是“算错了数量”，而是**用 completed 表达了不完整的扫描面**。

## 六、公共校验器：按不变量判，不按调用点判

“没有调用某个命名校验器”本身不构成产品错误：契约允许宿主在 store/service 内联等价校验。判据是它保护的不变量是否实际缺失。

| 校验器 | 保护的不变量 | 当前是否有等价实现 | 结论 |
|---|---|---|---|
| `MaintenanceExchangeSchema`（`packages/contracts/src/knowledge-maintenance.ts:219`） | 跨页 queryHash/snapshot 一致、过滤一致、游标严格前进 | 无：queryHash 从不比对（P06），条目失败时游标可置空（P07） | 不变量缺失，须由 store/service 实际调用或写等价校验 |
| `KnowledgeImpactExchangeSchema`（`packages/contracts/src/knowledge-maintenance.ts:324`） | 报告固定、itemId 严格前进、首个终页返回全部 | 部分：getImpact 已按 reportId 绑定并严格前进；totalItems 与页末一致性未校验 | 补终页一致性即可，不阻断 |
| `KnowledgeIndexCommitExchangeSchema`（`packages/contracts/src/knowledge-maintenance.ts:532`） | 切换前必须 rebuilding、旧票据/旧代不覆盖、indexedSeq 不回退 | 无：从不写 rebuilding，直接 completed/ready（P14、P15） | 不变量缺失，随 B-A01E-08 一起修 |

交付口径：接线或内联实现后，在 Wiki 写明校验发生在哪个函数、哪一行，并给出对应反例测试；不要用“已存在校验器”替代实际校验。

## 七、资料冲突的样例资格（B 裁定）

可直接驱动规则/检查/双反馈演示（仍然只是合成样例）：

1. `sourceStatus=synthetic`、绑定固定 revisionId/contentHash 的合成规则文本，冲突点落在确定性字段：`src-terms-payment-split.txt`（预付+尾款须 100%）、`src-terms-fibre-conflict.txt`（单一纤维宣称与规格冲突）、`src-terms-validity.txt`（有效期/币种缺失应阻断）。
2. 同一规则的两个合成版本给出不同阈值（如 30/70 与 50/50）。这类样例只证明“能检出并定位双方 revision”，**不能择一作为默认值、审批依据或对外报价口径**。
3. 同一版本内正文与结构化 rules 不一致、section 引用缺失等机械可判矛盾，用于 lint duplicates_conflicts 与规则映射。

作为样例的四个必要条件：标记 synthetic 且保留原文；双方 revisionId/contentHash 与阈值固定、可复现；与真实客户/供应商数据物理隔离（`tests/fixtures` 与运行库分开）；界面与报告显示“合成样例，非真实政策”。

只能标为待核对、不得作为规则样例背书：真实客户/供应商原件与合同；价格、成本、有效期、付款比例、原产地、关税、认证状态等实质结论（未人工对照即待核对）；validity=unknown 的声明；模型 inference 与 fact 混用未人工确认；双方都无人工裁决/来源复核的冲突（只能进冲突队列，不能出 block 规则或默认值）。

两点性质必须写清：synthetic 标签只证明“非真实政策/合同/承诺”，不证明来源真实，也不证明内容正确；反之真实资料未经人工核对也不等于已核实。维护队列中的 fixture 标识不能充当 resolve 证据（对应 E5）。当前实现允许随机证据结案，正是把“待核对”洗成“已核对”的通道，必须先堵住再扩样例。

## 八、复核方法与可复跑探针

```sh
# 在目标固定基线的 worktree 根目录执行
npx vitest run --config packages/infrastructure/probes/a01e-contract.vitest.config.ts
# 产物（每次覆盖）
wiki-project/raw/b01-a01e-contract-probe.json
```

解读：`status=passed` 表示 18 项全部符合；`status=contract_gaps` 表示已复现偏差，`failing` 列出编号，`observations[].expected/actual` 是逐项断言。该套件**故意红**——它的价值是失败明细，不是绿灯；不要在常规 `pnpm test` 里跑它，也不要用它替代 A 的正式回归（A 需要把这些用例改成预期通过的实现测试）。

探针只使用合成 fixture（synthetic 来源、合成知识、合成 quote），不含真实客户/供应商资料；产物可直接提交。换基线复核时，在 `git worktree add --detach <sha>` 的目录里跑同一命令，并按新 SHA 另存结果，不复用本轮“不通过”去否定新版。

## 未完成与边界

- 未复核 46939c3 及任何 A 的 P2 提交；它不在本轮固定基线内。A 若以 46939c3 作为新固定提交，B 会按第八节在新 SHA 上重跑全部探针，并补“来源失效后的新引用与消费、历史快照回读、报告与消费同事务回滚”三类用例，本轮结论不自动延续。
- 未验证：跨工作区越权（单工作区库无法构造）、真实人员审核/发布/撤回/业务签认、桌面 IPC/E2E、Windows。
- 未修改 A 分支、未推送、未合入、未代签；A 的迁移与 C 的桌面集成结论由他们自己给出，B 不代签。
- A01c 页与 A01 任务页的 A01e 状态由 A 维护；B 只改自己的复核页、任务页与 B00a 协议页的口径。

关联：[[B00a知识整理与维护协议]]、[[A01c检索引用实现]]、[[B01-规则检查与双反馈]]、[[知识库可靠性与覆盖范围]]、[[B00a-业务Wiki契约补充]]。
