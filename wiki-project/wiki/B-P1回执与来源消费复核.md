---
title: B-P1回执与来源消费复核
type: interface
status: observed
updated: 2026-10-27
sources:
  - packages/contracts/src/knowledge-maintenance.ts:42
  - packages/contracts/src/knowledge-maintenance.ts:93
  - packages/contracts/src/knowledge-maintenance.ts:114
  - packages/contracts/src/knowledge-wiki.ts:202
  - packages/infrastructure/src/wiki-store.ts:515
  - packages/infrastructure/src/wiki-store.ts:586
  - packages/infrastructure/src/wiki-check-source.ts:36
  - packages/infrastructure/src/wiki-check-integration.test.ts:164
  - wiki-repo:raw/b-p1-review-validation.json:1
  - wiki-repo:raw/b-p1-source-eligibility-probe.json:1
---

# B-P1回执与来源消费复核

## 固定范围与结论

B在独立codex/b-p1-review-consumption、D:/code/tradequote-agent-b-p1-review从C已推送c6f6788d3e75f3ac9de02d95306222fb5509ca71开工。C本地739961a无法由本轮fetch取得，人工检查/双反馈接线只按用户转述记录，不以本轮存储测试证明该桌面实现。固定C基线的P1契约、CheckStore、SqliteWikiCheckSource与已推送B f4c9dfc没有差异；未代A实现lint落库或人工服务，也未改C桌面或Worker。

P1严格输入、已存报告与审核绑定及B报告消费回归首轮七文件104/104通过，包含本轮三项新增事务/来源边界。公开引用接口另有两个实际失败样本，故整体复核仍changes_required，不能以104绿色宣称A完整服务/联合验收通过。既有五项迁移阻断、Y10及A-W08技术确认/材料接收保持原已测关闭状态，本页两项是引用资格问题。

## P1接口确认与A接入条件

| 阶段 | 必须保留的接口与宿主责任 |
|---|---|
| lint | 使用KnowledgeMaintenanceCommandSchema的wiki.lint/getLintReport；绑定revisionId/contentHash/sourceSetHash及expectedLifecycleVersion。报告完整覆盖七类，completed无unknown/not_run，有block为blocked，partial/failed只能unknown，lint成功不审核或发布 |
| 回执落库 | KnowledgeLintReport的reportId=receiptId，完整保存workspace/revision/contentHash/sourceSetHash/policyVersion/checkedAt/outcome、coverage/issues/error；成功结果、事件和幂等同事务，重放首次事实不再次运行或改写旧报告 |
| 人工审核 | 只信宿主human_ui/workspace/actor/now。事务内按lintReceiptId载入真实已存完整报告，用KnowledgeLintReviewInputExchangeSchema核对现有P0 input；构造最终决定后用KnowledgeLintReviewExchangeSchema绑定完整receipt。不可相信renderer自报report/outcome/actor，blocked/partial/failed可记录reject、不可approve |
| 发布/撤回 | 独立明确人工操作；提交时复核生命周期OCC、实际知识hash、当前来源版本/资格和适用策略。审核通过或lint通过不自动发布；撤回追加事实/更新投影，旧知识正文、旧报价、旧报告、消费、旧成功回执不重写 |

现有schema不会证明数据库已保存、actor现实身份、当前来源资格或人员实际审核。这些仍由A存储/服务及C可信入口实现；不新增DTO绕开既有绑定，不由B编号迁移。来源/规则变更后需要新报告或新回执时，不得覆盖旧证据。具体服务失败回滚、重开、同键重放和实际人工入口仍待A固定实现后联合验证。

## 来源变化与报告/消费行为

| 变化 | 本轮已核对的B行为 |
|---|---|
| 来源新版本/撤回/到期 | 仍指向该来源的知识用于新检查时SOURCE_CONFLICT且无半份报告/消费/事件/成功幂等；旧报告、完整消费、同键首次结果保持，重开可回读 |
| 最新知识过期/撤回 | 新检查不回退更旧知识，缺覆盖如实pending，不编造消费；旧报告不随现态改写 |
| 引用或存储损坏 | 新检查拒绝；已存消费篡改则历史读取/重放也报存储错误，不能把损坏当有效旧证据 |

本轮新增两处晚失败：两个知识段落、四个来源已进入报告与完整消费，内部消费事件/成功回执写入后，外层quote.check事件或外层成功幂等失败。逐表比较quote_check_report/knowledge_consumption/outbox/idempotency全部原行，均整体回滚；去掉注入后同键成功且两段四来源完整保存，重开/回放不重复。新增来源到期边界用CheckStore可信时钟，在validUntil相等时新请求拒绝，原完整报告/消费及成功回执保持。fixture仅增加sourceValidity选项，生产代码未变。

## 交A的两个公开引用资格缺口

