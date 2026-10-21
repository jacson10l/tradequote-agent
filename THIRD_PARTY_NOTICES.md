# Third-party notices

本文件记录目前仓库内的上游代码副本和 M0 验证依赖，不代表尚未生成的桌面安装包已有完整许可清单。项目自身代码许可证尚未选择。

## Solivio

Copyright (c) 2026 Solivio contributors — MIT。

实验用原样复制的 CSV parser 与报价 totals 文件位于 `experiments/m0-reuse/vendor/solivio/`。完整 MIT 文本保存在 [LICENSE](experiments/m0-reuse/vendor/solivio/LICENSE)，来源与修改记录见 [UPSTREAM.md](UPSTREAM.md)。

## DeepSeek Harness

Copyright (c) 2026 DeepSeek — MIT。

M0 通过 npm 包使用 SDK/runtime/tools `0.2.1-rc.2`，完整上游 MIT 文本保存在 [LICENSE](experiments/m0-reuse/vendor/harness/LICENSE)。包内附带的许可证和第三方声明须随实际分发保留。

## 其他实验依赖

`csv-parse`、`decimal.js`、`tsx` 及传递依赖的版本/integrity 见 [锁文件](experiments/m0-reuse/pnpm-lock.yaml)；许可证以对应发布包中的 LICENSE/NOTICE 为准。M0 没有发布或重新分发安装包。M1/M6 构建交付物时需生成覆盖全部实际分发内容的许可清单，包含 Node/Electron、原生模块、字体及各自第三方声明。

## M0 平台实验新增依赖

本轮通过包管理器使用 Electron/electron-builder、better-sqlite3、Drizzle、ExcelJS、csv-parse、Mammoth、PDF.js、JSZip、fast-xml-parser、Zod、decimal.js、React/react-pdf，未复制修改其上游源码。精确版本与许可证字段见 [依赖记录](experiments/m0-platform/evidence/dependencies.json) 和锁文件；构建保留 node_modules 内上游许可。Harness 保留开发对照，不进本轮生产依赖。

PDF 离线字体使用 @fontsource/noto-sans 5.3.0、noto-sans-sc 5.3.1、noto-sans-arabic 5.3.0，SIL Open Font License 1.1；字体原始 LICENSE 随包保留，记录包含 SHA-256。正式发行仍需完整传递依赖许可清单；本段不是全量发行合规审计。
