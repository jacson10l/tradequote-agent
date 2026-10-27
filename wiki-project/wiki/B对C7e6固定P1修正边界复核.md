---
title: B对C7e6固定P1修正边界复核
type: interface
status: observed
updated: 2026-10-27
sources:
  - packages/contracts/src/knowledge-maintenance.ts:42
  - packages/contracts/src/knowledge-maintenance.ts:93
  - packages/contracts/src/knowledge-maintenance.ts:114
  - packages/infrastructure/src/wiki-store.ts:425
  - packages/infrastructure/src/wiki-store.ts:515
  - packages/infrastructure/src/wiki-store.ts:597
  - packages/infrastructure/src/wiki-store.ts:677
  - wiki-repo:raw/b-p1-c7e6-review-validation.json:1
  - wiki-repo:raw/c-a01e-p1-blockers.json:1
  - conversation:2026-10-27用户要求A修实现B复核公共契约业务语义C复验
---

# B对C7e6固定P1修正边界复核

## 固定材料与B结论

B从C固定7e6b485c15ba7c4ec30d6495df0a58cd2088207e新建独立codex/b-p1-contract-semantics（D:/code/tradequote-agent-b-p1-corrections）。实际接受本机复核的应用代码就是该完整SHA；本轮只增补Wiki及可恢复的原始探针证据，没有改A存储、公共schema、调用方或C桌面。要求原文另从C文档固定3d21289e79a2b8f8f8de9a3a8899674c0b12c07e读取；不是把后续文档头当作应用测试SHA。

C材料来源A e7a94392af5816c4e9d7f01885bde40189030432（含b05a049）、B e5f6b1a2a4d03a83ea5264c8a4f9f524f62461b2（实际原作者测试e4649ca）、C739961a6aecf379bbdd785e9fd3bfe115ee6ade1。它是C的内容合成，并非A/B tip均为祖先的merge；实际merge-base分别为A a2b050eb74f52dc10916645bcc7a2dead02f9a72、B c6f6788d3e75f3ac9de02d95306222fb5509ca71、C739961a。A六方法/B消费方法保留依据C raw/c-a01e-p1-protected-methods.json；B相对7e6应用源码零差异，源码hash另存新JSON。

**B技术复核结论changes_required。** C原脚本/config逐字节恢复，1个正常控制通过、7个产品断言失败，退出1，与C一致。B另补15例：10通过、5失败，五例分别是lint后审核前来源更新/到期/撤回仍批准，以及publish/withdraw宿主now变化同键仍冲突；均属C已列四类，不能写成另五类问题。旧B两个公开引用资格样本在本组合2/2通过，保持关闭。尚未取得A针对本轮四类的新固定修正，不能签认未来实现。

## 完整报告与旧事实

既有KnowledgeLintReportSchema已包含reportId=receiptId、receipt、status、七类coverage、issues、error，不需新增DTO或放宽schema。七类为source_integrity、section_references、relations、scope_validity、source_updates、duplicates_conflicts、orphans。当前runWikiLint仅返回并在knowledge_lint.data_json保存WikiLintReceipt；review只readLintReceipt，不加载P1报告，故“已存回执”不能证明完整报告/覆盖成立。

A应通过既有wiki.lint/getLintReport端口保存和回读完整报告（可保留已有runWikiLint回执兼容出口）；审核事务按lintReceiptId加载权威已存报告，以KnowledgeLintReviewInputExchangeSchema核对输入/宿主，再以KnowledgeLintReviewExchangeSchema核对最终决定。仅解析renderer自报报告、或仅把receiptId相同当报告存在，均不成立。仍需真实知识revision/hash/sourceSetHash、工作区权限、human_ui、生命周期OCC和事务边界。

