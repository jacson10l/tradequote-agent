# 当前上下文

- 当前任务：[[2026-10-21-M1工程初始化]]，active。首个工作区纵向切片已落地，完整 M1/MVP 尚未完成。
- M1 初始化切片与 Wiki 按用户要求保存本地提交，后续布局/图标和 M1 补齐以该提交为新基线；不推送。
- M0 与 P0 Wiki 规则已提交本地 32d7e8c90a7ec4dce1966fdf6e2a73c0b4066826，未推送；当前分支 codex/m1-foundation。M1 同步门禁以该提交为基线。
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
