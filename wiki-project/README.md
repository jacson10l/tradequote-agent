# 工程知识库

从 [项目索引](index.md) 开始，当前状态见 [[项目状态]]，逐项落实见 [[工程Wiki要求对照]]。这里保存工程知识；未来企业商品/询盘业务知识由应用数据目录负责。

当前已有基于真实 M0 源码的架构/能力/状态页、任务与 ADR、机械快照/覆盖及可执行门禁。Electron 产品、真实模型与双平台验收仍未完成。原始资料位于 raw/inputs 与 raw/design，保持原样。

从项目根目录运行：

```sh
node wiki-project/scripts/build-code-index.mjs . --check
node wiki-project/scripts/lint-wiki.mjs .
node --test wiki-project/scripts/wiki-tools.test.mjs
```

源内容变化后先更新知识页与分类，再 `node wiki-project/scripts/build-code-index.mjs .`。需要新采集基线时才加 `--ingest`；日常检查不改基线。

[规则](AGENTS.md)、[[Wiki 工作流与任务记录]]、[验证记录](raw/wiki-validation.json)说明维护与实际结果。标准库脚本不依赖应用依赖安装；根目录应用启动/打包命令仍不存在。


本目录只维护工程源码与交付知识。业务LLM Wiki计划位于各workspace运行数据中，原件/Markdown/人工发布/检索维护见 [[A业务LLMWiki方案]]；新A01验收与B00差距分别见 [[A01-知识发布与来源查询]]、[[B00知识契约差距与补充]]。不要把企业客户原件写入本工程Wiki。
