---
title: C客户回复草稿桌面切片
type: module
status: observed
updated: 2026-10-31
sources:
  - apps/desktop/src/renderer/src/features/customer-reply.tsx:1
  - apps/desktop/src/renderer/src/features/customer-reply-format.ts:1
  - apps/desktop/src/renderer/src/features/quote-checks.tsx:1
  - apps/desktop/src/renderer/src/features/quotes.tsx:1
---

# C客户回复草稿桌面切片

## 当前行为与边界

用户批准本地确定性英德模板，C从e49bb0e在独立codex/c-customer-reply实现。原设计提议domain纯函数，但仓库禁止renderer导入domain；实际纯文本格式化器放在renderer feature，不改变金额计算和公共契约。

当前报价页新增English/Deutsch切换、只读客户正文和复制未审核草稿。使用当前保存版本的商品数量、阶梯单价、行金额、商品合计、币种、原始付款交期、待确认事项和来源。decimal字符串不重新格式化或计算，null仍未知；商品名、条款、规则文本保持原文，明确需要人工核对翻译。模板框架为英德语言，不宣称业务资料已完整翻译或市场/平台适配已认证。

没有新数据库表/IPC/审批/外发/PDF能力。Electron默认权限策略原来拒绝所有剪贴板写入，本轮仅允许受信任主窗口、主frame、精确renderer URL的clipboard-sanitized-write；剪贴板读取、其它窗口/frame和其它权限仍拒绝，未放开原生Node或外部页面权限。文本不另存为独立产出，只从冻结报价和已保存检查报告重建；语言选择为页面状态，重开默认English。正式产出快照、bundleHash及审批绑定仍未完成。

## 报价和报告绑定

与QuoteChecks共用checkQueryKey和loadQuoteChecks。读取验证schema、根quoteId、revisionId和quoteVersion，拒绝混入其它版本或重复reportId。采用checkedAt倒序、同时间reportId升序的最新报告，与规则面板历史报告选择独立；正文写明实际报告ID和时间。新检查保存后共享缓存刷新草稿。读取中或失败时不使用旧缓存冒充已检查，明确仍待核实，失败可重试。

三类问题block/warning/pending、建议、覆盖状态及固定证据都可见；附报价来源文件/hash/合成性质/有效期/原文行和知识引用。即使无问题仍保留人工复核、未审批未发送标记。模板为供业务员审核的客户回复草稿，复制不会写报价或更改审批状态。

## 验证与风险

测试/真实执行证据见[[C黑客松演示闭环实现]]和raw/c-hackathon-demo-validation.json。当前整体黑客松仍active：已验证业务能力与最终演示资料/真实DeepSeek现场彩排分开记录；模板不能替代语义审核。完整范围见[[黑客松演示封板目标与ABC分工]]、[[M2真实报价V1]]、[[M4模型与报价修订]]。

维护回归首次25项在fixture准备时失败（source fixture was not installed）。原因是现有项目状态页CRLF不匹配fixture的LF前置替换；本轮将该页行尾规范为LF，保留历史内容，再跑工具回归，不修改维护工具断言或实现。该原因不等同B另一环境记录的临时目录权限问题。
