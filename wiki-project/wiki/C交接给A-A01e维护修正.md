---
title: C交接给A-A01e维护修正
type: process
status: observed
updated: 2026-10-30
sources:
  - wiki-repo:wiki/C267f087维护接收与剩余阻断.md:1
  - wiki-repo:raw/c-a267-maintenance-intake.json:1
  - packages/domain/src/wiki-maintenance.ts:51
  - packages/infrastructure/src/wiki-store.ts:1439
  - packages/infrastructure/src/migration-lineage.ts:492
---

# 给 A：A01e 维护修正交接

日期：2026-10-30。发起角色：C。本文供负责人转交，尚未向其他聊天发送，不代表 A 已接收或同意。

## 固定材料与结论

请先修正本轮维护与迁移阻断，再交新的固定提交供 B 复核、C 复验。A01e 保持 active/WIP，暂不合入；C 尚未开放新的 Wiki/维护桌面入口。

| 材料 | 固定位置 |
|---|---|
| C 本轮测试的 A 分支头 | `267f087490046955a0b4b1e6183caa163cc177c3` |
| A 八维护方法实现 | `dac69db4c527ee3484f3481f65c76d63649cd04c` |
| C 复核材料提交 | `9c27678849e53aaf4008c358b5e403df5cc11857`，分支 `codex/c-a01e-maintenance-intake`，目前仅本地保存、未推送 |
| C 知识记录 | `wiki-project/wiki/C267f087维护接收与剩余阻断.md` |
| C 任务页 | `wiki-project/wiki/tasks/C集成-A267维护方法复验.md` |
| 完整证据与可恢复脚本 | `wiki-project/raw/c-a267-maintenance-intake.json` |
| Wiki 检查证据 | `wiki-project/raw/c-a267-maintenance-docs-validation.json` |

C 的应用源码相对固定 A 零修改。测试使用 macOS arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2，均为合成资料与隔离数据库。

## 已验证的范围

- 原 C 阻断8/8、B补充15/15、旧B来源2/2、旧库重开/报告9/9通过，共34项。请保留这些已关闭用例和旧成功事实。
- 类型检查、构建退出0；已有真实Electron回归11/11通过，不包含新维护UI。
- 默认 `pnpm test` 两次分别491/492、484/492，存在等待/恢复/模型评估超时；额外限制2个worker后492/492通过。保留默认失败，不能改写为默认全绿。
- 固定A的 `pnpm check` 退出1：`wiki-store.ts` 导入排序及格式、`wiki-store.test.ts` 格式共3条诊断，A需修正。
- 新维护边界12例：1正常控制通过、11断言失败。新迁移约束3例：1正常控制通过、2断言失败。下表是这13项失败断言的分组，不是13个独立缺陷。

## A 负责修正

| 编号 | C 实测现象 | 修正与复验要求 |
|---|---|---|
| M01，4例 | `source.withdraw`、`wiki.resolveMaintenance`、`wiki.rebuildIndex` 首次成功后同键重试返回 `REVISION_CONFLICT`；`wiki.analyzeImpact` 同键重试产生另一报告和新增事实 | 将写信封的 `idempotencyKey` 传到事务端口；按当前权限识别并回放首次成功结果，再对新请求做OCC。摘要绑定workspace/method/规范化payload/actor/origin，排除requestId/now。同键异参拒绝，重试不新增事件/报告/任务。 |
| M02，1例 | `rebuild.operationKey` 是新随机UUID，与请求键不同 | 将重建票据绑定原请求操作键，验证响应丢失、重开和同键重试时仍返回原票据/结果。 |
| M03，2例 | 使用真实来源revisionId，但伪造sourceId或artifactHash，仍成功生成影响报告；伪sourceId还能得到错误空集 | 事务内核对来源及知识目标的完整固定身份/hash；核对替代版本同源、新旧关系。失配时不写问题、报告、事件等部分事实。 |
| M04，1例 | 任意从未存储的evidenceId可直接resolve维护问题 | 与B确认可用证据类型、归属与解决条件；载入真实证据并核实处理事实。UUID合法不能代替执行证据，新候选不能自动算已解决。 |
| M05，1例 | 持原cursor更换kinds仍返回成功，公共 `MaintenanceExchangeSchema` 拒绝该请求/响应对 | 绑定workspace、规范化queryHash、有效snapshot；换查询、伪造或跨作用域游标应拒绝，续页严格前进。 |
| M06，1例 | 首页后并发处理下一页问题，原snapshot续页直接读到更新后的version/state | 实现真正固定的候选集/事实快照，或使旧快照明确过期并返回冲突；不得只透传随机snapshotId后继续查实时列表。 |
| M07，1例 | 撤回来源后，再对同一固定来源事实分析影响，生成两个source_withdrawn问题 | 统一撤回与分析路径的规范化目标/触发事实去重键；当前两路径目标包含字段不同。重扫更新同一任务的证据/发现时点，保留原事件。 |
| N9-01，2例 | 分别删除维护问题表的去重UNIQUE、索引状态表的复合PRIMARY KEY后，只读identify和真实仓库重开都仍接受该库 | 将新六表依赖的实际唯一性/主键等约束纳入谱系识别，在WAL/升级前安全拒绝损坏库，并证明原schema/数据/账本保持；保留有效库正向控制与升级/重开。 |

