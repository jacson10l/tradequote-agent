# 贡献与交付规范

## P0：编码完成必须同步工程 Wiki

所有开发成员和编码 Agent 都遵守此规则，优先级为项目内最高。代码与 Wiki 是同一个交付，不允许把文档维护排到后续迭代或交给另一位成员补写。没有“小改动免写”的例外。

每个涉及代码、测试、配置、依赖或构建的 PR 必须同时包含：

- **相关知识页**：实际变更、原因、新行为、影响与来源定位。按 `wiki-project/scripts/wiki-config.json` 的职责映射找到对应页面；新增/删除/改名文件同步映射。
- **对应任务页**：目标、范围、验收、改动、验证、未完成项；验证必须是实际执行结果，未运行如实记录。未通过要求不得标 done。
- **追加日志**：在 `wiki-project/log.md` 末尾记录变更与结果，保留历史。重要取舍写 ADR；项目状态或下一步有变化时同步状态页和 CONTEXT。
- **检查结果**：完成以下命令。仅生成代码清单不等于记录了改动。

```sh
node wiki-project/scripts/build-code-index.mjs .
node wiki-project/scripts/build-code-index.mjs . --check
node wiki-project/scripts/lint-wiki.mjs .
node wiki-project/scripts/check-wiki-sync.mjs . --base <本次改动基线>
```

`<本次改动基线>` 使用开始本次任务前的 commit，或 PR 目标分支与当前分支的 merge-base。校验包含基线之后的提交、当前未提交和未跟踪文件；不要在改动已经提交后用 HEAD 作为基线规避检查。工具会要求每个受影响文件至少有一个关联知识页实际发生正文变化，并要求任务和追加日志变化。删除的源码使用基线版本的覆盖映射。

维护工具有变更时还运行：

```sh
node --test wiki-project/scripts/wiki-tools.test.mjs wiki-project/scripts/wiki-sync.test.mjs
```

允许提交明确标注的 WIP 保存工作，但未同步 Wiki 的任务不能标完成或合并。PR 模板必须给出 Wiki/任务链接与验证结果；评审者逐项核对实现、来源与限制，不接受只改日期、空泛日志或无关知识页凑数。维护责任属于代码作者，不能默认由 C 兜底。

## 本机检查与仓库设置

用户决定不使用 GitHub Actions 或云端自动测试。仓库 Actions 已关闭，engineering/wiki workflow 在本切片移除；原有本机命令、金额/状态/持久化测试和 P0 Wiki 同步要求完整保留。历史 CI 启动失败作为历史证据保留，不视为通过，也不再要求处理账单恢复云端运行。

当前默认macOS优先，先完成需求开发；Windows验证后置，不阻塞当前开发和PR合入。macOS记录实际提交、OS/CPU、Node/pnpm/Electron版本、命令/退出码与关键行为结果；相关改动运行typecheck、适用测试、build、check和Wiki生成/只读校验/基线sync，维护工具或映射变动补Wiki回归。Windows记“未验证/后置”，待核心需求完成后由Windows开发者补真实记录，不拿macOS结果代替。

PR 至少一名非作者对照实现、Wiki与本机证据评审；不等待远端CI、不要求设置Actions必需检查。分支保护/规则集的实际状态单独核实，不能宣称本机检查自动构成服务端强制。当前平台顺序见 [macOS优先决定](wiki-project/wiki/decisions/0014-macOS优先与Windows验收后置.md)；停用Actions决定继续有效。

项目规则入口：[AGENTS.md](AGENTS.md)。知识入口：[Wiki 索引](wiki-project/index.md)。

## 独立分支与本批交接

A/B/C成员开发对应任务必须各开独立分支、使用独立工作目录；禁止共用一个checkout轮流切分支，禁止在main或集成分支直接做功能。历史共同起点 `origin/codex/m1-foundation` 仅供追溯，不要从落后的main或历史基线开始新任务。分支名称、开工命令、公共文件所有权、依赖和逐项验收见 [三人并行开发交接](wiki-project/wiki/三人并行开发交接.md)。

### 当前集成与验收主分支

项目负责人已将 `codex/m1-abc-integration` 定为当前唯一的集成主分支和人工验收基线，远端为 `origin/codex/m1-abc-integration`。后续 A/B/C 的所有最终代码、测试、配置和 Wiki 交付都必须合入该分支；成员分支已推送不等于项目交付完成。

- 新任务分支必须从最新 `codex/m1-abc-integration` 创建或同步。
- PR/交接目标统一为 `codex/m1-abc-integration`；历史 `codex/m1-foundation` 不再作为当前验收目标。
- `main` 是公开默认入口，按负责人发布安排接收已验收的集成成果。2026-11-01 用户授权集成分支同步 main，并选择 MIT；团队仍先集成验收，再同步 main。
- C 合入后核对远端分支 SHA，并在集成分支执行适用的 typecheck、build、测试和 Wiki 门禁。
- 只有合入并通过集成分支复验的提交，才可标记为最终交付；其他分支只记录为开发中、待集成或历史证据。

B的公共契约小PR先合入，A/C再接同一类型；A统一未发布迁移编号，C统一桌面桥接/公共组件接线。各成员负责自己的业务页面和Wiki，不把所有UI或文档排给C。先完成一个可验证小切片就集成，不在三条长期分支上积累最后一次性合并。

任务页必须记录领取人、真实taskBase、机器环境、验证范围与未完成项；接口未实现或真实模型未调用时不能标done。PR基线用与目标分支的真实merge-base，保留历史失败记录；生成文件冲突取源码/映射的正确并集后重新生成，不选一边丢掉另一成员的覆盖。
