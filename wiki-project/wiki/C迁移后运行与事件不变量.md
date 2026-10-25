---
title: C迁移后运行与事件不变量
type: interface
status: draft
updated: 2026-10-25
sources:
  - packages/infrastructure/src/agent-run-store.ts:67
  - packages/infrastructure/src/agent-run-coordinator.ts:35
  - packages/infrastructure/src/run-event-store.ts:14
  - packages/infrastructure/src/migrations.ts:58
  - packages/domain/src/agent-run.ts:14
  - packages/contracts/src/run-events.ts:6
  - wiki-repo:raw/c-migration-execution-plan-audit.json:1
---

# C迁移后运行与事件不变量

2026-10-25 当前独立复验：A远端固定e73d17790abf03517060bac4cd78736dfae78232已核对。六轮四例Y04a/Y04b/Y05/Y06全部拒绝且状态/文件保持，含控制组7/7；原五项、X01～X11（11/11）、原12及107矩阵全部保持通过。扩展M13新增Y07假注释保护体、Y08注释分隔UPDATE OF、Y09假注释事件三例，均误接受升8且旧步骤实际可删改；M13仍changes_required。详见[[Ae73d177独立复验与SQL注释边界回执]]、[[C集成-Ae73d177复验与注释边界]]。完整迁移矩阵、新组合、桌面/macOS联合、实际人员签认及业务验收未完成；B已接收材料/A-W08/两次100证据保留。下方旧版本状态是各自历史时点，不覆盖本轮结论。

2026-10-25 当前独立复验：A远端固定163f7a4d2954237d5c88ca909451509b720c0117已核对。前轮五项M09-L01/L02、M13-Y01/Y02/Y03均通过，X01～X11保持11/11，原矩阵107/107。继续扩展M13发现三类四样本Y04a/Y04b（SELECT RAISE后WHERE 0/LIMIT 0）、Y05（UPDATE OF不存在列）、Y06（AFTER DELETE + RAISE IGNORE）仍被接受升8且旧步骤可删改，当前M13仍changes_required。详见[[A163f7a4独立复验与触发器边界回执]]、[[C集成-A163f7a4复验与边界扩展]]。原五项仅在已测范围技术关闭，不撤销其旧失败记录；完整迁移矩阵、新组合、桌面/macOS联合、实际人员签认与业务验收未完成。B既有A-W08与两次100/100材料保留，不外推为新组合通过。下方旧版本结论为历史时点。

2026-10-25最新独立结果见[[A41f0cdc独立复验与迁移矩阵阻断]]、[[C集成-A41f0cdc复验与矩阵扩展]]：已取得并核对A固定41f0cdc4d2d8db931f00f4c2fc141e4274abf82b，C原X01～X11全部11/11通过（含有效原schema控制），X10/X11在已测样本范围技术关闭；原12生产项/typecheck/macOS存储45项/契约35项通过。随后推进迁移矩阵107个子样本，102通过、5失败：M09旧账本未知登记/重复身份仍接受，M13真实RAISE不可达/触发器挂错表/唯一索引挂错表仍接受升8且实际保护失效。10条升级路线的80个选定异常边界及C7四个真实SIGKILL点通过，但并非完整F矩阵；旧SQL行保留不是领域业务验收。当前M09/M13仍changes_required，完整矩阵/新组合/桌面/macOS联合及实际人员业务签认未完成。B既有材料/A-W08/Windows100证据保留，不重复核验或外推。下方旧“远端仍cece332/X10X11待修”仅为此前时点；本次未推送、合入、发送或真实模型复测。

供A确定方案后执行的C技术输入，尚未实施或联合验收。固定资料为C协调b3bc98c2c4149a21ec70978c0dd73eea67e561c6、C实现45fa03d57d6fc405c2438c3b187f87838355a88b、B回复f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef；本轮源码与原C实现逐文件核对，不纳入B源码。历史技术证据见[[C集成最终交接包]]；迁移6/7冲突及六组诊断仍按[[C迁移协调请求草稿-AB谱系兼容]]处理，compatible=false。

