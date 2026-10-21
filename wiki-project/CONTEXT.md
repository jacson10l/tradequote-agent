# 当前上下文

- 当前收口任务：[[2026-10-21-分支收口与集成验收]]、[[分支收口与共同基线]]。用户已明确授权提交推送、完成技术评审、合入符合条件的成果及清理临时分支；整合分支codex/branch-consolidation，taskBase45a9975506030170bcb8dc770919b7cb5de89fa6，共同目标codex/m1-foundation。远端交付与清理结果以任务和Git记录为准。
- 已推送共同基线a5e04d1并汇合B00/4e8c663、A01方案/1819d9d、C01a/68455a3、独立复核/2db64b4、C01b准备/a0a30a6。B00/C01a两名独立Agent分别完成Standards与Spec复核，两分支各轴均无阻断项；这是用户授权的技术复核，不冒充人类A/C签字，T00团队业务验收仍未完成。
- 组合代码已重新通过typecheck、66项单元和含构建的5项真实Electron回归；6项工程、36项Wiki工具回归、生成/check/lint/固定基线sync也均通过，见raw/branch-consolidation-validation.json。raw非生成证据与各来源逐文件字节一致，历史日志非空行全部保留，见raw/branch-consolidation-preservation.json。旧单分支失败/通过证据保留原作用域。
- B00只有知识/检查/run契约、mock与明确不可用门禁；新业务IPC仍未开启。C01a只有纯状态机与进程内取消，Provider/Executor保持首个错误归因，提交后不撤销完成事实；无run表、新取消UI或重启恢复。
- A01业务LLM Wiki按[[A业务LLMWiki方案]]区分工程/业务知识；原件与Markdown版本、AI候选、人工审核发布、检索引用、持续维护为A-W01～10验收。[[B00a-业务Wiki契约补充]] P0/P1仍待开发，原B00不代表完整业务Wiki已就绪。
- [[C01b-存储与恢复准备]]文档已完成并推送a0a30a6，[[C01b存储接口与事务方案]]/[[C01b恢复测试用例]]仍为草案，20组恢复用例未运行。下一步B补clarification/list/控制重放口径，A确认迁移前驱和同连接提交入口，C再从更新共同分支开codex/c01b-run-persistence。
- 迁移仅1～3已实现，知识4/run5仍是A维护的预留，不能跳过前驱/填空迁移。金额确定性计算、decimal跨边界、未知非零、报价/对话/幂等/outbox事务与旧快照不可变规则保持。
- A远端codex/a01-knowledge-publish/544ea51目前仅9个合成fixture文件，尚无同步Wiki，未纳入本次；不替A补签验收。A/B/C任务分支保留，已合入临时方案/验证分支才清理，其他聊天工作树不改。
- 当前策略：macOS本机需求开发优先，Windows/最终签名安装后置且未验收；按用户决定不使用Actions，保留本机检查与P0。真实DeepSeek未评估，HTTP替身不能算供应商通过。旧CI账单失败是历史，不要求恢复云端CI。
- 正式应用已有工作区、场景/CSV发布、价目表手工V1、模型设置/受限询盘修订V2/V3与差异。完整知识库、两类规则双反馈、审批/双语产出/PDF、稳定演示与双平台仍未完成。
- 赛事口径：两种语言或两类角色/场景二选一，不要求两个平台；批量鼓励、多岗位可选；差异表不替代规则反馈。P0要求每位作者同步知识/任务/log/覆盖/真实检查，不把Wiki补写转给其他成员。

- 收口交付已核对：PR#1/#2均MERGED，三个已合入临时方案/复核分支本地和远端均删除，证据raw/branch-consolidation-delivery.json。应用工作树归档请求仅返回queued，detached副本待应用处理；不影响共同代码已合入或分支清理事实。
