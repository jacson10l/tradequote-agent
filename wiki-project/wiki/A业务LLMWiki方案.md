---
title: A业务LLMWiki方案
type: architecture
status: draft
updated: 2026-10-21
sources:
  - tests/fixtures/knowledge/knowledge-drafts.a01a.json:1
  - conversation:用户提供KARPATHY-LLM-WIKI-BOOTSTRAP.md并要求补齐A01业务知识库
  - wiki-repo:raw/inputs/外贸询报价协同 Agent 完整产品与实施方案.md:280
  - wiki-repo:raw/inputs/项目构建技术栈.md:261
  - packages/contracts/src/knowledge.ts:35
  - packages/contracts/src/runs.ts:12
  - packages/infrastructure/src/artifacts.ts:9
---

# A业务LLMWiki方案

## 定位与当前事实

本页是A01的新目标设计，尚未实现。用户提供的初始化规范用于源码项目的工程知识管理；业务端采用其中“原始来源→Agent整理语义页→关联与索引→查询回读→持续维护”的方法，并增加企业资料的人工发布、版本与引用约束。文件中的执行命令是参考材料，不授权重新初始化项目或将客户资料写入工程仓库。

B00现有代码仅定义结构化规则条目/发布/查询协议及未接入门禁；A01服务未实现。它不足以代表完整业务LLM Wiki，缺口与B00a优先级见 [[B00知识契约差距与补充]]。本设计延续原方案第10节及T23的版本化Markdown要求，不将LLM Wiki等同于规则表或一次性检索回答。

## 与工程Wiki的区别

| 维度 | 工程Wiki | 应用内业务LLM Wiki |
|---|---|---|
| 用户与目的 | 开发成员/编码Agent理解源码、验收和决策 | 外贸人员/知识维护人/报价Agent使用企业知识 |
| 来源 | 脱敏源码、配置结构、测试、需求和决策 | 有权使用的产品资料、SOP、术语、市场/平台指导原文 |
| 位置 | 仓库内wiki-project，跟随代码PR | 当前工作区运行数据；不写入wiki-project或Git |
| 权威依据 | 当前源码与可复现验证记录 | 不可变原件＋已审核发布的知识版本；价格/报价仍以业务数据库为准 |
| 写入与发布 | 编码Agent按P0同步，非作者评审 | AI只能提候选；人工逐版本审核并显式发布，保留审核与采用记录 |
| 检查 | 源码覆盖、生成物漂移、断链、证据和文档同步 | 原文定位、断链、无依据断言、矛盾、适用性、有效期和来源变更 |
| 查询 | index/知识页→源码核对 | 已发布适用知识检索→固定知识版本→固定原始来源 |

两个知识库不共享索引、发布权限或数据目录。业务页面不能检索工程提示词/维护指令；工程Wiki只能保存明确合成fixture和脱敏验证。将来导出Obsidian视图时仍保留业务资料边界。

## 最小范围与分层

首版支持人工粘贴文本、UTF-8 .txt/.md原文；保留原字节与hash，拒绝无效编码/超限输入。来源段落定位在冻结的文本版本上，用UTF-16区间定位、UTF-8计算hash。多格式抽取、向量数据库、自动网页抓取、自动定时重建和多用户权限系统后续再做。

知识类型至少为product_note、process、market、glossary、rule；正文均为有界Markdown，非rule页允许没有可执行规则。Markdown知识不能代替SKU/成本/库存/价格/报价/审批状态的结构化权威数据。业务首版内容长度、批次大小、分页上限由B00a strict schema明确，不允许无限生成。

三层权威分离：

1. 原件与发布Markdown的精确UTF-8字节存入现有ArtifactStore的不可变artifact；原件hash、知识contentHash、摘录excerptHash分别命名，不复用单一sourceHash。
2. SQLite保存workspace、来源/知识身份与版本、artifact引用、审核与生命周期事件、关系、检索投影和消费引用。每个revision有稳定UUID、parentRevisionId/version、kind、locale、scope与来源映射；本地审核人由宿主上下文记录，不把本地角色当成已认证企业身份。
3. Markdown目录、index.md、log.md及关键词索引为可重建视图，展示生成时的generation/status；其修改不会自动覆盖已发布权威版本。资料不足或投影落后应显式提示。

