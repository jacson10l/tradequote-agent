# 当前上下文

- 2026-10-26：A 基于 P1 契约实现 A01e 真实 lint 回执落库、人工审核、发布、撤回服务及入口，见 [[A01c检索引用实现]]。SqliteWikiStore 新增 runLint/review/publish/withdraw（审核绑定 revisionId/contentHash/sourceSetHash 与已存 lintReceiptId，lint 成功不自动发布），SqliteWorkspaceRepository 新增 runWikiLint；新增迁移 `knowledge-wiki:8`（knowledge_lint 不可变回执表），统一目标九能力扩为十能力，`migration-lineage.ts` 新增 a-v8 谱系，历史九能力统一库仍识别为 unified 并定向追加 lint 表。本机实跑：typecheck 退出 0、探针 43 分类 + 11 追加 + 2 有效控制组全过（十段 SQL 指纹全匹配）、wiki-store 8/8（新增 A-W09-1/2/3）、migration-ledger 5/5、整仓 infrastructure vitest 49/1（仅 storage.test.ts symlink EPERM，Windows 权限）。剩余 A01d、A-W08 完整 lint 队列、A-W10、B 接口/事务验收、C 组合与桌面/macOS 全量、人工签认与业务验收；不代签、不自动合入/真实模型复测。

- 2026-10-25：A 修正 C 八轮 M13 方括号标识符核验（C 在固定提交 1c890dc 上独立复验确认原五项、六轮四例 Y04a/Y04b/Y05/Y06、七轮三例 Y07/Y08/Y09、X01～X11 均保持通过、原矩阵 107/107 后，统一复现发现的新阻断），见 [[A对C前置验证失败修正回复]]。新增 M13-Y10（方括号列名 `[CHECK(attempt>0)] TEXT` 伪造真实 attempt>0 CHECK）：`stripTrivia` 新增方括号引号标识符 `[name]` 剥离（内容去除），`stripComments` 同步识别 `[name]`（内容原样保留，与其他引号标识符一致），CHECK 判据按去注释/字符串/方括号标识符后的表原文匹配，方括号列名中的 `CHECK(attempt>0)` 文本不再被误认作真实约束；额外方括号列与真实 CHECK 并存的合法库仍识别为原谱系（不禁止所有额外列）。本机实跑：typecheck 退出 0、探针 42 用例 + 10 追加 + 2 有效控制组全过、migration-ledger 5/5、wiki-store 5/5、整仓 infrastructure vitest 46/1（仅 storage.test.ts symlink EPERM，Windows 权限）。拒绝发生在升级/写入前，保留 X01～X11、原五项、六轮四例、七轮三例、九段历史 SQL 指纹、正向升级与旧证据。C 已独立复验确认 Y10 技术关闭（复验提交 c4e109f），A/C 记录一致；B 已接收 A-W08 技术确认（固定材料 b80ad43，`CAPABILITY_UNAVAILABLE`/`retryable=false`），实际人员签认仍待；M13 整体、完整迁移矩阵、新 A/B/C 组合、领域有效旧业务回放、报告/消费/P1 新组合验证、桌面/macOS 联合验证、A 人工发布与业务验收仍未完成；不代签、不自动合入/真实模型复测。

