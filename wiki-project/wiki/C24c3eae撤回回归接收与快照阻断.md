---
title: C24c3eae撤回回归接收与快照阻断
type: process
status: observed
updated: 2026-10-31
sources:
  - packages/infrastructure/src/wiki-store.test.ts:1261
  - packages/infrastructure/src/wiki-store.ts:1528
  - packages/infrastructure/src/wiki-store.ts:1873
  - wiki-repo:raw/c-a24-reverify.json:1
---

# C24c3eae撤回回归接收与快照阻断

C接收远端codex/a01e-p3-fixes固定24c3eae96bf002ee0f6898733fff089c617f4162，独立worktree/分支codex/c-a24-maintenance-reverify，taskBase同SHA；macOS arm64、Node22.22.0/pnpm10.13.1/Electron44.9.2，冻结安装及原生ABI重建退出0。

## 结论与范围

本版相对46939c3仅新增28行wiki-store测试及Wiki，存储/domain/公共契约/桌面生产源码零差异。新增A01e-1b验证同键撤回回放、outbox与幂等各一行，C实跑A测试27/27通过。它补强了已修幂等行为的证据，没有修改上一轮快照绑定漏洞；结论仍changes_required，维护桌面入口保持关闭。

## C实际复验

从C固定b397f78的raw恢复脚本原文/config，保持断言不变：原维护12/12、旧迁移拒绝3/3、迁移10投影主键拒绝3/3通过；额外边界4/5（快照身份重绑定1失败）。pnpm typecheck退出0。命令/输出、生产diff、固定脚本与安装记录在raw/c-a24-reverify.json。

原样反例：对两条open问题取全量快照，再取states=[resolved]查询的queryHash，以前一个snapshotId配后一个queryHash和真实afterIssueId续页；服务ok并返回open问题，不符合resolved过滤。原因：只比较请求cursor.queryHash与当前查询hash，readMaintenanceSnapshot只按snapshotId加载issues_json，不核对数据库保存的workspace_id/query_hash。

合法快照重开续页、撤回完整事件的权威幂等回执/投递关联、v1不得作为v2 replacement、投影插入失败回滚这4个控制继续通过。旧13红在469已转绿，本轮没有回退，不能混写“13项仍未修”。全量494/494、旧Electron11/11属于上一轮469证据；本轮没有重跑，不冒充24上的新结果。

## 请A修正当前唯一已复现的新接线阻断

1. readMaintenanceSnapshot加载保存的workspace_id/query_hash/checked_at和issues_json，由宿主与当前工作区/规范化查询做完整绑定校验，不信任客户端自行拼接的cursor。
2. 对伪造/不匹配snapshotId、queryHash、afterIssueId返回与B对齐的明确冲突；不得静默成功返回其它过滤结果或伪造空终页。
3. 新增该原样失败反例及合法续页控制的回归，保留已通过的撤回重放与旧用例；同批更新A知识/任务/log与实际命令结果。
4. 给出包含生产修复的完整SHA，B复核新版政策，C恢复同一脚本复验后再接维护入口。C不在A源码上代改，不以单测27绿替代该反例关闭。

本轮未运行全量单元/build/桌面E2E/安装验收，不调用真实模型、不使用客户原件；单机macOS测试不代Windows或实际人员业务签认。整体C集成active/WIP，未合入。关联：[[C集成-A24维护增量复验]]、[[A01c检索引用实现]]、[[B00a知识整理与维护协议]]。

## 2026-10-31 B补充事件意见的C实测核对

C在固定24c3eae、macOS arm64/Node22.22.0/pnpm10.13.1/Electron44.9.2用真实Repository执行两例：完整撤回事件持久化于幂等回执、outbox引用及不同requestId/宿主now的回放控制通过；将返回eventId作为对应来源维护项的resolve证据得到NOT_FOUND，处理无部分写入。该证据消费链缺口已复现，假设“事件属于支持的执行证据”时用例失败；资格政策仍由B明确。脚本原文、config与输出存raw/c-a24-event-evidence.json，命令退出1，1控制通过/1失败。

B的结论需修正：事件不是完全未落库；业务事件ID与投递ID可以不同。仅统一两个ID不会自动修复readEvidenceFact缺事件读取分支，应明确可解析身份/权威事件保存及同工作区、固定目标/版本、操作类型与解决事实资格。B需避免把所有10个emit调用一概外推为同一缺陷，逐方法验证。不能仅凭重放调用点计数认定全部幂等闭环；目前C原12项通过的范围已固定。快照查询绑定在C原样反例中仍失败，不是“大体闭环”。

合入依据以C已完成的macOS27/27与额外反例分列；A自己的Windows作者结果不冒充macOS结果，B也不应忽略已有C验证。旧B报告原文保持，新意见应另录固定版本。分支堆叠可通过明确PR依赖/目标解决，已有共享分支不应默认squash/rebase强推；现阶段先交生产修复，B复核后C原脚本接收。旧历史和人员签认继续保留，维护入口仍关闭。
