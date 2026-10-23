---
title: A迁移谱系固定提交接收与前置验证
type: process
status: observed
updated: 2026-10-24
sources:
  - wiki-repo:raw/c-a-lineage-intake.json:1
  - wiki-repo:raw/c-a-lineage-native-validation.json:1
  - wiki-repo:raw/c-a-lineage-native-initial-validation.json:1
  - packages/infrastructure/src/migrations.ts:58
---

# A迁移谱系固定提交接收与前置验证

2026-10-24后续状态见[[A迁移谱系9225526复核与M13约束验证]]：A9225526已修正原类型/N07～N11样本，原12全过；M13有效约束四个子样本仍失败。下文保留本页原A9cdd13a/b9a0af7与C6f9287b的历史核验，不改写旧失败或扩为新版本结论。

已收到A方案与固定实现，进入过首轮独立前置核验，结论为changes_required；尚不能放行完整组合矩阵或桌面接线。A原探针通过保留，实际生产入口新增核验失败也保留，不把两者合并成“迁移通过”。本轮只在独立codex/c-a-lineage-validation工作树读取固定A快照、执行合成核验并保存Wiki，C生产/历史迁移、A作者分支均未修改。

## 固定材料与取得事实

| 对象 | 完整提交/入口 |
|---|---|
| C本轮基线/执行准备 | 1f6fbbbfd0e7ba8076f8d3a924779efa03818ed4；[[C迁移后运行与事件不变量]]、[[C迁移后桌面接线清单]]、[[C迁移联合验证用例]] |
| A实现 | 9cdd13a3755b4bd1d0a4ac300785021e47ed4a88 |
| A回复 | a58e97097994491a9e49c085ae9369ef9bd08019 |
| A取得并核对的远端头 | b9a0af76217e57e0ab22ba927de1a1a287b1145f，origin/codex/a01-migration-lineage；回复和状态提交不改变本次被验迁移实现 |
| A前驱 | dd42b055efd409fa3c332c6cb1997c7a7638ca62，A01c |
| C/B原谱系证据 | C45fa03d57d6fc405c2438c3b187f87838355a88b，B迁移6c76fb991f3135d6a48362c1b242e46af6641817，B回复f2dfa5fa2fd550c16057abcbdf07ec0ba23ec2ef；[[C迁移协调请求草稿-AB谱系兼容]] |