旧receipt-only行、既有审核/发布/成功回执必须保持。缺失完整报告时，不得用默认七类passed补齐旧记录，也不能从outcome=passed反推未存issues/error。A需给出明确的旧回执读取/升级策略：旧事实可读，但旧回执不足以发起新的批准；需要新执行并保存完整报告。不能以运行schema成功或旧人工成功结果冒充当前新报告。真实已存报告错误/缺失时拒绝新批准，旧成功重放保留；相应旧库重开与兼容测试仍待修正实现。

## B确认的问题分级与非通过语义

以下是B契约/确定性技术语义确认，实际人员对资料真实性及业务适用性的签认另行完成。每项issue保留受影响sectionIds/sourceRevisionIds和稳定issueKey，使用现有字段；不把维护队列的kind字段塞入strict lint issue。

| 事实 | coverage / issue | 报告与批准 |
|---|---|---|
| 实际head已替换所引用来源 | source_updates=issues，severity=block | 已证实失格，不能仅warning后passed |
| 来源到期（now等于validUntil也到期）或尚未生效 | scope_validity=issues，severity=block | 时间使用可信宿主now，非renderer时间 |
| 来源已撤回、引用/hash/摘录不一致 | source_integrity=issues，severity=block | 不删除旧pins或旧已存报告来消除问题 |
| 资格未知或检查无法确认 | 对应coverage=unknown，severity=unknown（有可解释问题时） | partial/unknown；不把未知解释为零问题 |
| 某类未运行 | coverage=not_run | partial/unknown；不能补造passed |
| 执行异常 | status=failed，error非null | outcome=unknown；若存储无法保存则操作失败、无成功事实 |

七类均实际完成、存在block时才是completed/blocked；若同时有unknown/not_run，既有schema规定partial/unknown，即使已发现block也保留block issue，不能为了输出blocked谎称completed。只有完整且无block/unknown才可能passed；一般warning本身可passed，但不能把上述已证实失格降成warning。approve只接受completed/passed；reject可记录真实完整的非通过报告，拒绝决定不等于批准或发布。该表未宣称当前A实现已执行七类。

## 同键重放、来源提交与撤回边界

review/publish/withdraw的业务身份包含method、工作区、actor、origin与解析后的业务payload；幂等键索引该身份。requestId是传输身份，宿主now是首次事实时间，均不应使同一业务请求冲突。重放应在执行新OCC/来源检查前取首次结果，返回首次decidedAt/occurredAt、事件/版本/IDs，不能再次写入或把当前时间覆盖首次时间。身份/业务输入不同仍拒绝；不能简单丢弃context全部字段。本机3种操作已使用键的actor/入口/业务输入变化拒绝且逐表无变化，晚时钟三个操作则都存在C/B所见冲突。

旧成功键当前保存的是含context.now的requestHash。A修改新指纹时须同时说明旧键兼容方案并测试；不可批量删除旧idempotency/改写旧result来“修复”，也不可为兼容而放过不同actor/输入。历史同键成功即使来源后来失效仍是旧成功事实，不能当新的批准/发布；新键须重新检查。

**新approve和新publish各自在自己的事务内重读实际来源head、有效期、active状态、知识hash和生命周期OCC。** 覆盖lint→review以及review→publish两个时间窗的更新/到期/撤回；失败不落新生命周期、outbox或成功幂等，既有报告/审核/发布/消费事实原样保持。不能只在lint或UI按钮前检查。记录reject可以解释失格报告；withdraw用于撤销既有发布，不应因当前来源失格反而无法撤回，仍检查人工权限、状态/OCC/时间及幂等，不等同新引用。

B补测review/publish/withdraw各自在outbox与成功idempotency两个晚写点注入异常：6/6返回STORAGE_ERROR，八张相关表完整回滚，去掉注入同键可成功且再次重放不重复。来源更新后旧review同键重放保持1/1。上述绿色只证明既有异常路径和历史重放；来源失格当前被错误视为成功，不能借异常回滚绿色宣称资格拒绝已实现。

