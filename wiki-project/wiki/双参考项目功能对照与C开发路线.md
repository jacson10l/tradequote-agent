---
title: 双参考项目功能对照与C开发路线
type: architecture
status: observed
updated: 2026-10-21
sources:
  - conversation:用户要求按两个参考项目核对实现补齐C完整任务依赖验收并继续独立开发
  - UPSTREAM.md:5
  - wiki-repo:raw/inputs/外贸询报价协同 Agent 完整产品与实施方案.md:176
  - wiki-repo:wiki/05-三人分工与开发步骤.md:110
  - packages/infrastructure/src/agent-executor.ts:1
  - packages/infrastructure/src/read-tool-runtime.ts:1
  - packages/infrastructure/src/read-tool-runtime.test.ts:1
  - packages/contracts/src/runs.ts:1
  - packages/infrastructure/src/migrations.ts:1
  - apps/desktop/src/workers/business.ts:1
  - tests/fixtures/knowledge/knowledge-drafts.a01a.json:1
---

# 双参考项目功能对照与 C 开发路线

## 基线与判定口径

本轮独立分支codex/c-runtime-roadmap，taskBase=be53b98adaa25883e7699ccbf7bda9c6fe1fb0ce，来自重新fetch的origin/codex/m1-foundation；保留此前e0f9336的 [[C01b-依赖就绪核查]]，不将旧PR/分支状态当作实时状态。be53b98合入A的9个合成fixture文件，未增加知识服务或迁移；B仍缺澄清/list，A仍缺实际迁移前驱及run/quote同事务入口。实现以源码为准，测试结果以本轮raw/c-runtime-validation.json为准。

“已完成”只针对列明的子能力；“部分”仍有本期验收项；“待实现”仍在当前目标内；“延期”说明恢复条件，不取消验收。内部模块测试、HTTP替身、真实Electron、真实DeepSeek、安装包分别取证。参考功能不等于已经复制上游代码，也不要求对上游所有功能做一比一移植。Solivio不整体Fork；Harness当前Electron兼容失败后采用自有执行器，功能责任仍须追踪。

## Solivio：业务功能对照

| 参考模块/目标 | 当前实现与状态 | 剩余验收、任务与Owner |
|---|---|---|
| catalog/csv-import：目录、导入预览确认 | **部分**：catalog-csv.ts、trade-store.ts和quotes.tsx已有固定CSV、人工发布、档位/来源冻结；不是四格式映射完整实现 | A T20～T22：XLSX/PDF/DOCX、映射纠错、商品/价格版本、过期与跨品类检索；AC-01/02/03/06 |
| offers：报价草稿、行项目与修订 | **部分**：domain/trade.ts、revision.ts及TradeStore已有价目表V1/V2/V3、Decimal、不可变快照、冲突和幂等 | B T30/T31：成本核价、费用/汇率、历史恢复为新版本、内部任务；未知保持未知；AC-05/08/09 |
| offer-chat：对话驱动业务 | **部分**：agent-executor.ts一次结构化理解/三类修改后提交，quote-agent.tsx展示版本差异 | C T41/T42与下文C02/C01c：真实业务工具循环、澄清、状态与事件；HTTP两轮不等于完整Agent |
| knowledge-base：检索与来源回读 | **待实现服务**：B00 strict规则协议/门禁已完成，A新合入合成fixture；无正式知识Repository/查询服务 | A A01a～e、B B00a、C C06：版本化Markdown、审核发布、适用检索、引用解析和维护；AC-06。遵守 [[A业务LLMWiki方案]] |
| 报价校验：需求匹配与反馈 | **待实现**：checks.ts及mock是协议，无真实检查服务/UI | B B01/T32：合同与目标市场两类，平台另验，稳定checkId、风险标记＋文本批注、修改后重检；AC-07/17 |
| offer-pdf：人工审核后的产出 | **待实现正式业务**：printToPDF只有M0探针，无正式审批/导出服务 | B T33/T34定义快照/模板/审批，C C05实现Electron adapter；不能将探针PDF算AC-11通过 |
| customers/order-history：客户与历史成交参考 | **未纳入当前MVP独立模块**：现有buyer只是报价字段，无CRM/订单历史服务 | 保留上游参考；后续需新增明确需求/数据授权/版本适用性任务才能启动，不宣称当前有CRM，也不把本期报价版本历史算订单历史 |

