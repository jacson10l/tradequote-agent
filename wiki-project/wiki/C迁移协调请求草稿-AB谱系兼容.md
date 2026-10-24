---
title: C迁移协调请求草稿-AB谱系兼容
type: process
status: draft
updated: 2026-10-24
sources:
  - wiki-repo:raw/c-b-migration-reply-intake.json:1
  - wiki-repo:raw/c-b-migration-reply-validation.json:1
  - wiki-repo:raw/c-b01-remote-intake.json:1
  - wiki-repo:raw/c-b01-migration-compatibility-probe.json:1
  - wiki-repo:raw/c-b01-remote-validation.json:1
  - packages/infrastructure/src/migrations.ts:1
---

# C迁移协调请求草稿-AB谱系兼容

迁移协调请求草稿（原文及共享记录已按用户授权推送；本页新增B回复接收记录仅本地保存，未发送通知或代签）。基于d99f2b3已保存的固定材料与六组诊断，现已收到B开发Agent的M1～M8技术回复，尚无A/B人工签认、迁移决定或实施；本文方案均为协调建议，未分配新编号、修改历史SQL/账本或运行新迁移。入口[[B01固定提交接收与迁移兼容诊断]]、[[C签认请求草稿与回填规则]]，本轮备稿任务[[C集成-AB迁移协调请求草稿]]；原[[C集成候选-依赖与非作者签认]]继续active。

## 请求正文与固定版本

主题：请A牵头、B/C共同确认迁移6/7双谱系的识别、兼容升级或安全拒绝方案

A、B你好，B固定交接已取得，C用两侧实际迁移函数在独立内存库中复现了版本号相同但schema不同的问题。请按下列固定版本核对，先确定支持边界、登记/识别规则及验证计划，再安排隔离组合实现。请分别记录你本人职责内的意见、依据、未覆盖项；本请求不预设已批准方案，也不要求自动合并或收费真实模型复测。

| 固定对象 | 完整提交及入口 |
|---|---|
| 本次证据冻结点 | d99f2b32def756b6b4d4cc99fca75dd9511436d5，分支codex/c-b01-remote-intake；[[B01固定提交接收与迁移兼容诊断]]及[接收/源码核对记录](../raw/c-b01-remote-intake.json) |
| C已实现谱系 | 45fa03d57d6fc405c2438c3b187f87838355a88b；代码与e6af0b2d0cfe86af3abd45180dd56750db86b214一致；[[C03持久事件与桌面重连]]、[[C02c统一运行与写账本]] |
| C交接与旧独立复核 | b256dd1d219cbf9f4a4264e19a980e194180dc14 / dc0f034216e51b0da3dc22c910b27938aeef2f46；仅其原固定范围，不覆盖新B组合 |
| B代码/推送交接 | 330bff76615147ea9c2729cb144a18873a5251d0 / 6c76fb991f3135d6a48362c1b242e46af6641817；本次已核对远端头及父子关系，交接增量仅6个Wiki路径 |
| A/B前驱及共同基线 | A01c dd42b055efd409fa3c332c6cb1997c7a7638ca62；共同654fecc4d93e4630ed4a0cf42f261d0d432e23d3；B相对共同9提交/57路径，含A来源 |

请读取[六组完整诊断JSON](../raw/c-b01-migration-compatibility-probe.json)、[本机接收/诊断实际命令](../raw/c-b01-remote-validation.json)及接收记录中固定B实现、任务、稀疏迁移决定/原Windows验证的路径和hash。B迁移源码可按固定对象读取：`git show 6c76fb991f3135d6a48362c1b242e46af6641817:packages/infrastructure/src/migrations.ts`；C按上述45fa03d同一路径读取。B原验证列出的27源码hash与取得的blob全部一致。

## 迁移6、7的两种含义

| 原编号 | C的实际SQL/依赖 | A/B的实际SQL/依赖 | 需要协调的事实 |
|---|---|---|---|
| 1～4 | 共同工作区/报价/修订/旧知识表 | 对应SQL归一换行指纹与C一致 | 共享前驱不代表后续谱系相同 |
| 5 | agent_run、agent_run_control，已经实现 | 未注册生产5；后补测试用合成5 | 不应把C当成只有“预留5”，也不能仅把C5塞进B序列 |
| 6 | agent_write_call，依赖C5运行表 | knowledge_source、knowledge_wiki、knowledge_lifecycle、knowledge_consumption | 相同编号不是同一迁移；无账本v6不能仅按号码引导为A/B6 |
| 7 | 对agent_write_call新增validation_json，建立agent_tool_step | quote_check_report及索引/不可变触发器 | 相同user_version=7不保证具备另一侧所需表 |
| 执行器 | 连续序列，按user_version跳过已编号项 | 稀疏序列＋schema_migration(version,sql_hash)；旧无账本仅允许0/1/2/3/4/6引导 | 稀疏补装和SQL指纹保护不能自行解决旧编号含义冲突 |

