---
type: design-change
project: cursorart-tools
module: child-nav
date: 2026-09-07
status: implemented
summary: >
  原 fhelper 子文档导航植入并入本插件：正文 H5 包裹文档引用，自定义属性名保持 custom-fhelper-child-nav。
related: []
tags: [child-nav, editor]
---

# 子文档导航植入

## 变更记录

| 时间 | 说明 |
|------|------|
| 2026-09-07 | 从 fhelper 迁入 cursor极简工具；设置在「编辑」页签，即时生效 |
| 2026-09-07 | 斜杠「新建子文档块」改挂到真正的 Plugin.protyleSlash，不再写在 EditorFeatures 包装对象上 |

## 背景信息

打开文档时若缺少当前层子文档的自动引用，补到文末。已有笔记里的块带 `custom-fhelper-child-nav`，不能改名。

## 当前方案

- 代码：`editor-features.js`；配置 `childDocWidget.enabled`（缺省 true）写入 `/data/storage/theme/cursorart/config.json`
- 查子文档仅 SQL；顶层笔记本文档按虚拟父子列举
- 斜杠「新建子文档块」注册到 `CursorArtTools.protyleSlash`（思源只读插件实例上的该数组），并固定排在斜杠菜单最顶
- 面包屑：定位到文档树、根据文档块移动、删除没有文档块的子文档
- 自动导航引用样式与 cursor 手写文档引用样式分开：导航块继续跳过 `starter-custom-doc-ref`

## 其他模块引用约束

- 不要改 IAL 属性名
- 检测到 fhelper 仍启用时不要安装本模块

## 工程师测试验收方法

禁用 fhelper 后启用本插件：打开有子文档的页应出现或保持自动导航块；输入 `/` 时「新建子文档块」应在菜单最顶，选中后同一行变成导航引用并打开新子文档。

## 其他说明

无。
