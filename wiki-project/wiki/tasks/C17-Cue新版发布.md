---
title: C17-Cue新版发布
type: task
status: done
verification:
  - wiki-repo:raw/c17-cue-validation.json:1
updated: 2026-11-01
sources:
  - wiki-repo:wiki/C17新Cue知识与Harness.md:1
  - conversation:用户授权直接完成并发布新版Cue交付观看链接
---

# C17-Cue新版发布

## 范围

C独立制作并发布以LLM Wiki和Codex Harness为核心的10页Cue，产品固定99c167d。详细内容与边界见[[C17新Cue知识与Harness]]。

## 改动

本地生成10页PPTX及10份逐页讲稿，Python zipfile与XML解析核对页数及结构通过。当前桌面图谱185节点/170关联已截取。Cue登录态可用，已通过网页文件选择器上传。

## 验收

十页内容与排版完成核对；最终替换电子宠物页另行实拍核对；Cue发布、私密链接与观看页完整加载通过。


## 目标

新版Cue突出企业知识到受限工具执行的闭环；同时保留已验证边界，关联[[C14企业知识闭环方案]]。

## 验证

PPTX结构10页/10讲稿检查通过；修正首轮JPEG扩展名问题后全部5个PNG签名通过，Cue重新导入无媒体失败。正在逐页核对。

## 未完成项

新版Cue已交付。产品能力边界保持C14记录，不用演示发布代替新增产品验收。


用户追加要求已纳入：第9页改为电子宠物与独立memory，移除开机动画。PPTX全部幻灯片与讲稿XML核对不含开机/五彩纸文本，图片签名通过；新版本正在Cue导入。


## 发布进展

2026-11-01：最终Cue已显示“已发布·最新”，共享设为无需账号的私密链接。编辑页https://cue.humanmeetsai.com/deck/27f96b51-c562-4d72-be90-2f7e6d650506。新版第9页电子宠物大图/独立memory已实拍检查；中间稿媒体校验错误已在后续重导中消除，最终版本含4张图片无缺失。观看页已实际打开，显示新标题与1/10的完整封面；截图保存在本机.runtime/c17-cue/cue-published.jpg。


## 最终回执

发布版本8f5eb79c-2c3d-43a7-aa1c-21ffd9ab92b6，编辑页显示已发布·最新；私密链接持有者无需账号。观看链接已交付用户，密钥仅保存本机，不提交Git。PPTX/讲稿/截图哈希及验证见raw/c17-cue-validation.json。本轮仅文档，无产品代码变化；生成清单、只读Wiki check/lint及固定99c167d sync通过。最初Wiki类型/任务章节检查失败已修正后复跑通过。
