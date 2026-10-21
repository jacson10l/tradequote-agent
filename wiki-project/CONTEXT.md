# 当前上下文

- 当前增量：[[2026-10-21-M1布局图标与契约补齐]] 已验证，限定增量 done；初始化 [[2026-10-21-M1工程初始化]] 已保存本地 7c5a2eb，完整 M1/MVP 仍 active。
- 新增产品图标、外壳固定高度/main 独立滚动、窄屏图标导航；E2E 独占 5189，不占用 dev 的 5179。
- T11 增加九类 typedPatch、Fact/来源/审批绑定和运行事件 schema；没有报价/Agent 服务接入。
- 本增量 Wiki 同步基线为 7c5a2eb；不推送。
- M0 与 P0 Wiki 规则已提交本地 32d7e8c90a7ec4dce1966fdf6e2a73c0b4066826，未推送；当前分支 codex/m1-foundation。该提交是初始化历史基线，当前增量改用 7c5a2eb。
- P0：代码作者在同一交付更新关联知识正文、任务、追加日志和覆盖，并通过门禁；适用于所有成员及 Agent，不满足不得 done/合并。
- 正式工程：desktop/contracts/domain/infrastructure，Electron/React/TS。pnpm install --frozen-lockfile 后 pnpm dev。见 [[M1工程基线]]。
- 实际能力：工作区创建/修改/重开，SQLite 单写入、幂等/版本冲突、初始迁移、ArtifactStore。见 [[M1接口与持久化]]。
- UI 已接入约定的表单/路由/查询与共享组件；报价表格与差异为显式合成预览，Agent/审核禁用。见 [[M1工作台]]。
- 验证与未完成范围见 [[M1验证与协作]] 及任务记录；测试使用隔离合成数据，不读取真实凭据。
- 模型 API Key 仍通过 pnpm --dir experiments/m0-platform settings 配置；正式 React 系统设置迁移在 T40。没有真实模型通过声明。
- 最小执行器替代 Harness 的选择不变；M0 原始探针和证据保留，见 [[0004-M0平台与执行器选型]]。
- A 数据/B 领域/C 桌面三人全栈，T00 评审未签署。后续先评审完整 DTO，再按各模块继续 T11/T12/T13 与 M2/M3/M4。
- 未完成：报价/审批/真实 Agent、job/outbox 完整恢复、真实模型评估、RTL 精确回读、Windows/签名安装/升级。用户允许暂缓最终安装验收并继续开发。
- CI 已配置，远端执行和分支保护未设置；不能声称远端门禁已全部生效。

- 本轮验证：13 项 Vitest、2 项 Electron、4 项 Node 边界/图标、36 项 Wiki 回归与 P0 同步通过；macOS 大窗口受工作区限制高度 815，未声称实际 1080 高或系统缩放验收。下一步为 T00 实际评审及按 M2/M3/M4 落地领域服务，见任务未完成项。
