# 当前上下文

- 最新要求：A01升级为业务LLM Wiki，工程wiki-project与workspace业务资料隔离；版本化Markdown、AI候选、人工审核发布、检索引用、持续维护均为验收。读 [[A业务LLMWiki方案]]、[[A01-知识发布与来源查询]]。
- 本次方案补齐已完成，生成/check/lint/sync与语法/差异检查通过（raw/a01-wiki-plan-validation.json）；仅方案/任务/验收编辑，在codex/a01-llm-wiki-plan，基线4e8c663；源码仍为B00规则切片。[[B00知识契约差距与补充]]列出P0/P1，[[B00a-业务Wiki契约补充]]待开工；不能把B00通过当完整业务Wiki通过。
- 下一步：B00评审→B00a P0→A01a/b/c；B00a P1→C知识执行＋A01d/e。C原报价恢复、A样本、B纯规则可继续；未合入分支不是其他成员已取得的共同基线。本轮用户已授权将方案提交并推送至codex/a01-llm-wiki-plan；交付提交以该分支Git记录为准，不自动合入。

- 本轮B00验证：55项单元、5项实际Electron、6项工程、36项Wiki、类型/构建/check/lint/sync全部通过；证据raw/b00-validation.json，首次fixture类型和桌面桥接名单失败保留，不声称真实模型/Windows验收。
- 交付入口：[B00 PR #1](https://github.com/jacson10l/tradequote-agent/pull/1)，代码提交e71442d127edeb9a62a9a0cd5a127ee0ae2898be已推送codex/b00-first-batch-contracts并核对远端；后续仅文档补记。目标codex/m1-foundation，等待A/C评审，不自动合并。
- 最新：[[B00-首批公共契约]] 在独立codex/b00-first-batch-contracts实现三组schema/端口/公共导出、mock与客户端未接入门禁；taskBase=45a9975506030170bcb8dc770919b7cb5de89fa6。A/C评审与集成合入待执行，A01/B01/C01服务未实现；本分支不改变数据库或原业务白名单。

- 已完成交接准备：[[2026-10-21-三人并行交接准备]]。用户已授权本轮准备完成后提交并推送；本批共同起点/PR目标codex/m1-foundation，准备开始基线b69c4e50060a54e656017c2b17c4bb04e836630e。代码基线58b462ee9c9d096c480d331036f51ae2bcfa87f6已推送并核对远端一致，证据raw/parallel-handoff-git.json；后续补记为纯文档提交，成员从远端最新头部开分支。
- 立即读 [[三人并行开发交接]]、[[首批并行接口约定]]；A领取 [[A01-知识发布与来源查询]]，B先B00契约再 [[B01-规则检查与双反馈]]，C领取 [[C01-Agent运行恢复与集成]]。A01/B01/C01仍draft；B00代码已在独立分支实施，实际A/C评审未登记。
- 成员各自独立clone/worktree、各开任务分支：codex/a01-knowledge-publish、codex/b00-first-batch-contracts、codex/b01-rules-feedback、codex/c01-agent-recovery。禁止在main/集成分支直接做成员功能；小PR合入集成分支。
- B维护公共契约；A维护迁移/存储导出（知识迁移4，run预留5，其他编号协调）；C维护Main/preload/worker/App接线与公共UI/构建。A/B自写业务feature页面和Wiki。新代码按独立模块新增，避免三人同时扩写trade-store/quotes大文件。
- 原规则切片等B00合入；新版业务Wiki等B00a对应P0/P1合入后再接依赖类型。A可先做三品类/来源样本，C可先真实模型验证与运行状态机；B检查核心先用合成published规则，完整联调换A真实查询。取消/重试的完成/提交竞态有独立验收，不依赖规则服务。
- 已实现 [[M2真实报价V1]]：场景版本、固定UTF-8 CSV预览/人工发布、价目表档位、同币种同单位/decimal计算、不可变V1与重开；商品合计不含运税费。已发布SKU覆盖、四格式/知识检索/第二定价未实现。
- 已实现 [[M4模型与报价修订]]：Main safeStorage正式设置、worker有界DeepSeek JSON adapter、询盘理解/三类字段修改V2V3、对话与差异。正式HTTPS固定，测试替身仅未打包且隔离目录的环回端点；真实DeepSeek未验收。全部报价draft，审批禁用。
- 迁移1～3保留：quote_revision/agent_turn追加，不改V1原文；版本/对话/outbox/幂等同事务、提交前复核base。成功结果重开可回放；UI未提交操作键/失败对话/待决run不持久化，C01负责补齐。旧九类TypedPatch仅契约基础，不等于当前三个操作之外都已可执行。
- 上轮真实本机验证：42项Vitest、5项Electron、6项工程、36项Wiki、type/build/check/lint/sync通过，raw/agent-validation.json；所有模型请求用合成HTTP和Key，不能算真实供应商/Windows通过。本次交接复验同样全部通过，记录raw/parallel-handoff-validation.json；不替成员新代码验收。
- 历史覆盖失败已解决并保留raw/feedback-final-check.json与任务记录；开发名称/统一反馈改动保留共同交接，不再把当时active误写当前阻塞。原raw来源与旧失败记录不可删除。
- 剩余：真实供应商评估/运行恢复；平台文化profile、知识与两类规则双反馈；英德产出/审批PDF；备份、稳定五次演示、Windows/最终签名安装和远端保护。最后安装按用户既有决定暂缓，真实Key仅在应用输入，不读真实凭据文件。
- 赛事口径：两种语言或两类角色/场景二选一，不要求两个电商平台，批量鼓励/多岗位可选；差异表不能替代规则校验反馈。真实业务/规则适用性与T00成员评审仍待确认。
- P0：每位代码作者同分支同步语义知识/任务/追加log/coverage/生成检查，维护工具改动补回归；验证真实通过才done。不得把协作任务当自动派生子Agent授权。
