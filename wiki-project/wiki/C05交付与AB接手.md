---
title: C05交付与AB接手
type: process
status: active
updated: 2026-10-31
sources:
  - conversation:负责人授权提交推送C独立候选但禁止合入集成分支并恢复暖色
  - packages/contracts/src/runs.ts:1
  - packages/infrastructure/src/codex-harness.ts:1
  - packages/infrastructure/src/agent-run-store.ts:1
  - apps/desktop/src/renderer/src/theme.css:1
---

# C05交付与A/B接手入口

## 固定范围与取用

仓库jacson10l/tradequote-agent，交付分支codex/c-codex-harness；本轮代码差异基线24771fb8eb9c0ae80f29b7f9653794e3ba2886be。包含C05原生Codex接入、C05b保存DeepSeek/电脑验收、C05c会话/只读生命周期与产品界面，以及负责人最后指定的暖色回调。代码、业务Wiki、任务、ADR、覆盖清单和脱敏证据同次提交；固定代码/Wiki材料提交为d62570a3c91890cc2aeb7ed8f971b275aaeac713，已普通推送且远端回读完全一致；回执raw/c05-delivery-receipt.json绑定该提交与便携验证包。fc8c515交付回执仅补Wiki状态；用户随后要求的输入区CSS微调单列C05d，不改变原材料指纹或业务范围。

集成分支codex/m1-foundation不在本次推送ref范围，不合入、不创建发布标签、不强推，也不代A/B签认。取用者应使用独立工作树/自己的任务分支，先按固定材料审查，不把整支C分支未经评审并入集成。原集成远端观察值654fecc4d93e4630ed4a0cf42f261d0d432e23d3，不与本轮差异基线混用。

```sh
git fetch origin refs/heads/codex/c-codex-harness:refs/remotes/origin/codex/c-codex-harness
git worktree add --detach ../tradequote-c05-review origin/codex/c-codex-harness
git -C ../tradequote-c05-review log -2 --oneline
git -C ../tradequote-c05-review diff --stat 24771fb8eb9c0ae80f29b7f9653794e3ba2886be HEAD
```

收到材料固定SHA后在该工作树核对HEAD或detach该SHA，再按自己的任务新建codex/分支。只读检查不会自动重新调用真实模型。

## 代码入口与兼容边界

- 执行：packages/infrastructure/src/codex-harness.ts通过真正codex app-server原生动态工具连接固定DeepSeek Responses，配置仅由正式Main受控快照传递；缺保存配置失败，无本机连接兜底。现有商品/金额/规则/写事务继续复用。
- 公共契约：packages/contracts/src/runs.ts、events.ts，RunClient/Main/preload/mock/Worker同步；新增agent.continue、持久agent.read、resolved及结构化问答/只读结果。B需重点复核这些公开变更，见B-02。
- 存储/恢复：agent-run-store.ts、agent-run-coordinator.ts复用agent_run/事件/步骤/控制表，无新增DDL迁移。读完成没有报价提交，报价完成保留真实凭据；继续的祖先同事务收口，递归分支守卫，取消先落库，重开不重发。新状态/结果不承诺旧二进制可读，旧JSON可由新代码读取。
- 产品：workbench.tsx、agent-runs.tsx、read-assistant.tsx；用户/助手消息、独立当前运行跟随与提交后报价刷新、停止/重试/结果恢复；资料页回归导入/来源/历史，模型设置只配置。theme.css恢复统一暖色#FFF8E0，不恢复旧占位文案或内核标签。历史来源/报价不回写。

## A/B可领取事项

详细输入、交付材料、反例和验收见[[C05c-AB业务依据与契约交接]]：

| 接手人 | 接手编号 | 下一步与完成材料 |
|---|---|---|
| A | A-01 | 提供真实来源原件/版本/hash/提取位置、发布撤回事实及可复核脱敏样本，返回固定实现与作者证据 |
| A，B复核语义 | A-02 | 补适用平台/市场/品类/有效期的真实规则来源与审核发布依据；当前覆盖pending继续真实保留 |
| B | B-01 | 定义显式条款确认状态与历史兼容，复现并修复非空“未确认”从pending消失；同步规则、调用方、mock/测试，禁止C另写关键词规则 |
| B | B-02 | 非作者审查新RunClient/状态/结果及生命周期一致性和版本口径，返回固定代码意见/证据；Agent技术复核不代替B/人员签认 |

A/B提交后提供作者分支、完整材料SHA、验证代码SHA及命令/退出码、未完项；C再独立接收与macOS组合复验，涉及迁移先由A登记支持/拒绝谱系。现有候选不自动批准合入。

## 可携带验证证据与复跑

本轮最新自包含记录为raw/c05-delivery-validation.json：命令、退出码、统计摘要、环境、源码SHA-256清单及其总摘要。它不依赖作者/tmp目录才能知道结果；C05/C05b/C05c原记录仍保留，含初轮失败和真实Computer Use运行ID。原本机完整日志不进入Git；不提交真实Key、业务库、客户原件、安装包或会话。

