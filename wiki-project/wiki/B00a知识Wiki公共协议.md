---
title: B00a知识Wiki公共协议
type: interface
status: observed
updated: 2026-10-24
sources:
  - packages/contracts/src/knowledge-wiki.ts:1
  - packages/contracts/src/wiki-integrity.ts:1
  - packages/contracts/src/knowledge-wiki.test.ts:1
  - packages/contracts/src/pending-client.ts:1
  - packages/contracts/src/mock.ts:1
  - apps/desktop/src/preload/contracts.test.ts:1
  - tests/e2e/workspace.spec.ts:1
  - tests/fixtures/knowledge/knowledge-drafts.a01a.json:1
  - wiki-repo:wiki/tasks/B00a-业务Wiki契约补充.md:1
---

# B00a知识Wiki公共协议

## 范围与实现边界

B00a P0 已在独立任务分支实现 strict schema、公开类型、异步服务端口、同步消费事务参与端口、纯完整性校验、合成请求和客户端不可用门禁。没有实现数据库、知识服务、发布 UI、索引、AI 整理或维护引擎。A/C 评审并合入共同分支前，A01c 依赖仍未解锁。任务及真实验证见 [[B00a-业务Wiki契约补充]]；完整产品范围见 [[A业务LLMWiki方案]]。

沿用 schemaVersion=1/requestId/写命令 idempotencyKey、公共错误/envelope 和 KnowledgeScope。新命令族独立于旧 knowledge.*；所有对象 strict，未知字段不能携带 actor/origin/workspace/now/审批事实。原件、Markdown 和摘录保留原始字符串，不 trim、不做换行或 Unicode 规范化。输入最长 32000 UTF-16 code units，段落/来源/规则最多各 100 条；跨品类、市场和任意合法 BCP 47 语言保留。

## 数据模型与 hash

| 对象 | 权威身份与内容 | 关键约束 |
|---|---|---|
| WikiSourceStageInput | sourceId、expectedVersion、label/sourceStatus、text/plain 或 text/markdown、sourceText、acquiredAt、sourceUri/permissionNote、validity | 首版文本直接传精确内容；无绝对路径、无文件系统访问令牌。URI 仅 HTTP(S) 无内嵌凭据的来源元数据，不能授权抓取；本地文件来源用 label 且 URI=null。仅人工可导入原件 |
| WikiSourceRevision | 宿主 workspaceId/sourceRevisionId/version/parentRevisionId/createdAt，原件快照及 artifactId/artifactHash | version=1 无 parent，其余必须有 parent；服务核实父链、工作区和 expectedVersion。内容寻址 artifactId=artifactHash；新来源生成新版本，不覆盖旧字节 |
| WikiContent/WikiRevision | kind=rule/sop/term、title/locale/scope、Markdown、validity、sections、sourceRefs、relations、rules；宿主 revisionId/documentId/version/parent/artifactId/contentHash/sourceSetHash | SOP/term 零规则；rule 至少一条结构化规则，规则显式映射 sectionId。不能以 Markdown 自由文本代替可执行规则。relation 固定目标 documentId/revisionId，服务验证目标存在且同工作区；不支持浮动 latest 链接 |
| WikiSourceReference | referenceId、sourceId/sourceRevisionId/sourceVersion、artifactHash、text location、excerptHash、assertion | location 是原件精确字符串的半开 UTF-16 范围，不能截断 surrogate。assertion=fact/inference/human_note，不把模型推断改写成原始事实 |
| WikiSection | sectionId、title、Markdown text location、sourceReferenceIds | 来源引用不能悬空、遗漏或重复；每个段落至少一份来源，每个结构化引用必须被段落使用。human_note 也要指向真实保存的人工说明原件，不能绕过来源 |
| WikiValidity | status=confirmed/unknown/conflict、validFrom/validUntil | confirmed 下 null 明确表示开放边界，非“未知”；unknown/conflict 禁止新引；时间是 [from,until)，到期时即失效 |

hash 均为 SHA-256 小写 64 位 hex：artifactHash 对精确原件 UTF-8 字节，contentHash 对精确 Markdown UTF-8 字节，excerptHash 对 sourceText.slice(start,end) 的 UTF-8 字节。sourceSetHash 对 `wikiSourceSetPayload` 的 UTF-8 字节计算：每个 sourceRevisionId 唯一一对 `{sourceRevisionId,artifactHash}`，按 ASCII ID 升序排列，JSON.stringify 无空白/尾换行；同来源多个摘录只贡献一对，排序不依赖 locale。来源 ID/version/hash 冲突先拒绝，不靠 Map 覆盖消除冲突。引用语义、范围/locale/validity 等元数据由不可变 revisionId 固定，任何改变须新 revision，不能借相同 Markdown hash 复用旧审核。

