---
title: C迁移后桌面接线清单
type: interface
status: draft
updated: 2026-10-25
sources:
  - packages/contracts/src/index.ts:93
  - packages/contracts/src/pending-client.ts:22
  - packages/infrastructure/src/index.ts:29
  - apps/desktop/src/workers/business.ts:19
  - apps/desktop/src/main/index.ts:240
  - apps/desktop/src/main/worker-client.ts:148
  - apps/desktop/src/preload/index.ts:53
  - apps/desktop/src/renderer/src/features/agent-runs.tsx:1
  - wiki-repo:raw/c-migration-execution-plan-audit.json:1
---

# C迁移后桌面接线清单

2026-10-25 最新C独立复验：固定A 910e6260af0c4d84471e665da7656dbf8133aae7的Y10安全拒绝，identify与真实repository均在升级/写入前报tampered，原schema/数据/版本7/账本、DB字节和目录列表保持。两个有效CHECK控制均正常通过迁移入口并实际拒绝attempt=0，套件3/3。此前全部指定回归保持：原五项、六轮四例、七轮三例、X01～X11、原12/107及九段SQL指纹；macOS infrastructure47/47、contracts35/35。Y10仅在已测范围技术关闭，本轮未发现新的阻断；M13完整矩阵、新组合、桌面/macOS联合及实际人员/业务验收仍未完成。详见[[A910e626独立复验与Y10关闭回执]]、[[C集成-A910e626与Y10独立复验]]；旧版本失败记录保留原作用域。

2026-10-25 最新C独立复验：A远端固定1c890dc77ecba2cfb949c5e69908dc81bdacc692已核对，Y07/Y08/Y09全部安全拒绝且逻辑/物理边界保持，含三个控制6/6；原五项、六轮四例、X01～X11、原12/107与九段SQL指纹保持通过。新增M13-Y10：agent_write_call移除真实CHECK(attempt>0)、增加普通方括号列[CHECK(attempt>0)]后，identify/repository均接受升8并成功写入attempt=0；两个真实CHECK控制均拒绝。M13仍changes_required。详见[[A1c890dc独立复验与方括号标识符边界回执]]、[[C集成-A1c890dc复验与CHECK边界]]。完整迁移、新A/B/C组合、桌面/macOS联合及实际人员/业务验收未完成；下方旧版本记录保留原作用域。

2026-10-25 当前独立复验：A远端固定e73d17790abf03517060bac4cd78736dfae78232已核对。六轮四例Y04a/Y04b/Y05/Y06全部拒绝且状态/文件保持，含控制组7/7；原五项、X01～X11（11/11）、原12及107矩阵全部保持通过。扩展M13新增Y07假注释保护体、Y08注释分隔UPDATE OF、Y09假注释事件三例，均误接受升8且旧步骤实际可删改；M13仍changes_required。详见[[Ae73d177独立复验与SQL注释边界回执]]、[[C集成-Ae73d177复验与注释边界]]。完整迁移矩阵、新组合、桌面/macOS联合、实际人员签认及业务验收未完成；B已接收材料/A-W08/两次100证据保留。下方旧版本状态是各自历史时点，不覆盖本轮结论。

2026-10-25 当前独立复验：A远端固定163f7a4d2954237d5c88ca909451509b720c0117已核对。前轮五项M09-L01/L02、M13-Y01/Y02/Y03均通过，X01～X11保持11/11，原矩阵107/107。继续扩展M13发现三类四样本Y04a/Y04b（SELECT RAISE后WHERE 0/LIMIT 0）、Y05（UPDATE OF不存在列）、Y06（AFTER DELETE + RAISE IGNORE）仍被接受升8且旧步骤可删改，当前M13仍changes_required。详见[[A163f7a4独立复验与触发器边界回执]]、[[C集成-A163f7a4复验与边界扩展]]。原五项仅在已测范围技术关闭，不撤销其旧失败记录；完整迁移矩阵、新组合、桌面/macOS联合、实际人员签认与业务验收未完成。B既有A-W08与两次100/100材料保留，不外推为新组合通过。下方旧版本结论为历史时点。

