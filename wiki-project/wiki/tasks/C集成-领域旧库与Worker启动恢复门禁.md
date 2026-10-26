---
title: C集成-领域旧库与Worker启动恢复门禁
type: task
status: active
updated: 2026-10-26
sources:
  - conversation:用户限定C下一张任务为领域有效旧库回放及Worker启动恢复门禁先共享cb90e9f暂不合入
  - packages/infrastructure/src/worker-ownership.ts:1
  - packages/infrastructure/src/worker-migration-gates.test.ts:1
  - tests/fixtures/worker-gates-host.ts:1
  - wiki-repo:raw/c-worker-migration-gates-validation.json:1
---

# C集成-领域旧库与Worker启动恢复门禁

## 目标

C按用户最新顺序共享固定结果，先补领域有效旧库回放及Worker启动/恢复门禁。工程实施与本机测试已完成，保持active等待实际非作者接收；不将本任务扩大为整体迁移或业务发布验收。

## 范围

负责人C，本次Codex实施；独立工作树codex/c-worker-migration-gates，taskBase=cb90e9fd1a2266327e1c4644bae1b9d1ccf2e01c，集成目标merge-base=654fecc4d93e4630ed4a0cf42f261d0d432e23d3，累计历史基线be53b98。macOS arm64、Node22.22.0、pnpm10.13.1、Electron44.9.2。仅合成旧库及本机HTTP，不读取真实凭据或客户数据。

## 验收

- 固定cb90e9f普通推送并远端回读一致，不合入。
- 共同v3及C5/C6/C7有效V1/V2/V3、缺价null、run/回执/步骤升级与重开；T0/T1/T2分离。
- 真实Worker争用者不进入ready，不中断活跃旧run；旧Worker退出后可接替。
- 不支持库在恢复前安全拒绝，Main无ready/伪成功，业务数据/版本/schema/字节保持。
- 重开/成功幂等回放不发模型，旧成功事实不改，恢复仅发生一次。
- P0正文/任务/日志/覆盖与本机检查齐备，人工与整体边界保持。

## 改动

新增worker-migration-gates.test.ts与测试用worker-gates-host.ts，直接运行生产Worker/Main client。发现并修正WorkerOwnership对数据库文件符号链接的锁绕过；未改A迁移/B报告事务或新业务UI。实现细节及精确矩阵见[[C领域旧库回放与Worker启动门禁]]；覆盖/index/ADR0020/状态同步，维护算法未变。

cb90e9f已推送origin/codex/c-b-f4c9dfc-validation，回执raw/c-worker-migration-gates-sharing.json；本轮新分支未推送，无合入/外发消息/代签。

## 验证

实际冻结安装成功。最终typecheck0、四文件45/45（含新8项及旧15个SIGKILL场景）、build0、实际Electron恢复1/1。锁别名回归含一个挂起HTTP调用，争用和接替总请求1；旧成功回放/启动组均0。机械生成、只读check/lint、pnpm check、wiki:test、cb90e9f/654fecc/be53b98基线sync的实际命令、退出码与源码hash保存在raw/c-worker-migration-gates-validation.json。

初始宿主CJS/type narrowing/原生依赖装载诊断失败、真实symlink互斥失败及owner-journal断言差异，保留raw/c-worker-migration-gates-diagnosis.json。装载失败时三个拒绝测试不计有效证据；修正装载后才验真实路径。原121/455/九Electron保持上轮证据，不假装本轮重跑。已有构建警告保留。最终工程6/6、Wiki维护36/36及三基线sync均退出0；300份既有非生成raw字节、202518字节旧log前缀保持，唯一既有生产源码变更是worker-ownership.ts。作者自查不等于实际非作者评审。

## 未完成项

完整M/F/J其余检查点/故障注入、A4/A6业务变体、新知识检查桌面入口、真实lint/review服务、实际审核/发布/撤回、业务语义及整体非作者签认仍待；Windows/签名安装后置。本任务当前技术结果不代签A/B/实际人员，不开放新业务入口。后续纵向切片按[[C迁移后桌面接线清单]]，总任务[[C集成-迁移方案执行与联合验收]]继续active。