- 2026-10-25：A 修正 C 七轮 M13 注释词法核验（C 在固定提交 e73d177 上独立复验确认原五项、六轮四例 Y04a/Y04b/Y05/Y06、X01～X11 均保持通过、原矩阵 107/107 后，统一复现发现的三例新阻断），见 [[A对C前置验证失败修正回复]]。新增 M13-Y07（注释伪造保护体）、M13-Y08（注释分隔 `UPDATE OF`）、M13-Y09（注释伪造事件）三项拒绝回归：新增 `stripComments`（`--` 行注释/块注释，字符串/引号标识符原样保留，注释补空格保持词法边界），触发器与索引的结构识别（保护体/事件/时机/`UPDATE OF`/`UNIQUE`/列/谓词）一律先剥离注释再匹配，注释不再能伪造结构或打断 `UPDATE OF` 邻接。本机实跑：typecheck 退出 0、探针 40 用例 + 10 追加 + 2 有效控制组全过、migration-ledger 5/5、wiki-store 5/5、整仓 infrastructure vitest 46/1（仅 storage.test.ts symlink EPERM，Windows 权限）。拒绝发生在升级/写入前，保留 X01～X11、原五项、六轮四例、九段历史 SQL 指纹、正向升级与旧证据。下一步待 C 独立复验七轮三例后关闭本轮；B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-25：A 修正 C 六轮 M13 保护体核验（C 在固定提交 163f7a4 上独立复验确认原五项 M09-L01/L02、M13-Y01/Y02/Y03 通过、X01～X11 11/11、原矩阵 107/107 后，扩展发现的四例新阻断），见 [[A对C前置验证失败修正回复]]。新增 M13-Y04a/Y04b（`SELECT RAISE(...) WHERE/LIMIT 0` 抑制）、M13-Y05（`BEFORE UPDATE OF 不存在列`）、M13-Y06（`AFTER DELETE` + `RAISE(IGNORE)`）四项拒绝回归：`hasBareAbortRaise` 要求保护体为裸 `SELECT RAISE(ABORT,'')`（取代关键词命中）、`extractTriggerTiming` 要求 BEFORE、UPDATE 触发器拒绝 `UPDATE OF <列>`。本机实跑：typecheck 退出 0、探针 37 用例 + 10 追加 + 2 有效控制组全过、migration-ledger 5/5、wiki-store 5/5、整仓 infrastructure vitest 46/1（仅 storage.test.ts symlink EPERM，Windows 权限）。拒绝发生在升级/写入前，保留 X01～X11、原五项、九段历史 SQL 指纹、正向升级与旧证据。下一步待 C 独立复验六轮四例后关闭本轮；B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-25：A 修正 C 五轮 M13/账本核验（C 在固定提交 41f0cdc 上确认 X01～X11 11/11 通过后，107 样本扩展矩阵的 5 项新失败），见 [[A对C前置验证失败修正回复]]。新增 M09-L01（旧账本未知 version=99）、M09-L02（无唯一约束旧账本重复 version）、M13-Y01（`CASE WHEN 0 THEN RAISE(...)` 不可达）、M13-Y02（同名触发器挂错表 agent_run）、M13-Y03（同名唯一索引建旁表 synthetic_index_target）五项拒绝回归：RAISE 判据收紧为 `/\bSELECT\s+RAISE\s*\(/` 直接保护体（`SELECT CASE` 不命中）、`TriggerRequirement`/`IndexRequirement` 各增 `table` 并从 sqlite_master `tbl_name` 核对目标表、`verifyLegacyLedger` 对映射外/重复 version 一律拒绝（不再忽略/去重）。本机实跑：typecheck 退出 0、探针 33 用例 + 10 追加 + 2 有效控制组全过、migration-ledger 5/5、wiki-store 5/5、整仓 infrastructure vitest 46/1（仅 storage.test.ts symlink EPERM，Windows 权限）。拒绝均发生在升级/写入前，保留 X01～X11、九段历史 SQL 指纹、正向升级与旧证据。下一步待 C 独立复验五轮 5 项后关闭本轮；B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-23：A 在 codex/a01-migration-lineage（基于 dd42b05）主导三方迁移谱系收敛，见 [[0029-迁移谱系统一与拒绝边界]]、[[A01-迁移谱系支持与拒绝矩阵]]、[[A01-追加迁移设计]]、[[A01-迁移验证计划]]；对 C 未发送协调草稿 fd4b728 与 d99f2b3 六组诊断的逐项回复见 [[A对C迁移协调草稿M1-M8回复]]。识别以 schema 为准、账本 migration_registry(lineage,version,sql_hash,applied_at)、只读预检拒绝零写入、统一目标九能力 user_version=8。纯 Node 探针实际通过（9 指纹全匹配、16 分类、10 追加）；typecheck/vitest 本机未复跑（无 node_modules）。

