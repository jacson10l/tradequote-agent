---
title: Bf4c9dfc组合macOS独立复验与桌面回归
type: process
status: observed
updated: 2026-10-26
sources:
  - packages/infrastructure/src/index.ts:1
  - tests/e2e/quote-agent.spec.ts:1
  - tests/e2e/multistep-agent.spec.ts:1
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - wiki-repo:raw/c-f4c9dfc-intake.json:1
  - wiki-repo:raw/c-f4c9dfc-e2e-diagnosis.json:1
  - wiki-repo:raw/c-f4c9dfc-matrix.json:1
  - https://github.com/jacson10l/tradequote-agent/commit/f4c9dfcfd3f656bb57b83d33f9ce13db2d8089cd
---

# Bf4c9dfc组合macOS独立复验与桌面回归

## 固定输入与结论

已fetch并以ls-remote核对B远端固定f4c9dfcfd3f656bb57b83d33f9ce13db2d8089cd，包含ee71a0f。实际B自验代码ceec0ee4e329d891aad1855a42414256762e367c至f4c9dfc无非Wiki差异；本轮开始时253份非Wiki文件与固定Git blob逐字节一致。独立C分支codex/c-b-f4c9dfc-validation，taskBase=f4c9dfc，工作树/Users/jason/.codex/worktrees/c-b-f4c9dfc-validation/tradequote-agent；不把父来源或旧121当作本轮测试HEAD。

固定来源为A a2b050eb74f52dc10916645bcc7a2dead02f9a72（实现910e6260af0c4d84471e665da7656dbf8133aae7）、B7f8afe6a0849da3f198bf5bf3be32180053f082d、C03b16b76ceb336d9f37692ee8b51046e90f328a0。B已更正五项旧阻断/Y10与121归属，原“待B更正/候选未推送”不再是当前阻塞。旧C材料接收范围与新C独立运行分别记录。

C已在macOS独立通过新组合121/121、全量455/455、维护36/36、工程6/6与历史迁移回归。原正式桌面9项先7通过/2失败，根因为新增QuoteChecks多个alert令两处全局定位器歧义；C仅修两E2E定位器，不改候选生产代码或原断言，正式原九项随后9/9通过。此限定基础复验闭环完成，不等于完整迁移/新知识和检查桌面接线/人员验收完成。

环境macOS26.4 arm64，Node22.22.0/pnpm10.13.1；按锁文件安装与native重建，原生SQLite走Electron44.9.2/Node24.22.0/SQLite3.53.4。仅独立合成库/HTTP fixture，无真实Key/客户原件/真实模型调用；不生成安装验收结论。

## 证据与来源保留

独立核对B保存的ceec0ee执行HEAD、九测试hash、原始输出、A/B/C来源和B最终结果；旧Windows全量454/455、维护34/36以及跨盘运行器失败保持原文，不反填为通过。A两迁移core及ledger测试与固定A归一AST一致，九段SQL值逐项与前轮C匹配。

A78/B108/C254份非生成raw逐字节核对，只有原同名探针按B声明另存A新版本到a01-migration-lineage-probe-a2b050e.json，B原路径保持；A/C日志非空行顺序保持、B完整字节前缀保持。C本轮基线290份旧raw和原log完整字节前缀保持。生产源码及原九测试不变，仅两个C负责的E2E文件发生定位器/格式变化。完整manifest、hash与命令保存在intake，旧来源JSON不重写。

## 实际结果与边界

