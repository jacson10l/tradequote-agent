---
title: C17新Cue知识与Harness
type: architecture
status: active
updated: 2026-11-01
sources:
  - wiki-repo:raw/c14-enterprise-knowledge-validation.json:1
  - packages/infrastructure/src/codex-harness.ts:1
  - packages/infrastructure/src/quote-tool-agent.ts:1
  - conversation:用户要求以LLMWiki和CodexHarness为核心重做并发布Cue
---

# C17新Cue知识与Harness

## 目标与叙事

面向普通观众和评委，以LLM Wiki × Codex Harness为核心：企业资料录入→模型整理带出处候选→人工审核发布→Harness驱动Agent使用受限工具→确定性核价、检查及保存引用报告。产品代码基线99c167d，承接[[C14企业知识闭环方案]]与[[C15知识关系图谱]]。本轮只制作演示和交付记录，不改产品源码。

## 十页内容

1. 企业知识进入每一次报价：两个核心与产品定位。
2. 知识可信与任务执行：两者解决的问题及分工。
3. LLM Wiki的来源、候选、人工审核发布。
4. 当前企业图谱：285行/82SKU/6品类，另有6份合成资料；当前185节点/170关联。
5. Codex Harness的询盘理解、知识查询、核价检查与保存工具循环。
6. 知识、编排与确定性业务模块之间的连接；引用证据随报价保存。
7. 真实DeepSeek-flash隔离验收：300件×39.21=11763.00CNY，1条Wiki引用/1来源。
8. 英语/德语客户产物、版本保留与待确认语义。
9. 电子宠物：大幅角色图、独立memory、审核人设及与询盘Agent的职责区分。
10. 已验证能力、开源入口与下一步。

## 证据与边界

当前企业图谱为本轮原生Electron实拍。知识审核截图来自真实模型隔离验收，资料明确合成；英德截图为既有合成桌面验收素材；电子宠物使用项目真实形象资源。按用户最新决定，全稿删除开机动画的图片、文案与讲稿。电子宠物memory为有界会话记忆和摘要，不宣称永久完整保存聊天。

本地88个知识候选尚未审核，不声称全量模型整理或批准。报价知识消费仅限已发布且适用的规则，SOP/术语通用RAG尚未实现。金额由确定性模块计算，未知运税费不视为零；报价是未审核草稿。非作者业务/语言签认、Windows及签名安装包、正式审批/邮件/PDF和计时效率对照仍未完成。

## 制作与交付

独立任务分支codex/c17-cue-wiki-harness，基线99c167d。本地PPTX有10页与10份讲稿；通过已登录Cue网页导入，不宣称使用本会话未连接的Cue MCP。发布状态和页面核验见[[C17-Cue新版发布]]及其验证回执；观看密钥仅保留本机交付文件，不提交Git。


最终新版已发布至[Cue编辑页](https://cue.humanmeetsai.com/deck/27f96b51-c562-4d72-be90-2f7e6d650506)，观看页实测正常加载，10页约5分钟。私密观看链接交付用户但不写Git，避免传播密钥。