拟定运行布局（仅设计，尚未创建）：当前workspace/artifacts保存原件和Markdown字节；workspace/knowledge/view下生成raw来源清单、wiki/products、wiki/processes、wiki/markets、wiki/terms、index.md、log.md、schema.md。展示目录可按知识ID稳定命名，标题改动不改变身份。这里的schema.md描述数据格式，不执行文件中给模型的命令。首次不允许应用外直接编辑发布视图；外部修改须显式导入为新候选并重新审核。

## 版本化Markdown与关系

知识版本须同时携带Markdown内容引用/contentHash、结构化frontmatter与sections。frontmatter至少含entryId/revisionId/version/kind/title/locale/sourceRefs/relatedEntryIds/scope；发布时间、审核人来自宿主发布记录，不信任模型自报。校验派生frontmatter与结构化元数据一致；原文与模型正文严格分开。

每个事实段落带稳定sectionId及sourceRefs；sourceRef包含sourceRevisionId/sourceHash/location/excerptHash，可从知识段落回读准确摘录。模型解释用inference，人工经验用human_note并记录确认依据（首版将人工笔记登记为有作者/时间的user_provided来源版本，不允许模型冒充人工笔记），不能伪装成原件事实；缺依据的可执行规则或商务事实阻止发布。一个知识页可综合多份来源，一份来源可支持多页。跨知识页引用按entryId解析，发布时冻结所依赖的revisionId；最新导航可以变化，历史事实引用不追随新版本。

改动产生新revision，V1仍按ID可读；不覆盖已发布正文、来源映射和审核结果。标题/Markdown/规则/范围/有效期/来源版本变更都会使旧审核失效。重复消费同一版本不制造新版本；同一文档并发修改以expectedVersion拒绝旧基线。

## AI整理与人工审核发布

1. 人工登记来源、来源类别synthetic/user_provided、原名、取得日期、来源说明/URL及使用权限说明。业务首版按当前workspace隔离，客户专属空间未实现前不得把私有资料混入通用样本。
2. 人工发起整理，选择来源版本和目标知识类型/现有知识基线。宿主传入允许读取的来源ID；C执行有界模型请求，A接收结构化候选。模型输出包含Markdown、section引用、事实/推断标记、关联建议、合并/冲突建议；不能选择文件路径、注入权限或发布状态。
3. A校验来源ID、摘录位置/hash、引用和大小；无依据事实、模型伪造定位、断链/冲突留在候选区，失败不生成已发布数据。模型不得将以前的模型回答当作新的原始证据；人工经验另走明确确认记录。
4. 人工在原文与候选对照界面修改，查看与现行版本的差异、适用范围、有效性和冲突。审核操作绑定revisionId＋contentHash＋sourceSetHash＋lintReportId，记录approve/reject、说明、宿主审核人/时间；拒绝保留理由。修改后产生新候选并重新审核。
5. 发布是单独human_ui写动作，必须核对批准记录仍指向同一内容/来源集合且未过时，无阻断项；模型整理完成不等于审核通过。人工可更新自己的待审稿，但不能用任意“强制通过”跳过缺来源/冲突检查。发布记录与事件/幂等同一事务提交。
6. 发布后刷新检索和Markdown视图，记录本次增量；重启可恢复未完成投影。用户发起一次新整理可合并旧知识候选，不能自动改写旧发布版或审批。

每个workspace的知识写入任务串行，仍校验聚合版本；模型调用不占用数据库事务。跨文件/SQLite不宣称原子事务：先写并验证不可变artifact，再用SQLite事务提交引用、审核/发布、事件和幂等；失败可能留下无引用blob，按引用和宽限期回收。数据库已提交、视图生成失败则显示投影待修复，通过outbox重建；不能回滚已发布事实或将旧索引当最新结果。现有ArtifactStore是async，A编排层须异步，数据库事务端口可同步。

## 检索与引用

首版用关键词＋标题/术语/关联导航，不把向量检索设为前置。按workspace、platform/market/category、locale与业务asOf过滤，明确分页和排序；只向报价Agent提供已审核发布、适用、未撤回、无阻断冲突的知识。候选管理查询与生产检索为不同入口。

