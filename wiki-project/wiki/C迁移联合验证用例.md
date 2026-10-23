---
title: C迁移联合验证用例
type: process
status: draft
updated: 2026-10-23
sources:
  - packages/infrastructure/src/agent-run-store.test.ts:398
  - packages/infrastructure/src/agent-run-recovery.test.ts:82
  - packages/infrastructure/src/run-event-store.test.ts:11
  - apps/desktop/src/renderer/src/features/run-events.test.tsx:18
  - tests/e2e/agent-recovery.spec.ts:9
  - scripts/test-unit.mjs:1
  - package.json:12
  - wiki-repo:raw/c-b01-migration-compatibility-probe.json:1
  - wiki-repo:raw/c-b-migration-reply-intake.json:1
---

# C迁移联合验证用例

这是待执行规格，全部M/F/J用例状态为not_run，本轮未创建或执行迁移测试实现。A须先逐项定允许升级/已知适配版本保留/安全拒绝及目标schema，B/C核对依赖；没有最终目标提交前不填兼容通过。执行任务[[C集成-迁移方案执行与联合验收]]继续active；准备任务[[C集成-迁移后执行准备]]的文档验证不是这些用例的结果。

固定输入：C源码45fa03d57d6fc405c2438c3b187f87838355a88b、协调b3bc98c2c4149a21ec70978c0dd73eea67e561c6，B回复f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef/接口e80d1a25c5ace628df6952a43d98b84d75e418e4；原B迁移/报告DDL仍来自6c76fb991f3135d6a48362c1b242e46af6641817，A01c原输入dd42b055efd409fa3c332c6cb1997c7a7638ca62。A/B最终实现和组合目标SHA尚待提供，不将它们预填为上述旧提交。

## 夹具与统一判定

每个用例用独立合成内存库；涉及重开/崩溃/WAL/锁的用例改用独立临时文件库。从固定谱系真实原SQL逐步构造，不以“最终库删几张表”冒充历史版本；故意损坏单独标注tampered。字段、用户输入和多来源均为明确合成，不打开真实用户库/凭据、不提交DB/原始模型文本。

记录三次边界：T0旧库快照；T1完成迁移或拒绝、尚未构造协调器；T2启动/恢复/业务后。T0→T1只允许A明确的新DDL/默认值/追加登记，旧TEXT/JSON/hash/IDs/事件/账本逐项保持；拒绝还须schema/数据/user_version/旧账本无变，物理DB/WAL/SHM/owner文件按A明确边界另记，不拿逻辑一致冒充字节文件不变。T1→T2仅允许[[C迁移后运行与事件不变量]]I06/I16规定的恢复修改及真实追加事件，模型请求仍0。保留外键检查、索引/唯一/CHECK/不可变触发器的实际存在与行为证据。

所有允许升级路线必须完成目标就绪检查：C run/control/write/step、知识/来源/生命周期/消费、B报告及其完整约束并存；不能只看user_version、SQL hash或“迁移没有抛错”。原谱系登记身份与旧SQL指纹保留，不重写成另一含义；重复迁移/重开不重复执行或登记。若A限定本阶段拒绝某路线，用例可按明确拒绝验收，但该路线的完整接线仍未完成；只读保留不意味着新组合可打开未知库。

## 输入矩阵：A定预期，C执行组合

| ID | 输入与预置 | 操作与必须核对 | 当前状态/责任 |
|---|---|---|---|
| M01 | 空库v0 | 初始化完整目标；新登记可追溯，重复打开不增记录 | not_run；A定目标，C执行 |
| M02 | 共同v3真实SQL＋合成V1/V2/V3/turn/idempotency/outbox | 升级或声明拒绝；若升级，旧JSON/hash/版本/报价关系逐字节保持 | not_run；A定路线，B夹具，C执行 |
| M03 | A01b v4＋staged/published旧知识 | 保留原知识资格/来源hash和历史报价，原发布事实不重新签造 | not_run；A定映射，B/C核对 |
| M04 | C v5＋全部七种run状态、控制回执、真实成功旧幂等；无新写账本 | 不伪造旧toolCallId/receipt；迁移与启动恢复分验，补足目标或先拒绝 | not_run；A定路线，C夹具/执行 |
| M05 | C v6＋prepared/abandoned/committed调用及控制 | 不把C6记成知识6；保留已提交input/hash/revision/执行身份，新增列按显式默认值 | not_run；A定路线，C执行；原D3关联 |
| M06 | C v7＋validation_json/tool_steps/事件，多attempt、交错全局seq | 不覆盖成报告7，保存授权/步骤可回读，公开seq/ID不重置 | not_run；A定路线，C执行；原D1/D6关联 |
| M07 | A v6真实知识四表＋多来源/lifecycle/消费 | 不误认成C写账本6；目标run/报告能力或明确拒绝，来源事实不丢 | not_run；A夹具/路线，B/C核对 |
| M08 | B v7＋有效schema_migration＋多来源报告/消费/幂等/outbox | 不能“无步骤”却缺run；旧报告JSON/hash/checkedAt/消费身份保持，新组合目标完整 | not_run；A定路线，B夹具，C执行；D2/D5关联 |
| M09 | 上述有部署可能的库，分别账本存在/缺失/遗漏/重复登记身份 | 每个变体单列支持/拒绝，不仅按user_version引导；不存在的谱系组合标tampered而非真实历史 | not_run；A逐变体定矩阵，C执行 |
| M10 | C6已被旧B误引导为7，账本声称A6但缺知识四表 | 隔离并安全拒绝，另列A鉴别/恢复方案；不改hash/user_version伪修 | not_run；A决定恢复，C核拒绝；D3后态 |
| M11 | 未知合成v6、部分混合C/B/A同号表 | 在旧账本bootstrap/任何业务写前拒绝，不建立假已执行记录 | not_run；A定判据，C执行；B额外红例1 |
| M12 | 已有账本但错误SQL hash/原编号含义冲突/未知高版本 | 拒绝并保存原事实，错误公开安全，内部诊断可核验 | not_run；A规则，B/C入口 |
| M13 | 持有效hash但缺表/列/索引/CHECK/外键/关键触发器的逐一损坏库 | 检测完整结构/约束；含缺quote_check_report_no_delete、agent_write_once/不可变步骤，不能凭hash接受 | not_run；A判据，B/C夹具；B额外红例2 |
| M14 | 旧C run无agent.run.event.v1；另含已存在的完整日志 | 迁移不补假历史，启动才追加真实中断；原日志字节/ID/两类seq保持 | not_run；A保留规则，C执行 |

