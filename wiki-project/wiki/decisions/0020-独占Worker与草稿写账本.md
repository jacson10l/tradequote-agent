---
title: 0020-独占Worker与草稿写账本
type: decision
status: observed
updated: 2026-10-21
sources:
  - conversation:用户要求继续C02c先统一调度和Worker独占再强杀恢复与持久写工具账本且不推送
  - packages/infrastructure/src/worker-ownership.ts:1
  - packages/infrastructure/src/agent-run-coordinator.ts:1
  - packages/infrastructure/src/agent-run-store.ts:1
  - apps/desktop/src/main/worker-client.ts:1
---

# 独占 Worker 与草稿写账本

## 背景

[[C02c持久运行与写入前置]]已经有SQLite运行票据与原子报价存储，但旧生产Executor仍独立执行；直接开放新run入口会重复收费，重启恢复也可能使仍活跃的旧Worker失效。只在Main记录PID不足以证明跨进程独占，报价成功幂等也不等于每toolCall有持久身份。

## 决定

生产understand/revise与run控制共用AgentRunCoordinator，复用旧上下文生成而将保存交给run票据＋写账本；旧同步返回格式不变，终态重送不自动收费。Worker启动先在专用SQLite侧库持有OS排他锁，再开业务库/恢复，ready后接请求；宿主必须等实际exit才重建。用既有better-sqlite3，不加依赖或自创过期锁删除协议。

迁移6加prepared/committed/abandoned草稿调用账本，宿主生成toolCallId并绑定attempt/execution/session；prepare先落盘，committed回执与报价、对话、run、成功幂等同事务。失败/取消/重启废弃未提交调用；恢复不重放模型。完整行为和验证入口见[[C02c统一运行与写账本]]、[[C02c-统一调度与强杀恢复]]。

## 替代方案

放弃仅靠主进程single-instance＋进程内Map：主进程强杀后的旧Worker生命周期不受Map保护。放弃PID文件超时删锁：PID可复用，检查与删除存在竞态。放弃长期业务数据库排他事务：会阻塞真实报价读写。专用侧库只承担所有权，业务事务保持短小。未选择新原生flock依赖，避免扩大ABI/平台安装面。

放弃先保存报价再另写回执：强杀后会丢失账本事实。未把任意模型动作或多步写循环一次开放；本轮每次受限理解/修订最多一个草稿提交，发布/审批仍人工。

## 后果

新库为v6，侧库锁文件属于运行数据，不能提交。锁由OS释放，macOS真实强杀已纳入验证；Windows未验证/后置。外部进程只有遵循相同锁入口才受约束。模型计费仍无法跨崩溃恰好一次，显式retry可能再次付费。只读agent.read仍独立，无持久恢复承诺，完整C02c与公开事件继续待验收。

## 回滚方式

不降user_version、不删除账本或旧快照。若需要暂时停用新run入口，使用仍识别迁移6的兼容构建关闭入口并保留数据；修复以向前迁移/兼容实现处理。已经committed的回执与草稿永久保留。
