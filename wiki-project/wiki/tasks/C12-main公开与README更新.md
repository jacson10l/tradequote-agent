---
title: C12-main公开与README更新
type: task
status: active
updated: 2026-11-01
sources:
  - wiki-repo:raw/c12-public-main-validation.json:1
  - conversation:用户明确授权main合并公开仓库更新README并选择MIT
  - README.md:1
  - LICENSE:1
  - wiki-repo:wiki/C12公开发布与README.md:1
---

# C12-main公开与README更新

## 目标

把已验收集成成果快进main，将GitHub仓库公开并采用用户选择的MIT，更新首次访问者可执行的README。

## 范围

C/Codex在独立codex/c12-public-main工作树实施；taskBase=3f3332b05ebf5527854685ac57e63a2586962961。macOS arm64、Node22.22.0、pnpm10.13.1；只改文档、许可证和Wiki覆盖映射，无业务/契约/依赖变更。main此前ef14fc3，0个独有提交；本机原主工作树和其他成员目录不覆盖。

## 验收

README能力/命令/路径与源码一致；MIT不覆盖第三方独立权利；Wiki语义、任务、日志、清单、只读check/lint、真实基线sync和维护回归通过；main与集成远端回读一致，GitHub可见性为PUBLIC且默认分支main，匿名入口可读取。

## 改动

重写README，新增LICENSE并修正第三方声明；AGENTS/CONTRIBUTING说明main公开入口与保留集成验收职责。Wiki新增本任务、知识页与ADR0035，登记LICENSE覆盖，并更新上下文/状态/分支入口与追加日志。未改应用功能，也不重新声明此前人工验收通过。

## 验证

实际已fetch检查祖先关系（0/213），读取GitHub可见性/默认分支/Actions设置，执行历史常见密钥格式扫描。文档/链接/生成/Wiki门禁的最终命令与结果将在完成后记录raw/c12-public-main-validation.json；未执行的验证不记通过。上一轮业务全量证据仍以C11固定版本为准。

## 未完成项

文档门禁已通过；本任务尚待远端main同步、可见性改变与匿名回读。业务人工签认、Windows/签名安装包、正式审批/外发/PDF是保留的产品边界，不作为本次文档发布已经完成的能力。

关联 [[C12公开发布与README]]、[[0035-main公开入口与MIT许可]]。


## 文档准备完成证据

已执行frozen install补齐独立worktree依赖；pnpm check（Biome、9项工程测试、Wiki只读check/lint）、固定3f3332b sync、diff --check均通过；覆盖映射维护回归最终36/36。README全部本地链接存在。独立Agent复核发现首次使用缺保存业务配置，已补齐“保存业务场景”和询盘客户，复核无剩余问题。初次缺Electron依赖和ADR格式失败保留，未减少测试。3665个历史blob常见密钥格式扫描无命中，不等同全面审计。具体命令/退出码与日志hash见raw/c12-public-main-validation.json。远端操作仍待执行。
