---
title: C已保存报价检查桌面切片
type: module
status: observed
updated: 2026-10-26
sources:
  - packages/contracts/src/index.ts:1
  - apps/desktop/src/workers/business.ts:1
  - apps/desktop/src/main/index.ts:1
  - apps/desktop/src/preload/index.ts:1
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - packages/infrastructure/src/check-store.ts:1
  - packages/infrastructure/src/wiki-check-source.ts:1
  - tests/e2e/quote-checks.spec.ts:1
  - tests/fixtures/quote-checks-data.ts:1
  - wiki-repo:raw/c-saved-quote-checks-validation.json:1
---

# C已保存报价检查桌面切片

## 范围与实际入口

在[[C领域旧库回放与Worker启动门禁]]之后，用户要求C兼项目负责人继续完成。已将c6f6788d3e75f3ac9de02d95306222fb5509ca71普通推送至origin/codex/c-worker-migration-gates并回读一致；本轮从它新建独立codex/c-saved-quote-checks，未合入。本轮接通已有B报价检查协议与事务、A已发布知识资格查询和原双反馈组件；不新增规则算法、DTO字段、迁移或报告表。C负责Runtime/Worker/Main/preload/人工按钮及本机验证，B/A实现来源保持在固定组合。

现在打开“资料与报价”，选择一个已保存版本，在“规则检查·Vn”点击“检查并保存报告”。后台重新读权威报价及来源，保存独立reportId/checkedAt和完整消费后返回；面板选择刚保存的报告，同一checkId生成风险标记与字段文本批注。标记支持键盘Enter定位付款/交期字段，来源可展开；没有问题的已应用规则也保留全部引用，报告级来源列表可读。重新读取或关闭重开只读本版本报告，历史版本不会继承其他版本的检查结果。

报告仍是检查事实，报价保持draft；金额与旧报价JSON/hash不改。缺任一规则类别显示pending，零规则产生两类待核实报告，不登记虚构消费；不存在的报价返回NOT_FOUND。含合成失败规则沿用【合成规则】消息与合成来源提示。零问题只描述已应用规则未发现问题，不表示审核或现实合规通过。

## 接线与权限

| 层 | 本轮行为 |
|---|---|
| Runtime/Worker协议 | 仅将既有CheckCommandSchema/CheckResultSchema/CheckListResultSchema加入Runtime联合，WorkerRequest/Reply沿用严格封装；没有通用execute、路径、SQL或身份字段 |
| Main | 白名单增加quote.check、quote.getChecks，保持主窗口/主frame/精确URL/方法一致校验；这两个方法不读取或传递模型凭据 |
| Worker | 通过既有repository.executeChecks调用B CheckStore，并固定actorId=local-user、origin=human_ui；不进入Agent/Provider |
| preload | 两个CheckClient方法分别绑定各自命令名，跨方法、身份/金额/报告/凭据注入在IPC前拒绝；返回schema、revision及列表唯一性再校验 |
| renderer | 使用保存报价的id调用，不计算规则或伪造报告；查询按workspace/root/revision/version隔离，写回也校验根/版本；旧版本迟到结果只可更新其自身缓存，不选中新版本报告或误播报成功 |

其余knowledge.*、source.*、wiki.*与P1接口继续原能力门禁；readonlyMockClient与unavailableFirstBatchClient保持只读拒绝，正式preload仅覆盖本轮两个方法。真实Electron另建非主窗口并加载同一preload/页面时，quote.check仍返回ACTION_NOT_ALLOWED，不会写报告。旧workspace测试中quote.check的预期更新为真实NOT_FOUND，原Wiki十二方法门禁保持。

## 原子保存与重试

Worker只委托既有B/A同连接事务：宿主快照→A search/resolve资格与全部来源核验→B evaluate→报告→全部citation消费→outbox→成功幂等；异常整体回滚。通过规则也登记消费，报告hash精确绑定消费的artifact身份；renderer传入reportId、checkedAt或自算金额都被拒绝。原事务与来源实现本轮未改，既有121项结果仍按原作用域复用。

人工按钮在请求期间禁用；不在挂载、刷新、窗口聚焦或重开时自动检查。当前组件生命周期内，同一workspace/报价版本未确认成功的操作保留idempotencyKey，重试仅更新requestId；校验通过并确认成功才清除，下一次主动检查才用新键。失败保留已读旧报告，不用错误响应覆盖它。连接异常与坏响应不回显内部异常，不宣称已保存。报告读取连接中断统一提示暂时无法读取，不再误称已经接通的检查服务尚未接入。