本文“现有”指上述C实现，不表示新组合已支持。I编号是后续验收条件；A决定如何保存谱系和执行登记，不由本页分配新号位或选择算法。执行入口[[C集成-迁移方案执行与联合验收]]，对应[[C迁移后桌面接线清单]]、[[C迁移联合验证用例]]。

## 运行与写入

| ID | 必须保留的现有语义 | 实现与旧用例入口；新组合须复验 |
|---|---|---|
| I01 | 同workspace/operationKey与规范化method/payload只对应一个run。同键同参start返回当前事实，无dispatch；异参IDEMPOTENCY_CONFLICT。requestId、控制键不替换原业务键；旧understand/revise与新start共用协调器/成功回执。 | `packages/infrastructure/src/agent-run-store.ts:265`；`packages/infrastructure/src/agent-run-coordinator.ts:91`；`packages/infrastructure/src/agent-run-store.test.ts:136`、`packages/infrastructure/src/agent-run-coordinator.test.ts:34` |
| I02 | cancel/retry的control_key保存首次result_json；丢响应重送同键返回首次快照，无重复abort/dispatch/event。UI另get/list取最新事实；同控制键异method/run拒绝。 | `packages/infrastructure/src/agent-run-store.ts:649`；`packages/infrastructure/src/agent-run-store.test.ts:223`、267 |
| I03 | claim只接当前queued/expectedAttempt；有效票据为runId/attempt/executionId/workerSessionId四元组且run仍running。旧attempt/session、取消后或晚到模型结果不得新写。 | `packages/infrastructure/src/agent-run-store.ts:207`、307、385；`packages/infrastructure/src/agent-run-coordinator.test.ts:72`、187 |
| I04 | start/控制持久事务成功后才产生派发/abort副作用；cancel先落库再精确abort，失败不声称取消成功。COMMIT先赢则completed及committedRevisionId不被cancel/retry撤销；prepared不代表保存成功。 | `packages/infrastructure/src/agent-run-store.ts:361`、477、649；`packages/infrastructure/src/agent-run-coordinator.ts:68`；`packages/infrastructure/src/agent-run-store.test.ts:181`、463 |
| I05 | 仅显式retry将failed/cancelled/interrupted转queued并attempt+1；同控制键重放不再递增。waiting_input保留clarification，补事实须新输入/新业务键；completed仅回读，不新版本。 | `packages/domain/src/agent-run.ts:14`；`packages/infrastructure/src/agent-run-store.ts:326`、649；`packages/infrastructure/src/agent-run-store.test.ts:206` |
| I06 | Worker先独占，再打开业务库/迁移/恢复，最后ready；旧writer实际exit后方可重建。启动恢复仅将queued/running改interrupted、清执行身份并放弃prepared，不自动模型派发。外部SQLite工具不受此侧库锁承诺覆盖。 | `apps/desktop/src/workers/business.ts:19`；`packages/infrastructure/src/worker-ownership.ts:6`；`apps/desktop/src/main/worker-client.ts:89`、148；`packages/infrastructure/src/agent-run-store.ts:705`；`packages/infrastructure/src/agent-run-recovery.test.ts:99` |
| I07 | 写调用身份/参数hash/输入/状态/真实revisionId与业务事实一致；每run/attempt最多一条prepared或committed。已提交回执与步骤不可改删，同调用同参回放不增报价，异参拒绝；失败可保留先前prepared，不能留下半份completed。 | `packages/infrastructure/src/migrations.ts:86`、109；`packages/infrastructure/src/agent-run-store.ts:385`、477、520；`packages/infrastructure/src/agent-run-coordinator.test.ts:187`、211 |
| I08 | 同连接外层事务涵盖quote/turn/成功业务幂等/run/回执/工具步骤/授权与相关outbox事件；嵌套savepoint不提前发布。任一写入失败整体回滚，绝不以第二连接或await切开原子边界。 | `packages/infrastructure/src/agent-run-store.ts:361`、477、576；`packages/infrastructure/src/quote-tool-agent.test.ts:291`；`packages/infrastructure/src/run-event-store.test.ts:57` |
| I09 | V1/V2/V3旧JSON、hash、ID/根/父/版本、decimal及null事实不改写。新草稿基于宿主确定性核价和最新基线/来源授权；block不写、缺覆盖保留pending，模型不能给最终金额或伪造校验依据。 | `packages/infrastructure/src/agent-run-store.ts:574`；`packages/infrastructure/src/quote-tool-agent.test.ts:153`、237、249、269、389、435 |
| I10 | 持久run/步骤/回执/真实报价引用自校验；损坏失败关闭，不跳坏项返回部分假成功，不回显SQL/任意异常。凭据仅宿主临时传入，不落command/事件；run详情和写入参数含本地业务正文，并非脱敏导出物。 | `packages/infrastructure/src/agent-run-store.ts:89`、339；`packages/infrastructure/src/agent-run-store.test.ts:447`；`packages/infrastructure/src/quote-tool-agent.test.ts:540` |

