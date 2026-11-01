---
title: C启动五彩纸屑动画
type: task
status: active
updated: 2026-11-01
verification:
  - wiki-repo:raw/startup-screen-validation.json:1
  - wiki-repo:raw/startup-confetti-validation.json:1
sources:
  - conversation:用户修订为独立背景中央软件名缓显与纸屑结束后淡入主页面
  - conversation:用户要求添加启动五彩纸屑动画并确认覆盖式设计
  - docs/superpowers/plans/2026-11-01-startup-confetti.md:1
  - apps/desktop/src/renderer/src/shared/startup-confetti.tsx:1
  - apps/desktop/src/renderer/src/shared/startup-confetti.test.tsx:1
  - tests/e2e/startup-confetti.spec.ts:1
---

# C启动五彩纸屑动画

## 当前集成授权与交付状态

用户于2026-11-01明确要求完成后合并到 `codex/m1-abc-integration` 并推送，替代下方历史“不提交/不合入”限制。当前目标已fetch并确认本机与远端均为405f6f95995459276a856aa3125e9f08e5edc5a4，目标工作区干净；新增手册与交接文档保留。先提交本分支代码/Wiki，合入目标最新文档并重新生成机械清单、复验实际组合，再将目标分支快进到已验证候选、执行目标分支门禁、普通push并回读远端。集成未结束前保持active，不把本机实现done等同于最终交付。

提交范围白名单：App.tsx、theme.css、shared/startup-confetti.tsx与其测试、tests/e2e/startup-confetti.spec.ts、对应计划、Wiki知识/任务/ADR/状态/导航/追加日志/源码职责与生成清单，以及两份既有脱敏验证JSON；不包含客户资料、运行数据库、安装包、截图或完整运行日志。待集成固定SHA与父提交在实际提交后记录。

## 用户修订：独立启动页（当前已验证）

用户看到覆盖效果后明确否定“纸屑直接在主页面”，要求独立背景、中央软件名缓缓出现与同步纸屑，纸屑结束后淡入项目主页面。该最新决定替代下文第一轮覆盖式验收，历史验证 raw/startup-confetti-validation.json 保留，仅证明旧实现，不用于新实现放行。

当前实现改为 StartupScreen 包裹已挂载的工作台：intro 2200ms，独立不透明奶油背景与橙黄柔光，中央自有图标/TradeQuote/中文副标题1400ms显现；同期120粒子。intro内工作台opacity=0、inert且aria-hidden，不能穿透点击/键盘访问。粒子结束进入650ms的entering，主页面淡入、启动页淡出，2850ms移除启动层进入ready。预挂载保持原业务加载和路由状态，不增加IPC或依赖；无Canvas仅省略纸屑，减少动态则立即进入工作台。

同一独立分支/工作区和87106d1基线继续修订，不混入源工作树文档。新增5项屏幕生命周期单测先红灯（旧8项仍通过），实现后完成下列本机验证，当前done仅限该修订的代码/本机验证/Wiki闭环，不代表非作者批准或合入。决策与原因见[[0034-独立启动页与工作台淡入]]、行为见[[桌面启动五彩纸屑]]。

### 当前验证

- `pnpm exec vitest run apps/desktop/src/renderer/src/shared/startup-confetti.test.tsx`：退出0，13/13。`pnpm typecheck`、`pnpm build`均退出0，保留原有renderer超过500kB提醒。
- `ELECTRON_RUN_AS_NODE=1 apps/desktop/node_modules/.bin/electron node_modules/vitest/vitest.mjs run --no-file-parallelism`：退出0，579通过/3跳过，63文件通过/2跳过，47.85s；不排除迁移用例、不改超时。
- `pnpm exec playwright test tests/e2e/startup-confetti.spec.ts`：退出0，真实Electron2/2、11.6s；独立背景/品牌渐显/实际像素/intro工作台隐藏且inert/先结束纸屑再淡入/ready无启动页和纸屑/路由不重播/重开再播/减少动态均验。新图desktop-splash.png和desktop-main.png已实看。
- `pnpm exec playwright test`：退出0，真实Electron14通过/1跳过、2.3m；跳过既有真实Codex显式启用项，不宣称真实模型已验。
- `pnpm check`：退出0，格式/工程Node9/模块边界/只读Wiki均通过。
- `pnpm wiki:test`：首轮35/36，源码/覆盖与快照并发修改造成symlink用例GENERATED_DRIFT；保留日志并冻结源后重跑36/36、44.18s，退出0，无修改维护工具或测试。
- generate→只读check→lint→固定87106d1基线sync均退出0，300纳管源码、301Markdown/267语义页全可达，6代码配置/7知识页/1任务无错误；双diff whitespace检查退出0。便携新证据`raw/startup-screen-validation.json`绑定5源码SHA256，旧证据SHA256保留且未覆盖。