异步 `verifyWikiIntegrity(revision,sources,sha256Utf8)` 复用 strict schema，逐项检查全部来源身份、同 workspace、版本、范围、原件/Markdown/摘录/source-set hash；异步 hash 函数由宿主注入，必须计算 SHA-256 精确 UTF-8；协议包及测试均不依赖 Node 内建模块。返回 valid/reason，不能当作已保存、已发布或来源合规结论。它不读取 artifact，不代替宿主验 blob、数据库归属、生命周期/来源状态或事务校验。

## 审核与发布状态

WikiRevision 永远不可变；WikiLifecycle 为独立投影，lifecycleVersion 从 1 开始且每次有效变更递增。candidate 无审核/发布，approve/reject 写不可变 WikiReviewDecision；拒绝可以回读，修改必须新 revision。再次审核同一未发布 revision 时记录新 decision，保留旧事件，不覆盖历史。每次审批绑定 workspace/revision/contentHash/sourceSetHash 和宿主已存 lintReceiptId；P0 最小 WikiLintReceipt 只固定 policyVersion/outcome 与上述绑定，不声称已有完整 lint 引擎。approve 必须 passed；unknown/blocked 不可批准。reviewer、时点来自宿主，模型/renderer 无权自报。

publish 必须显式调用，核对已存且当前有效的 approve reviewId、同版本/两 hash、当前 lifecycleVersion、全部来源及 lint 事实；人工主体不能仅凭自报 reviewId 跳过这些检查。approved→published 保持 revisionId/内容不变，记录 PublicationEvent。withdraw 写不可逆 withdrawn 事件，保留原发布和批准事件；不能重新发布同一已撤回 revision。修正须新 revision→新审核→新发布。重复请求只回放已有结果，不新增事件或修改时间。

WikiSourceState 单独固定 sourceRevisionId/lifecycleVersion/active 或 withdrawn；回读响应逐版本带来源状态。来源撤回、更新、已知冲突或时效不明必须进入新引资格判断；P0 未开放来源维护命令。来源 S2 的创建不改写 S1：宿主将仍引用 S1 的新引资格标为 source_updated/unknown，人工复核后以新知识版本/审核记录显式处理，不自动借旧版绕过。P1 再交维护操作和影响队列。

## 命令、端口与权限

`WikiService.execute(command,WikiHostContext)` 为异步编排端口。专用宿主上下文必含 workspaceId/actorId/origin/now，不改旧 ExecutionContext 必填字段。工作区来自已打开的宿主会话，now 为可信执行时点，不能使用 renderer/model 的历史选择代替当前资格。DTO 返回宿主 workspaceId 便于核对；任何 ID 查找仍必须由当前 workspace 隔离。

| method | 请求要点 | 成功 data.kind | 允许的宿主 origin |
|---|---|---|---|
| source.stage | sourceId、expectedVersion 和文本元数据 | sourceRevision | human_ui |
| source.getRevision | sourceRevisionId | sourceRevision | human_ui/agent_tool/system_job |
| wiki.stage | documentId、expectedVersion、parentRevisionId、content | wikiRevision | human_ui/agent_tool |
| wiki.getRevision | revisionId | wikiRevision | 三类 |
| wiki.listRevisions | documentId、beforeVersion、limit | wikiRevisions | 三类 |
| wiki.review | revision/两 hash、expectedLifecycleVersion、approve/reject、note、lintReceiptId | wikiRevision | human_ui |
| wiki.publish | revision/两 hash、reviewId、expectedLifecycleVersion | wikiRevision | human_ui |
| wiki.withdraw | revisionId、expectedLifecycleVersion、note | wikiRevision | human_ui |
| wiki.search | keywords/scope/locale/kinds、limit/cursor | searchPage | 三类 |
| wiki.resolveCitation | 固定 citation、purpose、scope/locale | citationResolution | 三类 |
| wiki.registerConsumption | consumer 不可变版本/hash、完整 citations | consumption | 三类，另有真实消费事务/存在性约束 |
| wiki.getConsumption | consumer kind/revisionId | consumption | 三类 |

