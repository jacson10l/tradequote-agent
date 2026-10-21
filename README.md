# tradequote-agent

外贸询报价协同桌面 Agent。以企业导入的商品、价格和知识资料为依据，辅助完成跨品类询盘理解、报价、需求变更、复核及多语言对外输出。

**正式 Electron＋React 工作台已接通手工报价 V1：演示场景、CSV 预览确认、价目表核价、草稿保存与重开；并新增正式 DeepSeek 设置、询盘理解、两轮 V2/V3 与差异；完整报价 MVP 尚未完成。** 首版单机保存数据，优先接入 DeepSeek；最终安装和双平台验收按用户决定暂缓。UI 使用 `getdesign` 的 **mistral.ai** 参考，并适配为浅色单据工作台。

最新结论：[M0 平台验证记录](wiki-project/wiki/M0平台验证记录.md)。Solivio 不整体 Fork，CSV/金额采用 csv-parse 与 decimal.js；Harness 在普通 Node 的历史实验通过，但在 Electron 44.9.2 初始化失败，当前默认改选最小执行器。

正式前端已接入 **Tailwind CSS、shadcn 组件组织方式、Lucide、Zod、React Hook Form＋resolvers、React Router、TanStack Query**；Biome、tsc、Vitest、React Testing Library 与 Playwright Electron 已建立检查入口。当前真实业务包括工作区与手工 V1 持久化；首页原报价布局/差异仍为明确标注的合成预览，真实操作进入“资料与报价”。实现与剩余范围见 [M1 工程基线](wiki-project/wiki/M1工程基线.md) 和 [M1 任务](wiki-project/wiki/tasks/2026-10-21-M1工程初始化.md)。

## 启动正式工程

使用 Node **22.22.0**、pnpm **10.13.1**，无需安装数据库服务：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

