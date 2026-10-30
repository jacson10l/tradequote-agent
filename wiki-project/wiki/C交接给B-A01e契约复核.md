---
title: C交接给B-A01e契约复核
type: process
status: observed
updated: 2026-10-30
sources:
  - wiki-repo:wiki/C267f087维护接收与剩余阻断.md:1
  - wiki-repo:raw/c-a267-maintenance-intake.json:1
  - wiki-repo:wiki/B00a知识整理与维护协议.md:1
  - packages/contracts/src/knowledge-maintenance.ts:201
  - packages/domain/src/wiki-maintenance.ts:51
---

# 给 B：A01e 契约与语义复核交接

日期：2026-10-30。发起角色：C。本文供负责人转交，尚未向其他聊天发送，不代表B已确认或完成复核。

## 当前需要 B 做什么

请对照固定A实现和C实际证据，确认维护契约的业务含义，向A提供逐项修正意见；A修复后，再针对新的固定提交复核最终实现。不能仅凭schema/typecheck通过放行，也不能由C替B签认契约结论。

| 材料 | 固定位置 |
|---|---|
| C测试的A分支头 | `267f087490046955a0b4b1e6183caa163cc177c3` |
| A维护实现提交 | `dac69db4c527ee3484f3481f65c76d63649cd04c` |
| C复核材料提交 | `9c27678849e53aaf4008c358b5e403df5cc11857`，`codex/c-a01e-maintenance-intake`，目前仅本地保存、未推送 |
| 公共维护协议 | `packages/contracts/src/knowledge-maintenance.ts`、`wiki-project/wiki/B00a知识整理与维护协议.md` |
| C报告/任务 | `wiki-project/wiki/C267f087维护接收与剩余阻断.md`、`wiki-project/wiki/tasks/C集成-A267维护方法复验.md` |
| 实测与脚本 | `wiki-project/raw/c-a267-maintenance-intake.json` |

当前结论为changes_required、A01e与C集成保持active/WIP。C没有开放Wiki/维护的preload、worker和Runtime白名单，没有批准合入。

## B 已有证据与 C 新结果的边界

C在macOS arm64、Node22.22.0/pnpm10.13.1/Electron44.9.2上复跑：原C8/8、B补充15/15、旧B来源2/2、旧库/报告9/9，共34项通过。旧兼容性在本轮已测范围关闭，请勿重复列为未修复。

新增维护边界为1正常控制通过/11断言失败；新增迁移约束为1正常控制通过/2断言失败，共13个失败断言。已有Electron11/11通过，不含新维护UI。类型/build退出0；默认全量两次491/492、484/492，限制2个worker后492/492；固定A工程check还有两文件共3项格式/导入诊断。不能把局部绿色结果扩大为完整接收。

## 请逐项确认的契约与政策

| 编号 | C发现与需要B明确的结论 |
|---|---|
| M01，写请求幂等/OCC | 撤回、处理、重建的同键重试变成版本冲突，影响分析同键会重复落报告。请确认当前公开写信封的首次成功回放、workspace作用域、actor/origin权限、摘要字段、同键异参错误及OCC顺序。OCC不替代已接受操作的幂等重放。 |
| M02，重建操作身份 | 回执operationKey与请求idempotencyKey不同。请确认它应绑定原请求，而非由存储另造一把键；审核响应丢失/重开后的相同事实回读。 |
| M03，影响目标固定 | 真revisionId配伪sourceId或artifactHash也成功。请确认来源和知识目标完整身份/hash、新旧来源关系必须由宿主核实；失配不得生成成功空集或部分写入。 |
| M04，处理证据 | 随机evidenceId可resolve。请明确支持哪些已存证据、如何绑定workspace/目标/版本、何时算真正解决。新候选只算in_progress；dismiss不能恢复来源资格或旧审批。请给出正反例，A据此实现存储核验。 |
| M05/M06，列表快照 | 换kinds续用cursor仍成功，且同snapshot会读到并发处理后的新version/state。请确认查询规范化、游标作用域、固定候选集/事实、快照失效错误、空页前进规则；不能只检查单页schema。 |
| M07，问题去重 | 同一来源撤回事实从withdraw与analyzeImpact两入口生成两任务。请确认规范化目标/触发事实键、重扫证据合并、发现时点/版本及已结案问题再次发现的政策，保留事件历史。 |
| N9-01，新迁移约束 | 缺UNIQUE或复合PRIMARY KEY的库仍被identify/仓库接受。A负责修谱系与存储；B复核这会破坏何种去重/索引语义，并复跑相关报告/消费事务，不能替A批准迁移。 |
| 索引实际投影 | 源码仅见写ready状态/回执，未见实际构建、校验、切换。此为源码观察，不计入13个失败断言。请确认真实投影/降级读取、generation与票据fencing、期间新事实/stale和崩溃恢复应如何验收，避免状态schema通过被误当重建成功。 |

