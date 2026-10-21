---
title: 接口与 Agent 契约
type: interface
status: active
updated: 2026-10-21
sources:
  - wiki-repo:wiki/03-领域与数据契约.md:1
  - wiki-repo:raw/source-manifest.md:1
---

# 接口与 Agent 契约

v1 先冻结命令、查询、事件及错误语义，再生成 TypeScript/Zod/mock。桌面 IPC 与未来 HTTP 都映射到这些用例，业务代码不感知传输方式。下述为待实现契约。

## 请求、响应和上下文

```ts
interface CommandEnvelope<T> {
  schemaVersion: 1;
  requestId: string;
  idempotencyKey: string;
  payload: T;
}
interface ExecutionContext {
  workspaceId: string;
  actorId: string;
  origin: "human_ui" | "agent_tool" | "system_job";
  correlationId: string;
  runId?: string;
}
type Result<T> =
  | {
      ok: true;
      data: T;
      warnings: Issue[];
      evidenceIds: string[];
      aggregateVersion?: number;
    }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        retryable: boolean;
        issues: Issue[];
        currentAggregateVersion?: number;
      };
    };
interface Issue {
  code: string;
  fieldPath?: string;
  severity: "info" | "warning" | "block" | "pending";
  message: string;
  evidenceIds: string[];
  suggestedAction?: string;
}
```

`ExecutionContext` 由应用入口产生，不接收模型自报角色、origin 或工作区权限；单机 actor 用于责任记录，不作为未来服务器身份认证的替代。查询有 requestId，纯只读无需幂等键。