用于逐项核对的原SQL SHA-256（仅归一CRLF→LF，未改SQL）：

| 原步骤 | 指纹 |
|---|---|
| C6 | 3d3c9da475f6a11d2d381de54a07396dc6dabaf8d780edebc0657f497bb47dfb |
| A/B6 | 5184461756e3a389588182c1e9e497f34bfc7442bbf4d7ff8a09cdb458f49f66 |
| C7 | 268beab4bd70f403d62877153abf2df0c6f574bde852b77c1cfe7a63808d87fa |
| B7 | 927ce55cc67a6ec655cff131a67af33f9fdc7f83372d4247ab65467d91144602 |

这些是原脚本指纹，不足以单独证明某旧库确实执行过脚本；还需核对实际表/列/索引/触发器/约束及可用的历史证据。旧库实际存在性、使用范围和备份状态尚待本人确认，本轮没有打开用户数据库。

## 六组诊断证据与协调意义

原报告SHA-256为 `834c091fb66aecb2b4467fd4f599356cee6800f53232f3129f204db044c1932c`。报告的cases数组逐项如下，两个控制组分别列出，不能把“诊断passed”写成兼容通过。

| 编号/原JSON定位 | 固定输入→目标迁移器 | 原始观察 | 请确认的处理边界 |
|---|---|---|---|
| D1，cases[0]，C_v7_to_B_v7 | C v7→B v7 | UNKNOWN_LEGACY_MIGRATION_SEQUENCE；user_version仍7、schema不变 | 该拒绝是否作为阶段安全边界，或需要已知C7升级路线 |
| D2，cases[1]，B_v7_to_C_v7 | B v7→C v7 | 无异常、user_version仍7、schema不变；仍缺agent_run、agent_run_control、agent_write_call、agent_tool_step | 新组合不能把这类“无待执行项”当完整就绪，应补齐已确认路线或在写业务前拒绝 |
| D3，cases[2]，C_v6_to_B_v7 | C v6→B v7 | 无异常、6升7，新增账本和报告表；知识四表仍缺，却记入A/B6指纹 | 禁止按v6推断知识迁移已执行；账本/schema矛盾不得自动放行或伪造修复记录 |
| D4，cases[3]，C_v5_to_B_v7 | C v5→B v7 | UNKNOWN_LEGACY_MIGRATION_SEQUENCE；user_version仍5、schema不变 | 明确支持C5升级，或明确拒绝并给可操作的后续路径 |
| D5，cases[4]，B_v7_to_B_v7_control | B v7→同版B v7 | 无异常、user_version仍7、schema不变 | 保持已知B库重开行为；自身重开成功不外推跨谱系兼容 |
| D6，cases[5]，C_v7_to_C_v7_control | C v7→同版C v7 | 无异常、user_version仍7、schema不变 | 保持已知C库重开行为；不能以新接线丢失现有运行/事件能力 |

这是d99f2b3已执行的六个独立`:memory:`诊断，环境darwin arm64、Electron44.9.2内嵌Node v24.22.0；宿主工具Node22.22.0另行记录。使用两侧真实SQL，经类型剥离并仅调整提取模块后缀执行；没有用户资料。原报告保留每组before/after完整schema、ledger、源文件/SQL hash与探针源码。首次加载better-sqlite3失败和修正后退出0的记录均保留，compatible=false。本次备稿不重新跑探针或产品测试。

## 供A/B讨论的方案建议，尚未选择

建议组合两条边界：只为能够充分识别且明确支持的谱系实现定向向前升级；对未知、混合、缺表或账本/schema矛盾的输入先安全拒绝。方案、编号、执行登记模型与支持矩阵均待A牵头、B/C按职责确认，不能将本文视为ADR决定或实施批准。