新增A fixture只用于合成测试资产：knowledge-drafts.a01a.json包含6条draft，sources含8份文本，其中两份尚无可执行规则映射；_pendingB00Extensions仍存在。标题/描述不证明规则算法已实现，例如required不能证明付款比例计算。覆盖登记与本页审阅不替A签署业务正确性或发布验收，8份原始文本字节不改；合成draft JSON仅按Biome规范化布局，解析内容与基线相同。

## Harness：执行能力对照

| 参考能力 | 当前实现与状态 | C的后续交付 |
|---|---|---|
| Provider/凭据隔离 | **部分**：DeepSeek JSON、45秒单请求、128KiB响应上限、鉴权/限流/取消、Main安全存储已接线；真实供应商未验收 | C04能力矩阵/显式评估；模型选择与执行器选择分开 |
| 单会话工具循环/allowlist | **内部切片已完成，生产待接线**：本轮read-tool-runtime.ts运行JSON动作→宿主工具→下一轮；仅注册的六类查询/计算名可调用 | C02b接真实A/B端口，C02c补持久化写工具；不能把C02a称为完整T41完成 |
| 严格工具参数与结果 | **内部切片已完成**：defineReadTool使用宿主提供的Zod schema，输入/结果均验证；业务DTO从contracts导入 | B维护正式业务schema，C维护适配层；未知工具/字段拒绝。宿主handler可信，allowlist不是OS沙箱 |
| 上下文与运行预算 | **部分**：原一次对话上下文100000 UTF-8字节/最近6成功对话；新只读循环每次发送前核对全上下文，默认8次工具/120秒，上限12次/300秒/100000字节 | C02b按真实资料做摘录、历史和来源版本策略；C04记录可用token/费用来源，价格未知不得填0 |
| 取消/超时/失败 | **部分**：C01a已有进程内取消；C02a覆盖整个只读任务及不合作adapter的晚到结果 | C01b/c将取消事实、attempt隔离接数据库和UI；不能把AbortController当持久化取消 |
| session/run恢复与工具账本 | **待实现**：migrations仅1～3，成功报价可回放，失败/澄清/待决run不落库 | C01b运行持久化，C02c每个写工具的宿主幂等/提交票据；重启不自动收费，不重放已完成写工具 |
| 事件、订阅、重连 | **待实现**：现有outbox不是公开run.events协议，UI无持久事件补页 | C03与B事件协议、A同连接存储协作；按eventId去重、seq补缺口，事件只在事务提交后发布 |
| profile/plugin业务桥接 | **部分设计**：专用allowlist和strict适配；无生产Harness或通用插件加载 | 固定可信宿主工具即可达首版；任意插件/MCP/shell不在当前产品能力中，不能为对齐参考而开放 |
| 真实模型、桌面与打包 | **部分**：M0/HTTP替身/本机Electron基础有证据 | C04/C07分别验真实供应商、macOS业务与最终安装；Windows按用户决定后置 |

## C的完整任务账本与依赖

C01只是运行恢复切片，不代表C全部工作。以下编号与T任务对应，原C01a/b/c编号保留；“阻塞”只作用于具体接线/验收，不扩展为C整体停工。

