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

负责人角色：C。实际领取人：本次 Codex 实施，用户已明确分配 C01。独立分支 codex/c01-agent-recovery，taskBase=45a9975506030170bcb8dc770919b7cb5de89fa6；环境 Darwin arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2。C01a已进入共同基线，C01b完成准备但尚未实现，完整任务保持 active。把当前仅能保存成功对话的Agent链路补为可取消、可重启查询、可显式重试的持久化运行；负责本批公共接线与合成/真实模型验收边界。对应T40评估、T44与T50最小集成。

## 范围

C01a先复验正式设置/真实模型两轮（有权限Key才执行），同时设计可独立测试的运行状态机；C01b实现run持久化/取消/恢复；C01c集成A/B服务/页面并补端到端回归。

真实模型评估缺凭据时记未运行，允许先交独立恢复子切片；不读取现存真实Key文件或让同事贴Key。Windows开发环境问题由C协助，最终签名安装按既有决定后置。

必须从 `origin/codex/m1-foundation` 新建独立 `codex/c01-agent-recovery` 分支；禁止直接在main/集成分支或其他成员分支开发。独立clone/worktree与具体命令见 [[三人并行开发交接]]；开工在此记录实际taskBase与机器环境。

## 接口与依赖

B00现有RunClient/AgentRun与10个新方法的未接入门禁可审阅；C后续按模块扩展Runtime/Worker白名单并接真实服务，不直接把门禁替换为假成功。 B00评审/验证见 [[B00-首批公共契约]]。

当前准备细化见 [[C01b存储接口与事务方案]] 和 [[C01b恢复测试用例]]：B补澄清正文与重开有界列表、确定控制重放口径；A确认实际迁移顺序和同连接提交入口；C实现票据隔离及运行/报价同事务。20组恢复用例尚未执行。B00/C01a已汇入本次共同候选基线，收口见 [[分支收口与共同基线]]；C01b准备原taskBase45a9975，提交a0a30a6，仅准备文档。

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
| scripts/、根package与锁文件（按需） | 仅必要本机工具链修复，先协调依赖与原生ABI，不新增Actions |
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
8. 所有代码和Wiki同步，通过本地实际检查；当前以macOS证据推进开发和合入，Windows验证后置不阻塞，未运行不得写通过；按用户决定不使用Actions或云端自动测试。

## 改动

C01a 已实现 domain 纯状态转换、AgentExecutor 进程内取消和 Provider AbortSignal；新增九项行为测试。现有 understand/revise 返回协议、报价事务、迁移和桌面 IPC 保持原接口。实现与有效来源见 [[C运行恢复实现]]，取舍见 [[0012-C01a取消与提交边界]]。

B00 C侧两轴技术评审无阻断项，复跑类型和55项单测通过；接线前须协调 waiting_input 澄清信息的持久化和重开读取。评审固定4e8c663，未代签A、未合入B00，见 [[B00-C接口评审]]。知识AI候选Markdown另等B00a，不阻塞原报价恢复。

## 验证

组合基线重新验证见 [[2026-10-21-分支收口与集成验收]]；C01b仍仅文档验收，不把下方C01a测试当恢复用例通过。

本轮安装、开工冒烟通过；修改后 typecheck、51项Vitest与含构建的5项实际Electron回归通过，使用隔离工作区/合成HTTP/Key。最终工程/Wiki generate/check/lint/sync及回归结果以 [[C01a-状态机与取消基础]]、raw/c01a-validation.json 为准。真实DeepSeek和Windows未运行；新取消UI与run强杀恢复尚未接线，不计通过。

## C01a评审跟进（历史）

PR#2的P2修复保留Provider超时/取消归因，补实际Provider＋Executor两种先后顺序回归。C01a因远端账单/额度导致startup_failure、0项检查而恢复active；需账户负责人处理Billing & plans并复跑CI后再评审合入。无workflow或账户配置改动。当前源码/证据见 [[C运行恢复实现]]、[[C01a-状态机与取消基础]]。

## 未完成项

