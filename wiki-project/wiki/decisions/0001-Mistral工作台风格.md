---
title: 0001-Mistral工作台风格
type: decision
status: active
updated: 2026-10-21
sources:
  - conversation:用户将claude更正为mistral.ai
  - DESIGN.md:10
  - wiki-repo:raw/file-provenance.json:1
---

# 0001-Mistral工作台风格

## 背景

用户明确桌面单据工作台为主，Agent 对话为辅助，并将最初 Claude 参考改为 `npx getdesign@latest add mistral.ai`。执行/版本/原件 hash 已在旧规划记录中保存。

## 决定

沿用根 DESIGN.md 为唯一产品视觉规范；采用当前归档 Mistral 模板的橙色、浅奶油色、白色单据与深灰文字。把营销布局改成紧凑侧栏/表格/对话面板，并定义中文字体回退、状态色、键盘焦点和缩放规则。

## 替代方案

Claude 参考已被用户替换，保留原件作历史来源；Tauri/Electron 选择不改变视觉决定。没有重新执行 getdesign 或重新询问用户风格。

## 后果

品牌 Logo、专有字体、照片和营销文案不作为产品资产。首版浅色主题；代表页面和真实 UI 验收尚未实施。原模板远端 commit 未取得，保留 CLI 版本和归档 hash，不补造出处。

## 回滚方式

未来用户明确更改方向时新增 ADR，并按变更修改根 DESIGN 和真实 theme；不把历史模板直接覆盖当前规范。本轮不改变根设计文件。

关联：[[01-MVP范围与验收]]、[[项目状态]]、[[0003-工程Wiki维护基线]]。
