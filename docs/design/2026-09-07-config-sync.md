---
type: design-change
project: cursorart-tools
module: config-sync
date: 2026-09-07
status: implemented
summary: >
  配置同步独立页签；缓存目录改为 petal/cursorart-tools/config-sync；下载时可回退读旧 fhelper 缓存。
related: []
tags: [config-sync]
---

# 配置同步

## 变更记录

| 时间 | 说明 |
|------|------|
| 2026-09-07 | 从 fhelper 迁入独立「配置同步」页；缓存路径从关于拆到本页 |
| 2026-09-07 | 「使用方法」只写用户步骤（点按钮、等同步、按提示重启、再选手动主题），清空缓存等写在「原理」 |
| 2026-09-07 | 设置说明补充：须先启用思源官方同步或 S3 同步 |

## 背景信息

思源不同步 `/conf` 与自定义主题。需要先落到 `data` 再走云端同步。

## 当前方案

- 缓存：`/data/storage/petal/cursorart-tools/config-sync`
- 覆盖云端：清空缓存 → 导出 conf + 拷贝主题（跳过 .git / .gitignore）→ `performSync` 上传
- 下载云端：未开同步则中止；否则清空缓存 → 只拉同步 → 写入 conf 并提示重启。若新目录无包，拷贝旧 `petal/fhelper/config-sync`
- 设置页开头写明前提：须先启用思源官方云端同步或 S3 同步。使用方法只写用户步骤：A 端点「覆盖云端配置」并等待同步完成；B 端点「下载云端配置」并等待同步完成；程序提示重启后重启，再在设置中手动选择主题。清空缓存、导出 conf、写入应用目录等写在「原理」

## 其他模块引用约束

下载前清空缓存时必须 `upload: false`。不要把 daylight / midnight 写入缓存。

## 工程师测试验收方法

配置同步页可打开缓存文件夹；覆盖/下载按钮在已开同步时可用。

## 其他说明

无。
