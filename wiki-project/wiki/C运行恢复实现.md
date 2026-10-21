---
title: C运行恢复实现
type: module
status: observed
updated: 2026-10-21
sources:
  - packages/domain/src/agent-run.ts:1
  - packages/domain/src/agent-run.test.ts:1
  - packages/infrastructure/src/agent-executor.ts:1
  - packages/infrastructure/src/deepseek.ts:1
  - packages/infrastructure/src/agent.test.ts:1
  - packages/infrastructure/src/deepseek.test.ts:1
  - wiki-repo:raw/c01a-ci-startup.json:1
---

# C 运行恢复实现

当前只实现 C01a 的纯状态机与进程内取消基础。正式模型设置、询盘理解和 V1→V2→V3 在本机 Electron 使用合成 HTTP 复验；真实 DeepSeek 未运行。持久化 run、重启查询、agent.start/get/cancel/retry 桌面入口均尚未接入，不把已有成功报价重开当作完整运行恢复。

## 状态转换

domain/agent-run.ts 从公共 RunStatusSchema 推导状态类型，经 domain/index.ts 公开 transitionAgentRun(status, action)。没有复制 B00 的 AgentRun DTO，没有数据库、Electron、模型 SDK、时钟或随机依赖。非法转换抛 ACTION_NOT_ALLOWED。

| 当前状态 | 允许动作与结果 |
|---|---|
| queued | begin→running；cancel→cancelled；interrupt→interrupted |
| running | commit→completed；fail→failed；wait_for_input→waiting_input；cancel→cancelled；interrupt→interrupted |
| waiting_input | cancel→cancelled；补充输入须新 operationKey，不支持原样 retry |
| completed | cancel/retry 均保持 completed，不重新执行 |
| failed / interrupted | 仅显式 retry→queued |
| cancelled | cancel 保持 cancelled；显式 retry→queued |

纯函数只决定状态，不增加 attempt、不保存版本引用，也不启动收费请求。后续 C01b 必须在业务事务内一起写 committedRevisionId 和 completed；重启恢复只选 queued/running 标记 interrupted，不自动调度。纯转换测试通过只证明这些规则，不证明数据库恢复已经实现。

## 进程内取消与提交边界

AgentExecutor.cancel(operationKey) 是 worker 内部可复用原语，未开放 IPC/UI。execute 仍返回原 TradeResult，understand/revise 的成功语义不变。相同业务键的并发调用共用一个 Promise 和 AbortController；cancel 返回 true 表示本进程接受一次取消，重复、未知或已进入同步提交边界时返回 false。false 不能被调用方解释成“未保存”，后续正式取消接口须查询持久化事实。

每次新执行尝试拥有独立 controller。信号穿透 DeepSeekProvider.json(messages, cancellation?)，与原 45 秒 timeout 合并；发请求前拒绝已取消信号，实际 fetch 收到合并信号。取消返回 CANCELLED，超时返回 MODEL_TIMEOUT，按首先触发的信号区分原因；不回显 abort reason、认证头或供应商错误正文。已有不传 cancellation 的调用方继续可用，没有自动网络重试。Executor catch 优先保留 Provider/业务层已归因的 TradeFault（包括 MODEL_TIMEOUT/CANCELLED）；仅在异常尚未归因且取消信号已触发时兜底返回 CANCELLED。这样晚到的 cancel 不会把已确认的超时改成取消。

模型返回后再次检查取消，即使替身忽略信号并给出晚到的有效建议，也不能创建报价。通过字段校验后关闭 cancellable，紧接着执行现有同步 SQLite IMMEDIATE 提交，中间没有 await；单 worker 事件循环不会在这段同步代码间处理另一条取消消息。提交成功后不能再报告接受取消；已保存结果继续按原业务键优先回放，重开后不再次调用模型。数据库事务和迁移本轮未修改，未来 run 行与报价的原子协调仍须 C01b 完成。

## 验证与剩余范围

新增九项用例覆盖：状态/终态与显式重试，waiting_input 禁止原样重试，预取消不发请求，真实本机部分 HTTP 响应中止并断开，timeout 先于 cancel 的错误归因，并发同键取消与晚到输出，取消错误脱敏，以及提交完成到 Promise 清理之间拒绝取消和丢失响应回放。现有金额、事务回滚、版本冲突和幂等测试继续执行。

本轮实际命令与结果见 [[C01a-状态机与取消基础]] 和 raw/c01a-validation.json。真实供应商/Windows/新取消 UI/强杀后的 run 恢复未运行；不能以旧 Electron 回归替代这些验收。B00 C 评审、澄清信息恢复的待协调点见 [[B00-C接口评审]]。A/B 服务未完成前，不接假知识或规则实现。关联 [[M4模型与报价修订]]、[[C01-Agent运行恢复与集成]]、[[0012-C01a取消与提交边界]]。


## P2 归因回归与远端 CI

评审 b05f2e8 发现 Executor 在catch中先看取消信号，会覆盖真实 Provider 已返回的 MODEL_TIMEOUT。先用实际 Provider＋Executor 的可控deadline/延迟transport拒绝复现：先timeout后cancel的用例失败（期望MODEL_TIMEOUT，实际CANCELLED），先cancel后timeout通过；红色证据保留raw/c01a-p2-red.json。修复仅调整公开错误保留顺序，并新增执行器层两种先后顺序用例，逐层断言Provider和Executor返回相同code、一次请求且报价/对话/幂等记录均未生成。原通用abort异常脱敏/取消回归继续保留。

远端run39571473237以startup_failure结束，jobs/check runs均为0；经已登录GitHub运行摘要的Annotations核对，原因是账户近期付款失败或支出限额限制。需账户负责人处理Billing & plans后重新触发CI，不调整workflow掩盖。API只给BuildFailed且没有日志，CLI泛化重跑提示不能证明YAML有误。证据见raw/c01a-ci-startup.json，后续本地结果见raw/c01a-p2-validation.json；PR保持打开且不合并，C01a恢复active等待远端CI与复审。关联 [[M1验证与协作]]、[[C01a-状态机与取消基础]]。


## 当前交付方式

用户随后决定停用Actions/云端测试，仓库Actions已关闭，本切片移除两个workflow；上节远端账单/CI诊断保留为历史，不再要求付款或云端重跑才能交付。当前以适用平台本机证据和非作者复审为准，Mac与Windows分别由实际开发者执行，不改变运行恢复的未完成范围。策略与执行记录见 [[0013-本机双平台验收停用Actions]]、[[C01a-本机验收与停用Actions]]。
