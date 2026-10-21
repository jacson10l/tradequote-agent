# tradequote-agent

外贸询报价协同桌面 Agent。以企业导入的商品、价格和知识资料为依据，辅助完成跨品类询盘理解、报价、需求变更、复核及多语言对外输出。

**当前已进入 M0，完成上游复用的本机实验；尚未初始化 Electron 应用或完成 MVP。** 已确定采用 Electron＋React＋TypeScript，首版单机保存数据，优先接入 DeepSeek；macOS 和 Windows 均须实际安装验收。UI 使用 `getdesign` 的 **mistral.ai** 参考，并适配为浅色单据工作台。

最新结论：[M0 技术验证记录](wiki-project/wiki/技术验证记录.md)。Solivio 不整体 Fork，CSV/金额采用 csv-parse 与 decimal.js；Harness 的受控业务 profile、取消与恢复实验通过，有条件采用 SDK/runtime，真实模型和双平台打包仍待验收。

## 从这里开工

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