- 2026-10-24：A 修正 C 二轮 M13 复核（20891fb），见 [[A对C前置验证失败修正回复]]。`capabilityStatus` 补有效定义判据：raises 触发器/partial 索引的 WHEN/WHERE 谓词非永假（M13-X01/X02）、`foreignKeys` 经 `PRAGMA foreign_key_list` 核实（M13-X03）、`checks` 按表原文匹配（M13-X04）；`contracts` `failure()` 统一 `CAPABILITY_UNAVAILABLE` 的 `retryable=false`（A-W08，公共契约单行修正待 B 确认）。本机实跑：typecheck 退出 0、探针 23 用例全过、migration-ledger 3/3、wiki-store 5/5、整仓 infrastructure vitest 44/1（仅 storage.test.ts symlink EPERM，Windows 权限）。下一步 B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-24：A 修正 C 三轮 M13 复核（a633c42，`codex/c-a-lineage-third-validation`），见 [[A对C前置验证失败修正回复]]。原 M13-X01～X04 通过、A-W08 关闭，但 X05～X09 五个有效定义变体仍失败（`1=0` 比较永假、索引增列/改谓词、触发器事件篡改、CHECK 仅在注释）。A 放弃常量黑名单，改为规范参考结构核对：`TriggerRequirement` 增规范 `event`/`when`、`IndexRequirement` 增规范 `columns`/`where`、CHECK 按 `stripComments` 去注释后匹配，归一为「小写 + 压缩空白」。本机实跑：typecheck 退出 0、探针 28 用例全过（含 X01～X09）、migration-ledger 3/3、wiki-store 5/5、整仓 infrastructure vitest 44/1（仅 storage.test.ts symlink EPERM）。下一步 B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-24：A 修正 C 四轮 M13 复核（本地 abda94e，未推送），见 [[A对C前置验证失败修正回复]]。C 确认 cece332 的 X01～X09 通过，但新增 X10/X11 两项有效定义缺口（触发器体仅为 `SELECT 'RAISE';` 字符串字面量、索引谓词字符串字面量改大写被误归一）。A 新增 `stripTrivia` 去注释与字符串字面量（RAISE 判据 `/\bRAISE\s*\(/i` 命中 `stripTrivia` 结果）、`normalizeSql` 仅字符串外小写（字符串内容原样保留，`'PREPARED'` ≠ `'prepared'`）、CHECK 判据同步改用 `stripTrivia`；探针扩至 30 用例并新增 2 项有效原 schema 控制组（c-v7 拒绝 DELETE、c-v6 拒绝重复 prepared）。本机实跑：typecheck 退出 0、探针 30 用例 + 10 追加 + 2 控制组全过、migration-ledger 3/3、wiki-store 5/5、整仓 infrastructure vitest 44/1（仅 storage.test.ts symlink EPERM）。下一步 B 接口/报告/消费适配与 A-W08 确认、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-24：A 修正 C 首轮独立前置核验（6f9287b）的 5 失败与 11 类型错误，见 [[A对C前置验证失败修正回复]]。类型门禁（`pnpm typecheck` 退出 0）、schema 约束识别（N07/N08/N09 必要列/索引 UNIQUE/partial/触发器 RAISE）、旧账本一致性（N11）、新账本读写真开前校验（N10 `verifyRegistryLedger`）均已修复；新增定向回归 `migration-ledger.test.ts` 3/3。本机实跑：typecheck 退出 0、探针 19 用例全过、整仓 infrastructure vitest 43 通过/2 既有失败（storage.test.ts symlink EPERM、wiki-store.test.ts A-W08 retryable，非本切片）。下一步 B 接口/报告/消费适配、C 完整迁移矩阵与桌面接线及 macOS 全量、A 人工发布与业务语义验收分别待完成；不代签、不自动合入/真实模型复测。

- 2026-10-22：B00a P0 独立分支 codex/b00a-knowledge-wiki-contracts，taskBase=56c909e21aefa484b6805bf9afc7c94b0e1d4576；[[B00a知识Wiki公共协议]] 已记录版本/来源/审核/检索引用/消费事务协议及 A01b 旧兼容差异。专用宿主上下文和 12 方法不可用门禁；C 范围技术复核通过（含空页游标 P2 修复，20项独立测试），A PR #6 接收清单，[PR#7](https://github.com/jacson10l/tradequote-agent/pull/7) 已推送并向 A/ssyyy31 请求评审，A 评审与合入仍待，A01c 未解锁。P1 知识运行/维护另交；真实验证以 [[B00a-业务Wiki契约补充]] 为准。

- 产品资料候选已跟进origin/codex/m1-foundation的be53b98；提交、独立评审与本机证据见 [[2026-10-21-产品资料集成验证]]，远端合并事实以该分支和PR状态为准。PR #3现已带入A01合成样本，仅样本不代表服务实现；本轮补整仓覆盖，原数据不改。

- [[2026-10-21-产品资料全流程一致性复核]]：修正费用依赖/单位/待译门禁/产出任务与审核适用性，说明书13.5新增9条衔接用例，13.6明确成员开发资料顺序；正式产品能力不因样机验收而增加。

- [[产品交互演示]]已补显式本单市场切换及包装建议/人工确认，全部为合成数据；任务 [[2026-10-21-HTML市场与包装确认]]。包装费用独立计算，数量/场景变化需重新确认，不改变正式应用完成状态。

- [[项目说明书]] 保留14章，新增询盘/依据链/本地化/包装场景详细规格与23条验收用例；HTML实际覆盖及简化逐项列明，任务 [[2026-10-21-说明书详细规格与演示对齐]]。正式能力与开发优先级不因样机而缩减。