| ID/状态 | 范围与具体产物（路径为责任范围，未存在的文件不是已实现） | 真实依赖/现在能做的部分 |
|---|---|---|
| C00 **基础已完成、持续维护**（T10/13/14） | main/preload/workers、公共UI/路由、模型设置、锁文件与本机检查；A/B各自feature页面不转给C | 现有基础可运行；新增IPC/UI必须按现行安全/设计规范同步回归 |
| C01a **已完成限定切片**（T44） | domain/agent-run、Provider/Executor进程内取消与错误归因；原九项及P2回归 | 已在共同基线；不重复开发已有状态机；无持久化/取消UI完成声明 |
| C01b **待实现，落库依赖未齐**（T44） | agent-run-store及测试、run/control表、claim票据、澄清、同事务提交、启动中断、显式retry | B澄清/list/控制语义；A实际迁移、连续前驱、同连接提交入口。详细接口和R01～R20已有草案，不等完整知识业务 |
| C01c **待实现**（T42/44） | Main/worker/preload白名单、quote-agent状态/取消/重开列表/重试UI、agent-recovery Electron测试 | C01b服务与B正式协议；写入失败/结果未知要查询事实，不换业务key自动重试 |
| C02a **本轮内部模块已验证**（T41） | read-tool-runtime.ts及测试，严格注册/串行工具循环/上下文与预算/取消，不含写工具或IPC | 复用现有Provider和contracts，不依赖A/B新接口；实际测试使用现有SQLite目录和确定性金额模块 |
| C02b **待实现，按工具分别接入**（T41） | 真实只读工具适配与上下文组装；宿主绑定workspace/范围/asOf/证据；保持现有understand/revise兼容 | 已有商品/报价可先按公开服务接入；知识须A查询与B00a，规则须B01。未实现工具不注册，不用假成功补齐 |
| C02c **待实现**（T41/44） | 草稿写工具、每toolCall与业务operation关联、持久幂等和当前revision校验，AgentRuntime完整读→算→校验→写链路 | C01b、B正式写契约/状态、A事务入口；无发布/审批/自动外发；收费重试由人明确发起 |
| C03 **待实现**（T42/44） | run.events/订阅、事件序号与补页、Main生命周期回收、UI去重/断线恢复 | B事件/游标契约＋A事务/outbox＋C01b。先做持久业务事件；token delta属后续展示优化，不能承担恢复事实 |
| C04 **部分完成，真实评估待运行**（T40/53） | 连接/结构化/工具协议、限流/失败/语义/跨品类/语言样本矩阵，显式真实模型评估入口及脱敏报告 | 现有凭据UI；供应商调用须用户在应用提供可用配置，不读取现存真实Key文件。无Key不假通过；本地fixture验证可独立推进 |
| C05 **待实现**（T24/34/43） | PublicQuoteView生成、中文摘要/目标语言、平台profile/术语/factRef、Electron PDF/导出adapter；B负责正文模板/审批 | A已发布知识/术语，B输出/校验/审批契约；未审批产出保持草稿，英德＋CJK/RTL分别验。现有PDF探针非正式出口 |
| C06 **待实现，契约先行**（A01d） | knowledge-builder及测试，受控多来源整理候选、取消/失败、不越权发布；A接候选保存与审核UI | B00a知识运行/候选协议＋A来源/基线服务；不复用必须提交报价的AgentRun伪造知识成功 |
| C07 **持续推进，发布项后置**（T50/51/52/60～63） | 本机Electron纵向联调、失败注入、备份UI、演示重置、五次稳定演练、安装/升级与第三方许可 | 分阶段依赖A/B实际服务；macOS开发优先，Windows/签名安装按用户决定后置；无Actions/云测试 |

## 逐任务验收清单

以下是未完成任务的交付条件，方框不代表本轮已运行；C02a实际结果单列在 [[C02a-受限只读工具循环]]，不能用本节代替证据。

### C00/C01a 维持已完成边界

- [x] 已有Electron窄桥接、工作区/手工V1与模型受限V2/V3；基础历史证据见 [[M1验证与协作]]。
- [x] C01a进程内取消、晚到结果与首个超时归因已验证，见 [[C运行恢复实现]]。
- [ ] 新功能合入后继续通过适用本机回归；不能沿用旧提交测试为新代码背书。

### C01b/C01c：持久运行与桌面恢复

- [ ] B澄清必填nullable/状态约束、有界list及控制重放完成；A实际迁移与连续前驱、单连接入口完成；登记真实commit和评审，无空迁移。
- [ ] start事务提交queued后派发；同key同内容返回当前run，异内容冲突；get/list不调模型。
- [ ] claim及异步结果匹配runId/attempt/executionId/session；旧worker、旧attempt、取消后结果不能提交。
- [ ] quote/turn/run/outbox/报价幂等共同回滚；取消先落库后abort，完成后取消返回原完成事实。
- [ ] 强杀/重开仅将遗留queued/running转interrupted，不自动重发；retry保留operationKey、增attempt，控制key重放不派发；waiting_input新输入须新key。
- [ ] R01～R20全部有实际结果；真实Electron取消、强杀重开、丢响应查询与重试、不重复版本；UI基于持久事实显示。

### C02a/C02b/C02c：完整工具编排