| 检查 | 本轮实际结果 | 说明 |
|---|---|---|
| 新组合九文件 | 121/121，退出0 | C独立运行，不是转述B自验；含报告/完整消费/事务失败/来源失效/旧B7业务重开与幂等/P1协议 |
| 全量单元 | 51文件455/455，退出0 | 原Windows storage symlink样本在本机通过，未跳断言 |
| Wiki维护 | 36/36，退出0 | 原Windows两symlink样本通过，工具未改 |
| 工程检查 | 6/6、边界/只读Wiki通过 | macOS原生名称检查实际执行，无Windows跳过项 |
| 迁移原入口 | 12/12 | 真实组合repository/migrate/只读identify |
| X01～X11 | 原4+5+2各组通过，11/11 | 含有效约束行为控制 |
| 六/七/八轮 | 7/7、6/6、3/3含控制 | Y04a/b、Y05/06、Y07～09及Y10均保持安全拒绝 |
| 原107矩阵 | 107/107 | 原五项保持，10路线选定80异常点与C7四次真实SIGKILL通过；不是完整M/F父矩阵 |
| 原桌面套件 | 首次7/9、退出1 | 两处全局alert严格模式错误，原失败留证 |
| 仅定位器诊断 | 两测试副本2/2 | 位于忽略目录，操作/断言/超时均不变 |
| 正式桌面修复版 | 含构建9/9，退出0 | 原9项重跑，包含强杀恢复/显式重试/不可变版本/重开；仅两定位器修正 |
| typecheck | 修改前后退出0 | 最终工程及Wiki门禁另记wiki-validation |

八份迁移探针只替换固定来源标签，断言完全保留。其旧ACommit字段是历史探针命名，当前指向组合migration来源f4c9dfc；新增testedCombinationCommit和完整源码manifest标明实际测试对象，不能误读为未组合的纯A验证。syntheticSQLFixture仍只证明SQL事实保留，领域有效回放另看实际服务测试，不把107项等同全业务验收。

## 两处桌面定位器修正

QuoteChecks为每个报价版本显示独立服务不可用提示，均有role=alert。原quote-agent.spec.ts和multistep-agent.spec.ts用全页面getByRole('alert')，分别同时命中5/3个规则面板提示，Playwright严格模式先失败，目标模型错误/阻断断言未能完成。

先保存原7/9退出1与完整错误输出，按diagnosing-bugs流程在.runtime/diagnostic复制原两个测试，唯一改动为给alert增加“DeepSeek 询盘与对话”区域。副本2/2通过，包括后续无新版本、鉴权失败、强杀重开/重试与旧版本保持；说明本次失败由定位歧义引起，未确认新的业务保护失效。

C随后将相同修改落入原两个E2E测试并重跑原九项，9/9通过：

```ts
page.getByRole("region", { name: "DeepSeek 询盘与对话" }).getByRole("alert")
```

既有toContainText('模型建议未通过字段校验')、toBeVisible及后续业务断言不变；不使用first()/跳过断言、延长时限或压制规则提示。最后仅Biome换行，独立AST比较证明最终两测试与已执行修复版语义完全一致。原候选生产代码、规则资格、金额、数据库及Worker白名单均不改。完整前后源、hash、诊断命令和正式失败/通过见e2e-diagnosis。

本轮有一个忽略目录AST审计运行器初次传错execFileSync参数而退出1，纠正encoding对象后通过；原输出另存，不归为产品失败。无debug日志进入源码。代表性截图已查看，合成多步保存/恢复及V1→V3差异可见；“检查服务尚未接入”仍如实显示，不能据此宣称新报告桌面服务已接通。

## 当前关闭与仍待完成

本轮解除“无可读固定组合”“C未独立运行121/组合基础单元”和原Windows EPERM在macOS的验证缺口。五项旧阻断、Y10与A-W08技术确认保持关闭/已接收。B/C共享公开出口在本机组合服务测试可共存，但真实lint持久化/review服务仍未实现，新Wiki/Check/P1的Main/Worker/preload入口尚未因此开放；原桌面9项通过不能替代D01～D12的新业务接线。

完整F01/F02所有检查点、F03～F07剩余组合路径、M14 T2、领域有效M02～M08全部变体、完整J01～J08、新业务桌面接线、实际人工review/publish/withdraw、人员/业务验收、Windows新修复版和签名安装仍待。正式C总实施任务active；本任务done只限本轮明确基础复验和两定位器修正。

C同交付同步M4、C02c知识页、任务/当前状态/矩阵/导航/log，并运行generate/check/lint/实际taskBase及共同/累计sync，维护36回归已实际执行。结果见raw/c-f4c9dfc-wiki-validation.json。暂未推送、合入或发送其他聊天消息。

关联：[[C集成-Bf4c9dfc组合独立复验]]、[[C迁移联合验证用例]]、[[B新固定组合与回归范围]]、[[C集成-迁移方案执行与联合验收]]。
