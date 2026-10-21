# M0 上游复用探针

本目录是独立验证工程，不是 Electron 应用。复用决策见 [技术验证记录](../../wiki-project/wiki/技术验证记录.md)，来源和许可见 [UPSTREAM](../../UPSTREAM.md)。

## 复现

已实测 macOS 26.4 / arm64、Node 22.22.0、pnpm 10.13.1：

```sh
pnpm --dir experiments/m0-reuse install --frozen-lockfile --ignore-scripts
pnpm --dir experiments/m0-reuse test
```

也可以分别运行 `pnpm --dir experiments/m0-reuse test:solivio` 与 `pnpm --dir experiments/m0-reuse probe:harness`。根目录没有应用启动或打包命令。

安装使用 `--ignore-scripts`；本探针实际可运行不代表被禁用的 PTY/其他原生功能或 Electron 打包已经验证。锁文件固定完整依赖树；`@opentelemetry/api` 覆盖到 1.9.1，满足当前上游 `^1.9.1` 和 OTel SDK `<1.10.0` 的交集。Node 24、Electron 内嵌 Node 仍需后续验证。

## 内容与证据

| 文件 | 作用 |
|---|---|
| `vendor/solivio/` | 两个逐字复制的上游函数文件、MIT 许可、来源 hash；只供对照实验 |
| `solivio.test.ts` | 11 个行为刻画：3 个兼容样例、8 个差异；差异断言通过不等于上游符合产品契约 |
| `business-tools.mjs` | 三个业务工具的受控桥接，拒绝额外参数，传递取消信号 |
| `harness-probe.mjs` | 真正启动已发布 runtime；本地模拟模型 HTTP 服务和内存业务服务；断言工具集、生命周期、恢复与幂等 |
| `collect-evidence.mjs` | 校验 vendor hash、运行探针、记录命令退出码、版本与文件 hash |
| [evidence/summary.json](evidence/summary.json) | 最新可复现实验摘要 |
| [evidence/solivio.tap](evidence/solivio.tap) | 完整测试结果 |
| [evidence/harness.json](evidence/harness.json) | Harness 检查项与合成请求摘要 |
| [evidence/source-audit.json](evidence/source-audit.json) | 本轮静态检查文件的 commit/hash |

探针不读取 `.env` 或任何凭据文件，不继承真实 Key；只向 `127.0.0.1` 的随机端口发模型请求，使用明确的合成 Key。摘要只检查环境变量名称是否存在，不读取其值。Harness 状态与生成的 profile 保存在忽略的 `.runtime/`，不提交完整会话日志。

进程检查目前使用 macOS/Linux 的 `ps`；Windows 会明确失败，不能把本脚本当作已支持 Windows 的证明。Solivio 源文件保持不改，类型导入在 tsx 执行时擦除；没有声称上游完整工程构建或 TypeScript 全量类型检查通过。

业务服务是内存 fixture，在 Harness 重启期间宿主保持运行。这里验证的是业务写入由宿主控制、重复调用返回同一版本；SQLite 崩溃一致性、宿主重启幂等、并发冲突及真实审批尚未实现。JSON 最终文本由测试解析验证，不代表真实模型总能遵守 schema。
