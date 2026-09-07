# cursor极简工具

cursor极简主题配套插件。交互能力（含原 fhelper）都在本插件。

主入口：`index.js`；编辑类能力：`editor-features.js`；配置：`/data/storage/theme/cursorart/config.json`。

## 模块地图

| 模块 | 配置键 / 入口 | 说明 | 设计文档 |
|------|----------------|------|----------|
| 侧栏布局 | `adaptiveTopbarHeight` `dockInContent` `hiddenDockTypes` | 仅 cursor极简主题 | 主题仓 toolbar / settings |
| 样式 | 主题原有字段 + 官方 SVG/状态栏 | 任意主题 | 主题仓 settings |
| 默认图标 | 思源 `local-images` | 样式页；不写 config.json | [design/2026-09-07-file-tree-default-icons.md](design/2026-09-07-file-tree-default-icons.md) |
| 子文档导航植入 | `childDocWidget` | 编辑页；IAL 仍用 `custom-fhelper-child-nav` | [design/2026-09-07-child-nav-body-refs.md](design/2026-09-07-child-nav-body-refs.md) |
| 图片 / 输入者 | `imageScale` `panguSpacing` | 编辑页 | — |
| 斜杠菜单 | `disabled` | 斜杠菜单页 | — |
| 配置同步 | `configSync` | 独立页签；缓存路径在本页 | [design/2026-09-07-config-sync.md](design/2026-09-07-config-sync.md) |
| 收藏 / 最近打开 / 喜欢 | `favoriteDocs` `recentDocs` | 原 cursor 能力 | 主题仓对应 design |

## 整体架构

```
CursorArtTools
  index.js          布局、收藏、设置对话框（六页签，逐项即时写入）
  editor-features.js 斜杠 / 图片 / 空格 / 子文档导航 / 默认图标 / 配置同步
  配置文件           /data/storage/theme/cursorart/config.json
  同步缓存           /data/storage/petal/cursorart-tools/config-sync
```

- 思源只包装 `index.js`：旁路文件不能用 Node `require`（解析不到虚拟模块 `siyuan`）。`editor-features.js` 由主入口读盘后，用插件自己的 `require` 执行。
- 若仍启用 **fhelper**，本插件跳过 editor-features，避免导航双写。
- 设置无保存按钮；开关立刻生效并写盘。设置窗口高度固定，各页签在内容区独立滚动。
- 无配置文件时写入内置默认（与当前常用组合一致）。关于页可恢复默认，收藏与最近打开名单保留。
- 仅当已有配置里还没有编辑类字段时，才从 `petal/fhelper/fhelper-config.json` 迁入。
