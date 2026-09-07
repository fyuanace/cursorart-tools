---
type: design-change
project: cursorart-tools
module: file-tree
date: 2026-09-07
status: implemented
summary: >
  默认图标三项放在样式页签，走思源图标选择器与 local-images，不写入插件配置。
related: []
tags: [file-tree, icon]
---

# 文档树默认图标

## 变更记录

| 时间 | 说明 |
|------|------|
| 2026-09-07 | 从 fhelper 迁入；放在 cursor极简设置「样式」页，与「默认使用 SVG 图标」同页 |

## 背景信息

未单独设图标的笔记本/文档读 `storage["local-images"]`。需要在插件设置里改三项并能还原。

## 当前方案

样式页「默认图标」：笔记本 `note`、有子文档 `folder`、无子文档 `file`。点图标 `openEmoji`，写入 `/api/storage/setLocalStorageVal`。思源开启 SVG 默认图标时三项 emoji 禁用。

## 其他模块引用约束

不要给文档 IAL 批量写 icon 充当默认图标。

## 工程师测试验收方法

样式页改一项后，文档树中未自定义图标的对应节点应立刻更换。

## 其他说明

无。
