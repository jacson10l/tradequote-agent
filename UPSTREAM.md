# 上游来源与复用决定

2026-10-21。结论依据 [M0 技术验证记录](wiki-project/wiki/技术验证记录.md)，完整证据在 [探针目录](experiments/m0-reuse/README.md)。

## Solivio

- 仓库：[solivio-ai/solivio](https://github.com/solivio-ai/solivio)。
- 核查与复制 commit：`0418df8d0568da80da421dc14da36bf2d7e4d0e1`。
- 许可：MIT，Copyright (c) 2026 Solivio contributors。
- **决定：不整体 Fork，不将目前抽取的两个文件用于生产。CSV 用 csv-parse，金额用 decimal.js 和自有领域校验。** 商品导入/报价/资料来源流程可作为设计参考。

| 上游文件 | 仓库内副本 | 修改 | 用途 |
|---|---|---|---|
| `modules/csv-import/src/lib/productParser.ts` | [productParser.ts](experiments/m0-reuse/vendor/solivio/productParser.ts) | 无 | CSV 与商品映射行为对照 |
| `modules/offers/src/lib/offerTotals.ts` | [offerTotals.ts](experiments/m0-reuse/vendor/solivio/offerTotals.ts) | 无 | 金额精度与输入校验对照 |
| `LICENSE` | [Solivio LICENSE](experiments/m0-reuse/vendor/solivio/LICENSE) | 无 | 保留完整许可 |

来源路径和 SHA-256 见 [provenance.json](experiments/m0-reuse/vendor/solivio/provenance.json)。这些副本仅属于实验工程，不是应用依赖。未复制上游 UI、服务、数据库模型或 PDF 模板。

## DeepSeek Harness

- 静态核查仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，commit `687f282e8625c6b8d11ff58211a90524be2e4317`。
- 实际执行 npm 发布的 `@deepseek-ai/dsh-sdk-client`、其依赖 `@deepseek-ai/dsh`、工具插件 API `@deepseek-ai/dsh-tools`，均为 `0.2.1-rc.2`。
- npm 查询未返回 `gitHead`；**源码核查 commit 与发布包分别记录，不声称发布包必然由该 commit 构建**。
- client 包 integrity：`sha512-EsG89x2rIhIT5pu/yBwJ1/By7ptPqjAEEEAAX1pjwswUkRrtip/SPSyhpxMNb8krbJROGi1ar5zr/c3hxLwXIA==`。
- runtime 包 integrity：`sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==`。
- 全部解析版本/integrity 以 [pnpm-lock.yaml](experiments/m0-reuse/pnpm-lock.yaml) 为准。实验所用主版本组合见 [summary.json](experiments/m0-reuse/evidence/summary.json)。
- 许可：MIT，Copyright (c) 2026 DeepSeek；保留 [Harness LICENSE](experiments/m0-reuse/vendor/harness/LICENSE)。
- **决定：有条件复用官方 SDK/runtime，通过自有业务 profile 和 AgentRuntime adapter 接入，不 Fork 内核。** 本机能力实验通过；真实模型、双平台安装和最终版本冻结尚未通过，不提前承诺上线可用。
- SDK 启动 runtime 子进程；插件独立桥接宿主应用服务。每次仅允许一个活动运行拥有该进程，取消关闭进程，恢复复用 sessionId 并由宿主检查业务版本/幂等。
- 不复制上游应用 UI；不启用其默认 shell、文件操作、任意 MCP 服务器或用户可编辑插件配置。

独立锁定的 `@opentelemetry/api: 1.9.1` 是本实验的依赖解析修正，没有修改上游源码。完整分发依赖及其 NOTICE/字体/原生二进制许可须在安装包形成时重新汇总。