状态图以domain真实转换表为准，不由数据库升级重新解释。error.retryable与run允许retry是不同条件，不能用B的失败分类改变I05。业务预算保持原值：tool_loop最多12次工具循环调用、120000ms；单次协调器50000ms等待、原Provider时限及宿主传输预算分别按现有实现。P2仅诊断测试局部20000ms，不放宽业务预算或删断言。参考`packages/infrastructure/src/quote-tool-agent.ts:354`、`packages/infrastructure/src/agent-run-coordinator.ts:160`和[[C04诊断回归时限修复]]。

## 事件与只读重连

| ID | 必须保留的现有语义 | 实现与旧用例入口；新组合须复验 |
|---|---|---|
| I11 | outbox中type=agent.run.event.v1是append-only持久日志，通知消费/清理不得删除或标消费这些行。原event_id、payload_json、context_json、created_at及全局outbox.seq保留；公开event.seq按run连续、跨attempt不重置，不能用全局seq替代。 | `packages/infrastructure/src/run-event-store.ts:14`、28、36；`packages/infrastructure/src/run-event-store.test.ts:11` |
| I12 | eventId由宿主生成，start/claim/状态/工具步骤与同事务事实一致；重放start/control/tool不再发事件。日志插入失败连业务回滚，无seq缺口；提示仅读取外层已提交数据。 | `packages/infrastructure/src/agent-run-store.ts:149`、520；`packages/infrastructure/src/run-event-store.ts:36`、98；`packages/infrastructure/src/run-event-store.test.ts:57`、77 |
| I13 | agent.events是宿主范围只读命令，run快照与页同事务读取；afterSeq默认0、limit默认20/上限100。页同run、连续seq、eventId唯一，nextSeq/headSeq/hasMore一致；越界游标/损坏拒绝，不靠空页无限循环。 | `packages/contracts/src/run-events.ts:6`；`packages/infrastructure/src/agent-run-store.ts:256`；`packages/infrastructure/src/run-event-store.ts:77`；`packages/contracts/src/run-events.test.ts:1` |
| I14 | events.available和events.connection只是唤醒提示，不是真实状态或报价。重复/乱序/伪大seq不推进游标；整页校验后接受，重复旧页不重复显示、缺口/新seq复用ID/跨run页不推进。显示保留100条与有界身份缓存不影响从持久游标继续补齐。 | `apps/desktop/src/renderer/src/features/run-event-feed.ts:10`；`apps/desktop/src/renderer/src/features/run-event-feed.test.ts:28`、37、45、57；RunEvents组件每页5、一轮最多20页、2秒兜底 |
| I15 | get/list/events、reload/重连/online/可见性恢复只回读，无凭据读取或start/retry/真实模型请求；卸载/迟到响应停止续页，Main/preload/Worker释放各自监听。少通知或丢响应仍从已接受seq补齐。 | `apps/desktop/src/main/index.ts:240`；`apps/desktop/src/preload/index.ts:78`；`apps/desktop/src/renderer/src/features/run-events.tsx:37`；`apps/desktop/src/renderer/src/features/run-events.test.tsx:18`；`tests/e2e/agent-recovery.spec.ts:9` |
| I16 | 旧无日志run迁移阶段仍无历史事件，不伪造历史toolCallId/步骤/回执。启动恢复可新增本次真实interrupted事件；已完成旧成功run可无新账本，仍核对真实报价/幂等。事件生产仅用元数据/受限工具身份及公开码，无原命令/回答/Key/认证头/SQL原文。 | `packages/infrastructure/src/run-event-store.test.ts:99`、129；`packages/infrastructure/src/agent-run-store.test.ts:287`；现有生产append仅run.updated/tool.completed |