`wikiMethodOrigins` 给出全量权限表；仅表不构成已运行的权限服务，A 实现 execute 时须校验。listRevisions 是当前工作区历史/草稿管理，按 version 倒序、beforeVersion 排他，最大 100；新版本插入不移动旧页，空历史列表合法。getRevision 不存在返回 NOT_FOUND。getConsumption 按不可变 consumer 版本回读唯一完整登记，不存在返回 NOT_FOUND。一个 consumer kind/revisionId 只能有一份不可变引用集合；同集合跨键可回放同一事实，异集合返回 REVISION_CONFLICT，不能追加改写旧消费。

写命令都使用 UUID 幂等键，幂等范围是 workspace 内共用命令空间；请求摘要包含 method、规范化后的业务 payload、actorId/origin，排除 requestId/now。先在当前权限/工作区下查询同键：同参重放原结果和原时间，同键异参 IDEMPOTENCY_CONFLICT；不能因重放刷新审批/引用资格。新动作 expectedVersion/expectedLifecycleVersion 不符或过期游标报 REVISION_CONFLICT；旧来源/摘录/内容 hash 不符 SOURCE_CONFLICT，缺 ID NOT_FOUND，来源过期 SOURCE_EXPIRED，未知/冲突 MISSING_FACTS/SOURCE_CONFLICT，撤回/候选/越权 ACTION_NOT_ALLOWED；非法结构 VALIDATION_ERROR。事务未提交时 STORAGE_ERROR/ARTIFACT_FAILED；已提交、投影失败仍回放已存成功事实，不伪装失败重发写入。

A 编排：先异步写并读取验证原件/Markdown blob，再同连接 immediate 事务验证当前版本/来源状态、提交权威记录/审核/发布/幂等/outbox；所有异步等待之后的事实须在事务内重查。没有文件和 SQLite 天然原子事务；DB 失败留下未引用 blob，过宽限期且确认无引用后才能回收。目录/搜索投影失败由 outbox 修复，不能回滚已提交的发布事实。索引状态不可确定时明确失败，不能返回伪造空列表掩盖缺投影。

## 检索、分页和引用资格

关键词为空表示导航；非空是对 title/Markdown 的不区分大小写 literal ALL 匹配，不执行正则/SQL。locale 用 Intl canonical BCP47 后精确相等，不暗含语言回退；scope 复用三维 AND，各空组通用，各非空组精确匹配。kinds 空表示三类全部。

宿主在快照时点先为每 document 选择最新发布事实，包含已 withdrawn 的最新发布，不先过滤 scope、locale、关键词或 validity；随后才过滤当前有效性和检索条件。较新 candidate/rejected/approved 尚未发布，不遮蔽旧有效发布。最新发布一旦撤回/到期/不适用，不能回退更旧发布来制造依据。

首请求 cursor=null，宿主绑定 workspace、queryHash、snapshotId/时点与固定候选集。queryHash 对本工作区的规范化过滤条件和 limit 计算，关键词去重并排序、locale canonical、kinds 排序、scope 三值固定键序；算法版本与快照由宿主持久/缓存，不能信任客户端 hash 自报。按 documentId、revisionId 的 ASCII 升序，cursor 的 after pair 排他；后续页必须使用同一查询/快照，过期、不匹配或跨工作区游标返回 REVISION_CONFLICT。

新发布不插入旧快照的后续页；每页实时重验旧快照命中的当前发布头/撤回/时效/来源。已撤回或被新发布替代的旧命中排除，允许页缩短/为空；不得将新版本替换插入造成重复或因旧快照复活内容。游标可前进到已扫描但被实时过滤的最后 key；空页仍可有 nextCursor，终点为 null。服务必须保证严格前进；Exchange 对空页的非 null nextCursor 也要求严格大于请求 cursor，不能相等/倒退形成无限循环。schema 的 publicationHead 固定快照/当前头，拒绝旧版本回退；SearchPage 校验有效时间/唯一顺序/游标，SearchExchange 校验请求与页的绑定/limit/排他前进。schema 仍需宿主查权威事实，不能单靠客户端构造 publicationHead 证明资格。

KnowledgeCitation 固定 documentId/version/revisionId/sectionId/contentHash/sourceSetHash 和该段落**全部** sourceRefs。来源身份、位置、hash、assertion 必须与固定知识版本一致，不能只摘第一来源、以裸 URL 代替引用或伪造 ruleId。规则的 ruleId→sectionId→citation 有明确映射；B00 CheckIssue.evidence 保持旧单来源规则形状，多来源检查须后续显式新增适配，不能静默扔弃来源。

