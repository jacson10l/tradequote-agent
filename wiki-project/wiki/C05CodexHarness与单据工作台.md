---
title: C05CodexHarness与单据工作台
type: module
status: active
updated: 2026-10-31
sources:
  - conversation:用户要求C优先真实CodexHarness验证并迁移日常业务到工作台
  - packages/infrastructure/src/codex-harness.ts:1
  - packages/infrastructure/src/quote-tool-agent.ts:1
  - packages/infrastructure/src/agent-run-coordinator.ts:1
  - apps/desktop/src/renderer/src/features/workbench.tsx:1
  - https://developers.openai.com/codex/app-server/
---

# C05 Codex Harness 与单据工作台

## 纠偏与边界

用户2026-10-31明确以实际Codex harness驱动业务工具作为验收中心。历史M0的@deepseek-ai/dsh不属于Codex，Electron初始化失败只说明旧DeepSeek Harness实验，不能作为放弃Codex的证据。现有DeepSeek JSON工具循环保留其历史名称与结果，不冒称Codex。原兼容执行器使用chat/completions。C05初轮尚未验证DeepSeek与Codex兼容；C05b已在当前保存deepseek-flash上通过原生Responses和正式Electron电脑验收，详见下节；不外推其他型号。

## 执行与数据

新适配器通过本机codex app-server stdio握手initialize/initialized，创建ephemeral线程并start turn；模型发出item/tool/call后，宿主执行现有BusinessTool。原生工具加tradequote_前缀，避免apply_patch等内置名称冲突。Codex承担原生Agent循环；宿主保留商品查询、确定性核价、规则检查、写入票据和事务。没有新增金额算法或第二份规则实现。临时工作目录为空且read-only、审批never；Shell/文件修改/网页/图像/多Agent/apps/hooks关闭，不把项目源码或数据库作为模型工作目录，不保留原始stderr/认证内容。C05b曾允许无保存配置时采用本机连接；C05c按用户纠偏取消此兜底，当前缺配置明确失败。mcpServerStatus/list只取名称、按分页禁用业务线程内所有既有MCP，继承配置的空表覆盖并不能清除旧服务器。名称盘点可能初始化用户已配置MCP连接，不向模型暴露其工具或资源。合成本地Responses端点实测业务线程只剩tradequote_工具与request_user_input；后者只转公开业务澄清。不得把拒绝未知JSON-RPC请求误当作阻止app-server内部工具的充分保证。

报价payload.executionMode新增codex_harness，可由同一agent.start/get/cancel/retry/list/events通道进入；已保存command包含模式，重启不自动重发，显式重试仍用原operationKey。当前产品任务必须具备已保存模型配置，未配置不启动原生执行器。12次工具上限与120秒任务deadline；取消发送turn/interrupt并终止本次子进程，晚到工具执行需通过现有ticket/AbortSignal。写事务成功即保留完成事实，不让取消改写已提交版本。无真实写入的文本回答不能冒充保存成功。

## 页面职责

单据工作台承接同处的任务对话、实际工具记录、当前报价、缺项、修改、规则反馈、版本差异和未审核回复草稿。资料与报价只承担商品/场景/价目表导入、人工发布、来源和历史查询，历史报价链接带quote ID打开工作台。只读查询/试算复用公开读工具并在同一对话入口提供不保存模式。模型设置保留模型连接配置，工作区设置保留本地业务环境配置。

中间核价是未保存预览；真正写事务返回committedRevisionId后才是已保存单据。回复草稿继续使用既有本地模板，不暗示模型翻译或外发。所有版本保持未经审核。旧快照不回写。

## A/B依赖与已知问题

A负责来源原件、版本、发布事实和可追溯引用；当前C合成fixture不能证明真实业务依据已通过。B负责公共工具契约复核、规则语义和条款确认状态。已定位现有calculateQuoteV1仅按payment/delivery空字符串判断pending：输入“未确认”是非空，因而从待确认清单消失；这是语义缺口，不能以UI迁移或Codex接入宣称修复。需要B定义明确的confirmation状态与迁移/历史兼容口径，再同步调用方、mock、测试；C负责接线，不复制关键词规则作为第二个真相。

## 验证口径

基础协议测试使用明确fixture子进程，验证动态工具调用、取消晚到写、失败turn、超时。真实Codex集成测试显式TRADEQUOTE_VERIFY_CODEX=1执行，使用隔离SQLite/合成商品和本机已配置Codex连接；单独记录实际模型工具链，不能用协议替身宣称真实通过。正式Electron从工作台发任务、V1→500数量修订、差异与缺项、取消/重开/显式重试需独立验证。Windows与最终签名包仍未验证/后置。

