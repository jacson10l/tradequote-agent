---
title: B规则检查实现
type: module
status: observed
updated: 2026-10-22
sources:
  - packages/infrastructure/src/check-store.ts:1
  - packages/infrastructure/src/check-store.test.ts:1
  - wiki-repo:raw/b01-storage-validation.json:1
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - apps/desktop/src/renderer/src/features/quote-checks.test.tsx:1
  - apps/desktop/src/renderer/src/features/quote-checks.fixture.ts:1
  - apps/desktop/src/renderer/src/features/quotes.tsx:1
  - wiki-repo:raw/b01-ui-validation.json:1
  - packages/domain/src/quote-checks.ts:1
  - packages/domain/src/quote-checks.test.ts:1
  - packages/domain/src/index.ts:1
  - packages/contracts/src/checks.ts:1
  - packages/contracts/src/knowledge.ts:1
  - wiki-repo:wiki/首批并行接口约定.md:69
  - wiki-repo:raw/b01-rules-validation.json:1
---

# B规则检查实现

2026-10-23 当前组合分支 codex/b01-wiki-integration 已基于 A 的 dd42b05 加入原 B01 切片，实际接通 SQLite 查询→检查→报告/消费同事务；宿主入口是 executeChecks，正式客户端/IPC仍未开放。本文早期切片段落保留其当时边界；当前行为以本节和第四切片为准。验证及未完成项见 [[2026-10-23-B01新Wiki存储联调]]。

## 范围与入口

B01 第一切片在独立工作目录、分支 codex/b01-rules-feedback 从共同基线 654fecc4d93e4630ed4a0cf42f261d0d432e23d3 开发。该基线已包含 P0 PR #7；P1 PR #8 已改向共同分支，但本切片不依赖未合入的 P1。当前为未提交工作区观察，非作者评审与 macOS 复验尚未执行。

公共出口为 @tradequote/domain 的 quoteCheckService，满足既有 QuoteCheckService.evaluate(input): CheckReport。输入为完整 QuoteSnapshot、B00 已发布 KnowledgeRevision 列表及宿主注入的 reportId/checkedAt；没有系统时间、随机 ID、数据库、模型或 Electron 依赖。运行时复用既有 strict 输入/输出 schema，非法结构抛校验异常，不生成部分成功报告；宿主业务服务未来负责映射为公开 VALIDATION_ERROR。

本切片只消费旧 B00 单来源规则，不把其状态结构冒充新 Wiki 发布有效性。真实服务必须在读取权威快照后核实当前发布资格、来源完整性、工作区归属及最新发布头，再调用检查；不能把 renderer 传来的快照/来源当可信事实。后续新 Wiki 适配必须保留多来源与固定版本，禁止取首条来源或伪造 SOP/术语规则，见 [[B00a知识Wiki公共协议]]。

## 当前行为

| 项目 | 行为 |
|---|---|
| 类别与字段 | commercial_terms / platform_guidance 分开记录 coverage；仅检查 payment / delivery，不扫描询盘引文 |
| required | 对实际字段做 trim，空或全空白触发规则的 warning/block |
| forbidden_literal | 字段与 literal 均 NFKC + toLowerCase 后做子串比较，不执行规则提供的正则或代码 |
| 适用范围 | platforms/markets/categories 三维 AND；空维度通用，非空按场景字段精确匹配，不推断别名或大小写 |
| 时间 | 使用显式 checkedAt；晚于检查时点的发布不参与，也不列入 ruleRevisionIds |
| 缺覆盖 | 某类零适用规则时生成唯一 pending 问题，定位 scenario.platform，无虚构来源；checked 仅表示执行过规则，不表示现实合规认证 |
| 来源 | 失败问题保留 knowledge revision、ruleId、sourceHash、sourceLabel、sourceStatus、原文位置；合成规则消息带【合成规则】，消息总长遵守 2000 字符上限 |
| 身份与顺序 | checkId 固定为报价 revision:知识 revision:ruleId；缺覆盖固定为报价 revision:coverage:category。规则版本列表和 appliedRuleIds 排序去重，输出不随查询顺序改变 |
| 歧义输入 | 拒绝重复知识 revisionId 或同文档多个版本；由宿主先选定权威版本，不在 domain 猜测最新记录。修订报价必须有独立 rootId，V1 可省略 rootId |
| 不可变性 | 仅返回新报告，不改变输入、金额、报价状态或先前报告。V2 报告绑定新 revision，quoteId 仍为根报价 ID |