2026-10-25最新独立结果见[[A41f0cdc独立复验与迁移矩阵阻断]]、[[C集成-A41f0cdc复验与矩阵扩展]]：已取得并核对A固定41f0cdc4d2d8db931f00f4c2fc141e4274abf82b，C原X01～X11全部11/11通过（含有效原schema控制），X10/X11在已测样本范围技术关闭；原12生产项/typecheck/macOS存储45项/契约35项通过。随后推进迁移矩阵107个子样本，102通过、5失败：M09旧账本未知登记/重复身份仍接受，M13真实RAISE不可达/触发器挂错表/唯一索引挂错表仍接受升8且实际保护失效。10条升级路线的80个选定异常边界及C7四个真实SIGKILL点通过，但并非完整F矩阵；旧SQL行保留不是领域业务验收。当前M09/M13仍changes_required，完整矩阵/新组合/桌面/macOS联合及实际人员业务签认未完成。B既有材料/A-W08/Windows100证据保留，不重复核验或外推。下方旧“远端仍cece332/X10X11待修”仅为此前时点；本次未推送、合入、发送或真实模型复测。

以C b3bc98c和B f2dfa5f为准备输入，全部D项为待执行/待新固定候选验证，不是本轮实现。既有运行/事件生产链已接通；新Wiki/完整B01在当前C仍未接通，pending-client并非真实保存服务。方案前提与角色见[[C迁移协调请求草稿-AB谱系兼容]]；保护条件见[[C迁移后运行与事件不变量]]，用例见[[C迁移联合验证用例]]。

## 开始接线前

| ID | 需要落实的工作与入口 | 完成证据/责任 |
|---|---|---|
| D01 | A提供ADR、谱系判据、目标schema、逐输入支持/拒绝矩阵、追加执行登记/编号及回滚边界；A/B提供固定实现、公开出口和原本机记录。先创建独立组合worktree/分支，记录实际merge-base及各来源SHA。 | A决定迁移；B确认公共契约；C记录来源范围。未知项不可用推测替代。仅准备不自动合入。 |
| D02 | C先执行完整迁移/拒绝矩阵，再构造业务服务。SqliteWorkspaceRepository当前先mkdir/open/WAL再migrate；Worker先Ownership再repository、恢复、ready。A/C确定识别与拒绝位置、WAL/侧库等允许变化，避免未判定旧库已被引导或恢复。 | 对拒绝库证明未ready/未接业务，无隐式空库/建workspace；启动安全错误有可审阅分派，SQL/路径不进UI。B建议STORAGE_ERROR尚非已实施决定。 |
| D03 | infrastructure/index公开导出取已核对能力的并集：保留runStore/AgentRunCoordinator/WorkerOwnership及旧业务入口，按A公共端口加入executeWiki、按B端口加入executeChecks；同业务数据库/连接，不整文件覆盖、不复制DTO。 | typecheck/边界检查、公开入口调用证据；原run/quote与新source/wiki/report可同时重开。 |

## 公共协议到Worker

