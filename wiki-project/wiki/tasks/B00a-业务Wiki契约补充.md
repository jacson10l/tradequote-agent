---
title: B00a-业务Wiki契约补充
type: task
status: active
updated: 2026-10-22
sources:
  - conversation:用户指定B优先交付B00aP0解锁A01c且P1另交
  - packages/contracts/src/knowledge-wiki.ts:1
  - packages/contracts/src/wiki-integrity.ts:1
  - packages/contracts/src/knowledge-wiki.test.ts:1
  - packages/contracts/src/pending-client.ts:1
  - apps/desktop/src/preload/contracts.test.ts:1
  - wiki-repo:wiki/B00a知识Wiki公共协议.md:1
  - wiki-repo:raw/b00a-validation.json:1
  - wiki-repo:raw/b00a-delivery.json:1
---

# B00a-业务Wiki契约补充

## 目标

负责人 B，本机 B 开发；A 审存储/来源/审核发布/检索引用，C 审客户端/IPC 接线。先交付可独立评审的 P0，以 [[B00知识契约差距与补充]] 为完整输入。P1 知识 AI 整理运行与维护另行交付，不阻塞 P0；不因创建文件或提交草案宣称解锁 A01c。

## 范围

- 独立分支 codex/b00a-knowledge-wiki-contracts，独立受管 worktree（目录名 b00a-knowledge-wiki-contracts/tradequote-agent）；从最新 origin/codex/m1-foundation 创建，实际 taskBase=56c909e21aefa484b6805bf9afc7c94b0e1d4576。
- 环境：macOS 26.4、arm64，Node 22.22.0、pnpm 10.13.1、Electron 44.9.2；唯一 pnpm 锁文件不变。pnpm install --frozen-lockfile 实际退出 0，原生 SQLite 为 Electron ABI 重建；electron-winstaller 可选脚本未执行，不冒充 Windows 验收。
- P0 新建 knowledge-wiki.ts / wiki-integrity.ts / knowledge-wiki.test.ts；同步 index/mock/pending-client 和正式 preload 边界测试。无数据库/迁移/模型/UI 实现，不改旧 B00 或 AgentRun/Runtime 白名单。
- P1 knowledge-build.ts、KnowledgeBuildRun/Proposal、完整 lint/维护队列/impact/index/rebuild 尚未创建；仅 P0 审核必需的最小 lint receipt 已定义。

## 验收

| P0 要求 | 本分支结果 | 实际业务验收边界 |
|---|---|---|
| Markdown、无规则 SOP/术语、多来源及各 hash | 不可变来源/知识版本、sections/relations、完整 sourceRefs、精确 UTF-8 hash 校验 helper；rule 必须显式映射 section，其他类型零规则 | 来源/blob存在性及实际存储由 A 落地；helper 不证明来源权威 |
| 审核发布状态基础 | 独立 lifecycleVersion；人工 review→显式 publish→不可逆 withdraw；workspace/revision/两hash/lintReceipt 绑定、拒绝/候选保留历史 | 权限/并发/事件/幂等事务由服务核实；没有假发布成功 |
| 检索与稳定分页 | keywords/scope/locale/kinds、快照/查询绑定、排他稳定顺序、有效期及最新发布头校验；先最新发布事实后筛选，禁止回退绕撤回 | 新分页投影和跨页权威实时重验由 A 实现；schema 测试不是索引已运行 |
| 引用与解析 | 知识 revision/section/contentHash/sourceSetHash、完整来源版本/位置/hash；history 可回读但新引资格独立，失效新引不能 ok=true | 原件损坏/缺失及当前资格须宿主在解析/提交时重验 |
| 消费登记 | 固定 quote/artifact 不可变 consumer revision/hash+完整引用；专用同步事务参与端口 | A/C 后续加入同连接消费/报价/产出/run/outbox/幂等事务，P0 无维护引擎 |
| 客户端与兼容 | executeWiki 严格 12 方法本地门禁；合法 CAPABILITY_UNAVAILABLE(retryable=false)，非法 VALIDATION_ERROR，不发新 IPC；旧 B00 测试/协议保留 | A01b c6539e8 仍是旧单来源模型/过滤后回退；C02c 0ccd72f 未消费本协议，须独立接线 |

完整字段、命令/结果及权限表、hash 算法、错误码、幂等、artifact→事务→投影恢复、A01b/C02c 差距见 [[B00a知识Wiki公共协议]]；重要取舍同步 [[0011-业务LLMWiki与工程知识隔离]]。新文件覆盖映射、导航、知识页和追加日志均由 B 同步。

## 改动

实现和公开文件详见上方验收矩阵；新增纯校验 helper 在异步 blob 验证阶段执行，保持 contracts 不依赖 Node 内建模块。

