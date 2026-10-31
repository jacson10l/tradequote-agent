---
title: Cfdd571a快照绑定独立复验
type: module
status: observed
updated: 2026-10-31
sources:
  - packages/infrastructure/src/wiki-store.ts:1528
  - packages/infrastructure/src/wiki-store.test.ts:1470
  - wiki-repo:raw/c-fdd571a-reverify.json:1
---

# Cfdd571a快照绑定独立复验

C在独立任务分支codex/c-snapshot-binding-reverify接收固定提交fdd571a6a441327a94ce574f7180f8db9b9c8728，复用C独立工作目录及已安装的锁定依赖（macOS arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2）。本轮不修改A存储、契约、迁移或桌面实现。A远端分支随后新增f20cfb7交接文档，不包含在本轮固定验证对象中。

生产修复来自2a61261；fdd571a补原样反例。readMaintenanceSnapshot从数据库读回workspace_id、query_hash及冻结问题，getMaintenance续页同时核对宿主工作区、规范化查询和已存快照，拒绝换绑返回REVISION_CONFLICT。客户端queryHash不再作为快照所属查询的权威事实。没有新迁移或DTO。

C未改断言，原样复跑.runtime/c-p2-extra.test.ts：把open快照ID配resolved查询与其合法queryHash的反例已被拒绝，含合法续页/重开、索引投影回滚和旧版本replacement控制共5/5通过。原维护12/12、旧迁移3/3、新投影迁移3/3以及A作者测试28/28均在本机通过，typecheck退出0。完整原脚本、配置、命令与原始输出保存在raw/c-fdd571a-reverify.json，可分别恢复到.runtime下通过对应config运行；历史24c3eae的失败原文保留在原C分支，不改写成通过。

因此仅关闭C原“快照ID与查询绑定”技术阻断。该结论不是完整维护契约批准，也不替B复核。此轮没有重跑实际Electron IPC/E2E、Windows或业务人员操作，不以构建或SQLite测试代替桌面验收。

## 事件证据仍待政策与实现

原样事件探针2例中，事件持久化/不同requestId及宿主now回放控制通过；返回eventId作为对应维护项解决证据仍NOT_FOUND，失败操作没有部分写入。探针命令退出1（1通过/1失败），已与快照通过结果分列，不能声称全门禁通过。失败断言以“事件允许作为执行证据”为前提，不替B裁定资格。

B需明确事件是否在resolveMaintenance证据白名单、具体允许类型、目标/版本/工作区和解决事实资格；A拥有持久化/查询索引及迁移设计，实现权威事件读取和绑定核验，B复核契约。业务事件ID与outbox投递ID可不同，幂等结果已保存完整事件，不能再称事件完全没有持久化；仅统一两个ID不足以解决读证据及资格问题。C等待固定生产修正版后重跑事件反例，再开展维护入口接线及桌面回归。

A应在自己的交付内记录正式Wiki/任务/日志及固定SHA，不直接修改C评审分支；用户转交的消息可作接收输入，不能替代实现与执行证据。详见[[C集成-快照绑定修复接收]]。

补充实际验证：pnpm build退出0；pnpm test --maxWorkers=2退出0（52文件496/496；scripts/test-unit.mjs未转发该参数，实际为默认52 workers，本轮并非限制到2 workers）。构建存在既有renderer chunk大小提示，未视为失败。

相关实现与契约：[[A01c检索引用实现]]、[[B00a知识Wiki公共协议]]。

机械清单按本机实际检出字节重新生成：A提交的Windows清单含CRLF字节/hash，本机LF检出导致inventory与源码快照多行hash/bytes变化（例如PR模板1040→1017字节）；对应源码和维护脚本未改动，不能把该环境差异称为产品修复。最终只读清单、lint-wiki、固定基线wiki-sync与pnpm check均退出0，含首次Wiki格式失败及修复后输出见raw/c-fdd571a-docs-validation.json。