A固定链接：[ADR0029](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/wiki-project/wiki/decisions/0029-迁移谱系统一与拒绝边界.md)、[支持/拒绝矩阵](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/wiki-project/wiki/A01-迁移谱系支持与拒绝矩阵.md)、[追加设计](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/wiki-project/wiki/A01-追加迁移设计.md)、[验证计划](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/wiki-project/wiki/A01-迁移验证计划.md)、[M1～M8回复](https://github.com/jacson10l/tradequote-agent/blob/a58e97097994491a9e49c085ae9369ef9bd08019/wiki-project/wiki/A对C迁移协调草稿M1-M8回复.md)。A回复明确本人签认时间另记，本轮只接收A技术决定/意见，不填人员通过结论。

A选择schema能力识别、migration_registry(lineage,version,sql_hash,applied_at)、统一九能力/user_version=8及前置只读拒绝；11类已知谱系允许升级/统一库重开，其余按矩阵拒绝。C实际核对九段生产SQL LF指纹与原C/B证据全部相同，未发现历史SQL改写；这不等于schema/账本保护完整。实际远端/祖先/源码hash/命令见[接收记录](../raw/c-a-lineage-intake.json)。

## 核验方式与作用域

用git archive取得固定b9a0af7完整来源到本工作树忽略目录，pnpm install --frozen-lockfile退出0，锁定Node22.22.0/pnpm10.13.1，完成Electron原生SQLite准备；安装后再次逐文件核对A非Wiki源码与固定Git blob一致。没有替A修源码，也没有将A实现合入C。

分别执行：固定A原探针；固定A pnpm typecheck；Vite编译未修改A infrastructure/index供实际repository调用（构建通过不代表类型通过）；实际A migrate模块经Node stripTypeScriptTypes(mode=strip)，仅改提取模块后缀，SQL不改，以Electron44.9.2/Node24.22.0/SQLite3.53.4 darwin arm64运行。C/B旧库由各自固定原迁移函数生成，全部为独立内存库或明确合成临时文件库，无用户数据库、凭据或真实模型请求。

原A探针在本机重跑退出0，九指纹/16分类/10追加与A原报告逐项一致。其追加部分是探针内appendToTarget，不是生产migrate，也未验证migration_registry、verifyLegacyLedger或真实repository预检；原报告compatible=false保持。新增12项核验才直接调用这些生产入口，但仍是聚焦样本，不覆盖完整29用例或业务/Electron桌面验收。

## 类型检查失败

固定A pnpm typecheck退出1，共11个错误。其中新增migrations.ts的7项为未使用CAPABILITIES、capabilityId要求CapabilitySpec而调用处只有MigrationStep/身份二元组、legacyMap字符串与CapabilityId类型不一致。另4项位于与dd42b05字节相同的domain/wiki.ts及infrastructure/wiki-store.ts：WikiCitationResolveInput未从公共契约导出、基础设施未声明/解析到zod、未使用sources。分列新迁移问题与前驱未变更文件，不能将全部11项归为本次新增，也不能用Vite可剥类型运行来替代tsc。

原命令/完整输出和归属核对位于接收JSON的actualCommands/typecheck。需A修迁移类型并与B协调前驱契约/依赖，交作者侧实际复跑证据；C本次执行不等于替作者补签P0交付。

## 真实迁移/预检12项：7通过、5失败

| C本轮ID | 合成输入/动作 | 实际结果 | 判定 |
|---|---|---|---|
| N01～N05 | 空库、真实C5/C6/C7、真实B7及旧账本→A实际migrate | 到8；C控制样本SQL哨兵行保持、重复migrate登记稳定；B旧schema_migration保持 | 5通过，仅上述结构/SQL行范围 |
| N06 | B7删除quote_check_report_no_delete | 修改前拒绝，schema/数据/version不变 | 通过，原B缺触发器样本得到改进 |
| N07 | C7将agent_run.request_hash重命名 | 识别c-v7并升8，仍无request_hash；后续查询报no such column | 失败，必要列未核验 |
| N08 | C7把agent_tool_step_no_delete换为同名SELECT 1空保护触发器 | 被接受并升8；补齐合法SQL外键父行后工具步骤可删除 | 失败，同名不等于不可变保护 |
| N09 | C7把agent_write_once换为同名普通非唯一索引 | 被接受并升8；index_list实际unique=0/partial=0 | 失败，一次写保护丢失未被识别 |
| N10 | 统一8库的migration_registry common:1 hash改错，初始journal=DELETE | readonly identify未拒绝；实际repository读写打开/WAL设置后才拒绝，文件hash改变，journal变WAL | 失败，虽最终拒绝却未满足只读拒绝边界 |
| N11 | C7仍无知识四表，旧schema_migration却声称已执行知识6且hash正确 | 被接受并升8，旧矛盾账本保留而非先拒绝 | 失败，只校验已知hash未核对执行声明与schema能力一致性 |
| N12 | 实际migrate追加坏SQL | 全部DDL/registry/version回滚到原C7 | 通过，普通异常回滚样本，不外推强杀/完整事务验收 |

完整before/after schema/行/版本、错误、只读判定与文件hash、索引属性、合成删除行为、SQL指纹、实际探针源码在[最终原生核验](../raw/c-a-lineage-native-validation.json)，status=failed、进程退出1，compatible=false。第一轮N08遗漏SQL外键父行，出现夹具FOREIGN KEY错误，原[初始记录](../raw/c-a-lineage-native-initial-validation.json)及命令保留；只补合成workspace/run父行后重跑，最终12项无harnessError，N08真实“未拒绝且可删”得到证实。未删除第一次失败或修改生产代码。

## 必须收敛的实现问题与建议

1. **类型/依赖门禁**：A/B按各自职责修复上述新迁移类型与前驱契约/依赖问题，提供同一固定提交实际typecheck及适用单元结果。
2. **schema识别强度（N07～N09）**：目前capabilityStatus主要核对对象名称，只对validation_json列做显式检查；须核对必要列、真实唯一/部分索引、外键/CHECK和不可变触发器的有效定义/行为，不能用正确名称替代约束。建议将这些负向样本纳入A作者回归，不改历史SQL来迎合判据。固定源码[识别逻辑](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/packages/infrastructure/src/migration-lineage.ts#L169)。
3. **旧账本与实际能力一致性（N11）**：在只读阶段核对每条执行声明对应的真实能力及身份，矛盾先拒绝，不能只比较已知SQL hash。固定源码[旧账本校验](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/packages/infrastructure/src/migrations.ts#L304)。
4. **新账本前置校验（N10）**：新migration_registry的身份/hash/能力一致性也须在读写真开/WAL之前判定；当前仅在migrate写事务内检查hash，晚于repository的WAL设置。固定源码[预检/构造器](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/packages/infrastructure/src/index.ts#L33)、[写事务账本核对](https://github.com/jacson10l/tradequote-agent/blob/b9a0af76217e57e0ab22ba927de1a1a287b1145f/packages/infrastructure/src/migrations.ts#L374)。

这些是A实际声明的保护边界与C观察之间的差异，不是重新分配迁移编号或由C选择另一套方案。本页可供转发，未自动发给A/B。修正由实际作者同交付同步Wiki/任务/原始失败与新验证，C不在本分支代改A的迁移源码。

## 后续顺序与保留待办

A提交修正固定范围并补作者侧验证/Wiki→B确认谱系账本与报告/消费适配，P1 lint回执可按依赖并行推进→C复跑上述前置失败、完整M/F迁移矩阵，再接桌面D/J并做macOS完整组合。A01d/A01e人工review/publish仍依赖B P1，由A实现、实际人员操作；业务验收人语义与R-1实际非作者整体接收另留证。

[[C集成-迁移方案执行与联合验收]]继续active；29项用例只增加本轮N样本关联，不追填整项通过。未做完整A vitest、实际桌面或新组合全套，不以旧C294/9Electron或本轮原生Electron Node模式当桌面UI通过。[[C集成候选-依赖与非作者签认]]、[[C04-收口签认]]及A-3/AB-1等人工项不关闭；不推送、合入、创建PR、代签、发送消息或真实模型复测。本轮记录任务[[C集成-A谱系方案接收与前置验证]]仅接收与技术核验材料闭环。


## 后续修正复核入口（2026-10-24）

[[A迁移谱系9225526复核与M13约束验证]]：固定A92255261e818e6fde0687deee5544755cf9af469已独立复核：typecheck退出0、原12项12/12（含N07～N11）、新增账本Electron ABI测试3/3，九SQL指纹一致；A原探针9指纹/19分类/10追加重跑一致。M13四个有效约束子样本均失败：WHEN 0使含RAISE触发器失效、WHERE 0使UNIQUE部分索引失效、缺外键/CHECK仍接受升8，且实际写删证明保护丢失；未损坏控制组全部真实拒绝。infrastructure macOS原生44/45，A-W08 retryable分歧仍失败，原Windows symlink EPERM未在本轮复现。原类型/N07～N11仅在9225526所列样本范围可关闭，旧6f9287b失败原样保留；schema一类未满足完整M13，不批准整体迁移/接线。A补有效定义/行为判据与回归，A/B确认A-W08公共语义及B适配/P1，再由C继续完整矩阵→桌面→macOS全套；人工发布/业务/实际非作者仍待。不推送/合入/代签/发送/真实模型复测。