RunEventSchema还定义了其他事件类型，但当前持久生产append没有因此实现token流、artifact导出或审批；不得在新组合凭事件类型存在声称能力已接通。日志大量历史的性能/保留期/专用索引尚未验收，追加优化若改变身份/分页，需独立说明和验证。

## 迁移快照与启动恢复必须分开

第一阶段在新迁移函数完成、协调器构造前取快照：旧数据按稳定主键排序，JSON/TEXT和hash按UTF-8逐字节比较，事件ID/公开seq和旧账本原事实不变；新增列仅按A明示默认值允许，新登记仅追加已确认身份。不要把整个SQLite文件hash当WAL/页布局不变证明。

第二阶段才启动独占Worker：允许I06定义的queued/running→interrupted、prepared→abandoned、执行身份清空及追加真实恢复事件；终态/旧控制回执/报价不改，模型计数仍0。重复启动不再重复中断事件。对安全拒绝的输入不进入协调器、不做恢复写入。

A需确认同号异义识别和追加登记、外键/索引/触发器完整性、拒绝前物理文件/WAL边界与事务/恢复路径；B需确认新Wiki来源、报告/消费/幂等事实与C的授权投影共存。以上未决不由旧C测试或本轮文档门禁批准。记录模板、输入矩阵和失败点见[[C迁移联合验证用例]]；准备任务[[C集成-迁移后执行准备]]仅整理材料。


## A固定方案后的首轮核验（2026-10-23）

[[A迁移谱系固定提交接收与前置验证]]：A实现9cdd13a3755b4bd1d0a4ac300785021e47ed4a88、回复a58e97097994491a9e49c085ae9369ef9bd08019及远端头b9a0af76217e57e0ab22ba927de1a1a287b1145f已取得；九SQL指纹一致、原A探针重跑一致。实际A typecheck失败11项（7新增迁移、4未变更A01c），实际生产migrate/repository原生12项7通过5失败。缺必要列、同名无效触发器/非唯一索引及旧账本/schema矛盾仍接受；坏新账本未在只读预检拒绝，真开WAL后才拒绝并改文件。结论changes_required：先A修正门禁并补作者验证，B交报告/消费适配与P1 lint回执，C再做完整迁移矩阵→桌面→macOS全套；人工发布/业务语义/实际非作者分别留证。不推送、合入、代签、自动发送或真实模型复测。本页仍draft/待完整执行，不追填29项或12接线项通过。


## A9225526复核与剩余门禁（2026-10-24）