重复检查的 checkId 不因 reportId/checkedAt 改变。新 reportId 仍由宿主负责；本纯函数不承诺写入幂等、报告已经保存或新引消费事务成功。规则检查通过时仍应由后续 UI 展示来源状态，不能把合成规则的无问题结果标为真实平台认证。

## 实际验证与限制

新增 23 项公共入口测试，覆盖缺覆盖、空白、中文、NFKC/大小写、精确范围、发布时点、稳定标识、版本隔离、重复版本拒绝、字面量安全及金额不变。先观察失败测试，再实现对应行为；本轮原始结果、环境和失败保留在 raw/b01-rules-validation.json。

当前 Windows x64 使用项目固定 Node 22.22.0 / pnpm 10.13.1；依赖安装采用 frozen lockfile，不改锁文件。类型检查、规则/纯模块测试和构建结果与全量、桌面、Wiki 回归分别记录。初次原生 rebuild 找不到 Python，指定捆绑 Python 后缺 Visual Studio；包内现成绑定仍能运行大部分测试。全量单元实际有符号链接 EPERM，Electron E2E 实际启动失败，不能写为平台验收通过；未为通过测试修改系统权限或跳过失败用例。macOS 未运行。

最终工程检查退出 0，5 项通过、1 项 macOS 专用测试按原平台条件跳过；只读 Wiki 索引/lint 与 654fecc 基线同步通过。默认 C 盘临时目录的复制 EIO 改用本测试进程的 .runtime/test-temp 解决，并用 GIT_CEILING_DIRECTORIES 隔离临时 fixture 的父仓库发现；未修改测试算法。Wiki 回归 34/36，剩余两项都是创建符号链接 EPERM；完整单元仍为 107/108。Electron 诊断明确为 electron.exe 拒绝 --remote-debugging-port=0，5 项桌面验收保持失败，不宣称是本纯规则切片已经接入桌面。

## 后续切片

本轮已继续实现下方双反馈第二切片及第三切片的存储候选。下一步 A 分配并登记报告迁移、复核同连接组合，再接新 Wiki 已发布规则查询、多来源证据/反向消费登记，由 C 配合正式 IPC/worker。正式应用尚不能保存/回读检查报告；修订重检业务入口、正式审批/产出/PDF 尚未实现，B01 整体保持 active。

## B01 第二切片：风险标记与字段批注

QuoteChecks 已挂在正式 QuotesPage 的已保存报价详情后，付款/交货条款移入该组件的字段区域，金额/商品来源与旧版快照行为保持。组件只通过已有 getQuoteChecks 读取当前 revision 的报告，既不在 renderer 执行 domain 检查，也不调用 checkQuote 写命令。当前正式客户端仍返回 CAPABILITY_UNAVAILABLE，页面显示“检查服务尚未接入，当前版本的条款仍待核实”；合成成功数据仅位于独立 .fixture.ts，被组件测试与临时浏览器预览引用，正式页面不注入假报告。

