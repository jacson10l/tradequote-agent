---
title: Ae73d177独立复验与SQL注释边界回执
type: process
status: observed
updated: 2026-10-25
sources:
  - wiki-repo:raw/c-ae73d177-intake.json:1
  - wiki-repo:raw/c-ae73d177-native.json:1
  - wiki-repo:raw/c-ae73d177-m13.json:1
  - wiki-repo:raw/c-ae73d177-matrix.json:1
  - wiki-repo:raw/c-ae73d177-boundaries.json:1
  - wiki-repo:raw/c-ae73d177-lexical.json:1
  - https://github.com/jacson10l/tradequote-agent/blob/e73d17790abf03517060bac4cd78736dfae78232/packages/infrastructure/src/migration-lineage.ts
---

# Ae73d177独立复验与SQL注释边界回执

后续复验：2026-10-25 最新C独立复验：A远端固定1c890dc77ecba2cfb949c5e69908dc81bdacc692已核对，Y07/Y08/Y09全部安全拒绝且逻辑/物理边界保持，含三个控制6/6；原五项、六轮四例、X01～X11、原12/107与九段SQL指纹保持通过。新增M13-Y10：agent_write_call移除真实CHECK(attempt>0)、增加普通方括号列[CHECK(attempt>0)]后，identify/repository均接受升8并成功写入attempt=0；两个真实CHECK控制均拒绝。M13仍changes_required。详见[[A1c890dc独立复验与方括号标识符边界回执]]、[[C集成-A1c890dc复验与CHECK边界]]。完整迁移、新A/B/C组合、桌面/macOS联合及实际人员/业务验收未完成；下方旧版本记录保留原作用域。

## 固定输入与结论

A六轮四例M13-Y04a/Y04b/Y05/Y06在C独立复验中全部通过，异常库在只读identify及真实SqliteWorkspaceRepository入口均拒绝，原schema/rows/version/文件字节/目录列表保持；带三个有效控制组的旧边界套件7/7通过。原五项M09-L01/L02、M13-Y01/Y02/Y03、X01～X11、原12项及107矩阵全部保持通过。

继续M13有效定义检查发现注释处理的三例漏洞Y07/Y08/Y09，均被错误接受升8，随后实际删除或更新四条旧步骤。M13仍changes_required，不能把原四例通过写成迁移整体通过。C未推送或合入本轮结果。

taskBase=1c5a5b11821195dd8d1d5e4c46d39b8547ec6a39；独立分支codex/c-ae73d177-validation，工作树/Users/jason/.codex/worktrees/c-ae73d177-validation/tradequote-agent。实际fetch取得A e73d17790abf03517060bac4cd78736dfae78232并用ls-remote完整SHA回读一致。完整A归档安装于.runtime/a-source，自有Git HEAD/index；175份非Wiki文件与Git blob字节一致。旧C45fa03d57d6fc405c2438c3b187f87838355a88b、旧B6c76fb991f3135d6a48362c1b242e46af6641817原SQL固定，九段历史SQL指纹保持。原六份C探针脚本仅替换A固定来源/标识，不删改断言。

macOS26.4 arm64、宿主Node22.22.0/pnpm10.13.1、Electron44.9.2/Node24.22.0、SQLite3.53.4。测试用固定A生产migrate/identify和实际仓库入口，不是已合并的新A/B/C运行组合。全部为独立合成库；syntheticSQLFixture JSON用于SQL事实保留，不冒充领域有效业务对象。未读真实客户库或调用真实模型。

## 本机回归结果

| 范围 | 实际结果 | 限定 |
|---|---|---|
| 六轮四例 | Y04a/Y04b/Y05/Y06 4/4安全拒绝，含三控制7/7 | 原失败记录不删除或反填 |
| 原五项和X01～X11 | 全部通过；X为11/11 | 原有效控制组真实拒绝非法操作 |
| 原12与原107 | 12/12、107/107；九段SQL指纹保持 | F01选定80点、F02 C7四次SIGKILL仍通过，完整父矩阵未完成 |
| 作者探针独立重跑 | 37分类+10追加+2控制全过，与固定作者结构结果一致 | 不替代生产入口测试 |
| typecheck、infrastructure、contracts | 退出0；47/47、35/35 | infrastructure含ledger5/wiki-store5；Windows EPERM历史记录保留 |
| A Wiki | check/lint/sync --base 163f7a4全部退出0 | 不改维护工具或规则 |
| 新注释边界 | 6例中3失败、3规范控制通过，内部Electron退出1 | 无harnessError；真实错误接受和保护失效 |

## 可转给A的新增三例阻断回执

统一复现：使用固定旧C七段真实SQL创建C7文件库，populate四条agent_tool_step（两个attempt），每例只替换指定触发器。关闭连接，先只读A.identify，再用A.SqliteWorkspaceRepository打开同一文件；保存前后schema/rows/version/文件SHA256/目录列表。错误接受后再执行DELETE或UPDATE观察。规范原库控制分别测试DELETE、UPDATE和重复prepared，3/3真实拒绝。