| 建议 | 拟解决的问题/实施原则 | 仍需确认与证明 |
|---|---|---|
| 方案一：已知谱系识别＋追加向前兼容迁移 | 在执行DDL或业务写入前核对实际schema、旧user_version、账本及原SQL证据，识别C5/6/7、A6、B7等支持集。保留所有已交付历史SQL/编号和原执行事实；为缺失能力追加后续步骤，不重放错误谱系的“同号”DDL。新编号由A统一登记，本文不指定。 | A定义足够且不歧义的识别条件、目标schema和各条升级路线。新执行登记需能区分“原谱系＋原编号＋指纹”等身份，或用不改原事实的追加映射；不能只用单个version列合并冲突条目。具体表设计/兼容算法另行评审，尚未实现。 |
| 方案二：不支持或无法确认的输入安全拒绝 | 对未知/混合/被篡改/schema与ledger矛盾，以及本阶段未支持的跨谱系路线，在修改前拒绝；保留原库供已有适配版本读取或后续明确迁移，不自动新建空库、清账本、改user_version或复制数据掩盖问题。 | A确认阶段支持/拒绝矩阵及后续处理指引，B/C确认公开失败与桌面显示。拒绝必须在入口安装/升级阶段可见，不能等业务查询缺表才发现；需实际证明schema、数据、版本与原账本保持，不声明跨谱系已经兼容。 |

方案一的失败/中断应在可证明的事务边界内回滚或有可审阅恢复路径，重试/重开不能重复补装。对D3所示的账本/schema矛盾状态，优先隔离并拒绝，需本人另行鉴别；不能仅将hash改成预期值“修好”。不得删除/改写原6/7号SQL、用空迁移占位、删除已有行或直接换库来完成验收。

这里“只读保留”指保留原库，并仅由已知适配版本在明确范围内读取；不表示未知谱系可以被新组合直接打开或已经验证可读。

两条建议都不代表选择某一侧覆盖另一侧：目标仍需保持现有报价/旧版本金额、run/控制/事件seq、票据/写回执/步骤、知识/来源/生命周期、报告/消费、outbox和成功幂等事实；新组合不得覆盖旧不可变结果。若本阶段只能安全拒绝，应明确组合接线仍未完成，不能将“拒绝符合预期”标为完整兼容。

## A/B待确认项与分工

| 编号 | 待明确的问题与需要的材料 | 责任 |
|---|---|---|
| M1 | 哪些C5/6/7、A6/B7试验库/实际库存在，是否带账本，哪些允许升级、只读保留或必须拒绝？仅提供脱敏schema/hash/版本及证据定位，不提交用户库/客户原文。 | A统筹；B报告B侧、C报告C侧已知范围 |
| M2 | 如何识别旧谱系及混合/矛盾库，判定发生在何处，识别不足时如何拒绝？尤其D2静默缺表和D3误引导怎么防止？ | A定义迁移/存储规则，B/C核对各自真实入口 |
| M3 | 统一目标schema、追加步骤的顺序/唯一编号和原谱系执行身份怎样记录？旧schema_migration条目与历史SQL指纹如何保留？ | A维护序列/记录；B/C核对真实SQL依赖，不在本文分配号位 |
| M4 | 哪些原数据/来源/回执/事件/报告/消费/幂等必须逐字节或按稳定语义保持，哪些允许新增而不能覆盖？ | A存储与来源，B报告/消费，C运行/事件共同列明 |
| M5 | executeChecks/executeWiki及runStore等公开入口如何共存，失败如何通过既有公共错误与Main/Worker/preload/桌面显示？renderer不能注入可信context。 | B维护最终公共契约；A提供存储入口；C提供接线方案 |
| M6 | 下方验证矩阵中每个输入的预期目标/拒绝、失败注入点、重开与回滚证据由谁执行，在什么固定提交上验？ | A/B/C按职责分工；macOS完整组合及Electron由C记录 |
| M7 | A人工review/publish何时具备可审阅入口，人工操作/来源资格如何与合成fixture区分？ | A实际人员；B/C核对消费/只读与未发布门禁 |
| M8 | 谁记录最终迁移决定及ADR、谁做完整非作者评审、哪些意见仍待补？方案意见与产品/业务/整体合入批准如何分开？ | A牵头，B/C分别本人回复；R-1/H-1仍各自留证 |

这些是A-3和AB-1的本次具体协调输入，不自动关闭原A-1/A-2/B-1/B-2/R-1/H-1。B Windows聚焦52/52及181/182、Wiki34/36的原EPERM失败仍保留；未把其当新组合macOS全绿。A人工发布、业务语义和完整非作者评审仍待，旧C材料技术关闭也不批准新组合。