- HTML目标对齐增量：[[2026-10-21-HTML目标对齐与依据链]] 修复新报价默认包装和修订场景继承，补受限原文识别、发布知识依据链、其他语言未支持反馈与RFQ/邮件差异。沿用独立codex/project-product-manual工作树和e0f9336基线，不改正式产品能力；本轮结果以任务/证据为准。

- 配合说明书新增 [[产品交互演示]]：experiments/product-walkthrough/index.html是自包含假数据样机，八页共用报价/知识/审批/运行状态。仅说明目标交互，不扩大正式能力；验证与交接见 [[2026-10-21-产品HTML交互演示]]。

- 新开发人员先读 [[项目说明书]]：以共同基线e0f933657c2438642b006fd1a5549fe7dc683ccd核对产品目标、两条业务流程、当前实际切片、业务/工程Wiki边界及源码/分工。编写任务 [[2026-10-21-项目说明书编写]] 仅完成文档，不改变产品能力或既有任务状态；业务下一步仍按下方收口记录执行。

- 当前收口任务：[[2026-10-21-分支收口与集成验收]]、[[分支收口与共同基线]]。用户已明确授权提交推送、完成技术评审、合入符合条件的成果及清理临时分支；整合分支codex/branch-consolidation，taskBase45a9975506030170bcb8dc770919b7cb5de89fa6，共同目标codex/m1-foundation。远端交付与清理结果以任务和Git记录为准。
- 已推送共同基线a5e04d1并汇合B00/4e8c663、A01方案/1819d9d、C01a/68455a3、独立复核/2db64b4、C01b准备/a0a30a6。B00/C01a两名独立Agent分别完成Standards与Spec复核，两分支各轴均无阻断项；这是用户授权的技术复核，不冒充人类A/C签字，T00团队业务验收仍未完成。
- 组合代码已重新通过typecheck、66项单元和含构建的5项真实Electron回归；6项工程、36项Wiki工具回归、生成/check/lint/固定基线sync也均通过，见raw/branch-consolidation-validation.json。raw非生成证据与各来源逐文件字节一致，历史日志非空行全部保留，见raw/branch-consolidation-preservation.json。旧单分支失败/通过证据保留原作用域。
- B00只有知识/检查/run契约、mock与明确不可用门禁；新业务IPC仍未开启。C01a只有纯状态机与进程内取消，Provider/Executor保持首个错误归因，提交后不撤销完成事实；无run表、新取消UI或重启恢复。
- A01业务LLM Wiki按[[A业务LLMWiki方案]]区分工程/业务知识；原件与Markdown版本、AI候选、人工审核发布、检索引用、持续维护为A-W01～10验收。[[B00a-业务Wiki契约补充]] P0/P1仍待开发，原B00不代表完整业务Wiki已就绪。
- [[C01b-存储与恢复准备]]文档已完成并推送a0a30a6，[[C01b存储接口与事务方案]]/[[C01b恢复测试用例]]仍为草案，20组恢复用例未运行。下一步B补clarification/list/控制重放口径，A确认迁移前驱和同连接提交入口，C再从更新共同分支开codex/c01b-run-persistence。
- 迁移仅1～3已实现，知识4/run5仍是A维护的预留，不能跳过前驱/填空迁移。金额确定性计算、decimal跨边界、未知非零、报价/对话/幂等/outbox事务与旧快照不可变规则保持。
- 前次收口时，A远端codex/a01-knowledge-publish/544ea51仅9个合成fixture文件，尚无同步Wiki，未纳入该次收口；不替A补签验收。A/B/C任务分支保留，已合入临时方案/验证分支才清理，其他聊天工作树不改。
- 当前策略：macOS本机需求开发优先，Windows/最终签名安装后置且未验收；按用户决定不使用Actions，保留本机检查与P0。真实DeepSeek未评估，HTTP替身不能算供应商通过。旧CI账单失败是历史，不要求恢复云端CI。
- 正式应用已有工作区、场景/CSV发布、价目表手工V1、模型设置/受限询盘修订V2/V3与差异。完整知识库、两类规则双反馈、审批/双语产出/PDF、稳定演示与双平台仍未完成。
- 赛事口径：两种语言或两类角色/场景二选一，不要求两个平台；批量鼓励、多岗位可选；差异表不替代规则反馈。P0要求每位作者同步知识/任务/log/覆盖/真实检查，不把Wiki补写转给其他成员。

- 收口交付已核对：PR#1/#2均MERGED，三个已合入临时方案/复核分支本地和远端均删除，证据raw/branch-consolidation-delivery.json。应用工作树归档请求仅返回queued，detached副本待应用处理；不影响共同代码已合入或分支清理事实。