M04～M08除空schema，还要有旧业务行。七种run状态按各谱系当时合法schema生成；C5/6不强填C7的optional步骤/授权；多来源新字段不回填到旧报告。每个明确支持的M项都重复执行、关闭重开，并派生相关F用例。原D1～D6仅六个空schema诊断，不能替代本表数据测试。

## 失败、拒绝与恢复：每条支持路线都覆盖相应写入点

| ID | 动作/注入点 | 必须证据 | 责任与状态 |
|---|---|---|---|
| F01 | A判定前、判定后但DDL前、逐个追加DDL、登记写前/后、version写前/后、COMMIT前/后分别抛错 | 原schema/业务行/旧登记/version整体回滚或符合A明示可恢复阶段；无伪执行/半目标，重试不重装 | A列真实检查点；C合成注入；not_run |
| F02 | 对F01实际存在的持久检查点用子进程屏障SIGKILL，等待exit后重开 | 独占顺序、WAL恢复/目标完整性、可审阅恢复路径；不能用普通异常代替断进程测试 | A定义边界，C文件库执行；not_run |
| F03 | 两个Worker争用同一路径/别名路径；旧进程未exit时重建，迁移中并发入口 | 唯一writer/迁移互斥，不误中断活跃run、不重复登记，不声称阻止外部工具 | A锁/识别边界，C宿主；not_run |
| F04 | 任一不支持输入走真实repository/Worker启动入口 | 拒绝先于账本引导与恢复、无ready/伪空workspace/业务写；公开错误无SQL/路径，物理副作用按A约定记录 | A规则，B公共错误，C桌面；not_run |
| F05 | 完成迁移后首次/重复构造协调器，涵盖queued/running/终态及prepared | T0/T1/T2分离；中断只发生一次、旧控制回执/终态不改、事件仅真实追加、Provider计数0 | C；I02/I05/I06/I16；not_run |
| F06 | 报价/run/回执/步骤/授权/新事件插入中途失败或SIGKILL，另验COMMIT后丢回复 | 同连接原子事实全有或全无；已提交回放不增版本，失败重试无seq缺口，旧attempt无权写 | C＋B事务夹具；I03/I04/I07/I08/I12；not_run |
| F07 | B报告/全部消费/事件/成功幂等任一点失败，重复同键/异参/重开 | 完整事务回滚；原报告JSON/首次时点保持，损坏消费不筛掉后假成功 | B先交固定测试/输出，C组合复验；not_run |

## 迁移后的运行与桌面场景

| ID | 场景与步骤 | 预期与关联 | 状态 |
|---|---|---|---|
| J01 | 同键并发旧/新start、控制丢响应重送、改输入/改run重用控制键 | 同参无重复派发/事件、异参冲突，completed返回原版本；I01/I02 | not_run |
| J02 | cancel提交前/后、Provider不合作晚到、显式retry新attempt、waiting_input补事实 | 事务赢者决定最终事实，旧票据拒绝，澄清须新业务键；I03～I05 | not_run |
| J03 | run分页同createdAt、多页过滤、跨run/越界游标；事件交错全局outbox | 列表无漏/重复，事件本run seq跨attempt连续，真实快照同事务；I11/I13 | not_run |
| J04 | 重复/乱序/丢通知、丢页响应、缺口、跨页ID冲突、坏JSON/外run | 游标仅整页接受后推进；失败保留已接受事实且不泄露任意原文；I10/I12～I14 | not_run |
| J05 | Worker kill/reload/online/可见性恢复、卸载迟到响应、重开历史 | 只读恢复、零新增Provider/业务重放；监听/定时器回收；超过显示上限仍能续页；I06/I15 | not_run |
| J06 | 新来源与核价变更、preview/saved报告切换、B新版本历史查询 | 旧授权失效、block不写/pending明确；报告属于真实revision，V1～V3/旧报告不改；I09与D05/D10 | not_run |
| J07 | 非主frame/外URL/伪context或金额/凭据/报告/未知命令及坏响应 | Runtime/Worker/Main/preload各层拒绝，无泛化IPC、无额外权限；D04/D08/D09 | not_run |
| J08 | A实际人工review/publish及撤回，B验资格/消费，C验桌面显示，业务人员验语义 | 人员各自留实际固定版本证据；fixture不顶替发布，技术测试不代签R-1/H-1 | not_run，实际人员项待 |

