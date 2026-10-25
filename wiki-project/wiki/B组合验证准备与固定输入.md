---
title: B组合验证准备与固定输入
type: interface
status: observed
updated: 2026-10-25
sources:
  - packages/infrastructure/src/wiki-check-integration.test.ts:105
  - packages/infrastructure/src/check-lineage-integration.test.ts:29
  - packages/infrastructure/src/check-store.test.ts:491
  - packages/contracts/src/knowledge-lint-review.test.ts:1
  - wiki-repo:raw/b-combination-regression-ready.json:1
  - conversation:用户转交C固定fd2fa252并要求B准备新组合验证
  - wiki-repo:raw/b-combination-fixed-handoff-validation.json:1
  - https://github.com/jacson10l/tradequote-agent/blob/356e4ca7557a3bef67a6898007504e657175655b/wiki-project/wiki/A41f0cdc独立复验与迁移矩阵阻断.md
---

# B组合验证准备与固定输入

2026-10-25 最新固定状态：已实际读取C 03b16b76ceb336d9f37692ee8b51046e90f328a0的B接收原文、来源审计及A910e626矩阵。M09-L01/L02、M13-Y01/Y02/Y03在后续C复验已关闭，固定A910e626保持107/107，X01～X11及Y10也在已测范围通过；不再等待163f7a4或要求A重修这些已关闭样本。C按原范围接收B121作者自验（HEAD067afc2、A依赖b9a0af7、证据5cdb2b1），本轮C未复跑；原A-W08技术确认与两次100项接收保持。B现于独立codex/b-a910-c03-combination组合A a2b050e（实现910e626）、B7f8afe6、C03b16b7，保留A迁移/B检查与P1/C运行及桌面出口；新九文件及兼容验证另存raw/b-a910-c03-combination-validation.json，不沿用原121作为新结果。完整迁移M/F/J、新组合独立接收、桌面/macOS联合、真实lint存储/人工发布、人员签认和业务验收仍未完成。详见[[B新固定组合与回归范围]]、[[B01-新固定组合回归]]。

以下较早结论保留为对应固定版本的历史，不作为当前等待条件。

## 历史：7f8afe6固定材料与当时阻断

2026-10-25 当前固定进度：A 41f0cdc4d2d8db931f00f4c2fc141e4274abf82b已推送，C固定356e4ca7557a3bef67a6898007504e657175655b独立验证X01～X11为11/11通过；当前阻断为M09-L01/L02、M13-Y01/Y02/Y03（扩展矩阵107项中102通过/5失败）。A本地163f7a4修复五项仅为用户转述，尚待取得推送后的固定实现及C复验。B保留5cdb2b15ddb267f9eea8d169a0dbe0c55c56f465、A-W08技术确认、原两次100/100和本轮121/121；121项仅登记为B作者自验，实际代码067afc283dd3026e21b5a443d90e00e9acdbbbc7，A依赖b9a0af76217e57e0ab22ba927de1a1a287b1145f，并非41f0cdc组合。本轮纯状态/材料更正不重跑121项，普通推送独立B分支供C接收，不合入。新A修正到位后在明确固定的新组合验证报告消费事务、旧库重开/幂等与P1回执，另记结果；迁移整体、新组合、macOS联合及人员/业务验收均未完成。详见[[B组合验证准备与固定输入]]及raw/b-combination-fixed-handoff-validation.json。

