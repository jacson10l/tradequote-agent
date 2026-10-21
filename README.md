# tradequote-agent

外贸询报价协同桌面 Agent。以企业导入的商品、价格和知识资料为依据，辅助完成跨品类询盘理解、报价、需求变更、复核及多语言对外输出。

**当前已有 M0 本机平台探针和独立 Electron 模型设置窗口；正式产品与 MVP 尚未完成。** 已确定采用 Electron＋React＋TypeScript，首版单机保存数据，优先接入 DeepSeek；最终安装和双平台验收按用户本轮决定暂缓。UI 使用 `getdesign` 的 **mistral.ai** 参考，并适配为浅色单据工作台。

最新结论：[M0 平台验证记录](wiki-project/wiki/M0平台验证记录.md)。Solivio 不整体 Fork，CSV/金额采用 csv-parse 与 decimal.js；Harness 在普通 Node 的历史实验通过，但在 Electron 44.9.2 初始化失败，当前默认改选最小执行器。

正式前端与契约基线还包括 **Tailwind CSS、shadcn/ui、Lucide React、Zod、React Hook Form＋@hookform/resolvers、React Router、TanStack Query**，质量基线为 Biome、tsc、Vitest、React Testing Library 与 Playwright Electron。当前 Zod 仅已用于 M0 部分契约，Tailwind/shadcn 等正式 UI 尚未接入；逐项职责、落地状态和 M1 任务见[技术栈细节](wiki-project/wiki/02-技术选型与架构.md#共享前端与契约具体依赖及落地状态)。

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

见 [探针说明与证据](experiments/m0-reuse/README.md)、[上游来源](UPSTREAM.md)和[许可声明](THIRD_PARTY_NOTICES.md)。实验使用真正安装的 Harness 与本地模拟模型/业务服务；没有真实 DeepSeek 调用、Electron 安装包或 Windows 验收通过的结论。根目录应用启动/构建命令仍待 M1 实现。

## M0 平台探针与系统设置

[独立平台探针](experiments/m0-platform/README.md)验证真实 SQLite、解析、PDF 和最小工具执行器。启动模型设置页：

```sh
pnpm --dir experiments/m0-platform settings
```

在页面填写 API Key，保存后测试连接、选择账户可用模型；Key 不放进聊天或仓库。设置页目前是 M0 验证界面，正式 React 产品尚未初始化。真实模型结果只有执行连接/模型验证后才成立。