## 已有证据如何复用

原C45fa03d/e6af0b2的294单元、9实际Electron含build、48fixture（189替身/0真实）、工程/Wiki及独立P2关闭，只作为原实现基线；索引[[C集成最终交接包]]和[[C最终交接包独立复核]]。现有agent-run-store.test.ts含v3/v6升级，agent-run-recovery.test.ts包含15个原运行/提交强杀屏障；run-event-store与RunEventFeed、preload/Worker/Electron已有回归是扩展起点，不证明新的跨谱系路线。

B f2dfa5f中的原六组Windows重跑与C源码/SQL/脚本/cases一致仍compatible=false；额外两项负向0/2、全量183/184与Wiki34/36的EPERM失败保留，聚焦53/53不覆盖迁移缺口。C不重新写旧报告或把旧失败改成新通过。Windows按当前macOS优先策略保留原范围，不扩成必须先修Windows才可收敛方案的前提。

## 方案确定后的实际命令与记录要求（本轮未运行）

先在独立组合工作树记录实际A/B/C/目标SHA、合并基线、锁文件hash、OS/CPU、Node/pnpm/Electron及SQLite运行时；原生SQLite用工程锁定的Electron ABI，不能以普通Node或浏览器通过代替桌面。A/B新增迁移/负向探针须提供明确可执行命令并纳入实际验证清单，不能沿用旧“已知红探针”当新实现绿灯。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:model --mode fixture --output .runtime/c-migration-fixture
pnpm check
pnpm wiki:test
node wiki-project/scripts/build-code-index.mjs .
node wiki-project/scripts/build-code-index.mjs . --check
node wiki-project/scripts/lint-wiki.mjs .
```

上述是待执行顺序；test:e2e按现有package.json自带build，记录构建退出码/输出，不虚构已运行。另对实际taskBase、实际共同目标merge-base和保留累计基线be53b98分别运行check-wiki-sync.mjs，不能用执行后HEAD替代本次基线。先生成再check/lint供工程门禁读取；源码/映射有更新时在需要时提前generate，并保留失败和修正后命令。诊断fixture/产品全套顺序运行，局部P2时限及业务预算不变；不执行deepseek模式或真实连接测试。

每项记录：caseId/参数变体/ADR预期/状态not_run或实际pass/fail；源与目标完整SHA/SQL指纹/夹具生成方式；T0/T1/T2的版本、schema、ledger、按稳定主键排序的行与逐字节hash；触发器/约束行为、错误/失败点/子进程退出信号、Provider和写入计数；实际时间/命令/退出码/脱敏输出与SHA；实现者/执行者及未覆盖项。未知费用/token保持null；不得保存Key/客户原件/完整敏感日志。拒绝通过、诊断复现与完整兼容通过分开记录。

责任顺序：A先交ADR/矩阵/固定存储实现→B交接口及报告/消费适配证据→C先M/F迁移门禁，再桌面D/J及macOS全套。A实际发布、业务语义验收、实际非作者整体接收分别留证；技术Agent意见不代签。任何not_run/失败/人员待签必须保留，不为小结凑“完成”。


## A固定方案后的首轮核验（2026-10-23）

[[A迁移谱系固定提交接收与前置验证]]：A实现9cdd13a3755b4bd1d0a4ac300785021e47ed4a88、回复a58e97097994491a9e49c085ae9369ef9bd08019及远端头b9a0af76217e57e0ab22ba927de1a1a287b1145f已取得；九SQL指纹一致、原A探针重跑一致。实际A typecheck失败11项（7新增迁移、4未变更A01c），实际生产migrate/repository原生12项7通过5失败。缺必要列、同名无效触发器/非唯一索引及旧账本/schema矛盾仍接受；坏新账本未在只读预检拒绝，真开WAL后才拒绝并改文件。结论changes_required：先A修正门禁并补作者验证，B交报告/消费适配与P1 lint回执，C再做完整迁移矩阵→桌面→macOS全套；人工发布/业务语义/实际非作者分别留证。不推送、合入、代签、自动发送或真实模型复测。本页仍draft/待完整执行，不追填29项或12接线项通过。
