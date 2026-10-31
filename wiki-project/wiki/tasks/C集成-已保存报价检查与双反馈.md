---
title: C集成-已保存报价检查与双反馈
type: task
status: active
updated: 2026-10-26
sources:
  - conversation:用户要求C开发兼项目负责人继续完成已保存报价真实桌面检查切片
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - apps/desktop/src/workers/business.ts:1
  - tests/e2e/quote-checks.spec.ts:1
  - wiki-repo:raw/c-saved-quote-checks-validation.json:1
---

# C集成-已保存报价检查与双反馈

## 目标

接通已保存报价→人工触发检查→报告与全部消费原子保存→风险标记＋文本批注→重开回读。C承担桌面/公共接线与项目推进；A/B已实现事务及资格读取按固定组合复用，实际人员审核发布与非作者接收独立保留，整体active。

## 范围

独立分支codex/c-saved-quote-checks，taskBase=c6f6788d3e75f3ac9de02d95306222fb5509ca71；集成merge-base654fecc4d93e4630ed4a0cf42f261d0d432e23d3，累计be53b98。继续使用独立C工作树，不改其他成员分支；macOS arm64、Node22.22.0/pnpm10.13.1、Electron44.9.2。本轮已按用户继续执行授权共享c6f6788，回读一致，无合入。新切片尚未推送。

## 验收

1. 两个严格CheckClient命令通过可信Main/Worker访问已有真实repository服务，模型凭据不进入检查。
2. 按钮确认写入后才显示新报告；失败/未知结果可显式同键重试，无自动重发；旧报告与金额保持。
3. 两反馈使用同一checkId及本版本报告，完整多来源和通过规则引用可查看，缺覆盖保持待核实。
4. 实际Electron证明原子失败无半份报告/消费/事件/幂等，重开回读与旧成功键回放，V1/V2隔离，非主窗口和注入被拒绝。
5. P0语义页/任务/log/覆盖/生成/只读check/lint与真实基线sync齐备，原证据保留。

## 改动

Runtime仅增加既有Check协议联合；Main增加两方法白名单，Worker委托executeChecks，preload精确方法与返回身份校验。QuoteChecks增加人工检查/重试、成功后报告选择、迟到响应隔离和报告全部知识来源展开；原风险定位与文本批注共用报告。新增离线合成fixture和实际Electron两流程，更新原workspace门禁断言，保留剩余Wiki服务不可用与readonlyMock行为。无新DTO/依赖/迁移、无复制A/B算法。

源码与精确行为见[[C已保存报价检查桌面切片]]。本轮角色范围由用户C兼负责人指令明确，公共契约仅接线现有方法，不改B命令或报告语义；不代签A/B。

## 验证

最终类型退出0，Runtime/preload/组件31/31；含构建的全部实际Electron 11/11（新检查2项＋原9项）通过。工程/Wiki及基线检查结果以raw/c-saved-quote-checks-validation.json的实际checks为准。原121/455和迁移门禁按既有证据复用，本轮不宣称重跑。初始测试失败/修正见raw/c-saved-quote-checks-diagnosis.json，最终源码hash及保留审计随验证记录。

A审核/发布仍未实现，已发布lifecycle由明确合成夹具投影，不能当真实发布服务或实际人工验收。新V2由生产业务commitAgent＋合成patch生成，不调用供应商。真实Electron在临时独立userData内运行，消费断言核对全部来源与报告hash。实际截图已查看，未把浏览器通过当桌面通过。

## 未完成项

实际非作者复核、A真实lint存储/review/publish/withdraw及人工入口、实际业务人员语义确认、完整M/F/J余项和整体接收仍待；Windows/签名安装后置。UI未知写意图只保留组件内存，不承诺跨重载同键恢复；重开只读原报告。主任务[[C集成-迁移方案执行与联合验收]]保持active。


最终工程检查6/6、Wiki维护36/36与c6f6788/654fecc/be53b98三基线sync均已实际通过。保留审计raw/c-saved-quote-checks-preservation.json核对303份旧非生成raw与203782字节旧log前缀保持；A/B迁移、检查事务、Wiki来源实现及原DTO/只读mock逐字节不变。作者自查不代替实际非作者复核。


项目依赖核对：本轮git ls-remote实际回读A迁移ec6b729、A搜索dd42b05、B固定组合f4c9dfc及P1契约19d60a8；当前可读固定组合中的wiki-store.review/publish/withdraw仍为不可用门禁。此处只描述已取得候选，不推断其他成员未推送工作树；未对其他聊天或外部服务发送任务消息。后续A需交固定的真实lint回执存储/绑定校验和人工生命周期入口，B确认报告消费/来源资格，C再接成熟接口及实际Electron验收。
