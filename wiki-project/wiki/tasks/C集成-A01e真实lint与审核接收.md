---
title: C集成-A01e真实lint与审核接收
type: task
status: active
updated: 2026-10-27
sources:
  - conversation:用户转交A的b05a049与e7a9439反馈要求继续C接收
  - packages/infrastructure/src/wiki-store.ts:1
  - packages/infrastructure/src/check-lineage-integration.test.ts:1
  - wiki-repo:raw/c-a01e-p1-intake.json:1
  - wiki-repo:raw/c-a01e-p1-validation.json:1
  - wiki-repo:raw/c-a01e-p1-blockers.json:1
---

# C集成-A01e真实lint与审核接收

## 目标

接收A新增lint回执/人工服务与两项引用资格修正，组合C739桌面和B新增消费测试，独立验证是否可开启真实人工入口。本轮原两项公开引用修正通过，但新增P1四类7例失败，结论changes_required，保持active/WIP，不宣称交付完成或合入。

## 范围

独立managed worktree/分支codex/c-a01e-p1-intake，taskBase=739961a6aecf379bbdd785e9fd3bfe115ee6ade1；A固定e7a94392af5816c4e9d7f01885bde40189030432（含b05a049），B固定e5f6b1a2a4d03a83ea5264c8a4f9f524f62461b2。远端已推送，截图未推送是历史时点。macOS arm64、Node22.22.0/pnpm10.13.1、Electron44.9.2；Windows保持作者原范围、未在本轮复跑。冻结安装成功，无依赖变化。

## 验收

固定来源/旧九SQL及消费/桌面保护可核；A原两引用反例关闭。完整P1报告落库回读、同键宿主时间变化重放、lint/审核/发布间来源变化拒绝、旧事实保持，所有阻断用原脚本复验后才可放行；真实人工语义和非作者接收单列。

## 改动

归一三方合成A五文件增量，保留C run/check出口及B消费者保护；公共payload schema替代A私有重复形状，A六方法AST与原件一致。导入B两个测试文件及原raw/知识/任务原文，A新探针脚本原字节导入。C修B7夹具动态吸入A8的问题，固定历史六能力并加新lint登记/空表断言，未删除旧数据/回执断言。新记录[[Ae7a9439接收与P1接线阻断复核]]、阻断脚本/证据、coverage/状态/ADR和追加log，实际新Wiki入口未开启。

## 验证

类型退出0；原A/迁移/知识/报告四文件47/47，B七文件＋C旧库Worker门禁最终117/117；含build的全部实际Electron11/11通过。A纯Node新探针43分类/11追加/2控制、10指纹全部通过。B原公开来源两反例C独立2/2通过。首次117中116/1失败来自历史B7夹具误装未来A8，已修正保留原失败。

另有独立8例P1验收1个正常控制通过、7个产品断言失败，分别为完整lint报告缺失、review的宿主now破坏同键重放、发布前来源更新/到期/撤回仍放行、失格来源lint静默passed。初始0例装载错误和修正后真红例分开。raw/c-a01e-p1-blockers.json可恢复复跑，不能拿117绿色覆盖7红例。工程/Wiki/维护与三基线命令以validation实际记录为准，不将失败改成通过。

## 未完成项

A修四类P1并交固定作者证据，B确认完整报告/审核绑定与来源政策，C再次复验并接人工入口；实际人员审核/发布/撤回、业务语义和整体非作者接收、完整M/F/J其他样本仍待。新能力完整损坏矩阵未执行；schema探针及旧Worker样本只按已测范围记录。保持WIP、未推送/合入、未代签或外发消息。


关联：[[Ae7a9439接收与P1接线阻断复核]]、[[B-P1回执与来源消费复核]]、[[C已保存报价检查桌面切片]]。


最终工程6/6、Wiki维护36/36以及739/654fecc/be53b98三套同步均通过。一次Wiki缺两个相关语义链接的失败已补齐并保留，未改检查器；P1的7产品失败继续保持，不据此标done。完整lint报告补齐时应保留旧receipt-only历史，不把未执行的七类检查补造为passed，不覆写既有审核/发布事实。


## 2026-10-27 共享与修正要求

用户授权普通推送7e6b485，实际推送origin/codex/c-a01e-p1-intake和完整SHA回读均退出0，未合入；raw/c-a01e-p1-push-receipt.json保存回执。可直接转发A/B的四类修正、责任与验收已写入[[Ae7a9439接收与P1接线阻断复核]]本日共享节，固定复现材料仍为7e6b485。后续仅文档回执提交不改应用源码，不重跑117/Electron11或P1七红例；本次文档生成/check/lint与7e6b485基线sync结果另存raw/c-a01e-p1-sharing-validation.json，产品changes_required和人员待签不变。前文“未推送”保留原WIP保存时点。
