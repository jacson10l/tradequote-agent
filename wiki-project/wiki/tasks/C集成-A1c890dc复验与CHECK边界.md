---
title: C集成-A1c890dc复验与CHECK边界
type: task
status: active
updated: 2026-10-25
sources:
  - conversation:用户提供A七轮修正固定提交及已推送交C独立复验
  - wiki-repo:raw/c-a1c890dc-intake.json:1
  - wiki-repo:raw/c-a1c890dc-identifier.json:1
  - wiki-repo:raw/c-a1c890dc-wiki-validation.json:1
---

# C集成-A1c890dc复验与CHECK边界

后续复验：2026-10-25 最新C独立复验：固定A 910e6260af0c4d84471e665da7656dbf8133aae7的Y10安全拒绝，identify与真实repository均在升级/写入前报tampered，原schema/数据/版本7/账本、DB字节和目录列表保持。两个有效CHECK控制均正常通过迁移入口并实际拒绝attempt=0，套件3/3。此前全部指定回归保持：原五项、六轮四例、七轮三例、X01～X11、原12/107及九段SQL指纹；macOS infrastructure47/47、contracts35/35。Y10仅在已测范围技术关闭，本轮未发现新的阻断；M13完整矩阵、新组合、桌面/macOS联合及实际人员/业务验收仍未完成。详见[[A910e626独立复验与Y10关闭回执]]、[[C集成-A910e626与Y10独立复验]]；旧版本失败记录保留原作用域。

## 目标

独立复验Y07～Y09及历史回归，继续核对M13有效约束要求。三例已关闭，但Y10方括号伪CHECK被接受且保护实际缺失；本任务及整体迁移保持active/changes_required。

## 范围

taskBase=7b9104f8ce43ef5d80d6ad4b20ec660063a15869；独立分支codex/c-a1c890dc-validation，A固定1c890dc77ecba2cfb949c5e69908dc81bdacc692与远端一致。macOS26.4 arm64/Node22.22.0/pnpm10.13.1，Electron44.9.2/Node24.22.0/SQLite3.53.4。仅独立A生产identify/migrate/repository与合成SQL事实；无新A/B/C集成或桌面验收。

## 验收

Y07～Y09、历史回归与控制保持，真实损坏库须在升级/写入前拒绝且逻辑/物理边界不变；保留九段指纹、旧证据与日志。词法/结构扩展检查必须区分SQLite方括号标识符与CHECK关键字；不能把运行器/文档通过当产品验收。

## 改动

新增[[A1c890dc独立复验与方括号标识符边界回执]]与intake/native/m13/matrix/boundaries/lexical/identifier证据。同步M13/F04、运行/桌面/总任务入口、前轮后续说明、CONTEXT/项目状态/index/log。C生产代码、测试、维护工具与覆盖映射保持。

## 验证

17条实际命令与输出见intake：安装/类型/作者探针/入口构建、七份旧探针、infrastructure/contracts与A Wiki均内部退出0；新增identifier内部Electron退出1。作者40分类+10追加+2控制与固定报告结构一致；A175非Wiki及九段指纹保持。

原12/107为12/12与107/107；X01～X11为11/11；原五项/六轮四例保持，六轮套件7/7；七轮套件6/6（三拒绝+三控制）。infrastructure47/47含ledger5/wiki-store5，contracts35/35；A check/lint/sync基线e73d177均退出0。

Y10只读与仓库接受升8，registry新增九项，实际attempt=0写入一条；两个真实CHECK控制均拒绝，无harnessError。新增失败不并入原107、不抹旧失败。源审计运行器路径转义问题修正后175文件全匹配，intake留因。

C generate/check/lint、真实taskBase/共同merge-base/累计be53b98 sync、diff和233旧raw/228非Wiki/log前缀审计见raw/c-a1c890dc-wiki-validation.json。文档门禁与产品changes_required分别记录；无工具/映射改动，不增镜像测试。

## 未完成项

A修Y10并交固定实现、作者回归与Wiki；C再复验，随后推进完整M/F/J与新组合。领域有效历史回放、Worker恢复/互斥/ready/公开错误、桌面/macOS联合、实际人员/人工发布/业务签认未完成。Windows本轮未验证；B已接收证据不冒充本轮组合。未推送、合入或外发消息。

关联：[[A1c890dc独立复验与方括号标识符边界回执]]、[[C集成-迁移方案执行与联合验收]]。