操作键仅驻留当前组件内存；整页重载/卸载后不承诺恢复未确认写意图。重开先只读历史报告，用户再明确发起检查会创建新操作；这不是完整Agent/操作意图持久恢复。相同完整命令键跨Worker/应用重开由服务重放原报告与首次时间，实际Electron覆盖该路径。

## 测试与真实业务边界

新增tests/e2e/quote-checks.spec.ts的两个实际Electron场景：第一条在UI创建工作区、人工发布合成CSV、保存900.00 USD的V1，人工按钮先存pending；离线装入双来源规则后保存风险/批注，核对两条来源、报告hash和完整消费，重开后同键回放；通过生产commitAgent注入明确合成V2条款，V2单独检查且V1原报告/金额保持。第二条给knowledge_consumption插入故障，真实桌面写入失败且报告/消费/outbox/幂等全回滚；修复后只由按钮再次触发。来源被合成撤回后新检查SOURCE_CONFLICT，旧报告仍可读，未新增产物。

A当前review/publish/withdraw的真实服务仍返回CAPABILITY_UNAVAILABLE。离线fixture复用A/B已有seedPublished，经过真实source.stage/wiki.stage后直接写入明确合成已发布lifecycle，撤回负例也用受控投影。所有写夹具操作只在桌面关闭后执行；只读inspect使用独立readonly连接核对合成临时库。fixture不进生产导出/IPC，本轮只对独立临时合成库运行；自动化点击人工按钮不代表真实业务人员已审核发布。

新增Runtime/preload/组件行为验证覆盖精确白名单、注入、错版本/重复报告、坏响应、丢回复同键重试、新检查新键、跨版本迟到写入。截图.runtime/quote-checks-narrow.png已实际查看，900×640下报告、来源长hash和两类反馈可换行，页面按主区域滚动。

最终类型退出0，三文件31/31，含构建的全部实际Electron11/11通过（新2项加原9项）。完整本轮命令/输出/退出码/源码hash见raw/c-saved-quote-checks-validation.json，初始合成前缀定位和测试preload API错误保留raw/c-saved-quote-checks-diagnosis.json。Windows/安装包未验证，原构建chunk/Vite警告保留；本轮没有调用真实DeepSeek，不重复旧121/455或供应商评估来填新结果。

## 下一步与接收

C本切片提供真实存储、IPC与桌面行为，非作者代码复核及实际人员业务语义仍待。下一依赖是A交付真实lint回执存储、审核/发布/撤回服务和人工入口，B配合来源资格/消费与报告事务，C再接成熟接口。工程Biome/Wiki lint不等于业务Wiki lint/review已实现。完整M/F/J其余变体、人工审核/发布/撤回和整体非作者接收单独保留，不能由本轮fixture关闭。

关联：[[C集成-已保存报价检查与双反馈]]、[[B规则检查实现]]、[[C迁移后桌面接线清单]]、[[首批并行接口约定]]。


最终工程检查6/6、Wiki维护36/36与c6f6788/654fecc/be53b98三基线sync均已实际通过。保留审计raw/c-saved-quote-checks-preservation.json核对303份旧非生成raw与203782字节旧log前缀保持；A/B迁移、检查事务、Wiki来源实现及原DTO/只读mock逐字节不变。作者自查不代替实际非作者复核。


项目依赖核对：本轮git ls-remote实际回读A迁移ec6b729、A搜索dd42b05、B固定组合f4c9dfc及P1契约19d60a8；当前可读固定组合中的wiki-store.review/publish/withdraw仍为不可用门禁。此处只描述已取得候选，不推断其他成员未推送工作树；未对其他聊天或外部服务发送任务消息。后续A需交固定的真实lint回执存储/绑定校验和人工生命周期入口，B确认报告消费/来源资格，C再接成熟接口及实际Electron验收。

2026-10-31 C按用户批准增加本地确定性英德客户回复草稿，绑定当前冻结报价与已保存检查报告，含风险、来源和未审核状态；不增加正式审批/外发/PDF。具体行为与验证见[[C客户回复草稿桌面切片]]、[[C黑客松演示闭环实现]]，实际状态以本轮证据为准。
