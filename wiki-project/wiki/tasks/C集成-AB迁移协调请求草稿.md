---
title: C集成-AB迁移协调请求草稿
type: task
status: done
updated: 2026-10-23
verification:
  - wiki-repo:raw/c-migration-coordination-draft-validation.json:1
sources:
  - wiki-repo:raw/c-b01-remote-intake.json:1
  - wiki-repo:raw/c-b01-migration-compatibility-probe.json:1
---

# C集成-AB迁移协调请求草稿

## 目标

按用户要求基于d99f2b3，准备给A/B的迁移协调请求草稿，列明6/7谱系、六组诊断、兼容或安全拒绝建议和待确认项，同步Wiki；不改历史迁移、不代签、不自动发送，不推送/合入或真实模型复测。

## 范围

taskBase=d99f2b32def756b6b4d4cc99fca75dd9511436d5，独立codex/c-migration-coordination-draft，复用/Users/jason/.codex/worktrees/c-diagnostics-p2-fix/tradequote-agent；旧接收/交接等分支不移动。现有macOS26.4 arm64、宿主Node22.22.0、pnpm10.13.1，仅Wiki正文/导航/记录；本轮不重新执行诊断、迁移或产品套件，不创建已批准ADR。

## 验收

草稿完整固定SHA和原证据hash可定位；D1～D6分列并逐项对照原before/after/error/ledger，compatible=false不写通过。方案明确识别、执行身份、保留历史、追加向前与修改前拒绝边界，不擅自编号。M1～M8责任/材料/本人回复格式明确，方案意见与实施验收/业务签认分开。原raw/log/225源码与迁移保持；实际生成/只读check/lint、任务/目标/累计sync和diff通过后仅备稿任务可done。

## 改动

新增[[C迁移协调请求草稿-AB谱系兼容]]，向[[B01固定提交接收与迁移兼容诊断]]、A/B未发送请求和统一入口追加协调入口，更新依赖任务、CONTEXT/状态/导航/日志。原A-3/AB-1与其他人员状态不代填，草稿status=draft且未发送。

## 验证

人工逐项读原六组schema/ledger/错误及SQL指纹，并核对固定版本和角色责任；本轮文档引用/保留审计及实际门禁见[备稿验证](../../raw/c-migration-coordination-draft-validation.json)。旧六组探针和B原验证仅引用已执行结果，不冒充本轮重新运行；无新独立Agent复核。

## 未完成项

A/B/C方案选择、M1～M8实际回复、原库存在性、支持/拒绝矩阵、正式ADR与实施/恢复验证未完成。完整非作者、macOS组合/Electron、A人工发布与业务验收仍待；[[C集成候选-依赖与非作者签认]]及[[C04-收口签认]]继续active。未发送、无人员通过结论/新迁移或推送/合入/真实复测。

最终备稿门禁通过：D1～D6及四个冲突SQL指纹、完整固定SHA与原始迁移源hash核对，225源码/184旧非生成raw/102143字节log前缀保留，生成/192页只读check/lint、d99f2b3/654fecc/be53b98同步及diff实际退出0。done只表示草稿整理完成；请求仍draft/未发送、方案未选择、compatible=false和人员active保持。


## 后续用户授权的推送交接

本任务done仅备稿；其后用户明确授权指定协调分支推送。原文fd4b728及其诊断祖先d99f2b3已在origin可读取，远端完整核对与固定链接见[[C集成-迁移协调草稿推送交接]]、[[C迁移协调请求草稿-AB谱系兼容]]。原“不推送”是当时约束，新授权仅开放分支读取，不关闭方案/人员待签或自动发送，历史原文/证据不改。
