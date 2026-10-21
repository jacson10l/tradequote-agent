# tradequote-agent

外贸询报价协同桌面 Agent。以企业导入的商品、价格和知识资料为依据，辅助完成跨品类询盘理解、报价、需求变更、复核及多语言对外输出。

**当前已进入 M1：正式 Electron＋React 工作台可创建、修改和重开本地工作区；完整报价 MVP 尚未完成。** 首版单机保存数据，优先接入 DeepSeek；最终安装和双平台验收按用户决定暂缓。UI 使用 `getdesign` 的 **mistral.ai** 参考，并适配为浅色单据工作台。

最新结论：[M0 平台验证记录](wiki-project/wiki/M0平台验证记录.md)。Solivio 不整体 Fork，CSV/金额采用 csv-parse 与 decimal.js；Harness 在普通 Node 的历史实验通过，但在 Electron 44.9.2 初始化失败，当前默认改选最小执行器。

正式前端已接入 **Tailwind CSS、shadcn 组件组织方式、Lucide、Zod、React Hook Form＋resolvers、React Router、TanStack Query**；Biome、tsc、Vitest、React Testing Library 与 Playwright Electron 已建立检查入口。当前真实业务是工作区持久化，报价表格/差异为明确标注的合成预览。实现与剩余范围见 [M1 工程基线](wiki-project/wiki/M1工程基线.md) 和 [M1 任务](wiki-project/wiki/tasks/2026-10-21-M1工程初始化.md)。

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

原生测试使用 Electron 的 Node ABI；若重新安装原生依赖后报 ABI 不匹配，运行 `pnpm native:rebuild`。`package:mac`/`package:win` 配置 DMG/NSIS，不自动发布；本轮未做最终安装验收。完整模型评估入口待 T40 实现，不提供假成功命令。CI 与三人职责见 [M1 验证与协作](wiki-project/wiki/M1验证与协作.md)。

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

在页面填写 API Key，保存后测试连接、选择账户可用模型；Key 不放进聊天或仓库。模型设置目前仍为 M0 验证界面，迁入正式 React 系统设置属于 T40；正式工作区设置已经实现。真实模型结果只有执行连接/模型验证后才成立。
