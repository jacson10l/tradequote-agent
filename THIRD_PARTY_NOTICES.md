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