- [ ] 只注册当前实际可用的工具；模型看见与宿主执行的allowlist一致；未知工具、额外字段、非法业务参数均拒绝。
- [ ] 每次模型请求包含有界当前上下文；只有已发布适用资料进入生产上下文，返回来源版本/定位；空结果、未知、失败分开。
- [ ] 搜索→确定性计算→检查→草稿写入走同一业务服务；金额不是模型自报，缺事实澄清，旧revision冲突拒绝。
- [ ] 预算耗尽、Provider/工具失败、取消、整run deadline不再派发后续工具；无隐式收费重试；已提交步骤不可撤销。
- [ ] 写工具持久账本与业务提交原子关联；丢响应、重复toolCall、worker重启均不重复写入；最终引用真实revision而非模型summary。
- [ ] 三品类、两轮修改与真实A/B服务联调；只读内核通过不代表写工具、持久化或生产调用方接线通过。

### C03/C04：事件与供应商验收

- [ ] 事件提交后发布，seq有序补页，eventId去重；重连漏页可补，关闭窗口/worker释放订阅；事件无Key/认证头/原始错误或内部推理。
- [ ] 实际配置模型完成结构化/工具循环、缺项/非法输出、取消/超时/限流和跨品类语义评估，记录日期/模型/样本/实际结果。
- [ ] 评估命令必须明确真实或fixture；缺凭据报告未运行；token/费用仅按真实可用数据记录，缺价格标未配置。

### C05/C06：语言、文档与知识整理

- [ ] 语言生成只用绑定revision的PublicQuoteView；SKU/金额/日期/条件与快照一致；RFQ/邮件结构、英德语气、术语来源可核对。
- [ ] 输出校验与人工复核后才能审批；新内容/语言bundle重新审核；长表/字体/CJK/RTL/PDF失败和重开验收，下载不自动标记已发送。
- [ ] 知识候选携多来源定位/hash；无依据/坏引用/超限拒绝；取消/失败/重启不误发布，人工发布入口保持独立；真实供应商另记。

### C07：集成与交付

- [ ] 资料→V1→两轮变更→两类检查/双反馈→审核→语言正文/PDF→重开，来源/金额/版本一致。
- [ ] 并发、数据库/PDF失败、备份恢复/演示隔离及五次稳定演练有实际证据；安装/Windows后置项恢复后分别本机验收。
- [ ] 每个小PR同时知识页/任务/log/覆盖/固定基线检查；非作者复核，禁止以静态页面或HTTP替身冒充真实业务验收。

## 延期与恢复条件

| 项目 | 当前处理及恢复条件 |
|---|---|
| Harness生产运行时/Node sidecar | 当前否决组合保留为候选；通过同等Electron兼容、工具隔离与安装探针后新ADR重新选型，不能直接重新引入 |
| token流式展示 | 先落持久业务事件/恢复，再按交互需要接token流；未实现且不作为本轮C02a完成条件；C03仍需完成正式事件接口 |
| Windows、签名与最终安装/升级 | 用户明确后置；核心需求完成后C07恢复本机验收，跨平台交付目标不删 |
| 全语种专业质量、向量检索、自动维护、多用户/通用插件 | 首版不承诺；分别按语言样本、数据规模或新产品需求再开任务，不能混入当前已完成范围 |
| CRM/订单历史 | 原方案参考能力，当前无独立MVP验收；需要产品确认后再新增范围 |

## 立即执行顺序与边界

本轮完成文档对照并交C02a，随后按C02b中已有公开服务的部分推进；B/A交付后接C01b/C01c与写工具。C04的本地评估结构可并行，真实模型调用等有效配置；C05/C06等业务契约和来源，C03等持久事件协议。无需等A/B全部项目结束，也不为绕过归属修改公共DTO或预留迁移。

原04页的resume/派生run及自动退避数字为规划期方案；当前C01b草案采用同runId的显式retry增attempt、默认不自动重发收费请求。B确认后方能冻结公共协议。C02a只有内部JSON动作协议，既非新增IPC也非Provider原生tool_calls，不能把内部ReadOutcome映射为已保存AgentRun。阶段取舍见 [[0016-受限只读工具循环分阶段接入]]。

关联 [[05-三人分工与开发步骤]]、[[04-接口与Agent契约]]、[[C01-Agent运行恢复与集成]]、[[C02a-受限只读工具循环]]、[[项目状态]]。
