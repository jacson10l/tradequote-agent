---
title: 0031-DeepSeek原生Responses与运行报告复用
type: decision
status: observed
updated: 2026-10-31
sources:
  - conversation:继续验证现有DeepSeek配置接入Codex并用ComputerUse检查偏离
  - packages/infrastructure/src/codex-harness.ts:1
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - tests/fixtures/codex-provider-host.cjs:1
  - https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
  - https://api-docs.deepseek.com/guides/responses_api/
---

# 0031 DeepSeek原生Responses与运行报告复用

## 背景

C05指定真实Codex执行中心，但旧设置只证实Chat接口。官方现已提供原生Responses及Codex集成；本机已保存deepseek-flash需实测，不可由接口名称推断。Computer Use发现当前阶段提前调用使整turn终止，以及自动运行检查已保存却在单据和回复显示缺失。

## 决定

保留现有Main受控设置/密钥存储，工作台优先使用保存模型，由Codex子进程原生Responses连接固定DeepSeek根端点；Key仅在子进程环境，不写全局Codex配置、argv、公共command或业务持久化。存在配置却失败不静默回退。当前保存模型真实验证后只承诺该型号和已测场景。

已注册但当前阶段不可用工具返回失败和当前工具列表给Codex纠正，纳入原12次预算；不执行该工具，不放宽未知工具或写入授权。报价检查面板/回复草稿在正式列表成功为空时复用持久run的严格版本绑定报告；有正式报告或读取错误时仍遵循原路径。重试派发至返回期间由父工作台锁定，成功绑定后执行锁继续接管。

## 替代方案

Chat→Responses转换代理会引入额外协议实现，且不能证明原生兼容，未采用。另存一份人工检查记录或复制规则会制造两套真相，未采用。所有阶段错误都直接终止使实际DeepSeek正常纠正能力无处生效；直接允许工具提前执行则破坏事务约束，均未采用。

## 后果

宿主内凭据参数与launch env seam改变，公共业务DTO和数据库迁移不新增。Computer Use使用正常Electron/Main与现有业务服务，只隔离合成库和浏览器会话。模型设置的连接控制仍单独是Chat探针，实际Codex验证需要工具闭环。只读仍无持久取消/恢复；B“未确认”语义、A真实来源和完整业务签认保持待办，不由本决策关闭。

## 回滚方式

可撤回本轮供应商选择与报告fallback，回到本机Codex连接和原正式报告查询；保留已有DeepSeek设置、冻结报价/run与历史失败，禁止重写旧快照或静默换执行器。候选仅本地，未推送或合入。

关联：[[0030-CodexHarness优先与工作台业务中心]]、[[C05CodexHarness与单据工作台]]、[[C05b-DeepSeek兼容与电脑验收]]。
