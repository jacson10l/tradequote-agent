# M0 平台与模型设置探针

独立技术实验，不是 M1 正式产品。运行合成 SQLite、解析、多语言 PDF 与最小工具执行器；提供最小模型设置窗口。业务数据与 PDF 临时目录由探针创建，自动清理，生成预览保留在忽略的 `.runtime/artifacts/`。

```sh
pnpm --dir experiments/m0-platform install --frozen-lockfile
pnpm --dir experiments/m0-platform exec electron-builder install-app-deps
pnpm --dir experiments/m0-platform typecheck
pnpm --dir experiments/m0-platform test:contracts
pnpm --dir experiments/m0-platform probe
pnpm --dir experiments/m0-platform settings
pnpm --dir experiments/m0-platform package:mac
```

`better-sqlite3` 重建为 Electron ABI 后，不用系统 Node 加载该原生库；数据库和解析探针在 Electron Utility Process 运行。运行系统使用 Node 22.22.0/pnpm 10.13.1，Electron 内嵌版本以 evidence 报告为准。

`probe` 的模型端只连接 loopback 合成服务，不读 `.env`，不调用真实 DeepSeek。`electron . --harness-candidate` 额外执行已知不兼容的 Harness 候选，预期会返回非零；失败证据保留，不计入默认已选路线通过的命令。候选 SDK/runtime 0.2.1-rc.2 在 Electron 44.9.2 原生加载器初始化失败，最小执行器作为当前默认方向。该执行器尚无完整产品 AgentRun 持久化/流式/恢复 UI。

## 模型设置

设置页使用真实 Electron 沙箱、窄 IPC、主进程 safeStorage。Key 由用户在页面输入，只返回是否配置；无法加密时仅内存保留。连接测试向固定官方 HTTPS 接口获取模型列表；验证模型发送一条合成 JSON 请求，会产生实际 API 请求。没有自动推断账户可用型号。

配置存放在系统 userData 的 `model-settings/credentials.enc`；JSON 连接结果在同目录 `model-validation.json`，不含 Key。不要把该目录复制进仓库。正式产品须沿用稳定应用标识和签名再做升级凭据验收；当前独立探针凭据不承诺自动迁入 M1。最小页面是独立 HTML，不代表 React/TypeScript 产品界面已完成。

## 验证边界

- SQLite：真实原生模块/Drizzle、decimal TEXT、外键、事务失败、进程强杀未提交回滚、重启幂等、迁移/备份回读。探针 schema 仅验证机制，不是全量业务迁移。
- 解析：ExcelJS、csv-parse、Mammoth＋OOXML 位置适配、PDF.js；明确拒绝旧 XLS/DOC/XLSM。公式只读缓存。DOCX 合并单元格/文本框/修订和复杂来源仍需扩大样本。
- PDF：同 120 行长表比较 printToPDF 与 react-pdf，离线嵌入 Noto 三字体；中文/德文、分页/行标记自动检查。阿拉伯文字形视觉抽查和精确文本回读分开记录，不能把渲染成功当作所有语言正确。
- contracts.ts 是 T00 部分可执行约束，四项测试通过不等于三人评审或全部公共契约冻结。
- 用户本轮决定先不做最终安装/双平台验收；M0 风险清单保留，允许推进可独立开发内容。

结果见 `evidence/desktop.json`、`evidence/packaged.json`（实际执行后产生）、`evidence/validation.json`。初次失败见 `evidence/initial-desktop.json`。版本与来源见 `package.json`、`pnpm-lock.yaml` 和 Wiki 的 M0 平台验证记录。
