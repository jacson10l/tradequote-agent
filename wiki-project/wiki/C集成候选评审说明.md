---
title: C集成候选评审说明
type: process
status: observed
updated: 2026-10-23
sources:
  - wiki-repo:raw/c-integration-dependency-audit.json:1
  - wiki-repo:raw/c-integration-migration-probe.json:1
  - packages/contracts/src/index.ts:1
  - packages/contracts/src/pending-client.ts:1
---

# C集成候选评审说明

本地评审说明，未创建或提交PR。目标codex/m1-foundation；来源codex/c-integration-candidate。本候选解决C03长期分支与共同头的公共出口/Wiki分歧，使运行恢复、多步报价、评估与持久事件可在B00a P0/产品资料共同基线上一起验证。A01c与B00a P1新服务仍未纳入，审批/导出没有因此完成。

## 提交与文件范围

起点C03=9e8695b，组合共同头654fecc，组合前共同祖先be53b98。原C侧25提交、共同侧8提交完整列于[依赖审计](../raw/c-integration-dependency-audit.json)；含A来源，禁止只摘9e8695b或把整链标为C原创。逐文件新增/修改/删除、生产源码hash和两种diff口径见[范围清单](../raw/c-integration-scope.json)。本轮唯一生产冲突修正为公共index/pending-client的功能并集，其余代码由两侧正常组合；迁移、金额、模型执行与预算文件保持C03。

以下是建议评审顺序，不是已创建的小PR，也不表示本轮逐个历史端点重新测试；当前组合测试针对整个候选。

| 顺序 | 原提交/端点 | 核对重点与知识页 |
|---|---|---|
| 1 | A资产5621db0；A01b 268eb3f/5551ef3/0f613b8；C02a 4a56a42、C02b 4324dc8/644c5ed | A贡献溯源、知识旧协议边界及四只读工具；[[A知识发布实现]]、[[C02b桌面只读助手]] |
| 2 | C02c前置67c69c7、协调4c09785 | 澄清/list/控制、迁移4→5→6、票据和同连接事务、独占Worker；[[C02c持久运行与写入前置]]、[[C02c统一运行与写账本]] |
| 3 | C02c多步0ccd72f | 确定性核价、有限规则授权、迁移7、不可变回执；[[C02c多步报价工具闭环]] |
| 4 | C04 febd14d至64f2e2d的评估/修复/报告提交 | 显式评估、失败收敛/预算/取消、旧真实31通过与17fixture区分；[[C04收口与验收边界]] |
| 5 | C03 9e8695b | 事件/业务原子提交、跨attempt seq、ID去重、只读重连及释放；[[C03持久事件与桌面重连]] |
| 6 | 本候选组合共同头654fecc | B00a P0出口与不可用门禁、严格桥接清单、两侧Wiki/历史保留、组合证据；[[C集成候选与依赖收口]] |

建议本机评审入口（完整SHA见审计）：

```sh
git log --reverse --topo-order --oneline 654fecc..9e8695b
git diff --stat 654fecc HEAD
git diff 654fecc HEAD -- packages apps tests scripts
git diff 9e8695b HEAD -- packages/contracts/src/index.ts packages/contracts/src/pending-client.ts
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm eval:model --mode fixture --output .runtime/c-integration-review-fixture
```

不运行真实模型模式；Electron回归使用临时userData和环回HTTP替身，不使用用户原工作区或凭据。重启/重连只回读，新的收费retry仍需明确人工操作。金额用decimal字符串，未知不补零，旧快照不改。

## 本机验证与限制

实际结果见[本轮验证](../raw/c-integration-validation.json)：macOS26.4/arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2；294单元、9实际Electron含build、48fixture（189替身/真实0）、45项合成HTML、4组迁移诊断与类型/工程/Wiki门禁。HTML通过只证明离线样机；迁移诊断通过只证明识别了不兼容；都不冒充正式业务/兼容验收。只读check/lint、维护36回归、固定目标/共同祖先双基线sync和源码hash以JSON最终实际结果为准。

[证据保留](../raw/c-integration-preservation.json)核对两侧旧raw/历史log、覆盖并集、锁文件、迁移1～7及受保护C运行代码。9项Electron在本候选重新运行，不能用旧C03结果代替。原构建chunk/Vite native配置警告保持记录，不因此调整预算或压低测试门槛。

## 合入前仍需明确结论

- A：A01b来源实现及C02c sourceHash修复、事务；outbox运行事件命名空间不可消费；A01c迁移冲突和可能旧v6数据库处理。新迁移整合不在本次批准范围。
- B：运行/事件公共契约及调用方、有限规则与报告语义。B00a P0历史批准不代替本次C增量复核；P1历史C复核不代替A存储批准。
- 非作者：对照实现、语义Wiki和实际机器执行证据审阅整个候选，不能只看汇总。
- 业务验收人：C04人工语义验收说明固定样本、断言、依据和实际核对范围；无全文就不宣称完整语言质量通过。

记录入口[[C集成候选-依赖与非作者签认]]与[[C04-收口签认]]，均保持待签。当前本地准备完成不等于批准推送/合入；剩余风险为未签认、未接A01c/P1/完整B01、日志保留/大规模扫描未验及Windows/安装后置。

## 9e067bf独立技术意见

后续[[C集成候选独立技术评审]]已独立审阅本候选实现/Wiki/机器证据：Standards有1项P2（诊断测试完整矩阵在默认5秒下三次全量超时），Spec无已确认问题。原作者通过记录保留为历史，新复跑293/294失败独立留证，不能称本候选已获技术批准。候选未改动，下一步修复P2并重新全量验证及独立关闭；A/B和业务人工签认仍待实际人员。
