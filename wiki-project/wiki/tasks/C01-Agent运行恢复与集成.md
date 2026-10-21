---
title: C01-Agent运行恢复与集成
type: task
status: active
updated: 2026-10-21
sources:
  - conversation:用户要求ABC分工文件接口依赖验收和独立分支
  - wiki-repo:wiki/首批并行接口约定.md:1
  - wiki-repo:wiki/三人并行开发交接.md:1
---

# C01-Agent运行恢复与集成

## 目标

负责人角色：C。实际领取人：本次 Codex 实施，用户已明确分配 C01。独立分支 codex/c01-agent-recovery，taskBase=45a9975506030170bcb8dc770919b7cb5de89fa6；环境 Darwin arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2。当前推进 C01a，完整任务保持 active。把当前仅能保存成功对话的Agent链路补为可取消、可重启查询、可显式重试的持久化运行；负责本批公共接线与合成/真实模型验收边界。对应T40评估、T44与T50最小集成。

## 范围

C01a先复验正式设置/真实模型两轮（有权限Key才执行），同时设计可独立测试的运行状态机；C01b实现run持久化/取消/恢复；C01c集成A/B服务/页面并补端到端回归。

真实模型评估缺凭据时记未运行，允许先交独立恢复子切片；不读取现存真实Key文件或让同事贴Key。Windows开发环境问题由C协助，最终签名安装按既有决定后置。

必须从 `origin/codex/m1-foundation` 新建独立 `codex/c01-agent-recovery` 分支；禁止直接在main/集成分支或其他成员分支开发。独立clone/worktree与具体命令见 [[三人并行开发交接]]；开工在此记录实际taskBase与机器环境。

## 接口与依赖

B00提供AgentRun和新增agent.start/get/cancel/retry协议，保留现有understand/revise兼容；A统一存储导出和迁移，run预留迁移5，落库前合入A的迁移4。状态机/Provider AbortSignal可先独立实现，不能假造A已完成。

A/B业务端口成熟后才加接线；C不写另一份规则算法或知识查询，也不要求A/B等待自己的真实模型效果。运行记录不含credentials，读取模型设置仍由Main承担。

## 负责文件

以下“待创建”是本任务计划，不代表基线已经存在；创建源码同时登记Wiki覆盖和导航。

| 文件/目录 | C的责任 |
|---|---|
| packages/domain/src/agent-run.ts、agent-run.test.ts（C01a已创建） | 纯状态转换及取消/提交边界 |
| packages/infrastructure/src/agent-run-store.ts、agent-run-store.test.ts（待创建） | 同连接持久化、恢复、尝试次数；A复核表/事务 |
| packages/infrastructure/src/agent-executor.ts、deepseek.ts及其测试（已有） | AbortSignal、终态、收费重试边界；不破坏报价幂等 |
| apps/desktop/src/main/*、preload/index.ts、workers/business.ts（已有） | 生命周期、窄桥接、A/B服务接线、密钥隔离 |
| renderer/src/features/quote-agent.tsx、model-settings.tsx、App.tsx（已有） | 运行状态/取消/恢复入口、A页面路由；A/B自写业务feature |
| tests/e2e/quote-agent.spec.ts（已有）、agent-recovery.spec.ts（待创建） | 提交前取消、提交后取消、强杀/重开、显式重试 |
| scripts/、.github/workflows/、根package与锁文件（按需） | 仅必要工具链/CI修复，先协调依赖与原生ABI |
| wiki-project/wiki/C运行恢复实现.md（C01a已创建）及本任务页 | C自己写运行语义/测试/真实供应商未运行边界 |

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

C01a 已实现 domain 纯状态转换、AgentExecutor 进程内取消和 Provider AbortSignal；新增九项行为测试。现有 understand/revise 返回协议、报价事务、迁移和桌面 IPC 保持原接口。实现与有效来源见 [[C运行恢复实现]]，取舍见 [[0012-C01a取消与提交边界]]。

B00 C侧两轴技术评审无阻断项，复跑类型和55项单测通过；接线前须协调 waiting_input 澄清信息的持久化和重开读取。评审固定4e8c663，未代签A、未合入B00，见 [[B00-C接口评审]]。知识AI候选Markdown另等B00a，不阻塞原报价恢复。

## 验证

本轮安装、开工冒烟通过；修改后 typecheck、51项Vitest与含构建的5项实际Electron回归通过，使用隔离工作区/合成HTTP/Key。最终工程/Wiki generate/check/lint/sync及回归结果以 [[C01a-状态机与取消基础]]、raw/c01a-validation.json 为准。真实DeepSeek和Windows未运行；新取消UI与run强杀恢复尚未接线，不计通过。

## 未完成项

C01b运行记录/控制幂等落库、同事务提交事实、重启中断/显式重试及C01c桌面和A/B联调仍未完成；B00合入与A迁移4/预留5协调、A实际评审仍待确认。超出本批范围的完整市场文化知识、语言产出、审批/PDF、双平台签名安装仍按总计划推进。自己的Wiki知识页、本任务、log、coverage、状态更新属于本人交付，不能转给C收尾。

关联：[[首批并行接口约定]]、[[三人并行开发交接]]、[[05-三人分工与开发步骤]]。