| ID | 需要落实的工作与入口 | 完成证据/责任 |
|---|---|---|
| D04 | B维护contracts/index.ts的RuntimeCommand/RuntimeResult与WorkerRequest/Reply联合、DesktopClient、mock/pending及调用方；只开放已交付命令。保留run/event/旧同步返回协议；知识运行P1/维护/审批不随P0自动开放。 | 非法字段与未支持方法拒绝；精确白名单/返回schema测试；B确认契约，C同步宿主调用方。 |
| D05 | 当前C的候选validate_quote是未保存草稿预写授权，B executeChecks严格接已保存revisionId，不能直接互换。由B确认纯校验/适配口径、A提供新Wiki来源读取/消费端口，C保持“预览授权→事务内复核→保存后真实版本报告”的身份区分。 | 新计算使旧授权失效，来源/规则变更拒绝旧写；旧saved_revision/proof/steps能回读。不得伪造revisionId、renderer快照或将旧B00有限规则当完整B01。 |
| D06 | business.ts在同一repository/可信context分派A/B命令。host确定workspace/actor/origin/时点；Worker输入/输出都严格校验。报告、完整多来源消费、outbox、成功幂等保持B同步同连接IMMEDIATE，无await拆事务。 | B报价/报告/消费夹具及失败整体回滚；同key首次结果不变、异参冲突；旧报告无wikiCitations不补写。 |
| D07 | WorkerOwnership、ready前不可用、exit后才重建、超时终止不确定writer、shutdown等待exit保持；新存储失败不驱动自动模型/写操作重放。 | 第二writer/迟到回包/丢完成响应/Worker kill及重开用例；I01～I08/I15。 |

## Main、preload与renderer

| ID | 需要落实的工作与入口 | 完成证据/责任 |
|---|---|---|
| D08 | Main按命令增量注册handler，保留sender=当前window、mainFrame、renderer URL核对和channel/method一致。只在实际需要模型的既有入口获取凭据，get/list/events/quote检查及Wiki查询不因此读取Key。人工发布身份由宿主可信入口确定，renderer传origin不能获得权限。 | 非主frame/外URL/伪actor/origin/workspace/credentials/金额/已通过报告均拒绝；B公开错误与A授权判定有对应映射。 |
| D09 | preload覆盖对应pending方法前同时完成请求/结果strict schema；绑定runId/afterSeq等响应范围，报告绑定实际revision。保留run/event正式实现，卸载幂等退订。不得泛化IPC透传或把不可用返回替成空成功。 | preload/contracts.test.ts、contracts负向测试与真实Electron IPC拒绝证据。 |
| D10 | renderer只调用DesktopClient；接入已保存版本检查/历史报告、风险标记和文本批注/全部来源定位，按revision隔离。明确旧/新报告、预览/保存及synthetic/pending/block；保持未知金额，不自动审批/外发。修改UI前按根DESIGN.md适配。 | B双反馈与A来源资格核对；V1/V2/V3切换/报告重开，不能拿版本差异表代两种反馈。旧成功报告不随新知识现态改写。 |
| D11 | agent-runs/run-events继续只读发现与seq补页；事件仅唤醒、不能作报告或报价本体。刷新/断线/online/重开不start/retry；控制丢回复复用原键，再get/list回读。 | I11～I16与RunEventFeed/UI/实际Electron重连；HTTP替身请求计数证明重连/迁移零新模型请求。 |
| D12 | A提供实际review/publish/withdraw入口，实际人员审核并显式发布，留revision/contentHash/sourceSetHash和操作证据。fixture直接变lifecycle不能充当人工发布；C仅按公开授权接线和展示，B验未发布/撤回/过期门禁。 | A人工操作、B消费资格、C真实桌面入口分别留证；不预填人名/通过结论。业务语义由验收人另签，R-1整体非作者另行完成。 |

## 执行顺序和交付

D01落实→D02迁移与安全拒绝先验→D03～D09按小切片同步契约/宿主/测试→D10～D12及原运行/事件回归→macOS完整组合验证。每次源代码修改由该作者同一交付更新Wiki、任务、追加log和覆盖；不能让新接线覆盖旧C04诊断/脱敏断言或把预算放宽来过门禁。

本轮仅形成清单，未扩展任何Runtime/Worker白名单、发布权限、UI或新错误码。未来执行按[[C集成-迁移方案执行与联合验收]]记录固定候选、环境、实际命令/退出码、用例证据和未决项；人员签认与文档准备done分别记录。参考[[C03持久事件与桌面重连]]、[[C02c多步报价工具闭环]]。


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
