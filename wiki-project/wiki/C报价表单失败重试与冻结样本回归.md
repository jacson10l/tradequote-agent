---
title: C报价表单失败重试与冻结样本回归
type: process
status: observed
updated: 2026-10-31
sources:
  - tests/e2e/quote-v1.spec.ts:164
  - apps/desktop/src/renderer/src/features/quotes.tsx:57
  - packages/infrastructure/src/trade-store.ts:1
---

# C报价表单失败重试与冻结样本回归

C独立分支codex/c-quote-form-retry，taskBase=988e69f049bd0e98783446983e0bd6efca4fb05e。macOS arm64、Node22.22.0/pnpm10.13.1/Electron44.9.2。仅新增真实Electron回归，不改产品行为、契约或迁移；维护入口与A两个待修问题不受此切片影响。

## 实现与验证范围

在现有tests/e2e/quote-v1.spec.ts内固定A数据提交11826e4的14行CSV原文字节（仅输入，不导入A脚本或动态依赖远端），经真实renderer/Main/单Worker/SQLite导入与人工发布。数据用于技术演示，公开商品页/供应商字段与合成URL来源口径仍待A澄清，不构成真实价格或认证结论。样本有效期2027-12-31，过期后按产品时效规则应重新冻结演示数据，不得自动跳过时效检查。

全部报价通过UI表单点击：上衣100件3921.00 CNY、Polo500件11730.00 CNY、板材500 m2为1600.00 USD、螺栓10 kg为9.50 USD。测试核对数量/金额/币种，无汇率/单位换算或模型调用。

首份报价保存前在隔离库安装AFTER INSERT quote_v1的RAISE(ABORT)触发器，强迫已尝试插入报价后事务失败。UI显示本地保存失败，无goods-total，买方与数量仍保留；quote_v1/outbox/idempotency逐行与故障前完全相等。移除触发器后同页面重试成功。每份成功再次显式点击保存，三表逐行不变，证明没有重复报价/事件/成功回执；测试没有捕获第一次失败的请求键，因此不额外声称已观测故障前后传输键完全相等。未模拟网络响应丢失或正在提交时快速双击，这两类另验。

四单保存后混合CNY/USD表单提交被拒绝，原金额仍展示且三表不变；真实关闭/重开Electron后公开getTrade全结果及三表与关闭前一致。数据库辅助命令使用Electron Node ABI，仅修改系统临时测试目录，结束删除；没有生产调试接口或运行库提交。

## 实际证据与限制

pnpm build退出0；聚焦pnpm exec playwright test tests/e2e/quote-v1.spec.ts两项通过。完整桌面、类型、工程/Wiki与维护工具结果见raw/c-quote-form-validation.json；该证据记录实际命令/退出码/输出，未执行不计通过。上一轮14档桥接验证不替代本轮四SKU表单，两个范围分开。

不新增业务功能、不验证真实供应商、模型、正式审批/PDF或安装包。测试成功不等于A维护修复/人员签认完成。关联：[[M2真实报价V1]]、[[M1验证与协作]]、[[C桌面-冻结报价表单与保存恢复]]。

最终结果：完整Electron12/12、聚焦2/2、Wiki工具36/36，类型/build/check及988e69f基线sync退出0。只完成本文限定的测试覆盖，A维护接线和人员验收仍待。