[[A迁移谱系9225526复核与M13约束验证]]：固定A92255261e818e6fde0687deee5544755cf9af469已独立复核：typecheck退出0、原12项12/12（含N07～N11）、新增账本Electron ABI测试3/3，九SQL指纹一致；A原探针9指纹/19分类/10追加重跑一致。M13四个有效约束子样本均失败：WHEN 0使含RAISE触发器失效、WHERE 0使UNIQUE部分索引失效、缺外键/CHECK仍接受升8，且实际写删证明保护丢失；未损坏控制组全部真实拒绝。infrastructure macOS原生44/45，A-W08 retryable分歧仍失败，原Windows symlink EPERM未在本轮复现。原类型/N07～N11仅在9225526所列样本范围可关闭，旧6f9287b失败原样保留；schema一类未满足完整M13，不批准整体迁移/接线。A补有效定义/行为判据与回归，A/B确认A-W08公共语义及B适配/P1，再由C继续完整矩阵→桌面→macOS全套；人工发布/业务/实际非作者仍待。不推送/合入/代签/发送/真实模型复测。


## A65885ff复核：原例通过、有效定义仍待（2026-10-24）

[[A迁移谱系65885ff复核与有效定义剩余问题]]：固定A65885ff472acee4cedb3b0c17e7c850f30f98d91已独立取得并核对远端；原12项12/12、原M13-X01～X04 4/4、typecheck通过，A原探针9指纹/23分类/10追加与固定报告一致。macOS infrastructure45/45、contracts35/35，A-W08原行为失败已消失，B公共契约确认仍待。M13-X05～X09五个有效定义变体0/5：WHEN/WHERE 1=0、索引列集合错误、触发器事件错误、CHECK仅注释仍接受升8，实际写删证明保护失效；原schema控制组全部真实拒绝。整体changes_required；A补已知有效定义识别/回归，避免仅关键词或常量黑名单；B确认公共failure语义、账本/报告/消费适配及P1，再由C继续完整矩阵→桌面→macOS联合全套。原四例在新A版本技术关闭不追改旧失败，M13整体仍未关闭；A人工发布/业务/实际非作者仍待，不代签、不推送/合入/发送或真实模型复测。


## Acece332九例复验与B材料接收（2026-10-24）

[[Acece332迁移复验与B契约材料接收]]：已取得并核对A远端固定cece332e41a230ebbeeaee64eb283b49a5d4fb43；请求的M13-X01～X09九例全部通过，原生产12项12/12，typecheck、macOS infrastructure45/45、contracts35/35通过，A原探针9指纹/28分类/10追加一致。补充X10/X11两个有效定义缺口仍失败：触发器仅含字符串RAISE仍接受、大写WHERE字符串被整体小写归一误判，接受升8后可实际删除步骤/重复prepared；有效原schema控制组均拒绝。M13整体仍changes_required，A修有效触发器体与保留字面量语义的结构核对；B已报告A-W08公共契约符合与100/100，但本次origin未找到codex/b-c-third-feedback，固定Wiki/证据不可读，接收核对未完成；不代签或把转述当已核实交付。取得新A修正/B固定材料后C再复核，完整29项、新组合接线/macOS联合未执行。人工发布/业务/整体非作者仍待，不推送/合入/发送/真实模型复测。


### 同轮后续：B固定材料已接收

[[Acece332迁移复验与B契约材料接收]]：本轮后续复查已取得并核对B远端b80ad4329e7a72f4990aea89eced0536d6ebba1d（材料509a234，代码基线8043afb），原Wiki与原始/重复两次八文件100/100、Wiki门禁证据已逐项核对；C引用blob/SHA/脚本hash、B源码未变、A/B helper原文hash一致，C独立重放3个helper结果一致。B确认CAPABILITY_UNAVAILABLE / retryable=false为开发Agent技术确认，实际人员签认仍待。100项为B Windows原执行，未据此宣称C复跑或新A/B/C组合/macOS桌面通过。B8043afb依赖旧A b9a0af7，新组合仍须保留A迁移修正/C运行导出/B检查与P1公开出口。原初查无头仅时点事实，不继续作为当前阻塞。当前仍待A补M13-X10/X11及新组合/人员验收，产品任务保持active。
