---
title: C集成候选与依赖收口
type: architecture
status: observed
updated: 2026-10-23
sources:
  - wiki-repo:raw/c-integration-dependency-audit.json:1
  - wiki-repo:raw/c-integration-migration-probe.json:1
  - packages/contracts/src/index.ts:1
  - packages/contracts/src/pending-client.ts:1
---

# C集成候选与依赖收口

## 候选范围与基线

用户2026-10-23授权本地集成候选、依赖核对、组合验证和Wiki交付，不推送、不合入共同分支、不创建PR或通知他人、不发起真实模型复测。独立分支codex/c-integration-candidate，工作树/Users/jason/.codex/worktrees/c-integration-candidate/tradequote-agent；taskBase=9e8695b88f3e5d306f6aeeb362d21524818a3d12，来自C03。实际fetch后的共同头/后续PR目标为654fecc4d93e4630ed4a0cf42f261d0d432e23d3 / codex/m1-foundation；组合前共同祖先be53b98adaa25883e7699ccbf7bda9c6fe1fb0ce。

候选在本地组合C03与共同头；原C03和共同分支不移动。本次组合前，C侧有25个共同头尚未包含的提交（包括A的合成资产/A01b来源提交，不能全部署名为C原创），共同侧有8个C03尚未包含的提交。完整commit/parent/subject及16个冲突文件见[依赖审计](../raw/c-integration-dependency-audit.json)，逐文件差异见[范围清单](../raw/c-integration-scope.json)。不能仅摘9e8695b：其运行存储、工具闭环、评估与迁移5～7依赖前序成果。

本次新增生产行为仅为两侧已实现接口的兼容组合：contracts公共出口与DesktopClient同时保留WikiClient、ReadAgentClient、RunClient、RunEventsClient和ModelEvaluationClient；pending-client同时保留Wiki executeWiki与运行事件不可用门禁。既有正式preload用spread接入Wiki门禁，Runtime/Worker仍拒绝Wiki命令，未新增Wiki IPC/发布授权。mock和preload/Electron测试保留两侧断言，金额、报价版本、模型预算、run恢复和事件语义沿用C03。

## A/B最新依赖事实

| 依赖 | 实际观察 | 本候选处理 |
|---|---|---|
| A01b 4d3b213 | 旧知识服务/迁移4已通过0f613b8等来源提交进入C祖先；远端头另包含共同分支内容 | 保留现有实现及C02c的已发布sourceHash检查/反例；需A审阅，未替A签认 |
| B00a P0 ae1af9d | 远端PR #7已MERGED/APPROVED，merge共同头654fecc；只交协议、完整性校验及不可用门禁 | 从共同头纳入，3个P0专用文件与其字节一致；不声称知识服务已上线 |
| A01c dd42b05 / PR #9 | PR开放，目标A01b分支；知识迁移6与C6语义冲突；作者知识页记本机typecheck/测试未运行；review/publish/withdraw仍不可用，测试直接提升lifecycle | 排除全部新服务/迁移，不改号；兼容诊断见下节，不称A01c通过 |
| B00a P1 19d60a8 / PR #8 | PR已改向共同分支、仍OPEN、reviews=[]，请求A/ssyyy31评审；分支保留历史C范围复核及3个P2关闭证据 | 仅核对既有证据，不纳入代码、不重跑P1、不重复宣称缺少历史C复核；A签认继续待补 |
| B01 | fetch所得分支中无codex/b01-rules-feedback；当前C02c只实现B00 required/forbidden_literal范围 | 保留有限规则闭环，交B复核；不能认定完整B01、双反馈UI或输出审批已交付 |

GitHub插件对PR #7/#8返回404，不能据此判不存在；使用现有gh登录只读查询获得上述PR状态，实际命令和输出收录[组合验证](../raw/c-integration-validation.json)。历史任务中“P0未合入”“PR #8仍以P0为目标”等属于当时状态，不删除、不作为本次现状。

## 迁移6不兼容与A待确认方案

现有C迁移1～7保持C03逐字节不变。C6建立agent_write_call；C7对该表添加validation_json并建立agent_tool_step。A01c迁移序列为1/2/3/4/6，6建立knowledge_source/wiki/lifecycle/consumption；不是同一schema，也不是可以用空迁移填补的同一前驱。

本轮用两侧真实迁移函数、Electron SQLite ABI及四个独立内存库复现，见[诊断证据](../raw/c-integration-migration-probe.json)：

| 合成数据库与迁移方向 | 实际结果 | 意义 |
|---|---|---|
| A01c v6 → C v7 | SQLITE_ERROR；事务回滚，schema/user_version保持v6 | C7依赖的写账本不存在，不能直接升级 |
| C v6 → A01c v6 | 迁移器返回成功；知识四表仍未创建 | 相同user_version会静默跳过异义迁移，不能用版本号作为兼容证明 |
| C v7 → A01c v6 | DATABASE_NEWER_THAN_APPLICATION，schema不改 | 拒绝回退，不说明有双向兼容 |
| C v7 → 本候选v7 | 无DDL变化，schema相同 | 本次候选没有引入新迁移 |

