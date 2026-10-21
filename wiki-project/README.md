# 工程知识库

本轮C01b准备入口：[[C01b存储接口与事务方案]]、[[C01b恢复测试用例]]、[[C01b-存储与恢复准备]]。本分支从共同基线独立建立，B00/C01a其他分支的进展只按固定提交引用，未提前合入实现。

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