错误码基线：`VALIDATION_ERROR`、`NOT_FOUND`、`REVISION_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`SOURCE_CONFLICT`、`SOURCE_EXPIRED`、`MISSING_FACTS`、`RULE_BLOCKED`、`UNSUPPORTED_FORMAT`、`CAPABILITY_UNAVAILABLE`、`MODEL_AUTH_FAILED`、`MODEL_RATE_LIMITED`、`MODEL_TIMEOUT`、`MODEL_INVALID_OUTPUT`、`CANCELLED`、`STORAGE_ERROR`、`ARTIFACT_FAILED`、`ACTION_NOT_ALLOWED`。

每个错误附可定位 issues；日志内部堆栈不返回业务 UI。可成功保存一个不完整草稿，其 Result 为成功，但草稿的 readiness/检查清楚显示缺项；这与保存失败是两件事。

## 业务查询与命令目录

下列命名用于应用服务和契约，不是承诺已经存在的 IPC channel 或 HTTP endpoint。

| 用例 | 核心输入 | 返回 | 负责/调用限制 |
|---|---|---|---|
| `source.stage` | Main 发出的短期 fileToken、用途 | sourceId、importBatchId、jobId | A；人工选文件后调用 |
| `import.inspect` | importBatchId | 提取字段、行错误、位置、候选 mapping | A；只读 |
| `import.preview` | importBatchId、mapping、schemaRevisionId | normalizedRows、issues、previewHash | A；不发布 |
| `import.confirm` | batchId、previewHash、expectedBatchVersion、选中行 | 新 product/price/knowledge revisions、错误行 | A；仅人工；原子提交明确选中且合法的行 |
| `catalog.search` | 属性条件、数量/单位、市场、asOf、分页 | 候选、匹配差异、product/price revision IDs | A；人/Agent |
| `catalog.getRevisions` | revisionIds[] | 冻结商品与价目表 | A；人/Agent |
| `knowledge.search` | query、产品/市场/语言范围、asOf、limit | snippet、sourceRevisionId、location、状态 | A；人/Agent；不泄露不适用来源 |
| `knowledge.publish` | draftId、expectedVersion、审核说明 | publishedRevisionId | A；仅人工 |
| `configuration.publish` | kind、draft、expectedVersion | immutableConfigRevision | A 发布服务；B/C 提供对应 schema |
| `inquiry.save` | 原文、sourceRefs、客户、场景、结构化提取版本 | inquiryId、inquiryRevisionId、缺项 | B；提取的 proposed 字段不自动 confirmed |
| `quote.calculate` | 选定商品/价格版本、数量、策略、费用/汇率快照 | calculation、trace、missingFacts | B；纯计算，不改变单据 |
| `quote.validate` | 完整快照、规则集版本 | checks、readiness | B；纯检查，来源适用性显式 |
| `quote.createDraft` | inquiryRevisionId、已选依据、patch/初始输入 | quoteId、revisionId、aggregateVersion、diff | B；人/Agent，业务服务重算 |
| `quote.revise` | quoteId、baseRevisionId、expectedAggregateVersion、typedPatch、reason | 新 revision、diff、任务、checks | B；人/Agent，事务幂等 |
| `quote.get` / `quote.compare` | quoteId 或两 revisionId | 当前/历史快照或按 lineId 的差异 | B；只读 |
| `quote.restoreAsDraft` | quoteId、sourceRevisionId、expectedAggregateVersion | 新 revision、时效检查 | B；人工 |
| `task.resolve` | taskId、expectedVersion、回答与 evidence | resolution、需要重算的字段 | B；仅人工确认事实，后续调用 revise |
| `output.generate` | revisionId、locale、scene、templateRevisionId | jobId；完成后 artifactId/bundleId | B 接口，C 执行语言生成；不改事实 |
| `quote.submitReview` | quoteId、revisionId、expectedAggregateVersion、bundleId/hash | 待审核记录、阻断项 | B；人工 |
| `quote.approve` | 同上＋contentHash、reviewNote | approvalId | B；仅人工入口，不注册 Agent 工具 |
| `quote.reject` | quoteId、revisionId、expectedAggregateVersion、原因 | lifecycleEventId | B；仅人工 |
| `output.export` | artifactId、mode 为 draft 或 final、Main 的 saveToken | 导出记录与 hash | B 校验，C 系统写文件；人触发 |
| `quote.markSent` | quoteId、revisionId、bundleId、approvalId、说明 | sentEventId | B；人工记录，非外发 |
| `agent.start` | quoteId?、baseRevisionId?、expectedAggregateVersion?、message、目标语言 | runId、初始状态 | C；即刻返回，不等待全流程 |
| `agent.cancel` / `agent.resume` | runId、expectedRunVersion | 新 run 状态；或派生 runId | C；resume 重新核对当前 quote 版本 |
| `run.get` / `run.events` | runId、afterSeq | 运行快照/持久化事件页 | C；重连恢复 |
| `workspace.backup/restore` | Main 的目录令牌或备份 token | jobId、校验清单/新 workspaceId | A 存储，C 系统交互；不含凭据 |

typedPatch 是明确的判别联合，如 `setQuantity(lineId, Quantity)`、`selectProduct(lineId, productRevisionId)`、`selectPrice(lineId, priceRevisionId)`、`setPackaging`、`setDeliveryTerm`、`setCommercialTerm`、`addLine`、`removeLine`、`setPricingPolicy`。禁止接受能写 `total`、`approval`、`actor`、`contentHash` 的任意 JSON Patch。

修改事实和修改产出语言是不同用例。渲染层不能自行修改价格结果；所有行编辑和对话修改走同一个 revise 服务。

## 服务端口与团队对接点

| Port | 最小职责 | 提供者 → 使用者 |
|---|---|---|
| CatalogPort | search、getProductRevisions、getPriceRevisions、resolveUnits | A → B/C |
| KnowledgePort | search、resolveCitations、checkValidity | A → B/C |
| QuoteService | calculate、validate、createDraft、revise、get、compare、approve | B → C/renderer |
| QuoteRepository / UnitOfWork | 在事务内读当前版本、追加快照、写事件与幂等记录 | A 适配 → B |
| ArtifactStore | putImmutable、readById、verifyHash；不暴露任意路径 | A → B/C |
| DocumentRenderer | render(snapshot, content, locale, template) | C 实现 Electron adapter → B |
| AgentRuntime | start、cancel、resume、subscribe；与具体 Harness 隔离 | C → 工作台 |
| ModelProvider | capabilities、generateStructured、streamTools、cancel | C → AgentRuntime |
| SecretStore | 保存/读取凭据引用；业务 DTO 只见 secretRef | C Main → 执行进程 |
| Clock / IdGenerator | 可控制时间、ID 便于确定性测试 | C 基础 → A/B |

A 提供存储实现不代表可以绕过 B 的报价状态约束；B 调用 UnitOfWork，决定事务中的业务动作。公共 contracts 不放持久化实现或任何 secret。

## Agent 工具集

首版采用一个执行会话，根据任务调用工具，不把业务员、采购、审核分别做成自主 Agent。工具的输入输出从公共契约派生并按模型支持的 schema 子集生成。

允许：

- `search_catalog`、`get_product_revisions`、`search_knowledge`、`get_quote`。
- `calculate_quote`、`validate_quote`。
- `create_quote_draft`、`create_quote_revision`，只能写草稿，服务强制重算。
- `propose_clarifications`，保存问题与 evidence；任务由用例按 issue 去重生成。
- `generate_output`，仅生成与指定 revision 绑定的未审核产出。

不注册最终审批、知识发布、直接写数据库、任意路径读写、shell、自动外发工具。模型在对话中写“已批准”不会改变审批记录。外部文档内的指令只作为待处理文本，不能改变工具集。

Harness 当前有条件采用，使用专用 profile、独立数据目录与固定版本；正式 adapter 须在启动时核对注册工具 allowlist，模型请求处再次断言。M0 已通过专用 profile 对每次实际模型请求核对工具集，见 [验证记录](技术验证记录.md)。上游 `sdk-minimal` 默认携带 shell，不能仅靠提示词完成隔离。其参数根对象默认开放，桥接必须拒绝未知字段并使用严格 DTO；身份与幂等由宿主提供。

`ModelProvider` 是本项目端口，不是 Harness SDK 可直接接收的 JS 实例。当前官方 adapter 走 Messages API；接入其他供应商需可信 provider 插件或独立执行器实现。SDK 没有单会话 cancel，`AgentRuntime.cancel` 由关闭 run 独占的 runtime 进程实现；超时也须执行回收。多活动 run 不能共享这一进程。

## 执行与版本一致性

```text
开始 run → 保存输入与当前 revision/version
  → 提取意图与 proposed 字段
  → 检索明确适用的已发布资料
  → 关键歧义：保存中文问题/任务，进入 waiting_input
  → 形成 typedPatch
  → quote.revise 在事务内重算、校验、保存新版本
  → 生成本地化 artifact
  → 校验事实引用与必填字段
  → 展示新版本、差异、风险与任务
