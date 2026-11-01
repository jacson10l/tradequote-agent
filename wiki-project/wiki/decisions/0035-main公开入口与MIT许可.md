---
title: 0035-main公开入口与MIT许可
type: decision
status: observed
updated: 2026-11-01
sources:
  - conversation:用户授权集成到main并公开仓库且明确选择MIT
  - LICENSE:1
  - THIRD_PARTY_NOTICES.md:1
  - AGENTS.md:1
---

# 0035-main公开入口与MIT许可

## 背景

当前功能与验证均已汇集codex/m1-abc-integration，main仍停留旧基线，README含过时入口；此前根项目未选许可证。用户明确要求main合并、仓库公开、README更新，并回答选择MIT。

## 决定

main作为公开默认入口接收验收后的集成成果，团队仍在codex/m1-abc-integration完成组合验收。采用根MIT License授权项目自有代码，保留原第三方许可与来源材料权利。README写当前实际能力与运行前提，历史验证保留固定SHA与未完成边界。

## 替代方案

用户已明确选择MIT，因此不采用Apache/GPL或公开但暂不选许可证。集成分支保持团队验收职责，main接收验收成果；不改为在main直接开发。

## 后果

公开使Git历史可被读取和克隆，第三方声明需保留。项目自有代码和供应商引用材料的许可范围分别说明。本轮不发布安装包、不启用云端测试。

## 回滚方式

若负责人后续要求调整公开状态，可另行变更GitHub可见性；已经被他人克隆的副本不随可见性变化自动删除。main内容回退采用新提交并保留历史；许可证调整须另获权利人明确决定，不自动撤销本次授权。

关联 [[C12公开发布与README]]、[[C12-main公开与README更新]]。
