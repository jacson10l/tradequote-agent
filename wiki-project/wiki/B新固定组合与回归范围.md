---
title: B新固定组合与回归范围
type: interface
status: observed
updated: 2026-10-25
sources:
  - packages/infrastructure/src/index.ts:1
  - packages/contracts/src/pending-client.ts:1
  - packages/infrastructure/src/check-lineage-integration.test.ts:1
  - packages/infrastructure/src/wiki-check-integration.test.ts:1
  - packages/infrastructure/src/agent-run-store.test.ts:1
  - packages/domain/src/quote-checks-runtime-compat.test.ts:1
  - wiki-repo:raw/b-a910-c03-combination-validation.json:1
  - https://github.com/jacson10l/tradequote-agent/blob/03b16b76ceb336d9f37692ee8b51046e90f328a0/wiki-project/wiki/B组合固定材料接收与状态滞后.md
---

# B新固定组合与回归范围

## 来源与已关闭样本

C固定03b16b76ceb336d9f37692ee8b51046e90f328a0已接收B7f8afe6材料，按原作者范围核对121项命令、环境、九测试hash及旧A依赖，C本轮未重跑。原A-W08与两次100项接收保留。原121属于完整测试HEAD067afc283dd3026e21b5a443d90e00e9acdbbbc7、旧A b9a0af76217e57e0ab22ba927de1a1a287b1145f，保存于5cdb2b1；不改写原raw。

当前M09-L01/L02、M13-Y01/Y02/Y03已在后续C复验关闭，A910e626上107/107；X01～X11及Y10也在已测范围通过。原41f0cdc失败及“163f7a4待取得”的旧描述保留为历史，不能继续作为等待条件。完整M/F/J仍未结束，材料接收不代表新组合批准。

本次新组合固定来源：A a2b050eb74f52dc10916645bcc7a2dead02f9a72（实现910e6260af0c4d84471e665da7656dbf8133aae7）、B7f8afe6a0849da3f198bf5bf3be32180053f082d、C03b16b76ceb336d9f37692ee8b51046e90f328a0。任务基线B7f8afe6；独立工作树D:/code/tradequote-agent-b-new-combination、分支codex/b-a910-c03-combination。本地merge候选未合入main/共同分支，各对全部merge-base、实际执行HEAD/源码hash与环境记raw/b-a910-c03-combination-validation.json。

## 实际适配与业务边界

- infrastructure/index保留A迁移只读预检、executeWiki与SqliteWikiStore；B executeChecks及检查/P1协议；C runStore、AgentRunCoordinator、WorkerOwnership、旧agent方法及桌面源码。按方法/导出合并，没有整文件覆盖或复制DTO。报告/消费保持同一业务连接IMMEDIATE同步事务。
- C旧B00纯检查服务与B较完整实现同名，采用B公开实现；保留C五项测试为quote-checks-runtime-compat.test.ts，明确宿主提供每文档唯一版本、重复历史拒绝。C预保存checkDraft仍是授权用纯检查，与已保存revisionId的executeChecks分开；不自动发布或放行。
- A/B自动合并造成WikiCitationResolveInput重复声明，保留一个相同schema推断类型；pending-client及DesktopClient保留C run/event/read/evaluation和B P0/P1方法。未扩大新Wiki/P1的Worker白名单或伪造维护成功。
- C v3/v6历史库夹具改用A seedTo({lineage,version})，生产目标统一8，旧列、JSON、幂等、run/控制/写回执的原比较保留。旧顺序数组前置测试改为生产migrate拒绝缺前置schema与重复旧身份，保持拒绝前后事实相同且不创建registry。
- A迁移core与ledger测试只格式化imports/布局；规范化AST与九段SQL值核对记录在同一raw。未改变迁移判据，也未新增lint存储/review服务。

## 新组合验证矩阵

| 范围 | 可执行来源与必守断言 |
|---|---|
| 九文件完整回归 | 原九份contracts与Wiki/CheckStore/旧B7测试，原命令与新结果分开记录 |
| 同事务与全部消费 | wiki-check-integration.test.ts：全部来源引用、报告、消费、两类outbox和首次成功幂等同提交；原金额与历史不变 |
| 故障与来源失效 | 四处INSERT故障整体回滚、去掉注入可同键成功；写入时来源失效复核并回滚，参与方ID/根/版本/时点替换拒绝 |
| 旧B7业务重开 | check-lineage-integration.test.ts：真实旧SQL与业务事实升级统一8、两次重开逐表原值保持、换requestId同键回放首份报告及原时点 |
| P1回执 | 真实结构报告与P0 input/context/完整回执一致；七类字段替换拒绝，blocked/partial/failed不能批准；本组合仍无真实lint存储/review服务 |
| C运行兼容 | 原C run store/coordinator/recovery/quote工具与保留的纯检查回归；服务入口共存，未执行真实桌面/macOS |

宿主Windows x64，运行器Node22.22.0/pnpm10.13.1，SQLite测试通过Electron44.9.2/内嵌Node24.22.0（实际身份另存）。初始typecheck重复导出/旧数组API失败、第一次扩大回归的接口不兼容原输出全部保留；修正后按固定候选源码另记。Windows symlink EPERM不跳过、不写成通过；原九文件绿色不能覆盖全量失败。

最终代码提交、实际命令/退出码、测试数量、stdout/stderr、源码hash、工程/Wiki结果见同一raw和[[B01-新固定组合回归]]。新结果归属B对独立候选的作者验证，非C复跑或人员/业务批准。后续C继续完整迁移矩阵与桌面/macOS联合，A实际人工发布、人员签认和业务验收分别完成。

关联：[[B组合验证准备与固定输入]]、[[B规则检查实现]]、[[M1接口与持久化]]、[[B01-新固定组合回归]]。
