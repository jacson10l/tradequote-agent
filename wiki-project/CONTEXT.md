# 当前上下文

- 最新用户决定：不使用GitHub Actions或云端自动测试；macOS由本人、Windows由Windows开发者本机验收。仓库Actions已关闭回读enabled=false，C分支移除engineering/wiki workflow；本机pnpm/Wiki门禁保持，PR#2待技术复审不合并，不再等待账单/云端CI恢复。详见 [[0013-本机双平台验收停用Actions]]、[[C01a-本机验收与停用Actions]]。Windows本机结果尚未执行/收到，不代签。

- C01a PR#2评审P2已复现并修复：Executor保留Provider已归因TradeFault，补实际Provider＋Executor两种顺序测试；本次起点b05f2e8，详见 [[C运行恢复实现]]。原51项本机通过证据保留；新增完整复验53项单测/5项Electron/36项Wiki、type/build/check/lint与两基线sync均通过，见raw/c01a-p2-validation.json。
- 远端run39571473237为startup_failure/0job/0check；已登录GitHub Annotations确认账户付款失败或支出限额问题，见raw/c01a-ci-startup.json。这是当时导致CI阻塞的事实；随后用户已选择停用Actions，不再要求处理Billing & plans或重跑CI。C01a保持active待技术复审/本机适用平台记录；旧账单证据不改写。

- C01已由用户分配给本次Codex，独立worktree/分支codex/c01-agent-recovery，taskBase45a9975506030170bcb8dc770919b7cb5de89fa6。C01a新增纯状态机、进程内取消/AbortSignal与提交边界；51项单测和5项实际Electron回归通过，工程check/36项Wiki回归/生成只读检查/lint/基线同步通过，证据见 [[C01a-状态机与取消基础]]。该基础子切片初次本机验收曾记done，现因评审/远端CI恢复active；C01整体active，run落库/重启/正式IPC/UI尚未实现。
- B00已在独立分支推送至4e8c663；C侧技术评审两轴无阻断项，复跑typecheck/55项单测通过，见 [[B00-C接口评审]]。A实际评审与共同分支合入尚未确认，不能把现C分支当已接入新契约。waiting_input澄清文字的保存/重开查询待B/C明确；知识AI候选Markdown另等B00a，不阻塞报价恢复。

- 已完成交接准备：[[2026-10-21-三人并行交接准备]]。用户已授权本轮准备完成后提交并推送；本批共同起点/PR目标codex/m1-foundation，准备开始基线b69c4e50060a54e656017c2b17c4bb04e836630e。代码基线58b462ee9c9d096c480d331036f51ae2bcfa87f6已推送并核对远端一致，证据raw/parallel-handoff-git.json；后续补记为纯文档提交，成员从远端最新头部开分支。
- 立即读 [[三人并行开发交接]]、[[首批并行接口约定]]；A领取 [[A01-知识发布与来源查询]]，B先B00契约再 [[B01-规则检查与双反馈]]，C领取 [[C01-Agent运行恢复与集成]]。交接准备时任务均draft；本轮C已领取/登记环境，B00已在其分支实现待合入，A/B其余进展不由C代签。
- 成员各自独立clone/worktree、各开任务分支：codex/a01-knowledge-publish、codex/b00-first-batch-contracts、codex/b01-rules-feedback、codex/c01-agent-recovery。禁止在main/集成分支直接做成员功能；小PR合入集成分支。
- B维护公共契约；A维护迁移/存储导出（知识迁移4，run预留5，其他编号协调）；C维护Main/preload/worker/App接线与公共UI/构建。A/B自写业务feature页面和Wiki。新代码按独立模块新增，避免三人同时扩写trade-store/quotes大文件。
- B00先合新契约再接依赖类型。A可先做三品类/来源样本，C可先真实模型验证与运行状态机；B检查核心先用合成published规则，完整联调换A真实查询。取消/重试的完成/提交竞态有独立验收，不依赖规则服务。
- 已实现 [[M2真实报价V1]]：场景版本、固定UTF-8 CSV预览/人工发布、价目表档位、同币种同单位/decimal计算、不可变V1与重开；商品合计不含运税费。已发布SKU覆盖、四格式/知识检索/第二定价未实现。
- 已实现 [[M4模型与报价修订]]：Main safeStorage正式设置、worker有界DeepSeek JSON adapter、询盘理解/三类字段修改V2V3、对话与差异。正式HTTPS固定，测试替身仅未打包且隔离目录的环回端点；真实DeepSeek未验收。全部报价draft，审批禁用。
- 迁移1～3保留：quote_revision/agent_turn追加，不改V1原文；版本/对话/outbox/幂等同事务、提交前复核base。成功结果重开可回放；UI未提交操作键/失败对话/待决run不持久化，C01负责补齐。旧九类TypedPatch仅契约基础，不等于当前三个操作之外都已可执行。
- 上轮真实本机验证：42项Vitest、5项Electron、6项工程、36项Wiki、type/build/check/lint/sync通过，raw/agent-validation.json；所有模型请求用合成HTTP和Key，不能算真实供应商/Windows通过。本次交接复验同样全部通过，记录raw/parallel-handoff-validation.json；不替成员新代码验收。
- 历史覆盖失败已解决并保留raw/feedback-final-check.json与任务记录；开发名称/统一反馈改动保留共同交接，不再把当时active误写当前阻塞。原raw来源与旧失败记录不可删除。
- 剩余：真实供应商评估/运行恢复；平台文化profile、知识与两类规则双反馈；英德产出/审批PDF；备份、稳定五次演示、Windows/最终签名安装和远端保护。最后安装按用户既有决定暂缓，真实Key仅在应用输入，不读真实凭据文件。
- 赛事口径：两种语言或两类角色/场景二选一，不要求两个电商平台，批量鼓励/多岗位可选；差异表不能替代规则校验反馈。真实业务/规则适用性与T00成员评审仍待确认。
- P0：每位代码作者同分支同步语义知识/任务/追加log/coverage/生成检查，维护工具改动补回归；验证真实通过才done。不得把协作任务当自动派生子Agent授权。
