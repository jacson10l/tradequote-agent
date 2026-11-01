# Startup Confetti Implementation Plan

## 当前修订：独立启动页面

用户明确要求替换第一轮主页面覆盖效果。采用同一renderer内独立StartupScreen而非新增Electron窗口：2200ms独立不透明奶油背景、1400ms中央TradeQuote品牌缓显与同期纸屑，随后650ms工作台淡入和启动页淡出。工作台预挂载但intro内opacity=0/inert/aria-hidden；结束不重挂载业务页，切路由不重播。减少动态直接进入ready，无Canvas仅省略纸屑。无需改动Main、IPC、DTO和依赖。

- [x] 新增5项独立启动页回归并确认旧实现失败，保留原8项粒子回归。
- [x] 实现StartupScreen的intro/entering/ready、品牌缓显、背景、交叉淡入和资源清理；App仅包裹一次。
- [x] 修订Electron专项为独立启动页/主界面不可交互/品牌出现/粒子结束后淡入/路由不重播/重开再播/减少动态跳过。
- [x] 完成串行完整单元、Electron专项和全量、类型/构建/工程检查。
- [x] 同步知识/任务/ADR/状态与追加日志，生成并复验Wiki及固定基线sync，单独保留新验证JSON，不覆盖旧证据。

以下为第一轮已完成但已被用户最新决定替代的历史方案与执行记录。

**Goal:** 实现用户已确认的非阻塞式五彩纸屑开机动画。

**Architecture:** 在 App 的路由外挂载独立 Canvas 组件，每次 renderer 启动播放一次，120 个粒子从窗口中央偏下喷出，约 2 秒后淡出。组件只依赖浏览器绘制 API，不读取业务数据、不增加 IPC、不延迟工作台可用时间。

**Tech Stack:** 现有 React 19、TypeScript strict、Canvas 2D、Vitest、Playwright Electron；不新增依赖。

## 已确认设计与边界

- 用户于 2026-11-01 确认覆盖式方案，保留现有工作台，无独立欢迎屏、无点击阻挡、无业务变更。
- Canvas 适配窗口与高清屏；采用按时间计算的重力轨迹，不随刷新率改变速度。
- 系统减少动态效果时跳过；运行中切换该偏好立即结束；无 Canvas 上下文时直接跳过。
- 定时结束并释放 RAF、计时器和窗口/偏好监听；React StrictMode 的 setup/cleanup 重放安全。
- 独立分支 codex/startup-confetti，taskBase 87106d170f50d44af81b7594b1b6c3308f177be3；不复制原工作树未提交材料，不提交/推送/合入。

## 执行顺序

- [x] 在 shared/startup-confetti.test.tsx 先写粒子、计时、高清/resize、减少动态、卸载和 StrictMode 回归，先执行确认缺少实现的红灯。
- [x] 新增 shared/startup-confetti.tsx 并在 App.tsx 的路由外接入；theme.css 增加固定全屏、pointer-events:none 的装饰画布。
- [x] 新增真实 Electron 启动测试：绘制发生、导航可点击、结束移除、导航不重播、重开再播及减少动态跳过。
- [x] 执行定向测试、全量单元、typecheck、build、Electron 专项与工程检查，记录实际结果而非预计值。
- [x] 同步知识页、任务页、CONTEXT、项目状态、导航、覆盖映射及 log；生成机械清单，运行只读 check/lint、固定基线 sync 与 Wiki 维护回归。

## 验证与未完成边界

不使用云端自动测试，不读取真实客户数据或模型凭据；Electron 使用临时合成工作区。macOS 为本次平台，Windows 后置；非作者人工评审不由自检替代。实际命令与退出码记录在对应任务和 raw 验证证据中。
