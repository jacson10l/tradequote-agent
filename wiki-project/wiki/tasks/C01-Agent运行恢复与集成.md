---
title: C01-Agent运行恢复与集成
type: task
status: draft
updated: 2026-10-21
sources:
  - conversation:用户要求ABC分工文件接口依赖验收和独立分支
  - wiki-repo:wiki/首批并行接口约定.md:1
  - wiki-repo:wiki/三人并行开发交接.md:1
---

# C01-Agent运行恢复与集成

## 目标

负责人角色：C。实际领取人：未登记，开工时填写。当前未开工，不因任务书存在标done。把当前仅能保存成功对话的Agent链路补为可取消、可重启查询、可显式重试的持久化运行；负责本批公共接线与合成/真实模型验收边界。对应T40评估、T44与T50最小集成。

## 范围

C01a先复验正式设置/真实模型两轮（有权限Key才执行），同时设计可独立测试的运行状态机；C01b实现run持久化/取消/恢复；C01c集成A/B服务/页面并补端到端回归。

真实模型评估缺凭据时记未运行，允许先交独立恢复子切片；不读取现存真实Key文件或让同事贴Key。Windows开发环境问题由C协助，最终签名安装按既有决定后置。

必须从 `origin/codex/m1-foundation` 新建独立 `codex/c01-agent-recovery` 分支；禁止直接在main/集成分支或其他成员分支开发。独立clone/worktree与具体命令见 [[三人并行开发交接]]；开工在此记录实际taskBase与机器环境。

## 接口与依赖

B00现有RunClient/AgentRun与10个新方法的未接入门禁可审阅；C后续按模块扩展Runtime/Worker白名单并接真实服务，不直接把门禁替换为假成功。 B00评审/验证见 [[B00-首批公共契约]]。

B00提供AgentRun和新增agent.start/get/cancel/retry协议，保留现有understand/revise兼容；A统一存储导出和迁移，run预留迁移5，落库前合入A的迁移4。状态机/Provider AbortSignal可先独立实现，不能假造A已完成。

A/B业务端口成熟后才加接线；C不写另一份规则算法或知识查询，也不要求A/B等待自己的真实模型效果。运行记录不含credentials，读取模型设置仍由Main承担。

## 负责文件

以下“待创建”是本任务计划，不代表基线已经存在；创建源码同时登记Wiki覆盖和导航。

| 文件/目录 | C的责任 |
|---|---|
| packages/domain/src/agent-run.ts、agent-run.test.ts（待创建） | 纯状态转换及取消/提交边界 |
| packages/infrastructure/src/agent-run-store.ts、agent-run-store.test.ts（待创建） | 同连接持久化、恢复、尝试次数；A复核表/事务 |
| packages/infrastructure/src/agent-executor.ts、deepseek.ts及其测试（已有） | AbortSignal、终态、收费重试边界；不破坏报价幂等 |
| apps/desktop/src/main/*、preload/index.ts、workers/business.ts（已有） | 生命周期、窄桥接、A/B服务接线、密钥隔离 |
| renderer/src/features/quote-agent.tsx、model-settings.tsx、App.tsx（已有） | 运行状态/取消/恢复入口、A页面路由；A/B自写业务feature |
| tests/e2e/quote-agent.spec.ts（已有）、agent-recovery.spec.ts（待创建） | 提交前取消、提交后取消、强杀/重开、显式重试 |
| scripts/、.github/workflows/、根package与锁文件（按需） | 仅必要工具链/CI修复，先协调依赖与原生ABI |
| wiki-project/wiki/C运行恢复实现.md（待创建）及本任务页 | C自己写运行语义/测试/真实供应商未运行边界 |

迁移序列/index存储导出归A，公共contracts归B；C提出diff并请对应成员复核，不并行覆盖。B owns quotes.tsx，C通过quote-agent组件接入，双反馈挂载由B负责。

## 验收

1. agent.start先落queued，后执行模型；runId/operationKey/状态可查询，Key和认证头不出现在数据库/事件/证据中。
2. 提交前取消会abort网络并阻止版本提交；取消与提交竞态用事务/临界区保证一个最终事实，已提交版本不可撤销，必须返回committedRevisionId。
3. 杀业务进程/退出应用后，queued/running恢复为interrupted；重开不自动收费重发，用户显式retry使用原operationKey。
4. 模型成功提交但响应丢失时，重试回放原版本，不额外调用模型或生成V4；同key异参拒绝，completed不可重复执行。
5. 鉴权/限流/超时/非法输出/缺事实分别保持可解释状态；取消/失败不能误报已保存，已保存不能因取消显示被撤销。
6. 真实Electron强杀/重开/取消流程和现有V1→V2→V3、共享反馈回归通过；A/B真实服务集成完成一次两类规则双反馈演示。
7. 真实DeepSeek独立记录日期/模型/脱敏输入与预期/实际/失败，不含Key或客户原件；未执行保持待验收，不能用HTTP替身冒充。
8. 所有代码和Wiki同步，通过本地实际检查；远端CI状态单独核实，未运行不得写通过。

## 改动

本轮只建立任务定义，业务实现尚未开始。领取后作者逐项记录实际文件、接口/数据影响和有效源码行号；不要保留本段占位并声称完成。

## 验证

本任务开发验证未运行。开工按交接页做环境冒烟；每个代码交付运行typecheck、相关Vitest、build、实际Electron及Wiki generate/check/lint/sync；维护工具变更补Wiki回归。记录实际命令、退出码、OS/模型/fixture范围，失败与修复证据保留。最终done须有passed验证JSON和真实语义核对，不复制基线通过记录证明新功能。

## 未完成项

业务实现、实际成员评审、对应验收均未执行。超出本批范围的完整市场文化知识、语言产出、审批/PDF、双平台签名安装仍按总计划推进。自己的Wiki知识页、本任务、log、coverage、状态更新属于本人交付，不能转给C收尾。

关联：[[首批并行接口约定]]、[[三人并行开发交接]]、[[05-三人分工与开发步骤]]。