resolve 的 purpose=history 可回读固定版本、全部原件及当前生命周期/来源状态，eligibility=false 时必须给原因（候选/拒绝/撤回/过期/未生效/未知/冲突/被替代/来源更新或缺失/范围或语言不符）。不可读取或被篡改的原件仍返回 NOT_FOUND/SOURCE_CONFLICT/ARTIFACT_FAILED，不编造成功正文；历史可见不等于新引授权。purpose=new_reference 必须当前最新发布、同 scope/locale、全体来源和有效期通过，否则失败，不得返回 ok=true/eligible=false。checkedAt 是宿主当前时点；拿旧 search/resolve 响应不能授权后续新消费。

## 消费登记与 A01b/C02c 兼容

consumer 固定 kind=quote/artifact、entityId、不可变 revisionId/contentHash，citations 不能空或重复同知识段落。WikiConsumption 增加宿主 consumptionId/workspaceId/registeredAt/actorId；记录快照用于以后反向依赖，不跟随最新知识而改写。

`WikiConsumptionWriter.register(input,WikiHostContext,idempotencyKey)` 是宿主内部同步事务参与端口，供 A/C 与报价/产出写入组合：同一连接、同一事务内验证该 consumer 真正存在且 hash 相符，再重查新引资格/完整来源，保存消费记录（consumer kind/revisionId 唯一）、报价/产出、write receipt、run step/outbox、幂等。不能在业务提交后用第二个远程/异步独立写入假装原子；单独 execute 注册也只能给已存在且精确匹配的版本补录，并按原消费事实处理，不能绕过新引检查。重试同键不新增消费，异参冲突。既有历史导入不能借该“新登记”入口绕过失效规则，历史修复需另定协议。

| 消费者 | 当前事实 | P0 后需要的明确迁移 |
|---|---|---|
| B00/共同基线 | KnowledgeContent 单来源 sourceText，rules>=1，staged/published；同步 KnowledgeRepository；sourceHash=原文 hash | 旧 schema/方法/fixture 全保留。仅无损单来源 rule 可显式兼容；必须记录 old revisionId/ruleId→new revisionId/sectionId，不改旧 ID 含义 |
| A01b c6539e8（PR #6） | 远端代码观察：同步 SqliteKnowledgeStore、迁移4、原地 staged→published；findPublished 在时间/scope 过滤后去重，允许旧匹配版本回退；本机该分支未复跑 | 尚未合入此基线。新 WikiService/来源/审核/生命周期/先选最新发布/完整引用需 A 另实现，不把旧 store 直接声明满足新协议；A 统一迁移编号 |
| C02c 0ccd72f（C 说明） | 仍用旧 knowledge.query+B00 required/forbidden_literal；未消费新 WikiService、通用引用/登记 | C 后续独立接线切片对齐公开协议及原子消费事务；本 PR 不替 C 实现或宣称完成 |
| 正式 preload/readonlyMockClient | DesktopClient 统一 executeWiki，12 个方法严格本地校验后合法返回 CAPABILITY_UNAVAILABLE/retryable=false，非法返回 VALIDATION_ERROR | 不新增 Main/worker IPC/RuntimeCommand/WorkerRequest/Agent 工具白名单；实际服务验收后再由 C 接线 |

P1 的 KnowledgeBuildRun/Proposal、完整 lint/maintenance/impact/index/rebuild 和维护执行器另交付，本 P0 仅保留审核必需 lint receipt。P0 的协议验证不等于 A01b 存储/检索服务、正式 Electron 知识全流程、真实 DeepSeek 或 Windows 已通过。

关联：[[B00知识契约差距与补充]]、[[首批并行接口约定]]、[[M1接口与持久化]]、[[0011-业务LLMWiki与工程知识隔离]]。

## 本机整仓收口修正

workspace Electron 现有精确桥接列表同步 executeWiki，并直接从真实隔离 Electron 桥接执行全部 12 个合法未接入请求和额外宿主字段反例。A01a 合成 JSON 在共同基线不符合 Biome，本 PR 仅按 Biome 重新排版数组；parsed JSON 与 taskBase 逐值相同，原件/规则/来源 hash 与业务语义不变，不重写 A 的知识样本。Wiki 回归在文件稳定、重新生成机械清单之后执行，避免一边编辑源码一边复制基线导致 GENERATED_DRIFT。

## 迁移谱系收敛附带的类型导出

迁移谱系收敛（codex/a01-migration-lineage）把 `WikiCitationResolveInput` 从 schema-only 推断类型改为显式导出 `export type WikiCitationResolveInput = z.infer<typeof WikiCitationResolveInputSchema>`，供 infrastructure 的 wiki-store resolveCitation 端口按公开契约直接引用，消除 TS2724 类型错误；不改变 schema 语义或 B00a 协议行为。