| 材料 | 范围 |
|---|---|
| raw/c05-codex-workbench-validation.json | 首轮实际Codex工具、隔离、取消/失败恢复与工作台闭环；原模型连接范围保留 |
| raw/c05b-deepseek-computer-use.json | 保存deepseek-flash原生Responses及电脑V1/V2/取消/重开；首次失败与修正 |
| raw/c05c-session-workbench-validation.json | 澄清收口、只读停止/持久恢复、角色聊天与业务摘要；真实运行ID/900→只读250及1080 |
| [[C05-CodexHarness纠偏与工作台迁移]]、[[C05b-DeepSeek兼容与电脑验收]]、[[C05c-会话收口与只读持久运行]] | 每次实现、红绿回归、实际命令、已知边界 |
| [[C05-候选提交推送与暖色回调]] | 当前授权、暖色视觉复核、最终本机门禁及提交/远端回执 |

环境：macOS arm64，Node22.22.0、pnpm10.13.1、Electron44.9.2，实际Codex0.166.0-alpha.5.1。依赖按锁文件使用同一pnpm；原生ABI通过项目脚本准备，不混用包管理器。普通本机验证：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test --grep-invert 'real Codex completes'
pnpm check
pnpm wiki:test
pnpm wiki:check
pnpm wiki:sync --base 24771fb8eb9c0ae80f29b7f9653794e3ba2886be
git diff --check
```

原交付源码指纹可直接从固定材料提交的Git blob核对（不受接收者工作树换行设置影响，也不运行模型）：

```sh
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const material = 'd62570a3c91890cc2aeb7ed8f971b275aaeac713';
const blob = path => execFileSync('git', ['show', `${material}:${path}`], { maxBuffer: 16 * 1024 * 1024 });
const report = JSON.parse(blob('wiki-project/raw/c05-delivery-validation.json').toString('utf8'));
for (const file of report.sourceSnapshot.files) {
  const actual = createHash('sha256').update(blob(file.path)).digest('hex');
  if (actual !== file.sha256) throw new Error(`source mismatch: ${file.path}`);
}
console.log(`verified ${report.sourceSnapshot.fileCount} canonical source blobs`);
JS
```

普通单元跳过3个显式live测试；桌面回归的HTTP传输为明确fixture，不拿它们证明供应商。真实模型验证另走正式保存配置与隔离合成业务的显式入口，可能计费；当前只证实本机保存的deepseek-flash，不重发历史运行或复制作者凭据。Windows/最终签名安装未验，正式审批/导出、真实资料/规则和条款确认问题不因本次推送关闭。

关联：[[C05CodexHarness与单据工作台]]、[[C05c会话生命周期与业务对话]]、[[C05c-AB业务依据与契约交接]]、[[0032-业务会话关联与统一只读运行]]。

## 实际推送回执

固定材料[d62570a3c91890cc2aeb7ed8f971b275aaeac713](https://github.com/jacson10l/tradequote-agent/commit/d62570a3c91890cc2aeb7ed8f971b275aaeac713)包含91个源/知识/测试/证据文件，63项canonical源码指纹已从Git HEAD独立核对。普通推送新建origin/codex/c-codex-harness后ls-remote回读同SHA；集成分支前后均观察为654fecc4d93e4630ed4a0cf42f261d0d432e23d3，本次未合入、不强推、不建标签。当前Wiki回执若推进分支头，A/B仍可固定材料SHA复跑，fc8c515回执时也已核对63项源码完全一致；后续UI调整按下方独立任务和证据核对，不再要求移动HEAD等同于原材料。

## 后续输入区微调

[[C05d-输入区常驻边框与背景]]仅在原交付之上改变输入区白底与外框常驻，不改业务或聊天结构。原63项源码指纹核对示例固定使用d62570a材料提交，避免后续UI颜色更新使接手者误判原证据失真；本次补正证据另存raw/c05d-composer-validation.json。

最新配色续改见[[C05d-输入区常驻边框与背景]]：白色对话/输入区与暖色用户气泡，原橙框常驻；新证据raw/c05e-white-chat-validation.json，原d62570a/f21f403材料及验证不覆盖。A/B业务交接项不变。

下一轮执行以[[C06下一轮ABC任务书]]及[[A06-来源证据与适用规则包]]、[[B06-条款确认与运行契约复核]]、[[C06-独立准备与组合验收]]为准。A5c69b70来源说明/80行映射hash已由C只读核对，原件缺失/字段空值/人工审核仍待，不接受完整真实性闭环或整支lint全绿的推断；C只取审计摘要，不合入其维护代码，详见raw/c06-a-intake.json。

A新交付1313db918ca5b3847217a6f97ad72129b33cb187已只读核对，增量接收状态见[[C06-A1313资料接收复核]]：新SKU截图有进展，仍需修大目录行尾/样品价/来源登记hash/清单差异。原5c69b70结论只属历史固定材料；新数据未审核发布，A/B任务不收口、不合入维护或集成分支。
