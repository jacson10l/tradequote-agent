# 当前上下文

- 技术栈细节复核：[[2026-10-21-技术栈细节核对]]。[[02-技术选型与架构]] 已明确 Zod 仅落地 M0 子集，Tailwind/shadcn 等尚待正式 renderer；补 @hookform/resolvers 及 T10/T11/T13/T14 验收。后续 M1 按清单落实，不将 HTML 设置探针当作 React 工作台。

- P0 最高优先级项目规则：所有成员及编码 Agent 每次代码交付必须同步关联知识页、任务页和追加日志，检查通过后才能标完成/合并。详见根 AGENTS、CONTRIBUTING 与 [[2026-10-21-Wiki强制同步规则]]；不能延期给其他成员补写。

- 当前任务：[[2026-10-21-M0技术验证]]，本轮增量详见 [[M0平台验证记录]]。
- 用户最新调整：先不做最终安装/双平台验收，不作为开发推进前提；Key 必须经系统设置输入。保留这些未完成项，不能称通过。
- 选型：Electron 44.9.2＋React/TypeScript 产品方向不变；最小执行器取代默认 Harness，理由为 0.2.1-rc.2 对当前 Electron 原生运行时指纹不兼容。见 [[0004-M0平台与执行器选型]]。
- 新实验：experiments/m0-platform，真实 Utility Process SQLite、事务/重启/强杀回滚/备份，四类解析、两种 PDF、safeStorage 设置页、合成模型三工具链。
- 模型设置启动：pnpm --dir experiments/m0-platform settings。用户在页面输入 Key，测试连接后选模型。无真实 Key 已被读取或模型已通过的声明。
- 主产品仍待 M1 初始化；独立 HTML 设置页不是 React 产品已经完成。A 数据/B 领域/C 桌面，三人全栈，T00 材料已备但未签署。
- 未完成：真实模型全评估、完整运行持久化/流式、RTL 精确文本回读及复杂输入、Windows/签名安装/升级。按用户调整可继续 M1，同时跟踪。
- 后续操作：核对本轮 validation.json，再三人评审契约，初始化正式 workspace；将探针已验证机制迁入 ports/adapters，不把合成 SKU/单工作区假设移入生产。
- Wiki：新源码必须更新 coverage，generate→--check→lint；脚本变更须跑回归。工程 Wiki 已在 M0 完成，不延期。
- 本地 Git 基线 ef14fc3；本轮改动未提交，未推送。原始归档和此前 M0 证据保留。
- 最终本轮验证：20 条命令退出 0；开发与 macOS 未签名目录包各 9 组探针通过，包已实际启动。RTL 精确回读和 Harness 候选明确未通过，不包含在通过结论内。
