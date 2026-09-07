# cursor极简工具

Companion plugin for the [cursorart](https://github.com/fyuanace/cursorart) theme.

SiYuan bazaar no longer allows new themes to ship `theme.js`. Interactive features of **cursor极简** therefore live in this plugin.

## Theme gate

**Sidebar top dock strip** runs only while the active light/dark theme folder is `cursorart`. Title-bar height is handled entirely in theme CSS via DPI media queries (about 55 device pixels). Other helpers stay available.

The bazaar does **not** auto-install a companion theme or plugin. Install both packages yourself; this plugin shows a one-time tip if cursor极简 is not the current theme.

## Install

1. Install and enable theme **cursor极简** (`cursorart`) for light and dark
2. Install and enable this plugin
3. Restart SiYuan if docks do not remount

## Note

Config is stored at `/data/storage/theme/cursorart/config.json` (same path as the old theme JS), so previous settings carry over.

### v1.0.2

- Title-bar height moved to theme CSS (DPI media queries); plugin no longer sets it

### v1.0.1

- Dock strip only when theme `cursorart` is active
