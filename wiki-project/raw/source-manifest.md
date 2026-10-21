# 当前源码采集来源

本清单记录当前项目工程 Wiki 的纳管范围。历史上游阅读、设计生成与输入来源保留在 [规划期来源核查](规划期来源核查.md)；当时“未运行/未复制”属于历史观察，当前能力以 [[系统架构]] 和 [[技术验证记录]] 为准。

## 固定采集基线

<!-- ingest:start -->
采集时间：2026-10-20T18:55:33.524Z；项目路径（已脱敏，仓库相对）：`.`。

基线 HEAD：`8fc9a9ba39e51fb7db195300d81b541dd3a3a843`；分支：`main`。

工作区差异（只记录路径及状态，不读取凭据内容）：

```text
M README.md
?? .gitignore
?? AGENTS.md
?? DESIGN.md
?? THIRD_PARTY_NOTICES.md
?? UPSTREAM.md
?? experiments/m0-reuse/README.md
?? experiments/m0-reuse/business-tools.mjs
?? experiments/m0-reuse/collect-evidence.mjs
?? experiments/m0-reuse/evidence/docs-check.json
?? experiments/m0-reuse/evidence/harness.json
?? experiments/m0-reuse/evidence/harness.stdout.log
?? experiments/m0-reuse/evidence/install-frozen.log
?? experiments/m0-reuse/evidence/install-initial.log
?? experiments/m0-reuse/evidence/install-pinned.log
?? experiments/m0-reuse/evidence/solivio.tap
?? experiments/m0-reuse/evidence/source-audit.json
?? experiments/m0-reuse/evidence/summary.json
?? experiments/m0-reuse/harness-probe.mjs
?? experiments/m0-reuse/package.json
?? experiments/m0-reuse/pnpm-lock.yaml
?? experiments/m0-reuse/solivio.test.ts
?? experiments/m0-reuse/vendor/harness/LICENSE
?? experiments/m0-reuse/vendor/solivio/LICENSE
?? experiments/m0-reuse/vendor/solivio/offerTotals.ts
?? experiments/m0-reuse/vendor/solivio/productParser.ts
?? experiments/m0-reuse/vendor/solivio/provenance.json
?? wiki-project/.obsidian/app.json
?? wiki-project/AGENTS.md
?? wiki-project/CONTEXT.md
?? wiki-project/README.md
?? wiki-project/index.md
?? wiki-project/log.md
?? wiki-project/raw/design/claude-original.md
?? wiki-project/raw/design/mistral-original.md
?? wiki-project/raw/file-provenance.json
?? "wiki-project/raw/inputs/\345\244\226\350\264\270\350\257\242\346\212\245\344\273\267\345\215\217\345\220\214 Agent \345\256\214\346\225\264\344\272\247\345\223\201\344\270\216\345\256\236\346\226\275\346\226\271\346\241\210.md"
?? "wiki-project/raw/inputs/\351\241\271\347\233\256\346\236\204\345\273\272\346\212\200\346\234\257\346\240\210.md"
?? wiki-project/raw/planning-checks.json
?? wiki-project/raw/source-manifest.md
?? wiki-project/raw/upstream-audit.json
?? wiki-project/raw/wiki-validation.json
?? "wiki-project/raw/\350\247\204\345\210\222\346\234\237\346\235\245\346\272\220\346\240\270\346\237\245.md"
?? wiki-project/scripts/build-code-index.mjs
?? wiki-project/scripts/lint-wiki.mjs
?? wiki-project/scripts/wiki-config.json
?? wiki-project/scripts/wiki-lib.mjs
?? wiki-project/scripts/wiki-tools.test.mjs
?? "wiki-project/wiki/01-MVP\350\214\203\345\233\264\344\270\216\351\252\214\346\224\266.md"
?? "wiki-project/wiki/02-\346\212\200\346\234\257\351\200\211\345\236\213\344\270\216\346\236\266\346\236\204.md"
?? "wiki-project/wiki/03-\351\242\206\345\237\237\344\270\216\346\225\260\346\215\256\345\245\221\347\272\246.md"
?? "wiki-project/wiki/04-\346\216\245\345\217\243\344\270\216Agent\345\245\221\347\272\246.md"
?? "wiki-project/wiki/05-\344\270\211\344\272\272\345\210\206\345\267\245\344\270\216\345\274\200\345\217\221\346\255\245\351\252\244.md"
?? "wiki-project/wiki/06-\346\265\213\350\257\225\344\270\216\344\272\244\344\273\230.md"
?? "wiki-project/wiki/07-\346\234\215\345\212\241\345\231\250\346\274\224\350\277\233\344\270\216\351\243\216\351\231\251.md"
?? "wiki-project/wiki/Wiki \345\267\245\344\275\234\346\265\201\344\270\216\344\273\273\345\212\241\350\256\260\345\275\225.md"
?? "wiki-project/wiki/decisions/0001-Mistral\345\267\245\344\275\234\345\217\260\351\243\216\346\240\274.md"
?? "wiki-project/wiki/decisions/0002-\344\270\212\346\270\270\345\244\215\347\224\250\346\226\271\345\274\217.md"
?? "wiki-project/wiki/decisions/0003-\345\267\245\347\250\213Wiki\347\273\264\346\212\244\345\237\272\347\272\277.md"
?? "wiki-project/wiki/tasks/2026-10-21-M0\346\212\200\346\234\257\351\252\214\350\257\201.md"
?? "wiki-project/wiki/tasks/2026-10-21-\345\267\245\347\250\213Wiki\350\241\245\351\275\220.md"
?? "wiki-project/wiki/\345\267\245\347\250\213Wiki\350\246\201\346\261\202\345\257\271\347\205\247.md"
?? "wiki-project/wiki/\346\212\200\346\234\257\351\252\214\350\257\201\350\256\260\345\275\225.md"
?? "wiki-project/wiki/\346\225\260\346\215\256\346\214\201\344\271\205\345\214\226\344\270\216\347\212\266\346\200\201.md"
?? "wiki-project/wiki/\346\240\270\345\277\203\344\270\232\345\212\241\346\265\201\347\250\213.md"
?? "wiki-project/wiki/\346\265\213\350\257\225\344\270\216\351\252\214\350\257\201\345\234\260\345\233\276.md"
?? "wiki-project/wiki/\347\237\245\350\257\206\345\272\223\345\217\257\351\235\240\346\200\247\344\270\216\350\246\206\347\233\226\350\214\203\345\233\264.md"
?? "wiki-project/wiki/\347\263\273\347\273\237\346\236\266\346\236\204.md"
?? "wiki-project/wiki/\350\277\220\350\241\214\346\227\266\350\203\275\345\212\233\345\234\260\345\233\276.md"
?? "wiki-project/wiki/\351\205\215\347\275\256\350\267\257\345\276\204\344\270\216\346\225\217\346\204\237\344\277\241\346\201\257.md"
?? "wiki-project/wiki/\351\241\271\347\233\256\347\212\266\346\200\201.md"
?? "wiki-project/wiki/\351\242\206\345\237\237\350\257\215\346\261\207\350\241\250.md"
?? "wiki-project/wiki/\351\243\216\351\231\251\344\270\216\345\276\205\351\252\214\350\257\201\344\272\213\351\241\271.md"
```
<!-- ingest:end -->

