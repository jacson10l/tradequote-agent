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
---

# B组合验证准备与固定输入

## 固定输入与当前结论

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

1. 收到A新固定SHA与X10/X11修复证据后取得对象，保留X01～X09回归；C独立复验X01～X11。未满足时不推进正式迁移接受。
2. 在独立组合分支记录A/B/C完整SHA、merge-base、工作树状态、OS/CPU、Node/pnpm/Electron与原生ABI。按各方增量合并公开出口，保留A迁移/存储、B executeChecks/P1及C运行/桌面入口；禁止整文件覆盖index.ts或复制DTO。运行typecheck检查调用方、mock和公共导出。
3. 通过Electron的Node ABI执行下列九文件命令，再运行新组合适用的迁移测试与C矩阵。记录实际命令、退出码、完整非敏感输出、测试数量和源码hash；失败照实保留，修复后另记结果，不能复用本次121项作组合证据。
4. 若新组合加入真实lint存储/审核服务，补该服务加载真实已存报告后的事务路径验证；目前P1校验测试只证明协议绑定。人工签认、发布和业务验收仍需分别完成，macOS联合桌面结果由实际执行者记录。

在项目根目录解析本工作树apps/desktop的electron路径，使用ELECTRON_RUN_AS_NODE=1（PowerShell先设置$env:ELECTRON_RUN_AS_NODE='1'，执行后恢复）运行：

```text
electron node_modules/vitest/vitest.mjs run packages/contracts/src/checks.test.ts packages/contracts/src/knowledge-wiki.test.ts packages/contracts/src/knowledge-build.test.ts packages/contracts/src/knowledge-maintenance.test.ts packages/contracts/src/knowledge-lint-review.test.ts packages/infrastructure/src/wiki-store.test.ts packages/infrastructure/src/check-store.test.ts packages/infrastructure/src/check-lineage-integration.test.ts packages/infrastructure/src/wiki-check-integration.test.ts
```

## 本轮实际执行与限制

宿主Windows x64，依赖准备使用Node24.21.0/pnpm10.13.1执行pnpm install --frozen-lockfile --offline --ignore-scripts退出0，保留engine警告；随后运行器使用项目固定Node22.22.0，实际SQLite测试使用Electron44.9.2/内嵌Node24.22.0。九文件121/121、原生运行时身份查询与远端头查询均退出0。新证据raw/b-combination-regression-ready.json包含argv、时点、输出、退出码和九份测试源码hash；本轮仅文档改动，不新增依赖或更改锁文件。

Wiki生成、只读check、lint、以本轮真实067afc2完整SHA为基线的sync及diff检查在同一新证据记录。维护脚本/映射未改，不重复维护回归。全量单元、build、X矩阵、M/F/J、真实桌面、macOS及新固定组合未执行。迁移整体、A/B/C联合验收保持active/WIP，不推送、合入、代签、自动发送或调用真实模型。

最终Wiki生成184文件、只读check、lint（123页/107语义页）、固定067afc283dd3026e21b5a443d90e00e9acdbbbc7同步及diff均退出0；105份旧raw和旧log字节前缀保持。首次lint因本页表内缩写源码路径失败，改为完整有效路径后通过，原失败保留在新证据中。

关联：[[B谱系账本适配与P1回执交接]]、[[B01-谱系账本适配与P1回执]]、[[B00a知识整理与维护协议]]、[[B对Ca633c428复核与公共契约确认]]。