详见[[C05-CodexHarness纠偏与工作台迁移]]、[[0030-CodexHarness优先与工作台业务中心]]、[[C运行恢复实现]]、[[M1工作台]]。

## 回归与评审修正

核价预览随现有run JSON与实际calculate_quote步骤保存，重试清空，不新增迁移；已保存报价仍以提交版本为准。桌面回归按新页面职责导航，手工和原DeepSeek路径在折叠兼容入口继续复用同一组件，不是新复制服务。单据和对话有独立滚动区域，任务输入不随记录下沉。

独立只读技术评审指出并修正：信号退出后的子进程清理死等、澄清任务跨重开/已有报价时丢失原业务命令、只读参数失败后纠正导致计数与观察记录不一致、执行期间切换旧任务绕过锁，以及实际model身份不得使用占位值。原生模型非空身份在turn前验证并记入已提交对话；模型注册表合成隔离测试不证明真实供应商语义。真实接入与正式Electron结果分别存入本次验证证据，不用HTTP替身代替。


## C05b 保存的DeepSeek与电脑验收

已有Main设置受控快照经Worker传递给QuoteToolAgent和只读服务，新增凭据参数仅在宿主内部，不属于公共业务command，不入run数据库、模型上下文或renderer。Codex为单次子进程配置tradequote_deepseek原生Responses供应商，固定https://api.deepseek.com，model采用保存值，Key仅存子进程环境TRADEQUOTE_CODEX_DEEPSEEK_KEY；不改全局Codex配置。线程固定供应商/模型并关闭provider model fallback；配置存在但失败则明确失败，不静默改用OpenAI。保存设置的Chat连接测试与Responses工具闭环分别验收，不能用前者代替后者。当前只证明本机已保存deepseek-flash。

真实DeepSeek曾提前调用已注册但当前阶段不可用的search_knowledge，使旧适配器直接结束ACTION_NOT_ALLOWED。现将这类请求作为success:false的阶段反馈和可用工具名交回Codex，模型可在原12次尝试预算内纠正；不执行提前工具，不放宽未知工具、参数/权限、写票据或业务事务。阶段恢复不是更换自建模型循环。

Computer Use使用独立未打包Electron验收宿主codex-provider-host.cjs，仅隔离Chromium sessionData和合成Business Worker库，正常Main保留生产设置入口。它不导出密钥、不替换供应商响应、不读取生产业务库，也不抢占已打开应用。工作台实际完成缺数量追问→100件V1 900.00→500件V2 4500.00与差异、两次显式失败重试、600件修改取消、重开只读恢复、来源和English草稿。查询DEMO-PANEL 20m2预览250.00，当前V2不变。原失败仍保留，现场发现问题修复后重试成功，不伪写首轮全通过。

自动检查复用已持久运行中的saved_revision报告。QuoteChecks和CustomerReply只在正式检查列表成功且为空时使用严格绑定revisionId/rootId/version的run报告；读取失败、错误版本或已有人工报告不被掩盖。未新增规则检查实现或人工报告写入。重开从持久run恢复相同报告，正文标记报告ID和覆盖待确认；无适用规则不能称检查通过。AgentRuns重试派发前将pending通知工作台，阻止新任务/切版本，成功直接绑定返回run后由执行锁接续；失败释放锁。延迟IPC红绿回归覆盖此窗口。

只读试算仍是临时请求，无公开取消或持久恢复；进度文案明确不会保存，不虚构运行记录取消入口。等待用户输入的旧run在补充新任务成功后仍保留waiting_input历史，是当前对话连续性欠账；没有自动关闭或篡改旧事实。B非空“未确认”语义和A真实规则来源仍待。实际证据[[C05b-DeepSeek兼容与电脑验收]]及raw/c05b-deepseek-computer-use.json，决策[[0031-DeepSeek原生Responses与运行报告复用]]。

## C05c当前行为

[[C05c会话生命周期与业务对话]]已把只读请求纳入原持久协调器，取消/重开/显式重试和结果保存不再是C05b临时只读模式；补充使用关联子任务与结构化问答，真实成功后同事务解决原问题。旧C05b“只读无恢复/旧问题未收口”属于原时点，新的实际验证见[[C05c-会话收口与只读持久运行]]。所有产品任务缺保存配置即拒绝，旧本机连接兜底取消；技术说明、Codex标签、旧模型表单及默认演示资料不再作为工作台内容。A/B缺口在[[C05c-AB业务依据与契约交接]]分列，不以UI修复宣称业务规则已通过。
