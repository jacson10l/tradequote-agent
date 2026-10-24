---
title: A41f0cdc独立复验与迁移矩阵阻断
type: process
status: observed
updated: 2026-10-25
sources:
  - wiki-repo:raw/c-a41f0cdc-intake.json:1
  - wiki-repo:raw/c-a41f0cdc-native.json:1
  - wiki-repo:raw/c-a41f0cdc-m13.json:1
  - wiki-repo:raw/c-a41f0cdc-matrix.json:1
  - https://github.com/jacson10l/tradequote-agent/blob/41f0cdc4d2d8db931f00f4c2fc141e4274abf82b/packages/infrastructure/src/migration-lineage.ts
  - https://github.com/jacson10l/tradequote-agent/blob/41f0cdc4d2d8db931f00f4c2fc141e4274abf82b/packages/infrastructure/src/migrations.ts
---

# A41f0cdc独立复验与迁移矩阵阻断

## 固定输入、环境与边界

C从fd2fa2529d2ebc919ca669b16486b0bc87484c89建立独立codex/c-a41f0cdc-validation工作树。实际fetch及ls-remote/rev-parse确认A远端固定41f0cdc4d2d8db931f00f4c2fc141e4274abf82b。A完整快照在忽略的.runtime/a-source安装，175份非Wiki源码与固定Git blob逐字节一致；九个历史SQL指纹与前轮C及固定B一致。旧C45fa03d、B6c76fb的原SQL分别按固定blob取出用于构造历史库，没有将最终库降版本冒充历史迁移。

宿主macOS26.4 arm64、Node22.22.0、pnpm10.13.1；原生SQLite实际走Electron44.9.2内嵌Node24.22.0及工程重建的better-sqlite3 ABI，具体SQLite版本/命令/输出/hash见intake/native原始JSON。全程仅合成内存库和独立文件库，不读真实用户库/Key，不调用真实模型。

本轮验证固定A生产migrate/identify及SqliteWorkspaceRepository，不是A/B/C源码已合并的新组合。矩阵的旧行是显式syntheticSQLFixture JSON/TEXT，用于数据库事实/字节保留，不冒充经过领域校验的报价、run、人工知识发布或B报告消费业务。

## X01～X11在已测范围通过

原C前轮脚本保留断言，只替换A固定来源与提交标识：X01～X04 4/4、X05～X09 5/5、X10/X11 2/2全部通过。每例均保留有效原schema控制组真实拒绝对应写删；损坏库的identify/migrate均拒绝且原schema/user_version/registry不变。X10字符串RAISE、X11大小写谓词这两个原问题在41f0cdc的已测样本范围技术关闭，前轮失败证据原样保留，不追改成通过。

原生产12项12/12（含N07～N11和坏SQL整体回滚）、typecheck退出0、macOS infrastructure45/45、contracts35/35通过。45项含migration-ledger3与wiki-store5；未为这8项另重复执行。A原探针30分类/10追加/2有效控制组独立重跑，与固定作者记录的结构结果一致；该探针的内联追加不替代生产migrate。A只读Wiki check/lint和基于cece332的正确Git上下文sync均退出0。

初次归档源码执行Git型sync错误继承外层C工作树，出现大量覆盖错误；为隔离快照补自己的固定A HEAD/index后重跑通过，未改产品或放宽规则。另有宿主Python不支持tarfile filter参数的解包运行器失败，修正调用后才执行产品测试。这两项属取证运行器问题，原失败记录与原因保留于intake，不算A产品门禁失败。

## 迁移矩阵扩展：107项中102通过、5失败

SQL输入与结构阶段共23个子样本，18通过/5失败；另外F01选定80点和F02真实SIGKILL4点均通过。完整29个M/F/J父用例没有因此全部完成。

11条输入路径（empty、共同1/2/3、A4、C5/6/7、A6、B7、unified重入）在实际文件库中保存旧SQL行，分别经真实repository两次重开和再次migrate，旧列值/JSON/TEXT/hash/ID/旧账本保持、九身份登记齐备且重入稳定。C6新validation_json仅按DDL变为null，迁移不改七种run状态/旧控制/写回执/步骤或造假历史事件。原SQL层多来源wiki/消费/报告行也保持；这些不是领域业务fixture验收，M02～M08的业务回放仍待B/C在新组合完成。

M10的C6误引导B7、M11未知v6、M12未知新身份/高版本均在只读identify与真实repository拒绝，DB字节和目录文件列表不变；原12项还覆盖错误registry hash拒绝。M14只验证迁移阶段无假日志/恢复，未构造协调器，启动恢复阶段仍待。