## A/C 对齐与评审

2026-10-22 开工先将接口/关键取舍发 C 的“推进 C02c 持久运行”聊天；C 认可独立协议/不可用门禁方向，要求专用必填宿主上下文、精确 strict 方法门禁、权限/幂等表、消费提交事务重验和旧 C02c 兼容矩阵，均已纳入。该回复只算设计对齐，不代替实现验收或 A 签字。

A 在另一开发者机器，不在本机聊天。已在 [A01b PR #6 对齐评论](https://github.com/jacson10l/tradequote-agent/pull/6#issuecomment-6321459685) 发送完整清单，包括 A01b 当前“过滤后回退”的兼容差异，等待 A 实际复核。C 的实现只读复核发现 P2：空 hits 页 nextCursor 可等于/小于输入 cursor，导致无限翻页；已在 Exchange 层补严格前进与四种反例（相等/倒退拒绝、前进/终页接受），C 已独立复现修正后的四种结果并复跑 2 文件/20 项测试（退出0），确认 C 客户端/IPC及宿主接线边界无剩余阻断项，证据 [C技术复核](../../raw/b00a-c-review.json)；不代替 A 的存储/状态评审或 T00 人类签字。

## 验证

首次 typecheck 退出 1：畸形输入反向测试的字面量类型及合成 section 数组的 unchecked-index 检查不通过；已修正构造方式/已知 fixture 索引，保留失败记录后重跑。首次完整单元 84 项通过，增加权限策略反向测试后 85 项通过。后续暴露 Electron 桥接清单漏更新、根 Playwright 无法解析包名 import、旧 A01a JSON 格式、contracts 测试误用 Node crypto、任务标题须精确匹配、编辑期间生成漂移，均已修正且不放宽门禁；原失败保留 raw/b00a-initial-validation.json。最终本机证据为 [b00a-validation.json](../../raw/b00a-validation.json)，含实际命令、退出码、环境和已测试源码/覆盖配置 SHA-256；任务因评审/合入待完成保持 active，不借旧 B00 55 项记录证明本任务。

| 最终实际命令 | 退出码/结果 |
|---|---|
| pnpm typecheck | 0 |
| pnpm test | 0，17 文件/85 项 |
| pnpm test:e2e（内含 pnpm build） | 0，5 项真实 Electron；12 Wiki 方法 gate/畸形字段本地拒绝，原 V1/V2/V3/重开保留 |
| pnpm check | 0，Biome、6 项工程、边界、只读清单和 lint |
| pnpm wiki:test | 0，36 项 |
| pnpm wiki:generate | 0，156 纳管文件 |
| node wiki-project/scripts/check-wiki-sync.mjs . --base 56c909e21aefa484b6805bf9afc7c94b0e1d4576 | 0 |

历史 raw 非生成证据逐字节不变，log 保留精确前缀；A01a fixture parsed JSON 与 taskBase 相同，仅重排格式。构建的已有 chunk size/Vite native loader 警告不阻断；无新增 Windows/安装通过声明。

## PR 交接

[PR #7](https://github.com/jacson10l/tradequote-agent/pull/7) 已创建并推送，目标 codex/m1-foundation，远端代码头核对为 26421ab5bf93f74b20d5888f0e1ff3b48b9bfc36；后续仅补本文/日志/交付记录，不变更已测源码。已向 A（ssyyy31）发起正式 review request，当前 OPEN、无 GitHub review、未合入；C 独立技术复核证据单列，不伪造同账号 GitHub 批准。[交付事实](../../raw/b00a-delivery.json) 保存原始 PR 头、目标、reviewRequests 与未解锁状态。A 应评审此 PR 中协议/存储差距，合入前不能以分支存在开始依赖共同类型。

## 未完成项

- A 实现评审、PR 合入共同分支及合入后明确通知 A 同步基线；C 范围技术复核已通过；在此之前 A01c **未解锁**，任务 active。
- A01b 新协议存储/生命周期/来源/检索/引用/登记适配及正式知识 Electron 全流程；当前 P0 无业务服务。
- P1 AI 整理运行、完整维护与影响分析、B 多来源 CheckIssue 显式适配、C 新 Wiki/消费接线。
- 真实 DeepSeek 语义、Windows/签名安装未验证且后置，不把 HTTP 替身/旧桌面回归写成新知识服务通过。

历史：本页在 2026-10-21 仅建立任务，原 P0/P1 均待创建；本轮为实际 P0 编码，保留原 B00 独立验证历史不覆盖。

关联：[[B00-首批公共契约]]、[[A01-知识发布与来源查询]]、[[C01-Agent运行恢复与集成]]、[[首批并行接口约定]]。
