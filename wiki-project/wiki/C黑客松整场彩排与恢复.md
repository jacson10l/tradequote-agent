---
title: C黑客松整场彩排与恢复
type: process
status: active
updated: 2026-10-31
sources:
  - scripts/rehearse-hackathon.mjs:1
  - tests/fixtures/rehearsal-host.cjs:1
  - tests/fixtures/quote-checks-data.ts:1
  - apps/desktop/src/main/index.ts:1
---

# C黑客松整场彩排与恢复

本轮从be4e574另开codex/c-hackathon-rehearsal，复用C独立工作目录。目标为[[黑客松演示封板目标与ABC分工]]的连续业务链；[[C客户回复草稿桌面切片]]已经完成的技术检查保持原作用域，不能代替本轮真实模型彩排。

## 冻结输入与安全边界

主演示文件为wiki-project/demo_data/catalog_demo.csv，逐字取自A固定提交035e5f802d9dd1ec4e73ddf0ae3754b65e8b0c37；14数据行、4 SKU，SHA-256为7c13afc110c1cd7a6e31eb0ef94f6c0acd08b164b2a9669e9aee11bc9f4bf89b。CSV单位实际为piece/m2/kg；m²仅人类显示。混合币种分商品存储，主报价只选CNY的1601053415993，不兑换或合计USD商品。

冻结交接见[[C-FROZEN-MANIFEST]]。本轮按合成演示资料发布，不验证CSV中供应商、网址、认证、日期或价格真实性；保留A原字节，不从URL或“采集日期”推断真实性。规则复用A的seedPublished离线合成投影，付款必填为commercial_terms阻断，交期必填为platform_guidance提醒。它们只证明规则机制，不证明正式平台规则或人工知识发布已经验收。正式资料人工审核与发布仍待A/B，禁止将fixture晋升记成人工发布。

fixture模式使用本地HTTP替身和独立userData；deepseek模式使用正式Main、正式安全存储及正式DeepSeek端点，验收宿主只把Business Worker的数据库参数改为新建.runtime子目录。没有读取/复制密钥、真实数据库或网络认证头；不改产品IPC、不开放数据库路径、不为生产包提供测试开关。每轮mkdtemp创建新演示库；不清理真实工作区。模型设置、凭据仍留在原生产userData，入口先查model.status，缺配置直接失败并由用户通过正式设置配置。

## 可复跑命令

在仓库根目录、Node22.22.0/pnpm10.13.1/macOS运行：

```sh
pnpm build
pnpm exec playwright install ffmpeg
node scripts/rehearse-hackathon.mjs fixture
node scripts/rehearse-hackathon.mjs deepseek
```

deepseek明确表示使用已保存配置发起三次业务模型操作，可能消耗账户额度；无自动收费重试。先关同一正式应用实例，避免单实例锁导致连到其他工作区。正式Main只允许受信主frame调用，演示宿主保留此规则。成功/失败均在本轮.runtime/hackathon-<mode>-<随机>下写report.json、检查点PNG及分段WebM；只有本轮全链路通过的视频才作为备用。大视频、数据库与模型设置不提交仓库。

## 台上顺序与预期

1. 空演示工作区保存场景；粘贴冻结CSV并选择合成性质，解析14行、人工点击确认发布，目录4个SKU。讲解哈希和原始行是冻结输入，不是来源真实性认证。
2. 合成买家询盘100件1601053415993，明确付款和交期未提供。真实模型只识别商品/数量，确定性模块选100档39.21 CNY，合计3921.00 CNY；运税费未知不计零。
3. V1显式检查，1阻断/1提醒。点付款风险标记跳到同一checkId的文本批注，查看固定知识/来源；英德草稿保持未审核。
4. 数量改500件存V2，500档37.21 CNY，合计18605.00 CNY；展示数量/单价/金额差异并重检，条款缺失仍1阻断/1提醒。
5. 补付款“30%预付，70%发货前付清”和“确认后30天交货”存V3，金额不变。重检0问题仅表示本次两条合成规则通过；运税费和真实市场规则等仍需人工核实，不代表业务批准。
6. 展示英语/德语本地模板、原文条款、未审核、固定来源哈希，复制草稿。模板不翻译中文商品/条款，不冒充完整商业译文。审批按钮关闭，没有外发动作。
7. 重开同一临时演示库，V3/报告/英德模板可重建；切回V1仍3921.00且保留阻断报告。旧快照不可改写，重开不自动调模型。

## 失败、重置与备用

- 模型鉴权/网络/结构失败：停止当前链，检查模型运行记录与已有版本；没有已存版本不得讲成成功。显式重试会重新调用模型，先确认版本，避免重复请求。彩排脚本失败即退出1，不自动换成本地回答。
- 重置：关闭本轮Electron后重跑命令，会创建新的临时业务库；不删除原userData或真实数据库，没有“重置全部资料”的产品按钮。
- 恢复：同一次脚本在导入、种规则、业务完成后按阶段重启，验证持久化；脚本退出后演示库仍留本机。不要直接双击运行rehearsal-host，使用带模式的脚本管理隔离路径。
- 现场模型不可用：展示已验证录屏，说明录制时间、模式和合成资料性质；fixture备用录屏必须明确“模型替身”，不能宣称实时DeepSeek。正式审批、PDF、完整维护和安装包验收均不在本次范围。

## 实际验证

本轮原始尝试与最终结果记录于raw/c-hackathon-rehearsal.json。2026-10-31 macOS arm64实际运行fixture一轮、deepseek连续五轮均通过每轮7检查点；真实模式使用已保存deepseek-flash，每轮完成3次业务操作（合计15次V1/V2/V3操作）；首轮总墙钟约26秒，不推断token或费用。4 SKU/14行、两次金额、两类双反馈、V2/V3重检、固定知识引用、复制与重开均通过。本机直接启动构建产物，未做安装包。

备用视频在.runtime/hackathon-deepseek-tJtFLp/deepseek-rehearsal.mp4（无声约22秒快速回放，H.264 1380×900）及.runtime/hackathon-fixture-HWm1uC/fixture-rehearsal.mp4。按导入/业务/重开顺序拼接原WebM；源片段来自各自整轮passed记录，哈希及解码结果在同一raw。真实模型录屏仍包含合成商品与规则，不能证明商业真实性。

本机冻结工作区可用.runtime/hackathon-deepseek-tJtFLp/open-frozen-demo.sh启动（本地绝对路径脚本，不提交仓库），直接进入已完成V3并保留V1/V2供切换；恢复启动不请求模型，不重置资料。若.runtime目录已删除，应重新跑彩排。

首轮视频缺少ffmpeg1013、英文标题大小写断言及异步剪贴板验收断言已修正。初次Wiki检查因新清单缺入链失败，补真实语义链接后重跑。失败尝试保留，不归因生产代码。隐私检查曾把Playwright视频自动文件名误识别为邮箱；交付raw仅记录分段数量和目录，保留MP4哈希，未关闭隐私检查。任务仍active，完整封板还需人工业务/语言确认与非作者复核。相关任务[[C黑客松演示闭环实现]]、[[黑客松演示闭环封板]]。