| 样本 | 固定c6f6788上的实际结果 | A需处理的边界 |
|---|---|---|
| B-P1-A01 来源更新后新引 | 先合法解析v1，source.stage成功写v2后，wiki.resolveCitation(new_reference)仍返回v1且eligible=true，公共schema也接受 | 公开解析/审核/发布须核对当前来源head，不能仅核旧sourceRevision自身hash和active状态；新引要返回合规拒绝 |
| B-P1-A02 来源到期后历史解析 | 过期前控制组合法；到期后history仍声称eligible=true，公共schema因来源失效拒绝整个成功结果 | history必须保留旧revision/source原文与pins，同时准确返回当前eligibility=false；不能为过schema删除历史或放宽公共约束 |

定位是SqliteWikiStore.resolveCitation/eligibility：只对知识validity和sourceStates进行资格计算，未把来源有效期及当前head纳入；B的SqliteWikiCheckSource另外复核head并解析公共schema，因此保存新报告的路径会安全拒绝，不能因此忽略A独立接口缺口。A服务修正后应复跑两例及B事务回归，再以实际已存lint报告测试来源在lint后、审核前、发布前变化的拒绝与回滚。

两个有效控制组先通过，失败不来自未发布空夹具或无效hash。fixture通过真实stage暂存后直接修改合成lifecycle模拟发布，非真实人工发布；只证明上述技术路径。完整脚本、配置、hash、输出/退出1与结构化观察在raw/b-p1-source-eligibility-probe.json；最初运行器包解析失败另保留在主验证JSON，修正后才出现两个产品断言失败。正常104项与这两项反例分开归档，没有隐藏为全绿。

## 复跑与交接

依赖按项目Node22.22.0/pnpm10.13.1安装。主JSON保存七文件Vitest实际argv，均通过Electron44.9.2内嵌Node24.22.0执行，避免SQLite ABI不匹配。反例从本页固定B提交的raw恢复到忽略目录后可单独重跑：

```sh
node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('wiki-project/raw/b-p1-source-eligibility-probe.json','utf8'));fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/p1-source-probe.test.ts',p.scriptUtf8);fs.writeFileSync('.runtime/p1-source-probe.config.ts',p.configUtf8);"
node -e "const {createRequire}=require('node:module');const {resolve}=require('node:path');const {spawnSync}=require('node:child_process');const electron=createRequire(resolve('apps/desktop/package.json'))('electron');const r=spawnSync(electron,['node_modules/vitest/vitest.mjs','run','--config','.runtime/p1-source-probe.config.ts'],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});process.exit(r.status??1);"
```

本轮Windows作者验证不代C独立macOS或739961a桌面验收。A真实lint存储/review/publish/withdraw、两项资格修正、C新固定接线与Electron联合、实际人员审核/发布/撤回/业务语义确认及整体非作者接收分别待完成。见[[B02-P1回执与消费复核]]、[[B00a知识整理与维护协议]]、[[B规则检查实现]]。


## 最终本机证据

最终作者测试代码固定e4649ca5e3f1cdb3a65c2baec6b44da3f82d8e5f；七文件104/104、typecheck、build、pnpm check均退出0（工程5通过/1 macOS专用跳过）。Wiki生成252文件、只读check、lint（247页/219语义页）、固定c6f6788d3e75f3ac9de02d95306222fb5509ca71同步（2测试源码/8知识页/1任务）及diff退出0。A公开资格反例仍0/2、退出1，两个有效控制通过，无运行器错误；完整脚本/config及hash/结构化观察已保存。303份旧非生成raw原字节及原log前缀保持，所有生产契约/存储文件未变。未运行完整单元、维护回归、C739桌面或macOS联合，理由与范围在新JSON中明确。整体review=changes_required，不标done或发布就绪。


## C7e6固定实现后续复核

2026-10-27 B在C固定7e6b485c15ba7c4ec30d6495df0a58cd2088207e原样复跑P1：1控制通过/7产品失败，补15例10通过/5失败（审核前来源更新/到期/撤回，publish/withdraw晚钟重放），仍changes_required；原B两资格修正2/2保持关闭。B明确现有完整报告/两Exchange契约、已证实失格block与未完成unknown、身份绑定/首次重放、事务内来源资格及旧事实兼容；不改A实现。Windows八文件109通过/8 Worker因symlink EPERM未执行，typecheck通过，不能套用C macOS117。详见[[B对C7e6固定P1修正边界复核]]、[[B03-C固定P1修正边界复核]]与raw/b-p1-c7e6-review-validation.json。A交新固定修正后B再复核、C独立复验和桌面；完整矩阵/macOS/人员/业务验收仍待，旧五项/Y10/A-W08技术接收保持。

以上c6f6788上的104项及两公开资格失败是历史；本轮已取得739961a以及A修正e7a9439，两资格问题在固定C组合再次2/2通过，不再待旧修复。当前待的是新四类P1门禁及A固定修正；B未签认这些实现，补充异常回滚通过不等于来源失格拒绝已实现。