| ID | 替换内容/操作 | e73d177实际结果 | 根因与修正要求 |
|---|---|---|---|
| M13-Y07-comment-spoofed-body | no_delete真实体为SELECT 1；在真实BEGIN前加`/* BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END */`；打开后DELETE | identify/repository未报错，升8；4条旧步骤全部删除 | extractTriggerBody先在原始SQL找首个BEGIN/END，截到注释内部才stripTrivia，注释边界已丢；必须只取真实语法保护体 |
| M13-Y08-comment-separated-update-of | no_update事件为`BEFORE UPDATE /* synthetic gap */ OF synthetic_nonexistent_column`，体仍裸RAISE ABORT；打开后更新data_json | 接受升8，实际改写4条旧步骤 | UPDATE\s+OF不能识别合法注释分隔；在统一词法结果中核对UPDATE列范围 |
| M13-Y09-comment-spoofed-event | no_delete名称保持；真实事件改为BEFORE UPDATE，前置`/* BEFORE DELETE */`；体仍裸RAISE ABORT；打开后DELETE | 接受升8，4条旧步骤全部删除 | extractTriggerEvent/Timing从原SQL匹配，误把注释事件当真；必须验证真实事件/时机 |

精确替换SQL（各用独立C7合成库）：

```sql
-- Y07
DROP TRIGGER agent_tool_step_no_delete;
CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step
/* BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END */
BEGIN SELECT 1; END;

-- Y08
DROP TRIGGER agent_tool_step_no_update;
CREATE TRIGGER agent_tool_step_no_update
BEFORE UPDATE /* synthetic gap */ OF synthetic_nonexistent_column ON agent_tool_step
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;

-- Y09
DROP TRIGGER agent_tool_step_no_delete;
CREATE TRIGGER agent_tool_step_no_delete /* BEFORE DELETE */ BEFORE UPDATE ON agent_tool_step
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;
```

Y07/Y09后执行`DELETE FROM agent_tool_step`，结果before=4/remaining=0；Y08用UPDATE设置合成data_json，changes=4且旧JSON变更。三例identifyError/repositoryError均为null、after.version=8；失败没有被解释成运行器问题。完整原始快照和脚本见lexical证据。

这三例共同暴露SQL词法处理不一致：事件、时机、OF、体边界仍在原SQL局部匹配，只有体截取后才去注释。建议A统一词法/结构解析，明确有限支持的完整规范定义，正确区分注释、字符串、标识符与关键字；支持规则之外安全拒绝。不要只为本次注释文本补黑名单，也不要改变九段历史SQL或抹平字符串语义。以上为基于源码和实测的修正建议，未替A修改生产实现。

## 修正验收要求与证据

三异常输入须在升级、registry与业务写入前拒绝；原schema/旧行/user_version/旧账本及约定物理文件边界保持。规范允许路线与有效控制通过；保留原五项、六轮四例、X01～X11、九段指纹、原12及107矩阵。A提交固定实现、实际命令/退出码与新增回归，同交付同步Wiki；C取得后再独立复验，不能只调测试期望。

- `wiki-project/raw/c-ae73d177-lexical.json`：新增三例与三个控制、完整scriptUtf8/scriptSha256、前后快照及删改结果。
- `wiki-project/raw/c-ae73d177-boundaries.json`：六轮四例关闭及三控制，7/7。
- `wiki-project/raw/c-ae73d177-matrix.json`：原107（含五项阻断、80异常与4真实SIGKILL）。
- `wiki-project/raw/c-ae73d177-m13.json`、`wiki-project/raw/c-ae73d177-native.json`：X01～X11、原12及SQL指纹。
- `wiki-project/raw/c-ae73d177-intake.json`：固定源manifest、源文件字节审计、作者探针对照、原始argv/cwd/时间/退出码/stdout/stderr/hash和运行器源码。

本工作树重跑：

```sh
python3 .runtime/run-a-electron.py a-m13-boundary-command ../a-probe/m13-boundary.cjs
python3 .runtime/run-a-electron.py a-m13-lexical-command ../a-probe/m13-lexical.cjs
```

内部Electron分别退出0/1；Python记录包装器自身返回0，必须读JSON的exitCode和产品summary。其他机器从固定A git archive取源码，按锁文件安装及native:rebuild；使用intake.probeSources还原固定A/C/B输入，runnerSources还原strip/build/record工具，再从证据scriptUtf8还原cjs。脚本自行建新合成库，无需搬运/提交数据库。

## 当前分工与边界

A修Y07～Y09体现的统一SQL解析问题并保留原回归；B保留已接收的A-W08/两次100证据和121验证准备，后续在固定组合验证报告/全部消费/成功幂等/事件原子性、升级重开及P1完整回执绑定。C复验A下一固定提交，门禁通过后继续完整M/F/J、领域有效旧业务回放、桌面接线与macOS联合；本轮未把B作者成绩写成C组合通过。

完整F01/F02检查点、F03～F07、M14协调器T2、领域业务M02～M08、D01～D12/J01～J08以及新A/B/C组合尚未完成；实际人工发布、人员签认和业务验收另待。C本轮不改生产/测试/维护工具/覆盖映射，只交付独立验证证据与语义Wiki。226份旧raw、228份非Wiki和日志完整字节前缀保持，P0检查见raw/c-ae73d177-wiki-validation.json；文档质量通过不覆盖产品changes_required。不推送、不合入。

关联：[[C迁移联合验证用例]]、[[C集成-Ae73d177复验与注释边界]]、[[A163f7a4独立复验与触发器边界回执]]。