- 风险按钮、字段批注、问题数量与两类 coverage 均从同一 CheckReport/CheckIssue 派生，不重新判断业务规则。阻断/提醒/待核实均有文字，Enter/Space 使用原生按钮；定位后聚焦付款/交货/业务平台字段，保留可见焦点与对应批注。两种反馈共用 checkId。
- 保存时来源明细逐条展示知识 revision、ruleId 对应的问题标识、sourceStatus、sourceLabel、SHA-256 与 UTF-16 半开区间，不截取第一条。合成来源在报告顶部明确标记；原文片段/当前资格仍待知识服务回读，不伪造摘录或宣称来源现时有效。React 文本输出不会执行来源标签中的 HTML。
- 查询缓存绑定 workspace、root quote、revision 与 version。报告列表先经 CheckListResult strict 校验，再逐条核对根报价/版本身份；任一不匹配、非法报告或重复 reportId 均停止展示整个列表，不筛掉坏项后误报通过。迟到的旧请求仅更新自己的缓存，切换版本时不复用旧报告。
- 当前版本报告按 checkedAt 倒序，时间相同按 reportId 固定排序；默认展示最近一次，可回读更早报告，不覆盖原记录。查询加载、空列表、能力未接入、结构错误、同步/异步传输失败分开处理；重试只重新读取，不暗中创建新报告。零问题仅表述本报告未发现问题、仍需人工复核，不替代审批。
- 使用 DESIGN 的现有颜色与 Button，不改共享 theme 或 C 的桥接。窄屏字段变为单列，长问题/来源及哈希折行。浏览器实际验证 1280×720 和 720×900、Enter 定位、长文本无横向溢出与缺覆盖两项 pending；[宽屏](../raw/b01-ui-wide.png)、[窄屏](../raw/b01-ui-narrow.png)、[待核实](../raw/b01-ui-pending.png)为正式组件搭配合成夹具的截图，不是 Electron 验收。

新增 15 项组件/报价页测试，结合第一切片 23 项纯规则测试；本轮组合契约/domain/preload/UI 为 86 项通过，全量单元为 122 passed / 1 symlink EPERM。类型/构建及最终 Wiki/工程结果、平台失败与截图 hash 见 raw/b01-ui-validation.json。第一切片 raw/b01-rules-validation.json 保留当时的源码/config 和失败事实，不以第二切片覆盖旧证据。macOS/非作者复核、真实报告服务、报告保存/消费事务、新 Wiki 多来源 DTO 适配与完整桌面回归仍待完成。

## B01 第三切片：报告存储候选与迁移交接

新增 infrastructure 内部 CheckStore.execute(input, context)，复用既有 quote.check / quote.getChecks strict 命令和结果，不新增 DTO。构造器接收宿主已有的 SQLite 连接、同步 B00 KnowledgeRepository.findPublished 及可注入时钟；不自行打开数据库或安装表。该文件尚未从 infrastructure/index 导出，也未接 Main/worker/preload，正式客户端仍返回能力未接入。当前为可在真实 SQLite 验证的实现候选，不等于生产历史报告已启用。

### 表设计及 A 的集成责任

同文件的 checkReportTableSql 是未编号 DDL 提案，测试显式安装。当前共同分支实际仍为 654fecc、迁移仅 1～3；A 统一知识/run/报告的实际编号和连续前驱，本轮不创建空迁移或改写已发布迁移，也不修改 A 的 migrations/schema/index。

| 字段/约束 | 当前候选行为 |
|---|---|
| quote_check_report.report_id | 报告主键；宿主生成 UUID，新操作键生成新报告 |
| workspace_id / quote_id | 分别引用现有 workspace 和根 quote_v1；工作区由当前宿主数据库读取，客户端不能提供 |
| revision_id / quote_version | 绑定具体 V1 或修订。插入触发器核对版本、根报价及同工作区；避免只外键引用 quote_revision 而漏掉 V1 |
| checked_at / content_hash / data_json | 保存首次检查时点、精确报告 UTF-8 SHA-256 和完整 strict 报告，包含固定规则版本和问题来源 |
| 历史及不可变性 | 按工作区/revision 查询，checkedAt 倒序、reportId 升序；拒绝 UPDATE/DELETE，不覆盖旧报告 |
| outbox / idempotency | 复用现有两表和全工作区命令键空间，不另造事件库或独立业务数据库 |

