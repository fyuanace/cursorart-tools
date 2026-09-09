---
type: design-change
project: cursorart-tools
module: donate-heart
date: 2026-09-09
status: implemented
summary: >
  顶栏喜欢爱心点过后写入插件设置 config.json 的 donateClicked；关于页复位后清除。
related: []
tags: [donate, heart]
---

# 喜欢爱心

## 变更记录

| 时间 | 说明 |
|------|------|
| 2026-09-08 | 不再用计算机名比对；改为本地「已点击」标记 |
| 2026-09-09 | 标记写入 `/data/storage/theme/cursorart/config.json` 的 `donateClicked`，与其它插件设置同一文件 |

## 背景信息

点一次爱心打开支持页后应隐藏按钮，直到关于页「复位喜欢按钮」。重启后仍应隐藏。

## 当前方案

- 字段：`donateClicked`（布尔），写在 `/data/storage/theme/cursorart/config.json`
- 与收藏、侧栏等设置同一文件，随工作区同步
- 启动时把旧的 `localStorage` 键和误写的 `conf/appearance/cursorart-donate.json` 迁入该字段后删除
- 「恢复默认配置」保留该字段；只有「复位喜欢按钮」会清掉

## 其他模块引用约束

不要再用计算机名或浏览器 localStorage 作为生效依据。

## 工程师测试验收方法

点爱心后完全退出再打开思源，顶栏不应再出现爱心。关于页复位后应再次出现。

## 其他说明

无。