C01b运行记录/控制幂等落库、同事务提交事实、重启中断/显式重试及C01c桌面和A/B联调仍未完成；B的澄清/list增量与A迁移4/预留5协调仍待完成，T00人工业务验收不代签。超出本批范围的完整市场文化知识、语言产出、审批/PDF、双平台签名安装仍按总计划推进。自己的Wiki知识页、本任务、log、coverage、状态更新属于本人交付，不能转给C收尾。

关联：[[首批并行接口约定]]、[[三人并行开发交接]]、[[05-三人分工与开发步骤]]。


## A01业务知识整理协作切片

新增范围来自 [[A业务LLMWiki方案]]。C01原报价运行恢复仍可独立推进，不等待整套知识库；另以小PR交知识整理适配：B00a提供KnowledgeBuildCommand/Run/Proposal后，C维护packages/infrastructure/src/knowledge-builder.ts及测试（待创建），复用受控DeepSeek配置/取消重试机制，输出带来源的候选给A校验保存。不可调用报价understand来伪装知识运行，不填虚假committedRevisionId。

输入仅为宿主选择的来源版本/目标类型/知识基线；模型只有受控读取与候选建议权限，不能审核发布。验收包括多来源结构化候选、无依据/坏引用/超限拒绝、超时/取消/重启不误发布、显式重试幂等与真实供应商单独记录。A自写对照/审核/检索/维护页面，C只做执行器/公共接线；C代码与Wiki由C同步。完整A01d依赖此切片，实际评审与代码均未发生，协议见 [[B00知识契约差距与补充]]。

## 当前本机验收决定

用户选择macOS负责人/Windows开发者分别本机验收，不再使用Actions，仓库级已关闭、C分支移除workflow。此前P2跟进中的账单恢复/CI重跑不是当前合入前提；技术评审、本机行为测试和P0 Wiki仍必需，Windows未运行保持未验证。详情见 [[C01a-本机验收与停用Actions]]。


## 当前开发平台

用户明确macOS优先，先完成需求开发，Windows验证后置；C01a当前不再缺Windows合入前置项。保留macOS本机检查/Wiki/非作者复审及B00/迁移依赖，不把Windows标通过。参见 [[0014-macOS优先与Windows验收后置]]。

## C完整职责与本轮推进

C01是T44恢复、T40评估及T50最小接线的切片，不包含C全部交付。完整C00～C07职责、依赖、产物、验收、延期与恢复条件统一见 [[双参考项目功能对照与C开发路线]]。当前共同基线be53b98已含B00/C01a及A合成fixture；B澄清/list、A迁移和同事务入口仍未齐。C01b恢复本身保持待实现，但C02a只读工具循环无需这些新接口，本轮实际编码及验证见 [[C02a-受限只读工具循环]]。后续C02b读工具按已有业务端口推进，C02c写工具等持久账本，C03事件、C04供应商、C05语言/PDF、C06知识整理及C07集成分别按清单执行；不能将它们隐含归入C01c或静默标完成。

## C02b已有商品报价子切片跟进

从C02a本地提交4a56a42开codex/c02b-catalog-quote-tools，先完成现有商品/报价与确定性核价的真实只读适配，见 [[C02b-商品与报价只读工具]]、[[C02b商品与报价只读工具]]。C02b总任务仍部分：知识/规则服务未就绪不注册，生产IPC/UI和公开入口需后续协调；本轮不改运行契约/迁移/同事务边界，C01b与R01～R20仍未完成。此进展补充C完整路线，不把只读成功当作报价保存或恢复验收。

## C02b四工具正式桌面接线

用户进一步要求实际应用可用，已在codex/c02b-desktop-read-tools以独立agent.read接四个已有只读工具到正式Worker/Main/preload/侧栏页面，见 [[C02b-Worker与桌面只读入口]]、[[C02b桌面只读助手]]。必要公共schema、导出、mock和调用方同批同步，无新迁移或业务写入；原保存路径兼容。本进展不关闭C01b/c持久恢复/取消或C02c写工具，知识/规则仍未注册，C03/真实模型仍未完成；此前“未接生产入口”仅适用于旧切片时点。