机器基线见 [ingest-baseline.json](ingest-baseline.json)。首次项目快照提交前仅脱敏本机路径，保留原采集时间、HEAD 和文件 hash。显式 --ingest 才更新此区块与基线；普通 generate/--check/lint 不调用当前 HEAD 覆写基线。未提交文件的 hash 只代表工作区观察，不属于基线 commit。

## 纳管与排除

- 项目根 README/AGENTS/DESIGN/.gitignore、来源许可；M0 源码/测试/manifest/锁文件、原样 vendor 与已阅读的合成 evidence。
- 路径、类型、行数、hash、职责映射由 [[代码清单]]、[[源码快照]]、[[源码覆盖矩阵]] 记录。
- 排除 Wiki 自身、.git、node_modules、dist/build/target/coverage/release、缓存、.runtime/.scratch、凭据/私钥/真实数据库；读取内容前过滤名称。不跟随任何符号链接，也拒绝引用或输出路径越界。
- 普通日志不读；仅显式允许现有 M0 evidence 日志。新增受支持文本文件须人工映射，否则失败；未知扩展需扩展扫描器，不能据全覆盖宣称任意二进制已审阅。
- Wiki 维护脚本不递归纳入应用清单；单独保存工具指纹，运行反向测试并引用其源码行号。

## 已阅读与未深读

已完整阅读用户技术栈文档、项目规则和根文档、M0 自有代码/测试/入口/桥接/注册/状态边界以及两个上游抽取文件；检查许可证、来源哈希和既有结果。锁文件检查 importer、版本覆盖和依赖边界，完整内容纳入 SHA-256，未逐行审计传递依赖。没有读取 node_modules、真实运行数据库、密钥或临时会话。

当前没有 Electron 构建/CI、生产 schema/迁移或产品 UI。这些是未实现项，不生成虚构机械条目。对应范围说明见 [[知识库可靠性与覆盖范围]] 和 [[命令与运行时清单]]。

## 来源证据

- [原始技术栈](inputs/项目构建技术栈.md)、[原始产品方案](<inputs/外贸询报价协同 Agent 完整产品与实施方案.md>)、[归档指纹](file-provenance.json)。原件保持不变。
- [当前 Mistral 参考](design/mistral-original.md)、[已替换 Claude 参考](design/claude-original.md)。当前根 DESIGN.md 是视觉规范，决策见 [[0001-Mistral工作台风格]]。
- [既有上游源码核查](upstream-audit.json)、[历史规划检查](planning-checks.json)。均是历史记录，不代表本轮检查。
- [本轮 Wiki 验证](wiki-validation.json)；任务见 [[2026-10-21-工程Wiki补齐]]。