```

每个 quote 同时只允许一个可提交变更的 AgentRun；用户手工编辑仍可提交，Agent 的旧 expectedVersion 必须失败并要求重新基于当前版本规划，不能自动覆盖。取消仅中止尚未提交工作；已经提交的版本保留。

模型输出 JSON 合法不等于业务合法：Zod 检查结构，领域服务检查数量、单位、来源、权限与状态。结构错误最多一次受控修复，再失败显示可操作错误；不无限重问。

对外正文使用结构化内容块与事实引用：`text` 块表达语气，`factRef` 块由程序插入 SKU、数量、金额、日期、材料等。术语翻译有 glossary revision。模型不得独立重算/自由改写事实字段。自由文本中的额外承诺仍需一致性检查和人工审核；不能声称仅靠正则就验证了所有语言语义。

对外生成与 PDF 使用字段白名单形成的 `PublicQuoteView`，不传采购成本、毛利、内部备注和未授权知识全文；中文内部摘要走单独投影。`output.generate` 调用无写工具的内容生成路径，不递归开启另一个可修改报价的 Agent 会话。

## 事件、恢复和重试

```ts
interface RunEvent {
  schemaVersion: 1;
  eventId: string;
  runId: string;
  seq: number; // 每个 run 单调递增
  timestamp: string;
  type: "run.started" | "step.started" | "tool.completed"
    | "revision.created" | "clarification.required"
    | "artifact.ready" | "run.completed" | "run.failed" | "run.cancelled";
  payload: unknown; // 实施时按 type 定义 Zod 判别联合
}
```

持久化事件先提交后发布，至少一次投递；renderer 按 eventId 去重，按 seq 发现缺口后 `run.events(afterSeq)` 补齐。实时 token delta 是临时展示，不承担恢复事实；完整消息提交后才进入历史。API Key、原始错误栈和模型内部推理不作为业务事件传输。

Run 状态：`queued → running → waiting_input|completed|failed|cancelled`；应用启动将残留 running 标为 interrupted，用户恢复创建派生 run，继承已提交结果并重新检查版本。禁止重放完成的写工具。

初始可调预算建议：每 run 最多 12 次工具调用、单模型请求 90 秒超时、总 run 5 分钟；限流/暂时网络错误最多 2 次指数退避重试，鉴权/参数错误不重试。数字是测试起点，在 M0 实测调整；费用只有配置有效价格表才计算，缺价格时显示 token 用量与“成本未配置”。

同一次工具提交重试必须复用业务幂等键；不能每次网络重试生成新 key。tool call ID 记录提供方原值，业务幂等键由应用生成并跨恢复保留。

## IPC 与将来 HTTP

Renderer 只使用 `window.tradequote` 的具体方法；preload 不暴露通用 `invoke(channel, arbitraryPayload)`、fs、ipcRenderer 或 process。订阅返回取消函数，窗口关闭时回收。

Main 发出文件选择/保存令牌，后台用令牌访问受控路径；原始上传文件名不能变成路径穿越。固定 HTTP 基础地址只能在设置页面由用户配置，文档内容不能修改模型 endpoint。

未来服务器以认证上下文替换本地 ActorProfile，提供相同 DTO 与业务错误；不把本地 SQLite 文件当成多端同步协议。详见 [服务器演进](07-服务器演进与风险.md)。

关联：[领域与数据契约](03-领域与数据契约.md)、[开发步骤](05-三人分工与开发步骤.md)。

工程知识关联：[[运行时能力地图]]、[[核心业务流程]]。

## M0 本轮实现状态

本轮默认执行器已切为最小工具循环，见 [[0004-M0平台与执行器选型]]；前述 Harness 约束仅适用于保留候选。T00 部分 strict schema/测试与评审清单见 [[M0契约评审准备]]。正式端口及完整公共契约仍需 M1 实现。
