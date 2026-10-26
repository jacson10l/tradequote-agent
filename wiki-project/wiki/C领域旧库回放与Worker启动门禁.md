---
title: C领域旧库回放与Worker启动门禁
type: module
status: observed
updated: 2026-10-26
sources:
  - packages/infrastructure/src/worker-ownership.ts:1
  - packages/infrastructure/src/worker-migration-gates.test.ts:1
  - tests/fixtures/worker-gates-host.ts:1
  - apps/desktop/src/workers/business.ts:1
  - apps/desktop/src/main/worker-client.ts:1
  - wiki-repo:raw/c-worker-migration-gates-validation.json:1
---

# C领域旧库回放与Worker启动门禁

## 固定范围与共享

按用户顺序，C先普通推送cb90e9fd1a2266327e1c4644bae1b9d1ccf2e01c至origin/codex/c-b-f4c9dfc-validation，远端完整SHA回读一致；无合入。回执见raw/c-worker-migration-gates-sharing.json。该提交包含固定B组合及C两处E2E定位修正，是本轮独立codex/c-worker-migration-gates的taskBase。原九文件121、全量455、原桌面9项等证据保留在[[Bf4c9dfc组合macOS独立复验与桌面回归]]，本轮不重写为新执行结果。

本轮限定领域有效旧库与实际Worker启动/恢复，新增八个有断言的回归；不新增报价检查、审核或发布UI。仅生产改动为WorkerOwnership的路径归一化，A迁移SQL/谱系、B公共契约/报告事务、Main/preload/UI业务接口保持原实现。

## 领域旧库与T0/T1/T2

测试用生产业务接口生成合成工作区、场景、人工发布的目录、V1/V2/V3及成功幂等、对话、outbox；数量100→120、交期变更，decimal金额与缺价null均保留。再在独立文件依MIGRATION_STEPS原DDL构建共同v3、C5、C6、C7，通过旧表实际列复制有效数据；不是从新库删表伪造旧版本，也不使用真实客户库。

| 用例 | 实际覆盖与判定 |
|---|---|
| 共同v3 | V1/V2/V3、另一份缺价草稿、成功幂等/对话/来源。迁移两次后字节字段不改；实际Worker两次重开与四条旧成功命令回放返回首次结果，无模型请求 |
| C5 | 七种run状态、多attempt、控制回执、已完成run引用真实报价。没有历史持久事件/写回执；迁移不补假历史，启动才将queued/running中断 |
| C6 | 七状态及prepared/committed/abandoned写调用。迁移仅新增validation_json=null；恢复prepared→abandoned，已提交/已废弃回执原字段保持 |
| C7 | 上述事实加真实工具步骤、交错outbox/持久事件；T0→T1原事件/步骤/身份/seq不变；启动只追加本次中断事件，重开不重复追加 |

T0是旧DDL/数据；T1是两次migrate后、尚未构造协调器；T2用测试Electron主进程启动实际business.ts的UtilityProcess，并经实际BusinessWorker查询列表/报价、回放成功请求。测试检查完整旧表值、报价JSON/hash/ID/根父关系、控制回执、步骤及账本不变、外键有效。启动仅允许活跃run中断、清execution/session、废弃prepared和每run两条现有事件（传统outbox＋持久run事件）。再次启动无重复中断，终态/澄清/attempt不改。

恢复/旧成功回放使用有计数的环回HTTP替身，四路线两次重开均0请求；另构造Coordinator的Provider factory计数0。共同v3旧成功首次被适配为completed run可以追加真实接收事件，不能误算历史事件被改写；原业务幂等结果、报价与对话仍逐值保持。

## Worker互斥缺口与修正

原WorkerOwnership只realpath父目录，再拼原文件名。实际UtilityProcess回归证明：原路径、目录符号链接都拒绝第二writer，但数据库文件符号链接生成另一个.owner，第二Worker进入ready。诊断保留raw/c-worker-migration-gates-diagnosis.json，不把初始失败删掉。

现对已存在数据库realpath整个文件，再追加.owner；新库仍realpath父目录。由此三个路径共享同一SQLite独占锁，号位、业务数据库和公共协议不变。不使用PID/过期时长猜测释放锁，也不删除别人持有的锁。范围是稳定的文件/目录符号链接及同路径；硬链接、运行中外部替换路径和不遵循入口的外部SQLite工具不在本次证明内。

F03以环回替身挂起一个真实请求，依次启动同路径、目录别名、文件别名争用者；三者均exit=1且无ready，原run保持running/attempt=1，HTTP计数仍1。等待旧Worker实际退出后才启动接替者，ready且原run变interrupted，计数仍1，无自动重发。已有SIGKILL十五屏障和桌面强杀恢复回归复用，不另写一套事务实现。

## 安全拒绝和物理边界

F04分别给C7置未知高版本、删除工具步骤不可变触发器、损坏迁移账本hash。实际Worker均在ready之前退出；Main无connected=true，workspace.get返回安全CAPABILITY_UNAVAILABLE，不包含路径、SQL或内部hash。旧schema、数据、版本、已有账本与业务数据库文件字节保持，不发生恢复或伪空工作区成功。

ownership先于preflight，因此拒绝可创建同名.owner及.owner-journal侧库；测试只允许这两个明确文件，其余目录项保持。这不是repository单独预检的“整个目录零变化”承诺；业务库副作用与锁侧库副作用分开记录。初始测试遗漏owner-journal的断言失败已保留并据实际顺序更正，未放宽业务库不变断言。

## 验证与后续

macOS arm64，Node22.22.0/pnpm10.13.1、Electron44.9.2（Electron Node24.22.0）。冻结安装成功，未改依赖。最终typecheck退出0；新八项加既有run-store、十五强杀屏障、Main client四文件共45/45；build退出0；实际Electron agent-recovery一项1/1。工程check、Wiki生成/只读check/lint、维护回归、真实cb90e9f基线sync及累计基线检查以raw/c-worker-migration-gates-validation.json为准。最终工程6/6、维护36/36和三基线sync均通过；300份旧非生成raw、202518字节旧log前缀保持。构建已有chunk size/Vite配置警告仍保留，不冒充零警告。作者自查已核对唯一既有生产变更与新增回归，实际非作者评审仍待。

这些结果关闭本次四条旧业务路线和F03/F04/F05已列子场景，不代表完整M/F/J的所有故障点、其他A/B旧业务变体或人工业务验收通过。工程Biome检查不等于业务Wiki真实lint/review服务完成。下一张切片按[[C迁移后桌面接线清单]]接“已保存报价→人工检查→报告和全部消费原子保存→双反馈→重开”；B配合公共报告契约/事务，A配合来源资格/人工发布，实际人员审核/发布/撤回与整体非作者接收仍待。

关联：[[C集成-领域旧库与Worker启动恢复门禁]]、[[C迁移联合验证用例]]、[[C迁移后运行与事件不变量]]、[[C02c统一运行与写账本]]。
