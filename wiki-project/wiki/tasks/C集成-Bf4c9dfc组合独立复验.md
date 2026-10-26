---
title: C集成-Bf4c9dfc组合独立复验
type: task
status: done
updated: 2026-10-26
verification:
  - wiki-repo:raw/c-f4c9dfc-verification.json:1
sources:
  - conversation:用户转交B固定f4c9dfc新组合及ceec0ee作者验证要求C独立复验
  - tests/e2e/quote-agent.spec.ts:1
  - tests/e2e/multistep-agent.spec.ts:1
  - wiki-repo:raw/c-f4c9dfc-intake.json:1
  - wiki-repo:raw/c-f4c9dfc-wiki-validation.json:1
---

# C集成-Bf4c9dfc组合独立复验

## 目标

核对B固定新组合来源，在macOS独立执行九文件/全量单元/工程/维护与历史迁移、原桌面回归，并处理C拥有的测试兼容问题。本轮上述范围完成，done不表示完整M/F/J、知识检查桌面接线、真实lint/review或人员验收完成。

## 范围

taskBase=f4c9dfcfd3f656bb57b83d33f9ce13db2d8089cd，独立codex/c-b-f4c9dfc-validation；B代码ceec0ee与f4c9dfc非Wiki源码一致。来源A a2b050e/实现910e626、B7f8afe6、C03b16b7均完整SHA保存在intake。macOS26.4 arm64、Node22.22.0/pnpm10.13.1、Electron44.9.2/Node24.22.0/SQLite3.53.4；仅合成库/HTTP，无真实模型，未推送/合入。

## 验收

独立命令/源码hash与来源可核；原失败不抹掉，旧raw/log保留。九文件、全量、维护、迁移及原桌面回归真实执行；测试修正不得改变原断言、超时、业务保护和生产源码。P0知识/任务/log与实际基线门禁齐备，完整项目边界单列。

## 改动

新增[[Bf4c9dfc组合macOS独立复验与桌面回归]]及独立intake/原迁移八套与E2E诊断证据。仅正式修改两个E2E alert查询为业务region内定位，保留所有原断言，最终格式化AST等价。同步对应M4/C02c知识页、CONTEXT/项目状态/矩阵/接线/总任务/index/log，映射与维护工具不变。

## 验证

九文件121/121、全量455/455、维护36/36、工程6/6、typecheck0。原迁移12/12、X01～X11 11/11、六轮7/7/七轮6/6/Y10 3/3含控制、矩阵107/107及九SQL指纹均保持。A迁移core/ledger归一AST一致；A78/B108/C254 raw来源保留独立核对。

原桌面7/9退出1：多规则面板alert造成两个全局查询歧义。忽略目录仅改locator副本2/2通过，正式同修正后原9项含build 9/9通过；原失败、成功及源hash保存e2e-diagnosis，不声称原f4c9dfc未改测试即9/9。仅后续格式换行，独立AST比对与实际执行版等价。初次本地AST运行器参数错误已修正并留证。

本机代码/证据与最终Wiki工程门禁见intake及wiki-validation；290旧raw/原log字节前缀保持、仅两E2E源文件允许变化。Windows旧失败保留，不冒充Windows复跑或实际人员通过。

## 未完成项

完整M/F/J全部边界和业务变体、新Wiki/Check/P1桌面接线、真实lint存储/review、人工发布及人员/业务签认、Windows新测试修复版/签名安装待后续；总实施任务继续active。本轮不推送、不合入、不外发消息。

关联：[[Bf4c9dfc组合macOS独立复验与桌面回归]]、[[C集成-迁移方案执行与联合验收]]。