探针status=passed仅表示以上不兼容预期被准确复现，不表示A01c兼容或批准合入。没有打开用户数据库或迁移实际资料。探针源码、SHA-256、A01c来源SHA均保存在依赖审计的syntheticMigrationProbe，可提取到.runtime/c-integration；按记录的dd42b05从git show取出迁移模块，再运行node .runtime/c-integration/migration-probe.mjs复现。

**提交A确认的建议，尚未执行：**保留已运行C1～7，为新的知识schema在当前尾部之后协调追加迁移；按实际表结构识别两种旧v6谱系，不只看user_version。如果存在A01c v6资料，另行审阅迁移/安全拒绝路径，不能简单把文件6改成新数字后声称数据已兼容。至少验证空库、共同v3、A01b v4、C v5/v6/v7、A01c v6及中断回滚/重开；旧quote/turn/run/回执/来源与幂等记录保持，未知保持未知。编号、兼容路径和存储归属由A确认，本页不是迁移ADR或签认。

## 证据与Wiki组合

冲突逐块保留两侧功能意图；日志保留共同目标654fecc完整字节前缀，再原样追加C03相对be53b98的独有历史；非生成raw逐文件按两侧来源验证，未修改或删除旧失败/真实报告。覆盖映射按path/pages取并集，保留A来源TXT显式纳管及共同产品HTML/B00a P0映射，生成清单重新构建，不选择一侧生成物。按贡献规范允许的PR基线，固定共同目标654fecc与原共同祖先be53b98两套sync验证目标完整范围及累计范围；taskBase=9e8695b用于任务增量差异和源码/历史保留审计，两侧日志独有历史字节均保持。

组合结果、环境、实际命令/退出码/已测源码及bundle SHA见[组合验证](../raw/c-integration-validation.json)；[保留核对](../raw/c-integration-preservation.json)验证旧raw/log/覆盖/锁文件及迁移/受保护C源码。新48点fixture报告[JSON](../raw/c-integration-fixture-report.json)/[Markdown](../raw/c-integration-fixture-report.md)与旧真实报告分开；业务31+注入17、189替身请求、真实0，不外推新供应商结果。

## 交付与后续门槛

[[C集成候选-准备与组合验证]]仅验收本地可审阅候选及证据；[[C集成候选-依赖与非作者签认]]独立保持active，A/B/非作者/业务验收均无本轮签字。[[C04-收口签认]]继续技术通过、签认待补；本次不触发新真实评估。Windows、签名安装后置且未验证。

评审按[[C集成候选评审说明]]的小组顺序核对，不能将本机绿当成批准。当前候选范围允许在A01c排除下独立评审；A01c冲突只阻塞其新服务整合，不倒推C03未实现。签认后再由用户决定推送/PR/共同分支合入。C06先等A来源/候选同事务入口与B00a P1评审合入；C05先等B输出/校验/审批契约与A术语来源。二者均没有在本次实现。

## 初始门禁修正与视觉核对

首次Wiki检查因签认任务将必需“改动”节写为“改动与待签清单”触发TASK_SECTION_改动，已修正文档标题并保留[初次失败](../raw/c-integration-initial-validation.json)，未放宽维护算法。实际Electron的[恢复截图](../raw/c-integration-recovery.png)和[多步截图](../raw/c-integration-multistep.png)已查看：中文状态、跨attempt事件/折叠列表、实际步骤与非审批检查可读，未见本次组合导致布局缺陷；均为合成工作区，不能冒充人工业务语义验收。

目标654fecc首次sync暴露APPEND_ONLY_LOG_REQUIRED：两侧独有历史均已保留，但完整字节前缀只能选择一侧。现按CONTRIBUTING允许的PR基线口径保留共同目标前缀、原样追加C独有历史，再写本任务日志；taskBase未换成HEAD，代码/证据仍以9e8695b另做增量与保留审计。最终执行固定目标654fecc与原共同祖先be53b98同步；失败过程收录初次证据，不修改维护算法来绕过分叉前缀限制。

本地准备最终结果：294单元、9实际Electron含build、48fixture（189替身/真实0）、45合成HTML、6工程、36Wiki与类型/生成/只读check/lint、固定654fecc/be53b98同步均退出0。两侧131/77份旧非生成raw不变，93个受保护C文件及3个P0专用文件符合各自来源；共同日志完整前缀、C侧独有历史块字节和两侧旧非空行顺序全部保持。范围为92个面向目标的非Wiki文件；完整来源、初次失败与最终命令/源码hash可从本页证据回读。准备任务done不关闭待签任务。


## 固定修复版最终交接

当前供审阅的完整版本为45fa03d，统一入口[[C集成最终交接包]]与[[C集成-最终交接包整理]]。原9e067bf及上述PR/待修复说法保留其历史时点；STD-001已在e6af0b2独立技术关闭并于45fa03d留证，不能回溯把原失败变为通过。固定目标654fecc..45fa03d为29提交/279路径，225项源码与已复核修复一致；最新范围/实际验证/独立复核与待签清单以交接包为准。A/B及业务人工、整体合入批准仍待实际人员；本轮不重新查询远端、不推送/合入/真实复测。
