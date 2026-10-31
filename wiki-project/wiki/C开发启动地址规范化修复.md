---
title: C开发启动地址规范化修复
type: module
status: active
updated: 2026-10-31
sources:
  - apps/desktop/src/main/index.ts:89
  - tests/e2e/workspace.spec.ts:13
---

# C开发启动地址规范化修复

## 用户可见问题

用户在主目录启动codex/m1-foundation/654fecc，截图显示四导航、模型ID文本输入以及各页“调用来源不允许”。该版本不包含C的只读助手、规则桌面接线与英德回复；运行目录与已验证分支不同，不能直接使用新分支验收结论。最新C候选83014be也保留开发根URL比较缺陷，故仅切换分支不足以保证开发启动恢复。

## 根因与实现

electron-vite传入HTTP根地址不带末尾斜杠，Chromium加载后变成带斜杠地址。Main以未规范化字符串进行逐页精确比较，正常主frame因字符串不等被拒绝。隔离Electron复现：配置http://127.0.0.1:5179时workspace.get返回ACTION_NOT_ALLOWED，配置同地址加/后成功；未读取用户真实数据库或密钥。

从83014be独立codex/c-dev-origin-fix修复：先用new URL(...).href规范化允许的rendererUrl，再用于加载及原有精确比较。保留webContents身份、mainFrame身份、完整页面路径以及拒绝其它窗口等限制；没有改成仅按origin信任，也没有关闭来源校验。file构建入口与剪贴板权限继续按原规则。

## 回归与运行

workspace.spec.ts扩展两个开发入口（带/与不带/），真实Electron验证workspace.get、model.status、创建工作区；既有构建入口/其它窗口与iframe拒绝行为继续回归。修复前不带/失败、带/成功的红绿证据及最终命令结果在raw/c-dev-origin-fix.json。相关基线见[[M1工程基线]]、[[M1验证与协作]]。

需完整退出旧开发进程，然后从包含本修复的工作目录运行pnpm dev；不要同时从共同分支和C分支争用5179端口。该操作不要求删除数据库、重新填写Key或重新安装依赖。主目录分支未被本修复自动合入，实际用户旧实例未被强制关闭。

本机最终验证：typecheck/build退出0，Electron12/12退出0（含带/、不带/两个开发回归）；工程检查、索引/lint及83014be基线Wiki同步均退出0。实际进程仍为用户旧分支；本修复仅交付C独立分支，用户需要退出旧实例并从修复目录启动。