N9-01的两处约束分别是：

```sql
UNIQUE(workspace_id, dedup_key)        -- knowledge_maintenance_issue
PRIMARY KEY(workspace_id, index_kind) -- knowledge_index_status
```

本轮未穷尽新六表全部FK/CHECK/索引有效定义。请按实际依赖补足，不能用旧M13绿色结果覆盖新能力。

## 索引重建另需落实的实现

源码观察：当前 `rebuildIndex` 写入ready状态、回执与事件，未见keyword/markdown_view实际投影的构建、校验和原子切换。这项尚未单独构造崩溃/旧票据覆盖反例，不计入上述13项失败断言，但索引恢复不能据此宣称完成。

请说明实际投影载体和读取方，落实构建/校验/原子切换、generation/rebuildId fencing、权威序列前进时的stale结果，以及崩溃后的回执核实与显式重建。若需调整公开契约，先与B对齐，同批更新调用方/mock/测试，不能自行复制DTO。

## 恢复 C 原脚本

同一Git仓库的worktree可直接读取本地C材料，无需切到C分支：

```sh
mkdir -p .runtime
git show 9c27678849e53aaf4008c358b5e403df5cc11857:wiki-project/raw/c-a267-maintenance-intake.json > .runtime/c-a267-maintenance-intake.json
python3 - <<'PY'
import json
from pathlib import Path
r = json.loads(Path('.runtime/c-a267-maintenance-intake.json').read_text())
for probe in r['newProbes'].values():
    for content, destination in [('scriptUtf8', 'restoreScriptPath'), ('configUtf8', 'restoreConfigPath')]:
        target = Path(probe[destination])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(probe[content])
PY
ELECTRON_RUN_AS_NODE=1 apps/desktop/node_modules/.bin/electron node_modules/vitest/vitest.mjs run --config .runtime/c-maintenance-boundary.config.ts
ELECTRON_RUN_AS_NODE=1 apps/desktop/node_modules/.bin/electron node_modules/vitest/vitest.mjs run --config .runtime/c-maintenance-migration.config.ts
```

在固定A上，两条命令均退出1；12例中1通过/11失败、3例中1通过/2失败。修正后应保持原断言并全部通过。其他clone若没有本地C提交，需要负责人提供raw附件或在获准推送后获取；本文不声称远端已有这些材料。

原34项脚本、旧库生成器及配置也在raw中。旧库必须由旧实现生成，再用新实现重开，不能用新实现生成夹具后宣称旧兼容通过。

## 本轮交付清单

1. 在自己的独立任务分支/worktree修正，记录实际taskBase和环境；公共契约与B协调，迁移继续由A维护。
2. 同批同步受影响知识页、A任务页、CONTEXT/项目状态和追加日志，生成机械清单；保留旧成功/失败证据，不覆写旧报价/消费/审核事实。
3. 运行类型、适用行为/迁移/幂等测试、构建、完整工程检查及Wiki生成/只读check/lint/真实基线sync；如改维护工具，补其回归。Windows后置且未验证，不冒充macOS验收。
4. 提供新的完整固定SHA、PR入口与依赖链、逐条修复表、实际命令/退出码/结果、Wiki/任务路径和剩余风险。PR最终集成目标为 `codex/m1-foundation`，依赖链必须明确。
5. B复核语义，C对新固定实现原样复验后再做桌面接线。实际人员审核/发布/撤回及业务签认另行完成，不由Agent代签。

PR#10仅涉及demo CSV，不能承载或替代A01e源码交付。CSV正式导入、单位与混合币种验收仍单独记录。

关联：[[C267f087维护接收与剩余阻断]]、[[A01c检索引用实现]]、[[B00a知识整理与维护协议]]、[[C交接给B-A01e契约复核]]。