| 新子样本 | 41f0cdc实际结果 | 对实现/后续的影响 |
|---|---|---|
| M09-L01 旧账本未知version99 | 原B7附未知登记后identify/repository均接受并升8 | verifyLegacyLedger对未知version直接continue；A须明确已知历史映射/安全拒绝边界，不能默默忽略无法解释的登记 |
| M09-L02 旧账本重复version身份 | 构造无唯一约束且重复同身份/同hash的旧账本后仍接受并升8 | 当前逐行核hash，不检账本结构与身份唯一性；按M09重复登记异常要求修正或先由A明确可支持的历史形态 |
| M13-Y01 真实RAISE不可达 | no_delete体为SELECT CASE WHEN 0 THEN RAISE(...) ELSE 1 END；仍接受升8，随后4条旧步骤全部删掉 | 真函数存在仍不能证明保护生效；需可审阅的规范触发器体判据/明确受支持定义，不能只匹配RAISE调用 |
| M13-Y02 触发器挂错表 | 同名同DELETE/RAISE触发器挂到agent_run；仍接受升8，4条旧步骤全部删掉 | 需核sqlite_master.tbl_name/触发器目标表；名称、事件、WHEN与RAISE还不足够 |
| M13-Y03 索引挂错表 | 同名UNIQUE/规范列/规范WHERE索引挂到合成旁表；仍接受升8，同run/attempt两条prepared保存成功 | 需核索引真实目标表/索引元数据与保护对象，不只比列和谓词字符串 |

以上5例均无harnessError；原before/after/schema/行/物理hash、真实入口错误（实际为null）、成功越权保护操作及完整可重跑scriptUtf8/hash在matrix原始JSON。两种有效C7控制组真实拒绝删除和重复prepared，不能把这5项解释成夹具从未有保护。L02中旁存原ledger只是诊断夹具，重复登记/缺唯一约束明确标作tampered，不当真实已发布历史。

## 异常与进程中断的已测范围

F01在10条升级路线分别对8个选定边界注入真实生产连接调用异常：registry DDL前/首个DDL（registry）后、首条ledger INSERT前/后、version写前/后、COMMIT前/后。80/80证明提交前整体回滚且可重试，提交后丢回复保留完整目标并稳定重入。未枚举每条追加DDL/每条登记的前后位置，不能标F01完整通过。

F02在C7文件库的registry DDL后/首条登记后/COMMIT前/COMMIT后，实际子进程到屏障后SIGKILL，4/4：提交前WAL恢复为原事实，提交后目标完整；真实repository重开及重复migrate稳定。记录实际signal=SIGKILL、屏障、文件库恢复快照与版本，不用普通异常顶替强杀。其他谱系与Worker所有权/并发路径未覆盖。

## 当前结论与责任

X10/X11不再是当前待修阻断，但M09/M13新增5项仍changes_required；不以107子样本的通过部分或原X01～X11通过批准完整迁移/桌面接线。A先修账本异常和真实保护/目标表识别，明确L01/L02历史支持或拒绝策略，交固定实现与回归；B保留A-W08/100证据，准备新组合报告/消费/P1同事务和重开回放；C取得修正复验失败子样本并保留X01～X11及已测路径，随后补完整M/F再D/J/macOS联合。

完整F03～F07、F01/F02未测检查点、领域有效历史业务回放、协调器T1/T2恢复、Worker真实ready/公开错误/互斥、桌面D/J及macOS联合build/e2e仍未完成。A人工发布、人员签认、业务/实际非作者整体接收另待。B固定b80ad43材料已在abda94e核对，本次不重复接收，不把Windows100或旧C运行成绩外推新组合。

语义/任务/CONTEXT/状态/索引/log同步；文档门禁与215份旧raw、228份C非Wiki及旧log字节前缀保留检查见raw/c-a41f0cdc-wiki-validation.json。文档检查通过与产品changes_required分别记录，不改A/B源代码、旧SQL或公共出口，不推送/合入/发送或真实模型复测。

关联：[[C迁移联合验证用例]]、[[C集成-A41f0cdc复验与矩阵扩展]]、[[Acece332迁移复验与B契约材料接收]]。

复跑材料：intake包含probeSources的固定Git路径/hash与runnerSources完整脚本；native/m13/matrix包含各实际C脚本scriptUtf8。按probeSources提取固定blob到隔离a-probe，经strip-probes擦除类型、build-a构建原样A入口，再由run-a-electron使用锁定ABI执行。当前工作树可直接运行 `python3 .runtime/run-a-electron.py replay-matrix ../a-probe/matrix.cjs`；本次预期仍退出1并列出5失败，不把运行器自身退出0当测试通过。