补例复用C真实source.stage/wiki.stage→runWikiLint→review/publish/withdraw合成临时库夹具；来源更新经真实stage，到期使用宿主now，来源撤回与C相同由受控SQL更改来源状态，晚写失败由临时trigger注入。没有调用现实人员入口，也不证明source.withdraw维护服务或真实供应商资料已验收。完整消费、报告两晚写点失败、来源变更及旧B7两次重开/重放包含在本轮常规通过109项中；不能把旧104/121计入新数量。

## 本机证据、复跑与后续

Windows x64，Node22.22.0、pnpm10.13.1；Vitest5.0.5由Electron44.9.2内嵌Node24.22.0运行，实际加载SQLite3.53.4。原生重建曾依次因Python/Visual Studio缺失失败（未运行产品例）；锁定better-sqlite3 13.0.3自带prebuild可实际加载，因此没有改依赖、复制原生文件或声称重建成功。八文件回归实际109通过/8未执行、退出1：worker-migration-gates beforeAll创建symlink遇Windows EPERM；保持原测试不改断言。C117/117、Electron11/11、Wiki36是C原macOS证据，不写成本机通过。typecheck退出0。最终Wiki与工程检查见新JSON，未重跑旧121、完整迁移矩阵、桌面或macOS。

新raw/b-p1-c7e6-review-validation.json保存完整SHA、merge-base、环境、实际命令/退出码/stdout/stderr、源码hash、原C脚本与B补充脚本/config/hash、runner和失败明细。恢复脚本后按项目依赖运行，可跨平台使用Electron入口：

~~~sh
node -e "const fs=require('node:fs');const e=JSON.parse(fs.readFileSync('wiki-project/raw/b-p1-c7e6-review-validation.json','utf8'));fs.mkdirSync('.runtime',{recursive:true});for(const p of Object.values(e.probes)){fs.writeFileSync(p.restoreScriptPath,p.scriptUtf8);fs.writeFileSync(p.restoreConfigPath,p.configUtf8);}"
node -e "const{createRequire}=require('node:module');const{resolve}=require('node:path');const{spawnSync}=require('node:child_process');const electron=createRequire(resolve('apps/desktop/package.json'))('electron');const r=spawnSync(electron,['node_modules/vitest/vitest.mjs','run','--config','.runtime/c-p1-boundary.config.ts'],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});process.exit(r.status??1);"
~~~

第二条config改为.runtime/b-p1-supplement.config.ts即B补例（当前10通过/5失败）；改为.runtime/p1-source-probe.config.ts即原B资格修复两例（2/2）。C原八例当前退出1属于产品门禁，不是运行器失败。raw.runnerUtf8可恢复.runtime/verify-b-p1.cjs，使用Node22执行其original/supplement/old/targeted/typecheck/wiki/engineering各phase；完整argv以checks为准。

A仍负责实现及旧数据兼容/真实report端口，B收到A新固定SHA后再复核并复跑这些脚本与报告/全部消费/outbox/幂等回归；C按原八例独立复验后再开放入口、完成桌面/Electron/macOS及完整M/F/J。五项旧阻断、Y10及A-W08技术接收不重开。实际人员审核/发布/撤回、业务语义与整体非作者接收待，未合入。关联[[Ae7a9439接收与P1接线阻断复核]]、[[B-P1回执与来源消费复核]]、[[B00a知识整理与维护协议]]、[[B03-C固定P1修正边界复核]]。


## 本轮最终文档门禁与历史保持

Node22下pnpm check退出0（工程5通过/1 macOS专用跳过），机械生成/只读check/lint及固定7e6b485c15ba7c4ec30d6495df0a58cd2088207e同步、diff检查均退出0；本轮应用源码/映射/维护工具零差异。314份既有非生成raw逐个Git blob一致，旧log前207056字节原样保留。补充取舍见[[0030-P1报告来源资格与重放边界]]（draft，B技术确认不代人员签认）。未运行build/全量/维护回归：本轮无对应工具或应用改动；原109/8环境结果及P1/B产品红例不改。以上门禁只完成B固定复核材料，不代表A四类修正或C独立复验完成。