安装时自动为 Electron 重建 SQLite。数据保存在 Electron userData 的 workspaces/default 目录，首次打开为空工作台。开发检查：

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm wiki:generate
pnpm check
pnpm wiki:sync --base <本次任务开始的提交>
pnpm wiki:test
```

产品图标已接入 Dock/窗口及打包；重启 `pnpm dev` 后生效。外壳固定到窗口，滚动由 main 主区域承担；≤1000px 显示图标导航。图标源修改后运行 `pnpm icons:generate`，构建会检查 SVG/PNG/ICNS/ICO 同步。当前增量与边界见 [M1 布局图标与契约任务](wiki-project/wiki/tasks/2026-10-21-M1布局图标与契约补齐.md)。

原生测试使用 Electron 的 Node ABI；若重新安装原生依赖后报 ABI 不匹配，运行 `pnpm native:rebuild`。`package:mac`/`package:win` 配置 DMG/NSIS，不自动发布；本轮未做最终安装验收。完整模型评估入口待 T40 实现，不提供假成功命令。CI 与三人职责见 [M1 验证与协作](wiki-project/wiki/M1验证与协作.md)。

## 参赛方案与下一步

依据用户提供的参赛任务截图，现行 [六项要求与验收](wiki-project/wiki/参赛要求对齐与验收.md) 明确：两种目标语言或两类角色/场景二选一；不要求两个电商平台；批量生成为鼓励项。项目选择英德首批实测，新增平台/文化适配 AC-17，并用风险标记＋文本批注验收两种反馈。手工草稿 V1 已实现，正式模型与受限修订已接入，真实供应商评估及正式审批未完成。

下一轮按 [开发优先级](wiki-project/wiki/05-三人分工与开发步骤.md) 推进：场景与契约→真实 V1→两轮对话修订→适配、检查和审批产出→稳定演示→双平台交付。跨品类、任意目标语言和原有项目交付门槛保留。

## 试用真实手工报价 V1

启动后创建工作区，进入“资料与报价”：保存可编辑演示场景→选择 UTF-8 CSV（或填入合成样本）→解析预览→人工确认发布→输入客户/询盘、选择商品和数量→计算并保存 V1。关闭应用重开可读取原报价。合成上衣 100 件按 9 USD 档位得到商品合计 900.00 USD；缺价格保持未知。

固定 CSV 表头与边界见 [手工 V1 说明](wiki-project/wiki/M2真实报价V1.md)。商品合计未含运税费，所有报价仍为未审核草稿；不支持覆盖已有 SKU、正式审批或 PDF；V2/V3和模型入口见下节，真实供应商尚未验收。样本是明确合成资料，不代表平台规则或真实价格。验证见 [本轮任务](wiki-project/wiki/tasks/2026-10-21-演示场景与报价V1.md)。

## 试用询盘理解和两轮修改

正式应用“模型设置”中填写 Key 和账户可用模型 ID，保存并测试；然后在“资料与报价”发布样本，填“询盘客户”和100件 DEMO-TEE 需求，点击理解保存V1。第一轮改数量为120存V2，第二轮改付款与交期存V3；下方选择历史版本并比较字段/金额。所有版本仍是未审核草稿。

[模型与修订说明](wiki-project/wiki/M4模型与报价修订.md)记录支持字段、数据发送与加密边界。当前自动化使用本地HTTP替身；真实DeepSeek效果需在应用配置Key后验证，不要把Key贴到聊天。下一优先级是真实模型语义/取消恢复→平台文化与双反馈→人工审批/语言产出/PDF→稳定演示和双平台。

## 三人并行开发交接

本批共同起点/PR目标为 `origin/codex/m1-foundation`。成员必须在独立工作目录各开任务分支，禁止直接在main/集成分支开发。

| 成员 | 首批负责模块 | 分支与任务 |
|---|---|---|
| A | 知识资料暂存/人工发布、来源和适用性查询 | codex/a01-knowledge-publish；[A01任务](wiki-project/wiki/tasks/A01-知识发布与来源查询.md) |
| B | 公共契约、两类规则检查、风险标记＋文本批注 | 先codex/b00-first-batch-contracts，再codex/b01-rules-feedback；[B任务](wiki-project/wiki/tasks/B01-规则检查与双反馈.md) |
| C | DeepSeek评估、Agent取消/中断/重试、桌面集成 | codex/c01-agent-recovery；[C01任务](wiki-project/wiki/tasks/C01-Agent运行恢复与集成.md) |

开工命令、公共文件边界、依赖和验收见 [交接入口](wiki-project/wiki/三人并行开发交接.md)，新接口定义见 [首批接口约定](wiki-project/wiki/首批并行接口约定.md)。[B00公共契约](wiki-project/wiki/tasks/B00-首批公共契约.md)已在独立分支实现，知识/检查/run服务仍待开发。A/C先审阅接口并继续样本/模型与状态机工作，依赖新DTO的代码等B00评审合入共同分支；正式客户端目前明确返回能力未接入，不伪造成功。

## 从这里开工

**P0 必须遵守：每次编码交付同步工程 Wiki。相关知识页、任务页、追加日志或校验缺一项，任务不得标完成、PR 不得合并。** 所有成员及编码 Agent 的具体要求见 [贡献规范](CONTRIBUTING.md) 和 [协作规则](AGENTS.md)。

1. 三人一起读 [决策与 MVP 验收](wiki-project/wiki/01-MVP范围与验收.md)，确认交付口径。
2. 按 [技术选型与架构](wiki-project/wiki/02-技术选型与架构.md) 执行 M0 技术验证，填写实测结果，冻结可运行的版本组合。
3. 共同审阅 [数据契约](wiki-project/wiki/03-领域与数据契约.md) 和 [接口与 Agent 契约](wiki-project/wiki/04-接口与Agent契约.md)。
4. 领取 [三人分工与开发步骤](wiki-project/wiki/05-三人分工与开发步骤.md) 中有明确依赖和完成标准的任务。
5. 每个里程碑按 [测试与交付](wiki-project/wiki/06-测试与交付.md) 留下证据。

完整导航见 [项目知识库](wiki-project/index.md)，界面规范见 [DESIGN.md](DESIGN.md)，协作规则见 [AGENTS.md](AGENTS.md)。

## 运行状态

独立探针可以复现，已实测 macOS arm64、Node 22.22.0、pnpm 10.13.1：

```sh
pnpm --dir experiments/m0-reuse install --frozen-lockfile --ignore-scripts
pnpm --dir experiments/m0-reuse test
```

见 [探针说明与证据](experiments/m0-reuse/README.md)、[上游来源](UPSTREAM.md)和[许可声明](THIRD_PARTY_NOTICES.md)。历史实验使用真正安装的 Harness 与本地模拟模型/业务服务；不代表真实 DeepSeek 或 Windows 验收通过。独立实验锁文件保留，不纳入正式 workspace。

## M0 平台探针与系统设置

[独立平台探针](experiments/m0-platform/README.md)验证真实 SQLite、解析、PDF 和最小工具执行器。启动模型设置页：

```sh
pnpm --dir experiments/m0-platform settings
```

在页面填写 API Key，保存后测试连接、选择账户可用模型；Key 不放进聊天或仓库。该命令仅启动历史M0页面；正式应用已提供“模型设置”，不会自动读取或迁移M0凭据。真实模型结果只有执行连接/模型验证后才成立。

macOS 开发启动使用本地 TradeQuote.app，Dock 名称与图标一致；重启 pnpm dev 生效，已有工作区目录保留。