M05的请求和响应各自可通过单体schema，但组合被公共 `MaintenanceExchangeSchema` 拒绝。请同时审查交互级校验和存储行为，而非只核对返回对象类型。

## 报价、消费和历史适用性复核

结合新来源撤回、维护与影响分析，请在A新固定实现上核对以下行为，并记录每项实际结果或未运行：

1. 来源撤回/更新/过期后，新引用、新报告与新消费须重新检查资格；历史报告/消费仍按其固定快照回读，不改写旧报价/产出。
2. 影响扫描覆盖真实来源→知识→消费关系。未知消费者状态如实partial/failed，不推断为无影响；final历史只报告影响，不修改金额、内容或审批。
3. 报价检查与完整多来源消费登记仍在同连接事务内；任一来源/消费者核验失败，报告、消费、幂等与outbox无部分提交。
4. 同键重试保留首次结果/身份/时间；旧成功键、receipt-only回执、unknown语义与原34项绿色结果继续保持。
5. 人工处理维护项不会绕过实际阻断或自动批准新知识；Agent不获得review/publish/withdraw/resolve等人工权限。

这些是本次复核要求，不能写成已执行通过。完整新迁移损坏矩阵、真实人员语义与审批验收仍未完成。

## 如何读取与复跑证据

同一Git仓库/worktree可直接读取本地材料：

```sh
git show 9c27678849e53aaf4008c358b5e403df5cc11857:wiki-project/raw/c-a267-maintenance-intake.json
```

raw的 `checks` 保存实际命令、退出码和输出，`originalProbes`/`legacyFixture`/`legacyAndReportProbe` 保存旧脚本与生成器，`newProbes` 保存新两套脚本/config/sha256。恢复脚本及两条运行命令见同批《C交接给A-A01e维护修正》；请保持断言不变，在B自己的独立工作目录运行。

若B使用其他clone且没有该提交，需负责人转交raw附件，或待获准推送C材料后读取。本文不声称材料已经在远端，也不把缺材料当成测试通过。

## 请 B 返回的交付

- 实际复核的A完整SHA、B自己的任务分支/taskBase/机器环境；区分原267f087诊断与修正后最终复核。
- M01～M07/N9-01和索引事项逐项写：确认的契约、实际观察、阻断与否、需要A/C的改动、有效源码/证据位置。
- 对存在政策空白的证据类型/结案/重扫/消费者状态给出明确正反例；必要契约变更由B维护，同步调用方、mock和测试，不能削弱约束以让现实现状通过。
- 同批更新B相关知识页、任务页、CONTEXT/状态和追加日志，记录实际命令/退出码/结果，运行生成/只读check/lint/真实基线sync；未运行、Windows后置及人员待签如实标注。
- 向负责人交付固定材料与PR/依赖说明。A负责修实现/迁移，B负责契约及报价消费语义，C在前置问题关闭后原脚本复验并接macOS桌面入口。

PR#10为独立demo CSV；正式导入、m²单位和混合币种路径仍需单独验收，不因本轮维护契约复核而完成。

关联：[[C267f087维护接收与剩余阻断]]、[[B00a知识整理与维护协议]]、[[A01c检索引用实现]]、[[C交接给A-A01e维护修正]]。