## 方案确定后的验证矩阵建议，尚未执行

- 输入：空库、共同v3、A01b v4、C v5/v6/v7、A v6、B v7，区分有/无账本；再加缺表、错误指纹、混合谱系和未知更高版本。每项由A声明允许升级或明确拒绝，不能用一条成功路径代表全部旧库。
- 升级：确认完整目标表/索引/触发器/约束与登记身份，保留原记录/hash/版本关系、旧报价与报告不改写；同连接报告/消费和run/事件原子性继续成立，重复执行/重开不重复安装或登记。
- 失败/拒绝：在拟定迁移写入点注入异常和中断，核对事务/恢复边界；拒绝与失败不得部分建表、伪记已执行或隐式换库，需比较原schema/数据/账本/user_version并记录真实证据。现有六组仅空合成schema诊断，不是这些未来数据验收。
- 组合：在固定共同候选上执行macOS默认完整单元、实际Electron含build、工程/Wiki检查与真实基线sync，Windows失败保留其原范围；A人工发布及业务验收分别留本人证据，不自动真实模型复测或发布资料。

## 本人回复格式与后续记录

下面是回复结构说明，不是任何人的实际签认。请A/B分别给出本人意见；C已有诊断只作技术输入，不代填A/B身份、时间、选择或通过结论。

```text
回复人/角色：本人填写姓名与职责
实际回复时间：本人记录日期、时间及时区
证据基线：d99f2b32def756b6b4d4cc99fca75dd9511436d5
C实现：45fa03d57d6fc405c2438c3b187f87838355a88b
B代码/交接：330bff76615147ea9c2729cb144a18873a5251d0 / 6c76fb991f3135d6a48362c1b242e46af6641817
实际审阅文件/SQL指纹/诊断：逐项列出路径、hash和cases索引
M1～M8本人意见：逐项给依据、疑问、需修订或资料不足；其他角色意见不代填
拟支持输入与结果：逐谱系列出向前升级/只读保留/安全拒绝和理由
建议方案与登记：选择/修订建议、识别条件、目标schema、追加步骤与责任人
历史不变量：明确哪些SQL/账本/旧业务事实保留，哪些新增不覆盖
失败/中断/回滚与验收：固定版本、本人负责的命令/用例及预期；未执行如实记录
本人实际执行和历史引用：分列环境/时间/退出码/输出、原报告版本和范围
方案阶段结论：本人说明可进入实现验证/需修订/资料不足，并列未决条件
未覆盖与后续责任：完整非作者、macOS/Electron、人工发布/业务签认分别记录
```

请后续由实际人员将回复追加至[[C集成候选-依赖与非作者签认]]的A-3/AB-1，并关联本草稿；有明确决策后再由责任人形成迁移ADR/任务与新固定实施范围。本页不冒用B现有稀疏迁移决定替A/C同意。当前未发送、未决策、未实施，任何回复也不自动授权推送、共同合入或真实模型复测。

本轮仅保存草稿及导航/状态，实际文档检查见[备稿验证](../raw/c-migration-coordination-draft-validation.json)。草稿整理done不等于上述M1～M8已确认、六组问题已解决或原人员任务已完成。

## 用户授权的远端共享更新（2026-10-23）

