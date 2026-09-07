# cursor极简工具

Companion plugin for the [cursorart](https://github.com/fyuanace/cursorart) theme.

SiYuan bazaar no longer allows new themes to ship `theme.js`. Interactive features of **cursor极简** therefore live in this plugin.

## Theme gate

**Sidebar top dock strip** and **title-bar height** run only while the active light/dark theme folder is `cursorart` (cursor极简). Switch away and those layout tweaks are undone. Other helpers (settings, favorites, recents, like button, …) stay available.

The bazaar does **not** auto-install a companion theme or plugin. Install both packages yourself; this plugin shows a one-time tip if cursor极简 is not the current theme.

## Install

1. Install and enable theme **cursor极简** (`cursorart`) for light and dark
2. Install and enable this plugin
3. Restart SiYuan if docks do not remount

## Note

Config is stored at `/data/storage/theme/cursorart/config.json` (same path as the old theme JS), so previous settings carry over.

### v1.0.1

- Dock strip + title-bar height only when theme `cursorart` is active
