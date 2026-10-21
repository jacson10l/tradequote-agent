# 当前上下文

- 当前目标：工程 Wiki 补齐已完成；[[2026-10-21-工程Wiki补齐]] 为 done，接下来继续 [[2026-10-21-M0技术验证]]，M0 仍未退出。
- 当前阶段：T01 技术评估完成；T02 本机合成服务实验通过，真实模型与双平台打包待验收。Electron 产品尚未初始化。
- 已定路线：Electron＋React＋TypeScript；单机本地数据；在线模型，DeepSeek 优先，保留供应商适配层。
- 产品：跨品类；商品和规则来自导入资料及配置；Excel/CSV、文字型 PDF/Word；两种定价；任意目标语言辅助输出；中文界面、摘要和任务。
- 行为：单据工作台为主，对话辅助；Agent 可自动保存新草稿版本；缺项和歧义确认；人工最终审核；保留历史。
- UI 最新选择：`npx getdesign@latest add mistral.ai`，浅色。此前 Claude 选择已被替换。
- 团队：A 数据与知识，B 询报价业务，C 桌面与 Agent；三人全栈，先冻结接口和数据契约。
- 已落地：[M0 技术验证记录](wiki/技术验证记录.md)和 [独立探针](../experiments/m0-reuse/README.md)。Solivio 两个原样候选的 11 个行为刻画通过，生产改用 csv-parse/decimal.js；Harness 11 个检查项符合预期，有条件采用官方 SDK/runtime＋业务 profile。
- 限制：模拟模型/内存业务服务，不是实际 DeepSeek/SQLite；SDK 无单会话取消，活动 run 独占进程并通过 close 取消；不允许把多个并发 run 放进同一进程。
- 下一步：T00 三人评审；C 补 T02 真实模型与独立双平台打包探针，A/B/C 按 T03/T04 验证存储/解析/PDF；关卡未齐前不宣称 M0 完成或运行版本已冻结。
- 排期：按完成标准推进，无固定天数承诺。
- 关键待验证：Harness 真实业务服务、打包和宿主崩溃恢复；数据库原生模块；DeepSeek 实际模型能力；多语言 PDF 字体和 RTL；Windows 实测资源。

- Wiki 入口：[[项目状态]]、[[工程Wiki要求对照]]、[[Wiki 工作流与任务记录]]。新代码须同步知识页与映射，generate 后运行只读 --check/lint；不再推迟到 M1。
- 首次 Wiki 验收：27 个纳管文件/10,738 行，25 个语义页，4 个机械 Markdown＋inventory JSON；25 项维护工具测试通过。实际命令与输出见 [验证记录](raw/wiki-validation.json)。

- Git 保存：用户已授权将方案、M0 探针及 Wiki 提交到本地，未推送；提交号以 git log 为准。提交前脱敏本机路径并补齐凭据/数据库/会话/构建产物忽略规则，原始归档与 M0 测试证据保持不变。
