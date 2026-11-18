# cursor极简

Currently matched versions: theme **v2.0.15**, plugin **v1.2.14**.

**Inspired by Cursor and Notion: a clean, modern layout and interaction. Adds CJK-Latin spacing, image optimization, favorites, and other highly requested features. Please install the cursor极简 theme and the cursor极简工具 plugin together.**

Installing only the **cursor极简** theme without the **cursor极简工具** plugin: no favorites or config sync.

Installing only the **cursor极简工具** plugin without the **cursor极简** theme: sidebar layout and look will not match.

Set **cursor极简** for both light and dark. Settings: Plugins menu → **cursor极简工具**.

## Preview

**Light**

<img src="image/light.png" alt="Light preview" width="720">

**Dark**

<img src="image/dark.png" alt="Dark preview" width="720">

## Highlights

### 1. Display

- Calmer chrome, quieter sidebars, more room to write.
- Favorites and recently opened in the file tree, Notion-like.
- Outline drops Hx marks, bolds H1, keeps hierarchy clear.

### 2. Documents

- Breadcrumb shows the document path.
- Star to favorite the current doc without digging through native menus.
- Recently opened list on the file tree.

### 3. Hidden chrome

- Hide unused sidebar dock buttons.
- Hide unused slash-menu commands.

### 4. Editing

- Auto space between Chinese and Latin text.
- Images scale by DPI so they do not explode, and center themselves.
- Optional document-ref icons.
- Adjustable block line height.

### 5. Config sync

- App settings do not sync across machines. One-click sync for config and installed themes.

---

## Display

Stock SiYuan is busy. This overlay sits on daylight / midnight and only changes layout.

Dock icons sit at the bottom of each sidebar.

Favorites and recents are simple lists. The row you click is the only highlight.

The outline hides the doc name and Hx badges, bolds top-level headings, and follows the caret.

<img src="image/display.png" alt="Display: favorites, recents, sidebar, and outline" width="720">

## Finding docs

The stock breadcrumb follows block headings, not the file tree.

Here it is notebook / folder / current doc. When space runs out, middle levels become `...`; hover shows the path up to that level.

Native favorites are buried. One star on the breadcrumb pins the current doc.

Recents sit at the top of the file tree.

<img src="image/docs-path.png" alt="Document path breadcrumb and document-ref style" width="720">

## Too many buttons

The vertical dock strip eats space. Hide what you do not use (layout switches need this theme).

The slash menu gets long. Turn off commands you never pick.

<img src="image/slash-settings.png" alt="Slash menu: toggle unused commands" width="720">

<img src="image/slash-menu.png" alt="Slash command menu" width="720">

## Editing

Chinese stuck to English is hard to read. Spaces are inserted on type and paste.

High-DPI pastes make huge images. Width follows system DPI; image paragraphs center.

Document-ref icons are on by default so they do not look like plain text.

Block line height is a slider in Style.

<img src="image/editing.png" alt="Editing: DPI image scale and CJK-Latin spacing" width="720">

## Config across PCs

SiYuan does not sync `/conf` settings. Themes live in the data folder and sync with SiYuan itself.

Config sync copies only app settings into workspace data, then uses official sync.

Overwrite on one machine, download on the other, then restart.

Turn on SiYuan cloud sync or S3 first.

<img src="image/config-sync.png" alt="Config sync: overwrite and download" width="720">

## Install

1. Install theme **cursor极简** for light and dark.
2. Install and enable the companion plugin **cursor极简工具**. The theme and plugin must be used together.
3. Disable **fhelper** if it is still on.
4. Restart SiYuan if the sidebar strip did not mount.

Theme: [cursorart](https://github.com/fyuanace/cursorart) · Plugin: [cursorart-tools](https://github.com/fyuanace/cursorart-tools)

## Support the author

If this theme or plugin helps you, please visit the [support page](https://siyuan.ysoft.site) to like it, join the QQ group, or sponsor. QQ group: `1091105807`.

## Changelog

### Theme cursor极简

#### v2.0.15

- Restore both dock bars and sidebar content in SiYuan 3.8.10 and align the Windows caption buttons.

#### v2.0.14

- Breadcrumb hides only Lock editing; the document icon stays
- Code blocks use 80% font with aligned line numbers; tabs, splitters, and body spacing are tighter

#### v2.0.13

- Table headers stay regular weight in the theme; code blocks no longer get extra block spacing

#### v2.0.12

- Typography: taller heading line-height/padding, denser lists, code-block spacing, smaller table font, denser right dock

#### v2.0.11

- Intro now names both the cursor极简 theme and the cursor极简工具 plugin and asks to use them together

#### v2.0.10

- Converted `preview.png` to a real PNG so bazaar format checks pass

#### v2.0.9

- Chinese README light/dark previews now use image files so they render on GitHub
- Added a Support the author section

#### v2.0.8

- Theme and plugin now share one intro, with feature screenshots
- Marketplace blurb now cites Cursor / Notion and asks to use the theme and plugin together

#### v2.0.7

- Breadcrumb fills leftover width; middle levels collapse to `...` when tight; hover shows the path up to that level

#### v2.0.6

- Four-region layout CSS applies by default, even if the plugin has not loaded

### Plugin cursor极简工具

#### v1.2.14

- Pair with theme v2.0.15 for the SiYuan 3.8.10 layout fixes.

#### v1.2.13

- Direct child documents show between the title and the body; a setting can hide them
- Breadcrumb can append refs to unreferenced child documents, or delete those child documents
- Document-reference block menu: move the linked document here, or delete the reference block and its document
- Document deletion cannot be undone; restore only from data history
- Removed Locate in document tree from the breadcrumb

#### v1.2.12

- Removed the block-spacing and table-header-weight settings; header weight is fixed by the theme

#### v1.2.11

- Style tab: sliders for body text grayness and body font size; apply live and save to config.json

#### v1.2.10

- Like-heart click is stored in `config.json`, so it stays hidden after restart
- Intro now names the cursor极简 theme and cursor极简工具 plugin and asks to use them together

#### v1.2.9

- Config sync: overwrite syncs the cloud baseline before rebuilding the cache; download no longer wipes the cache first, so an empty folder is not pushed to the cloud
- Writing the petal cache no longer reloads the plugin, so overwrite no longer flickers
- The syncing toast and the result share one message and auto-dismiss
- Dialogs stack in open order; the restart confirm sits above Settings

#### v1.2.8

- Removed the non-standard `i18n` field from `plugin.json` (locale files stay in `i18n/`)

#### v1.2.7

- Converted `preview.png` to a real PNG so bazaar format checks pass

#### v1.2.6

- Added a Support the author section

#### v1.2.5

- Shares the same intro as the theme, with feature screenshots
- Marketplace blurb now cites Cursor / Notion and asks to use the theme and plugin together