实际生产安装须由 A 将提案纳入登记后的连续迁移并测试升级回滚/旧字节，再将 CheckStore 与真实知识服务组合到已有单连接。构造器只能表达同步端口，不能证明调用方真的使用同一连接；A/C 集成必须核对连接归属，不可传入缓存、跨连接查询或异步网络函数。

### 写入、重放及失败边界

1. 在同步 IMMEDIATE 事务内读取宿主工作区及共享幂等记录。指纹使用 workspace、method、schema 规范化 payload、actorId/origin，排除 requestId 和当前时钟。复用其他命令/参数/调用者的键返回 IDEMPOTENCY_CONFLICT，不改原成功记录。
2. 同键同参成功重放验证 strict receipt、真实报告行的哈希和身份后返回首次报告/checkedAt，不再次读取知识、执行规则或记事件。源已变更或暂不可读时，旧成功事实仍可重放，不把它当作当前来源重新获准的证明。新操作键明确创建新报告。
3. 首次检查从当前数据库按 revisionId 读取报价，不接收 renderer 的快照/规则/报告。读取后验证精确 JSON hash、工作区、根/父版本及版本列；重复身份或不一致拒绝，不从 board 的第一条报价猜测版本。
4. 同事务向同步知识端口提交报价冻结场景和 checkedAt，验证 strict 已发布结构及全部返回项的原文 UTF-8 hash，再调用纯规则引擎；不一致/歧义为 SOURCE_CONFLICT。知识查询抛错为 STORAGE_ERROR，不吞掉错误并制造空规则 pending 成功。正常空适用列表仍保留两类 pending。
5. 完整报告、quote.check 脱敏 outbox 事件和首次 CheckResult 幂等记录同事务提交；任一步异常全部回滚，失败不占用操作键。错误对外仅有公开类别和固定文案，不带 SQL/来源端口原始异常。只读 getChecks 不执行规则、不调用知识端口、不记事件；缺报价为 NOT_FOUND，缺表/坏报告为 STORAGE_ERROR，合法无历史才返回空数组。
6. 每条历史报告验证 JSON/hash、全部存储身份列及报价 revision/version；坏行使整个读取失败，不丢掉坏行后返回伪造的完整列表。V2/V3 各有独立历史，原报价字节/金额、旧报告和 checkId 不被后续修订覆盖。

### 已验证与尚未接入

新增 22 项真实 SQLite 公共存储/表约束测试：保存/重开、首次响应丢失后的重放、共享键冲突、三处写入故障与审计去重、来源 hash/未发布/歧义版本拒绝、报告及报价身份损坏、V1→V2→V3 隔离、不可变触发器、未知金额、能力缺失不冒充 pending，以及未安装 schema 时明确失败且不改 user_version。没有调用真实模型或 A 未合入的服务。实际原始结果见 raw/b01-storage-validation.json：22/22 聚焦测试、类型和构建通过；全量单元 144/145，原 storage.test.ts 的 Windows symlink EPERM 保留。工程检查通过（5 passed / 1 macOS-only skipped），Wiki 索引/lint/固定基线 sync 通过；映射回归 34/36，两项仍为原 Windows symlink EPERM。82 份先前 raw 字节不变，旧日志精确前缀保留，公共/迁移/锁文件与共同基线一致。

这仍消费旧 B00 单来源规则，不能满足新 Wiki 的有效期、最新发布头、多来源引用/消费登记。生产接线必须先完成新模型到规则/完整证据的明确适配，复用 A 的同事务 WikiConsumptionWriter；不能先保存报告再异步补登记假装原子。当前未启用迁移/存储导出/正式 quote.check IPC，macOS、非作者复核与真实 Electron 流程均待；先前两切片 JSON/截图保持原字节，不以本轮结果覆盖历史证据。

关联：[[B01-规则检查与双反馈]]、[[首批并行接口约定]]、[[M1接口与持久化]]、[[B00a知识Wiki公共协议]]、[[测试与验证地图]]。

## 第四切片：新 Wiki 报告消费联调