用户后续明确授权仅推送codex/c-migration-coordination-draft供A/B读取。已实际普通推送到origin，原文远端头完整核对为fd4b72859e63931986424d6c66ee48fd12d81a60，其祖先包含d99f2b32def756b6b4d4cc99fca75dd9511436d5。原文固定链接：[协调请求fd4b728](https://github.com/jacson10l/tradequote-agent/blob/fd4b72859e63931986424d6c66ee48fd12d81a60/wiki-project/wiki/C迁移协调请求草稿-AB谱系兼容.md)；[六组诊断原证据d99f2b3](https://github.com/jacson10l/tradequote-agent/blob/d99f2b32def756b6b4d4cc99fca75dd9511436d5/wiki-project/raw/c-b01-migration-compatibility-probe.json)；[可读取分支](https://github.com/jacson10l/tradequote-agent/tree/codex/c-migration-coordination-draft)。此前“本地/不推送”是原备稿阶段边界，本次只按新授权开放分支读取。

第一次推送HTTP400中断，核对远端仍无该分支后，以仅本次命令的HTTP/1.1与postBuffer设置普通重试成功；没有强推、推tag或修改全局配置，失败/成功原输出与hash均保留于[推送核对](../raw/c-migration-coordination-push-delivery.json)。Git服务给出的PR建议链接未被执行，没有创建PR、请求评审、评论或消息。

本页追加共享记录仍是Wiki变化，随后随同一授权分支保存/推送；最终文档提交的完整远端头由本次交付回复核对，不在生成该提交前预填其SHA。任务[[C集成-迁移协调草稿推送交接]]区分原文推送与记录保存检查；[本轮Wiki门禁](../raw/c-migration-coordination-push-validation.json)仅覆盖记录维护。草稿仍draft、M1～M8未决、compatible=false及人员active不变，不合入、不代签、不自动发送或真实模型复测。


## B固定回复接收与下一步（2026-10-23）

用户提供B已推送的协调WIP。C定向fetch核对远端codex/b01-migration-coordination完整头为f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef，其直接父为接口修正e80d1a25c5ace628df6952a43d98b84d75e418e4，再前为6c76fb991f3135d6a48362c1b242e46af6641817。固定入口：[B逐项回复](https://github.com/jacson10l/tradequote-agent/blob/f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef/wiki-project/wiki/B对C迁移协调草稿M1-M8回复.md)、[接口与已知阻塞](https://github.com/jacson10l/tradequote-agent/blob/f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef/wiki-project/wiki/B01迁移协调回复与接口冻结.md)。回复明确身份为B开发Agent，时间为2026-10-23 19:15:29 Asia/Shanghai，仅B技术意见；不能回填为人类签名或A方案批准。

C已实际阅读两页、源码差异与原始验证输出。B记录的5份源码hash和Wiki映射hash均与固定Git blob一致；本次未将这些源码合入C。e80d1a2对executeChecks显式声明同步CheckResult或CheckListResult，将Wiki结果/交换结构校验失败归SOURCE_CONFLICT，真实SQLite异常仍由CheckStore归STORAGE_ERROR；新增分类、脱敏与无意外写入断言。原migrations.ts、check-report-schema.ts、check-store.ts、公共contracts及desktop文件相对6c76fb9未变，不能把接口修正描述成迁移修复。

| 原编号 | 已取得的B技术意见 | 仍须完成的收敛条件 |
|---|---|---|
| M1 | 已知执行只涉及合成测试/内存库，未确认真实部署库；C5～7为已实现能力 | A统筹真实旧库存在性、备份和逐谱系升级/保留/拒绝矩阵；C不凭空声明用户库范围 |
| M2 | 必须在旧账本引导和业务写入前识别schema，防D2静默缺表、D3误登记 | A确定表/列/索引/触发器/约束及历史证据判据；明确mkdir/open/WAL是否包含在拒绝不改库边界与相应互斥/检测顺序 |
| M3 | 支持讨论已知谱系定向追加＋未知/矛盾先拒绝，不再以补C5作为完整方案 | A确定目标schema、执行身份/追加映射、号位/依赖和ADR；保留原SQL、账本及业务事实 |
| M4 | 报价JSON/hash/decimal、报告/全部来源、成功幂等与outbox不可重解释；报告/消费同连接IMMEDIATE同步事务 | 新固定组合验证旧数据、回滚/重开；C补run/attempt/控制/票据/写账本/步骤/事件seq不变量证据 |
| M5 | 公共executeChecks和executeWiki须与C runStore/协调器共存；建议启动未就绪用既有STORAGE_ERROR安全表达，不新增公开码 | A/C确定启动失败分派与受控诊断；B最终契约、C Main/Worker/preload白名单和可信context接线另行验证，不改run重试权限 |
| M6 | B在新固定版本负责报价/报告/消费/幂等夹具和事务证据，C负责组合矩阵与macOS桌面验证 | A先给支持/拒绝预期、目标schema和失败注入点；当前尚无统一目标提交 |
| M7 | lifecycle直接提升仍只是fixture，人工review/publish/withdraw入口未具备 | A交固定实现，由实际人员审核/显式发布；B/C分别验消费门禁和实际桌面入口 |
| M8 | 可继续由A收敛方案和实施准备，当前新组合需修订，不放行正式接线 | A记录迁移ADR，B/C交新固定实现/证据；实际非作者、业务与人员签认保持独立 |

B在Windows x64的Electron44.9.2/Node24.22.0重跑C原六组诊断，报告sources、三项源码hash、全部SQL指纹、六组完整cases、probeScriptUtf8及compatible字段与C原记录逐项完全一致，compatible=false。C本轮比较B提交的原始JSON，未重新运行探针。原六组诊断结论均未改变；诊断复现成功不代表兼容通过。

B另有两个显式负向探针保持0/2：未知合成v6被误接受并写账本，删除quote_check_report_no_delete触发器后仍被接受。这两个是额外合成缺口，不冒充D1～D6，也没有被普通单元通过所覆盖。e80d1a2最终聚焦53/53；类型/构建/工程/Wiki同步通过；全量183/184与Wiki34/36保留Windows symlink EPERM原失败。最初聚焦51/53、探针装载失败和红色诊断均在B原记录中保留；不得将较早失败删掉后声称全套通过。f2dfa5f仅文档/证据增量，其Wiki门禁通过，不是新组合验收。C还用Git原始路径核对B回复前87份非生成raw字节未变、日志仅追加，原initial-validation路径转义假差异记录保留。

本次接收/哈希/完整相关输出见[接收证据](../raw/c-b-migration-reply-intake.json)，C文档维护实际检查见[本轮门禁](../raw/c-b-migration-reply-validation.json)。未执行B新代码的macOS全套、完整组合/Electron或真实模型复测；旧C45fa03d及b256dd1/dc0f034技术证据仍仅覆盖原范围。

下一步：A先给M1～M3及M6的可审阅ADR/矩阵和追加注册方案；B依该方案修正入口/存储并提交新的固定证据，保留上述红色缺口直至实际关闭；C在独立组合候选上先验完整迁移与拒绝/回滚矩阵，再接桌面并跑macOS完整本机验证。C现在可整理运行不变量和入口清单，不抢占A的号位/执行身份决定，也不覆盖B整文件实现。A-3/AB-1继续active，A-1/A-2/B-1/B-2/R-1/H-1及C04人工签认均不自动关闭。本次新增接收记录不自动推送、发送、合入、创建PR或签认。

本轮C首次Wiki lint因新验证JSON仍处于running而被done任务引用，正确拒绝DONE_VERIFICATION_INVALID；保留[首次维护记录](../raw/c-b-migration-reply-initial-validation.json)，待实际检查全部通过后再绑定本轮完成证据。该维护时序问题未涉及产品/迁移执行。


## C方案后执行准备（2026-10-23）

C已从固定b3bc98c在独立codex/c-migration-execution-plan整理[[C迁移后运行与事件不变量]]、[[C迁移后桌面接线清单]]、[[C迁移联合验证用例]]，分别列I01～I16、D01～D12和M/F/J共29个not_run用例，供A确定方案后执行。C重点补充T1迁移与T2启动恢复分离、事件保留及无自动重放、候选草稿校验与B已保存revision检查的适配差异。此为M4/M5/M6的C技术准备输入，不批准M1～M3、号位或支持矩阵；实际实施任务[[C集成-迁移方案执行与联合验收]]继续active，准备任务[[C集成-迁移后执行准备]]单列文档门禁。原协调分支b3bc98c已按用户上一轮授权推送，本次新分支材料不推送/合入/代签/发送/真实复测。


## A固定回复接收与前置验证（2026-10-23）

[[A迁移谱系固定提交接收与前置验证]]：A实现9cdd13a3755b4bd1d0a4ac300785021e47ed4a88、回复a58e97097994491a9e49c085ae9369ef9bd08019及远端头b9a0af76217e57e0ab22ba927de1a1a287b1145f已取得；九SQL指纹一致、原A探针重跑一致。实际A typecheck失败11项（7新增迁移、4未变更A01c），实际生产migrate/repository原生12项7通过5失败。缺必要列、同名无效触发器/非唯一索引及旧账本/schema矛盾仍接受；坏新账本未在只读预检拒绝，真开WAL后才拒绝并改文件。A已给schema识别/谱系账本/统一8/只读拒绝ADR及矩阵，旧“未取得A方案/全部待定”按原阶段阅读，方案取得不关闭A-3/AB-1。结论changes_required：先A修正门禁并补作者验证，B交报告/消费适配与P1 lint回执，C再做完整迁移矩阵→桌面→macOS全套；人工发布/业务语义/实际非作者分别留证。不推送、合入、代签、自动发送或真实模型复测。


## A9225526修正复核（2026-10-24）

[[A迁移谱系9225526复核与M13约束验证]]：固定A92255261e818e6fde0687deee5544755cf9af469已独立复核：typecheck退出0、原12项12/12（含N07～N11）、新增账本Electron ABI测试3/3，九SQL指纹一致；A原探针9指纹/19分类/10追加重跑一致。M13四个有效约束子样本均失败：WHEN 0使含RAISE触发器失效、WHERE 0使UNIQUE部分索引失效、缺外键/CHECK仍接受升8，且实际写删证明保护丢失；未损坏控制组全部真实拒绝。infrastructure macOS原生44/45，A-W08 retryable分歧仍失败，原Windows symlink EPERM未在本轮复现。原类型/N07～N11仅在9225526所列样本范围可关闭，旧6f9287b失败原样保留；schema一类未满足完整M13，不批准整体迁移/接线。A补有效定义/行为判据与回归，A/B确认A-W08公共语义及B适配/P1，再由C继续完整矩阵→桌面→macOS全套；人工发布/业务/实际非作者仍待。不推送/合入/代签/发送/真实模型复测。新独立codex/c-a-lineage-revalidation只存本地；A修正已取得，不再将原11类型或原N五例写成新版本仍失败，完整M13仍未关闭。


## A65885ff复核：原例通过、有效定义仍待（2026-10-24）

[[A迁移谱系65885ff复核与有效定义剩余问题]]：固定A65885ff472acee4cedb3b0c17e7c850f30f98d91已独立取得并核对远端；原12项12/12、原M13-X01～X04 4/4、typecheck通过，A原探针9指纹/23分类/10追加与固定报告一致。macOS infrastructure45/45、contracts35/35，A-W08原行为失败已消失，B公共契约确认仍待。M13-X05～X09五个有效定义变体0/5：WHEN/WHERE 1=0、索引列集合错误、触发器事件错误、CHECK仅注释仍接受升8，实际写删证明保护失效；原schema控制组全部真实拒绝。整体changes_required；A补已知有效定义识别/回归，避免仅关键词或常量黑名单；B确认公共failure语义、账本/报告/消费适配及P1，再由C继续完整矩阵→桌面→macOS联合全套。原四例在新A版本技术关闭不追改旧失败，M13整体仍未关闭；A人工发布/业务/实际非作者仍待，不代签、不推送/合入/发送或真实模型复测。


## Acece332九例复验与B材料接收（2026-10-24）

[[Acece332迁移复验与B契约材料接收]]：已取得并核对A远端固定cece332e41a230ebbeeaee64eb283b49a5d4fb43；请求的M13-X01～X09九例全部通过，原生产12项12/12，typecheck、macOS infrastructure45/45、contracts35/35通过，A原探针9指纹/28分类/10追加一致。补充X10/X11两个有效定义缺口仍失败：触发器仅含字符串RAISE仍接受、大写WHERE字符串被整体小写归一误判，接受升8后可实际删除步骤/重复prepared；有效原schema控制组均拒绝。M13整体仍changes_required，A修有效触发器体与保留字面量语义的结构核对；B已报告A-W08公共契约符合与100/100，但本次origin未找到codex/b-c-third-feedback，固定Wiki/证据不可读，接收核对未完成；不代签或把转述当已核实交付。取得新A修正/B固定材料后C再复核，完整29项、新组合接线/macOS联合未执行。人工发布/业务/整体非作者仍待，不推送/合入/发送/真实模型复测。


### 同轮后续：B固定材料已接收

[[Acece332迁移复验与B契约材料接收]]：本轮后续复查已取得并核对B远端b80ad4329e7a72f4990aea89eced0536d6ebba1d（材料509a234，代码基线8043afb），原Wiki与原始/重复两次八文件100/100、Wiki门禁证据已逐项核对；C引用blob/SHA/脚本hash、B源码未变、A/B helper原文hash一致，C独立重放3个helper结果一致。B确认CAPABILITY_UNAVAILABLE / retryable=false为开发Agent技术确认，实际人员签认仍待。100项为B Windows原执行，未据此宣称C复跑或新A/B/C组合/macOS桌面通过。B8043afb依赖旧A b9a0af7，新组合仍须保留A迁移修正/C运行导出/B检查与P1公开出口。原初查无头仅时点事实，不继续作为当前阻塞。当前仍待A补M13-X10/X11及新组合/人员验收，产品任务保持active。