C固定[复验原文](https://github.com/jacson10l/tradequote-agent/blob/356e4ca7557a3bef67a6898007504e657175655b/wiki-project/wiki/A41f0cdc独立复验与迁移矩阵阻断.md)及其m13/matrix两个原始JSON已实际读取并核对blob/SHA-256，矩阵内嵌脚本hash也已核验。其11/11与102/107均归属C对固定A的独立复验，不是B复验或新组合。五项分别为未知旧账本登记、重复旧身份、不可达真实RAISE、触发器挂错表、索引挂错表。

## 121项作者自验的精确归属

- 实际执行时完整HEAD：067afc283dd3026e21b5a443d90e00e9acdbbbc7；保存材料提交：5cdb2b15ddb267f9eea8d169a0dbe0c55c56f465。二者packages/apps/scripts/tests及配置无差异，与8043afb84db04697c78bae668d63af19303ced50的对应源码也相同；九份测试的证据hash已逐份与测试时Git blob及当前文件核对。
- A依赖：b9a0af76217e57e0ab22ba927de1a1a287b1145f（迁移实现9cdd13a3755b4bd1d0a4ac300785021e47ed4a88），经2100aa7253c2e0285d71cc879e60e3001f3cc82d组合，B在99ba7de97fd25f0843ccf63acfb8f97c374137f3保留类型/公开接口适配；未导入A cece332或41f0cdc，不能称原样A快照或新A/B/C组合。
- 环境：Windows x64，运行器Node22.22.0，pnpm10.13.1，Electron44.9.2/原生Node24.22.0。执行时间为北京时间2026-10-25 00:48:36～00:48:39，ELECTRON_RUN_AS_NODE=1；下文九文件命令的实际executable、argv、开始/结束时点、stdout/stderr和退出0均在原raw/b-combination-regression-ready.json，并原样引用到新raw/b-combination-fixed-handoff-validation.json。结果9文件121/121，仅B作者自验，非C接收或非作者批准。
- 依赖准备使用宿主Node24.21.0的engine警告及首次Wiki lint失败记录保留。本轮只更正状态/交接，不重跑不变化的121项，不覆盖原证据。

## 历史：5cdb2b1准备时的固定输入与结论

2026-10-25，B实际取得C fd2fa2529d2ebc919ca669b16486b0bc87484c89，读取其任务及raw/c-x10-x11-update-check.json，并保存原JSON的blob与SHA-256。本轮再次git ls-remote确认A远端仍cece332e41a230ebbeeaee64eb283b49a5d4fb43，C远端与用户给定完整SHA一致；尚无新推送的X10/X11修复供组合。C文件中的未推送措辞是该提交前的历史状态，本轮以实际远端回读为准。

B在独立工作树D:/code/tradequote-agent-b-combination、新分支codex/b-combination-regression-ready从067afc2开工。未导入A cece332或C运行实现，B源码仍保留8043afb阶段的既有实现。A-W08的CAPABILITY_UNAVAILABLE/retryable=false技术确认、两次八文件100/100及所有旧raw不改写。C原X01～X09通过与X10/X11失败继续按固定C证据归属，不视为B重跑或迁移已完成。

## 可复跑的B验证矩阵

| 验证项 | 既有可执行来源 | 在新组合中必须观察到的结果 |
|---|---|---|
| 报告与消费同事务 | packages/infrastructure/src/wiki-check-integration.test.ts:105，packages/infrastructure/src/check-store.test.ts:531 | 从A正式search/resolve取得全部来源，报告、消费、两类事件与幂等一起提交；重开后引用与原金额不变 |
| 四处写入失败 | packages/infrastructure/src/wiki-check-integration.test.ts:138 | 分别向quote_check_report、knowledge_consumption、outbox、idempotency注入SQLite失败，四表数量均恢复到执行前；移除注入后同键可成功，不残留半份报告 |
| 提交前来源失效 | packages/infrastructure/src/wiki-check-integration.test.ts:298 | 报告插入触发来源撤回后，事务复核拒绝并回滚报告、消费及撤回；去掉注入后可重试 |
| 参与方替换 | packages/infrastructure/src/check-store.test.ts:491 | prepare返回错误reportId/quoteId/revisionId/quoteVersion/checkedAt时，在register和写入前拒绝，无消费或事件残留 |
| 旧B7升级与重开 | packages/infrastructure/src/check-lineage-integration.test.ts:29 | 先以旧SQL/旧账本生成真实合成业务行，再走repository升级到统一8；两次重开逐表保持原报告JSON/hash、消费、报价、来源、幂等、outbox、旧账本；同键换requestId重放首份报告与原时点，不重复写入 |
| P1输入与完整回执 | packages/contracts/src/knowledge-lint-review.test.ts:1 | 已载入P1报告绑定P0 input/宿主工作区、人工origin与时间；七类receipt字段替换均拒绝，blocked/partial/failed可记录reject但不能approve，renderer不能附加自造receipt |
| A-W08与能力门禁 | checks.test.ts、knowledge-wiki.test.ts、wiki-store.test.ts | 合法未实现能力保持CAPABILITY_UNAVAILABLE/retryable=false；非法输入拒绝，不改变运行重试权限 |

四处失败回滚的既有测试会实际执行真实消费写入；旧八文件100项没有包含wiki-check-integration.test.ts。本轮将它纳入，九文件121/121通过。没有新增镜像测试、修改SQL归一算法或放宽断言。以上是B准备回归，不能覆盖X01～X11或C的完整M/F/J矩阵。

## 新固定组合的执行顺序

1. 已取得A a2b050eb74f52dc10916645bcc7a2dead02f9a72（实现910e6260af0c4d84471e665da7656dbf8133aae7）、B7f8afe6a0849da3f198bf5bf3be32180053f082d与C03b16b76ceb336d9f37692ee8b51046e90f328a0。C固定矩阵107/107、指定五项/X01～X11及Y10在已测范围关闭，不再等待修复；先记录来源、所有merge-base和环境，处理公开出口并集与调用方兼容，再执行新组合回归。
2. 在独立组合分支记录A/B/C完整SHA、merge-base、工作树状态、OS/CPU、Node/pnpm/Electron与原生ABI。按各方增量合并公开出口，保留A迁移/存储、B executeChecks/P1及C运行/桌面入口；禁止整文件覆盖index.ts或复制DTO。运行typecheck检查调用方、mock和公共导出。
3. 通过Electron的Node ABI执行下列九文件命令，再运行新组合适用的迁移测试与C矩阵。记录实际命令、退出码、完整非敏感输出、测试数量和源码hash；失败照实保留，修复后另记结果，不能复用本次121项作组合证据。
4. 若新组合加入真实lint存储/审核服务，补该服务加载真实已存报告后的事务路径验证；目前P1校验测试只证明协议绑定。人工签认、发布和业务验收仍需分别完成，macOS联合桌面结果由实际执行者记录。

在项目根目录解析本工作树apps/desktop的electron路径，使用ELECTRON_RUN_AS_NODE=1（PowerShell先设置$env:ELECTRON_RUN_AS_NODE='1'，执行后恢复）运行：

```text
electron node_modules/vitest/vitest.mjs run packages/contracts/src/checks.test.ts packages/contracts/src/knowledge-wiki.test.ts packages/contracts/src/knowledge-build.test.ts packages/contracts/src/knowledge-maintenance.test.ts packages/contracts/src/knowledge-lint-review.test.ts packages/infrastructure/src/wiki-store.test.ts packages/infrastructure/src/check-store.test.ts packages/infrastructure/src/check-lineage-integration.test.ts packages/infrastructure/src/wiki-check-integration.test.ts
```

## 历史：5cdb2b1作者自验实际执行与限制

宿主Windows x64，依赖准备使用Node24.21.0/pnpm10.13.1执行pnpm install --frozen-lockfile --offline --ignore-scripts退出0，保留engine警告；随后运行器使用项目固定Node22.22.0，实际SQLite测试使用Electron44.9.2/内嵌Node24.22.0。九文件121/121、原生运行时身份查询与远端头查询均退出0。新证据raw/b-combination-regression-ready.json包含argv、时点、输出、退出码和九份测试源码hash；本轮仅文档改动，不新增依赖或更改锁文件。

Wiki生成、只读check、lint、以本轮真实067afc2完整SHA为基线的sync及diff检查在同一新证据记录。维护脚本/映射未改，不重复维护回归。全量单元、build、X矩阵、M/F/J、真实桌面、macOS及新固定组合未执行。迁移整体、A/B/C联合验收保持active/WIP，不推送、合入、代签、自动发送或调用真实模型。

最终Wiki生成184文件、只读check、lint（123页/107语义页）、固定067afc283dd3026e21b5a443d90e00e9acdbbbc7同步及diff均退出0；105份旧raw和旧log字节前缀保持。首次lint因本页表内缩写源码路径失败，改为完整有效路径后通过，原失败保留在新证据中。

关联：[[B谱系账本适配与P1回执交接]]、[[B01-谱系账本适配与P1回执]]、[[B00a知识整理与维护协议]]、[[B对Ca633c428复核与公共契约确认]]。