SqliteWorkspaceRepository.executeChecks(command, ExecutionContext) 使用自身连接组合 CheckStore 与 SqliteWikiCheckSource，迁移7由check-report-schema安装不可变表，测试不再手工重复安装。旧第三切片的未编号DDL及单来源描述只代表历史阶段。

参与者在同一IMMEDIATE事务中遍历报价配置的所有locale，以精确scope检索rule页并按稳定游标取页。每个实际规则段落调用A.resolveCitation(new_reference)，验证当前发布资格、来源状态/时效、Markdown全文/hash、全部来源集合/hash、每个原文/摘录hash以及来源最新版本。超过100规则段落整体失败，不保存部分覆盖。A当前正文来自SQLite；独立ArtifactStore文件存在性、完整并发分页快照与维护影响仍属A后续范围。

evaluateWikiQuote使用旧quoteCheckService的required/forbidden_literal条件语义，保留真实Wiki revisionId/ruleId，不将原件hash改成Markdown hash。内部兼容投影只用于纯规则求值，最终每个问题重新附上全部原件证据；report.wikiCitations保存包括通过规则在内的准确KnowledgeCitation，evidence另含完整citation和referenceId。旧报告无该可选字段时parse不补字段，不重写历史或改变旧幂等回执；新报告校验拒绝截断/重复来源。SOP/术语不伪造规则，缺覆盖依然pending。

报告先插入，再调用A.registerConsumption。报告属于独立不可变artifact消费者，ID为reportId、hash为完整报告SHA-256；每次新检查单独登记，避免覆盖同一报价版本的原消费。注册失败抛出公开失败，整笔报告/消费/两类outbox/两份成功幂等回滚。重开及同键重放核对已存报告和消费的准确身份/hash/引用，但不重新检查当前知识资格，保留首次检查事实；真正重检另用新键。来源晚到撤回在提交阶段再次拒绝。详见 [[0016-检查报告消费与稀疏迁移]]。

52项聚焦测试包含原B存储22、A检索5、组合19、迁移6；实际完整结果见 [[2026-10-23-B01新Wiki存储联调]]，macOS/桌面/人工发布与非作者复核不因此通过。

## 2026-10-23 迁移协调期间的接口收敛

迁移方案由A确认，本页第四切片的稀疏账本和报告7仅为B已推送试验实现，不是支持C5/6/7的承诺。两项合成负向诊断表明版本号/SQL hash不足以识别实际schema，组合接线保持阻塞，见 [[B01迁移协调回复与接口冻结]]。

B独立修复来源资格被响应schema拒绝时误归STORAGE_ERROR的问题：参与者对来源结果和查询交换safeParse，资格/结构问题返回SOURCE_CONFLICT；真实SQL异常仍由CheckStore返回STORAGE_ERROR，历史报告/消费/幂等损坏不伪装来源冲突。强化撤回/篡改公开码，并新增真实缺表与输入/版本/幂等冲突回归；完整多来源、首次报告重放、历史兼容与报价不变语义不变。原验证JSON保留，新增本轮证据；不声称迁移缺口已修复。


## A谱系方案后的B报告适配

B在独立codex/b01-lineage-p1-adaptation整合A b9a0af7的九能力/统一8与P1 19d60a8。executeChecks、报告/消费同事务和公开错误保持；旧B7真实schema、旧账本、已存多来源报告/消费逐表保持，两次重开同键返回首份报告。旧测试改断言8、迁移测试改按lineage/version身份；不再保留“补5即兼容”的假设。新源check-lineage-integration.test.ts以现有服务生成历史事实后升级，fixture仅依赖公开端口。

正常路径已验证，A拒绝边界独立7项探针仍5失败/2通过（四类缺口），不能放行正式组合。旧raw保留，新证据raw/b01-lineage-p1-validation.json与boundary-probe.json，详情[[B谱系账本适配与P1回执交接]]、[[B01-谱系账本适配与P1回执]]。