### 当前未完成项

非作者视觉签认、Windows和最终安装包仍后置，不代签、不声称已验；本轮无提交/推送/合入。第一轮默认并发单元既有迁移stdout竞态仍不在本修订范围，完整串行已通过。下方仅为被替代的第一轮历史，不能用其“点击穿透”描述替代当前独立页行为。

## 第一轮覆盖方案与历史验证（已被替代）

## 目标

实现用户确认的覆盖式开机动画，不阻塞工作台，并完成同次代码、测试与 Wiki 同步。

## 范围

领取：本次 C 桌面编码 Agent。独立分支 codex/startup-confetti，独立 managed worktree，固定 taskBase 87106d170f50d44af81b7594b1b6c3308f177be3；源工作树已有未提交手册/Wiki 完整保留，未复制混入。环境 macOS 26.4 arm64、Node 22.22.0、pnpm 10.13.1、Electron 44.9.2。仅 renderer、定向测试及 Wiki/计划，无公共业务契约变动，无新依赖、迁移、推送或合入。

## 验收

120 粒子、约 2 秒自动消失、点击穿透、路由不重播、重开重播、高清及 resize、减少动态跳过、退出与 StrictMode 清理。真实 Electron 合成临时工作区验证，不用浏览器通过冒充桌面通过。

## 改动

新增独立 StartupConfetti，App 路由外接入；CSS 固定全屏装饰画布，保留现有工作台。用经过时间计算粒子位置、400ms 淡出、2200ms 结束，停止 RAF/计时器/事件监听。同步 [[桌面启动五彩纸屑]]、[[M1工作台]]、[[M1验证与协作]]、导航与新增源码职责映射；维护工具算法不变。

## 验证

实际命令日志保留于本机 `.runtime/startup-confetti/`，最终汇总写 `raw/startup-confetti-validation.json`。

- `pnpm install --frozen-lockfile`：退出 0，锁文件不变；Electron arm64 原生 SQLite 重建通过。
- TDD 首次 `pnpm exec vitest run apps/desktop/src/renderer/src/shared/startup-confetti.test.tsx`：退出 1，缺少实现模块，符合红灯；实现后 7/8，轨迹浮点精度断言失败，改近似断言后 8/8 通过。初次类型检查发现测试媒体查询只读属性及 Canvas 定位类型，改测试构造/类型收窄后重跑通过，不改业务实现。
- `pnpm typecheck`：退出 0。
- `pnpm build`：退出 0，仍有超过 500kB 的主 renderer chunk 提醒，无新增依赖或打包格式变化。
- `pnpm exec playwright test tests/e2e/startup-confetti.spec.ts`：退出 0，真实 Electron 2/2；像素/导航/停止/重开/减少动态均通过，本地截图已产生。
- 默认 `pnpm test` 两轮：均573通过/1失败/3跳过，原有 worker-migration-gates 的 legacy v6 在 JSON 输出截断后超时；退出监听先于 stdout 完整消费为基于代码及异常的原因分析，不代表本次修复了该竞态。未修改该文件，保留失败日志。
- `ELECTRON_RUN_AS_NODE=1 apps/desktop/node_modules/.bin/electron node_modules/vitest/vitest.mjs run --no-file-parallelism`：退出0，完整574通过/3跳过，63文件通过/2文件跳过，48.24s；不排除旧迁移用例、不改超时。
- `pnpm exec playwright test`：退出0，真实Electron全量14通过/1跳过（原有真实Codex显式启用项未启用），包括新动画两项。
- `pnpm check`：退出0，Biome214文件、9项Node工程回归、模块边界、只读Wiki check/lint通过。
- `pnpm wiki:test`：退出0，36/36通过；配置只登记职责，无维护算法改动。
- generate →只读 `build-code-index.mjs . --check` → `lint-wiki.mjs .`：退出0，300纳管文件、300Markdown/266语义页全可达。固定基线 `check-wiki-sync.mjs . --base 87106d170f50d44af81b7594b1b6c3308f177be3` 退出0，6代码配置/6知识页/1任务，无错误；`git diff --check`、`git diff --cached --check` 均退出0。首次漏计划覆盖及日志未追加的诊断保留于证据，最终已补齐。

## 未完成项

本任务 done 仅表示已确认启动动画的本机实现/验证与P0 Wiki闭环，不表示产品整体或合入审批完成。默认并发全量的既有迁移输出竞态仍在；串行全量通过。Windows 和最终安装包未验证/后置，非作者人工视觉签认待负责人安排，不代签。不提交、不推送、不合入集成分支；原工作树运行中的旧应用不受本次 worktree 修改影响。
