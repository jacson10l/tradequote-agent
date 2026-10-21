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

## 自动检查与仓库设置

`.github/workflows/wiki.yml` 的 `Wiki / wiki-sync` 检查在 PR 上运行生成物检查、lint、回归测试与基线差异校验。它能发现结构性遗漏，不能证明自然语言描述真实完整。

仓库管理员需要在 GitHub 分支保护或 ruleset 中把该检查设为必需，并限制绕过，才能在服务端禁止失败 PR 合并。仅添加 workflow 文件不会自动改变远端保护设置；本次不声称已启用远端强制保护。

项目规则入口：[AGENTS.md](AGENTS.md)。知识入口：[Wiki 索引](wiki-project/index.md)。

## 独立分支与本批交接

A/B/C成员开发对应任务必须各开独立分支、使用独立工作目录；禁止共用一个checkout轮流切分支，禁止在main或集成分支直接做功能。当前共同起点和PR目标为 `origin/codex/m1-foundation`，不要从落后的main开始。分支名称、开工命令、公共文件所有权、依赖和逐项验收见 [三人并行开发交接](wiki-project/wiki/三人并行开发交接.md)。

B的公共契约小PR先合入，A/C再接同一类型；A统一未发布迁移编号，C统一桌面桥接/公共组件接线。各成员负责自己的业务页面和Wiki，不把所有UI或文档排给C。先完成一个可验证小切片就集成，不在三条长期分支上积累最后一次性合并。

任务页必须记录领取人、真实taskBase、机器环境、验证范围与未完成项；接口未实现或真实模型未调用时不能标done。PR基线用与目标分支的真实merge-base，保留历史失败记录；生成文件冲突取源码/映射的正确并集后重新生成，不选一边丢掉另一成员的覆盖。