每个entry按查询时点先解析有效发布/撤回事件，再判断范围和有效性；不能因最新版本被撤回或过期而自动复活旧版。有效区间采用UTC [validFrom, validTo)，空边界表示无界；现实有效性另标confirmed/unknown，unknown与逾期待复核默认不进入正式报价依据。业务生效时间与发布时间分开，不能凭新上传日期覆盖更权威来源。

检索命中返回entryId/revisionId/contentHash、sectionId、摘录、来源集合、适用/有效性说明和检索generation；不是只返回自然语言答案。引用解析校验当前workspace和hash，打开指定知识版本及原件位置，来源丢失/篡改显式失败。历史已撤回/过期版本仍可按引用读取并带当前风险状态，不能作为新的正式依据。

报价检查/生成服务保存消费引用（consumerType/id，绑定具体quote revision或artifact；knowledgeRevisionId/sectionId及sourceRevisionIds），不是把引用只放在聊天里。B的规则执行读取已发布rule版本及其来源；纯术语/SOP不生成假RuleDefinition。查询得到结论仍须核验适用性；UI展示synthetic标记，演示资料不当现实平台合规结论。

## 持续维护与最小闭环

A提供人工“检查知识库/重建索引”入口，并在工作区打开时计算逾期复核项；首版不做后台收费轮询。knowledge lint至少检查缺来源/坏hash/越界、未解析关联、孤立页、重复或冲突候选、范围/有效期以及原始来源更新。规则与确定性检查能发现的必须直接检出，语义矛盾由AI提建议并人工确认，不能假称已自动穷尽。

发现问题追加MaintenanceIssue：类型、严重度、目标版本、发现证据、状态/负责人/处理说明。人工重整、修订、拒绝、复核、撤回都留事件；维持已发布/审核历史，不直接编辑旧版消除矛盾。未知时效可以整理和浏览，但不得标作正式有效依据。

来源S1更新为S2：保留S1，按反向引用标记受影响知识与未完成报价，建立去重的维护/报价复核项；A提供影响列表，B决定业务复核任务与重检，不自动改报价金额/内容或旧审批。处理维护问题后重新整理→审核→发布V2→重检，旧V1引用仍能完整回读。知识导航与日志可从数据库重建；删除索引不应丢原文、审核或历史引用。

## 实施顺序与责任

B先补 [[B00a-业务Wiki契约补充]] 的P0模型/发布/来源/版本和最小检索契约；A可同时做样本与存储设计。A01a来源与Markdown版本→A01b人工审核发布→A01c检索引用→A01d AI增量整理（C协作）→A01e维护与端到端。每步小PR，独立子切片完成不代表完整A01完成。

A维护知识服务、资料/Markdown artifact、审核/检索/维护页面与存储；B维护公共契约、规则语义和报价引用/复核桥接；C提供知识整理执行与取消/重试、模型设置和桌面公共接线。C01原报价恢复无需等A知识库完工，知识整理用单独结果类型，不把Markdown塞进committedRevisionId伪装报价。精确文件与验收见 [[A01-知识发布与来源查询]]、[[C01-Agent运行恢复与集成]]。


## 集成分支已有的A01合成样本

2026-10-21合并产品资料前核对：集成分支be53b98（PR #3）已经包含tests/fixtures/knowledge/knowledge-drafts.a01a.json及sources下8份TXT原文。JSON为synthetic=true、6个draft候选，示例覆盖付款、术语、有效期和平台风格；文本保存原始合成证据。两份纤维/灯具规格来源在_pendingB00Extensions中明确尚未接入规则，不能当作检索/规则服务已实现。

这些文件只是上游样本，未运行发布、规则执行或业务语义验收。比如第一条付款比例合计文字使用required条件，required不能实际证明比例和为100%；第六条交期规则引用容量单位原文，不能据此证明供货交期。正式接入前A/B须按原文修正/评审规则绑定并补反例，禁止把结构合法等同依据成立。当前保留上游原文件字节，不替其业务任务标done。此次仅补缺漏的JSON覆盖映射，使整仓机械检查可运行；TXT原件可通过同目录回读，工具仍按既定扩展名策略采集源码。

这组样本与HTML中的固定knowledgeSeed是两套独立教学/测试输入，未自动互相发布或导入。交付验证见 [[2026-10-21-产品资料集成验证]]。
