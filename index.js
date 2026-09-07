const {Plugin, showMessage, confirm} = require("siyuan");
const fs = require("fs");
const path = require("path");

/**
 * 思源只包装 index.js：这里的 require("siyuan") 可用，但 Node 直接加载旁路文件时
 * 解析不到虚拟模块 siyuan。因此读文件，用本插件的 require 执行。
 */
const loadEditorFeatures = () => {
    const dataDir = window.siyuan?.config?.system?.dataDir;
    if (!dataDir) {
        throw new Error("cursorart-tools: dataDir unavailable");
    }
    const pluginDir = path.join(dataDir, "plugins", "cursorart-tools");
    const filename = path.join(pluginDir, "editor-features.js");
    const code = fs.readFileSync(filename, "utf8");
    const mod = {exports: {}};
    const run = new Function(
        "exports",
        "require",
        "module",
        "__filename",
        "__dirname",
        `${code}\n//# sourceURL=plugin://cursorart-tools/editor-features.js`
    );
    run(mod.exports, require, mod, filename, pluginDir);
    return mod.exports;
};

const editorFeatureStubs = {
    installEditorFeatures: async () => null,
    uninstallEditorFeatures: () => {},
    createDefaultEditorConfig: () => ({}),
    normalizeEditorConfig: (cfg) => (cfg && typeof cfg === "object" ? cfg : {}),
};

let editorFeatures;
try {
    editorFeatures = loadEditorFeatures();
} catch (err) {
    console.error("cursorart-tools: cannot load editor-features", err);
    editorFeatures = editorFeatureStubs;
}

const {
    installEditorFeatures,
    uninstallEditorFeatures,
    createDefaultEditorConfig,
    normalizeEditorConfig,
} = editorFeatures;

module.exports = class CursorArtTools extends Plugin {
    async onload() {
        if (window.__cursorArtToolsLoaded) {
            return;
        }
        window.__cursorArtToolsLoaded = true;
        window.__cursorArtToolsPlugin = this;
        this._startFeature();
    }

    openSetting() {
        if (typeof this._openSettingsDialog === "function") {
            this._openSettingsDialog();
        }
    }

    updateProtyleToolbar(toolbar) {
        if (this._editorFeatures?.updateProtyleToolbar) {
            return this._editorFeatures.updateProtyleToolbar(toolbar);
        }
        return toolbar;
    }

    async onLayoutReady() {
        this._editorFeatures?.onLayoutReady?.();
    }

    _startFeature() {
        /**
         * cursor极简 —
         * 1) 左/右 dock 图标挂到对应侧栏顶部横条
         * 2) 顶栏左右侧栏显隐：左在「思源」标题后，右在窗口最小化左侧
         * 3) 主题设置（顶栏插件菜单 → cursor极简工具，走 Plugin.openSetting）
         * 4) 已选中 dock 图标再点不收起侧栏（仅拦 UI click，不改 toggleModel）
         * 5) 正文滚动/光标位置同步右侧大纲当前项（复用官方 Outline.setCurrent）
         * 6) 面包屑改为文档路径（笔记本/文件夹/文档），不再显示页内块层级
         * 7) 标题栏截图高度 55 物理像素：CSS = 55 / devicePixelRatio
         * 8) 指向文档的块引用显示文档图标并加粗（不改标题/段落引用）
         * 9) 文件树顶部「最近打开」区块
         * 10) 面包屑收藏按钮 + 文件树「收藏」区块
         * 11) 顶栏前进按钮后捐赠爱心：点开支持页并计数；同电脑名点过即隐藏，换电脑名或复位后再出现
         */
        (function () {
            /** 仅当当前亮/暗主题文件夹名为此时，才挪侧栏 dock */
            const THEME_ID = "cursorart";
            const TOP_CLASS = "starter-dock--sidebar-top";
            const PANEL_CLASS = "starter-dock-panel--with-top";
            const TOGGLE_LEFT_ID = "starterToggleLeft";
            const TOGGLE_RIGHT_ID = "starterToggleRight";
            /** 工作区持久化（重启不丢）；勿用 petal 插件目录 */
            const CONFIG_PATH = "/data/storage/theme/cursorart/config.json";
            /** 旧版路径（文件夹改名前）；读到后迁入 CONFIG_PATH */
            const LEGACY_CONFIG_PATH = "/data/storage/theme/starter/config.json";
            const LEGACY_STORAGE_KEY = "starter-theme-config";
            const HIDE_STYLE_ID = "starterHideDockStyle";
            const SETTINGS_STYLE_ID = "cursorart-tools-setting-css";
            const FEATURE_STYLE_ID = "cursorart-tools-feature-css";
            const DIALOG_ID = "starterSettingsDialog";
            const PLUGIN_VERSION = "1.2.0";
            const DONATE_HEART_ID = "starterDonateHeart";
            const DONATE_FLAG_KEY = "cursorart-donate-clicked";
            const DONATE_HOST_KEY = "cursorart-donate-clicked-host";
            const DONATE_PAGE_URL = "https://siyuan.ysoft.site";
            const THEME_HINT_KEY = "cursorart-tools-theme-hint";

            const isCursorArtTheme = () => {
                const ap = window.siyuan?.config?.appearance;
                if (!ap) {
                    return false;
                }
                const dark = Number(ap.mode) === 1;
                const name = dark ? ap.themeDark : ap.themeLight;
                return name === THEME_ID;
            };

            let layoutFeaturesOn = false;
            let themeWatchTimer = 0;
            let themeWsBound = false;

            const applyAdaptiveTopbar = () => {
                const themeOn = isCursorArtTheme();
                const adaptive = themeOn && config.adaptiveTopbarHeight !== false;
                document.documentElement.classList.toggle("starter-adaptive-topbar", adaptive);
                document.documentElement.classList.toggle("starter-default-topbar", themeOn && !adaptive);
            };

            const syncLayoutFeaturesToTheme = () => {
                applyAdaptiveTopbar();
                applyHiddenDockTypes();
                if (isCursorArtTheme() && config.dockInContent !== false) {
                    layoutFeaturesOn = true;
                    mountAllDocks();
                    return true;
                }
                layoutFeaturesOn = false;
                sides.forEach(unmountOne);
                return false;
            };

            const hintThemeOnce = () => {
                if (isCursorArtTheme()) {
                    return;
                }
                try {
                    if (window.sessionStorage?.getItem(THEME_HINT_KEY) === "1") {
                        return;
                    }
                    window.sessionStorage?.setItem(THEME_HINT_KEY, "1");
                } catch {
                    /* ignore */
                }
                try {
                    showMessage(
                        "侧栏布局、标题栏高度与隐藏侧栏工具仅在主题「cursor极简」启用时生效。",
                        7000,
                        "info"
                    );
                } catch {
                    /* showMessage 不可用时忽略 */
                }
            };

            const onThemeRelatedWs = (event) => {
                const cmd = event?.detail?.cmd || event?.detail?.data?.cmd;
                if (!cmd) {
                    syncLayoutFeaturesToTheme();
                    return;
                }
                const s = String(cmd);
                if (/appearance|theme|setAppearance|reloadTheme/i.test(s)) {
                    syncLayoutFeaturesToTheme();
                }
            };

            const startThemeWatch = () => {
                syncLayoutFeaturesToTheme();
                hintThemeOnce();
                if (!themeWatchTimer) {
                    themeWatchTimer = window.setInterval(() => {
                        syncLayoutFeaturesToTheme();
                    }, 2000);
                }
                const plugin = window.__cursorArtToolsPlugin;
                if (plugin?.eventBus?.on && !themeWsBound) {
                    plugin.eventBus.on("ws-main", onThemeRelatedWs);
                    themeWsBound = true;
                }
            };

            const stopThemeWatch = () => {
                if (themeWatchTimer) {
                    window.clearInterval(themeWatchTimer);
                    themeWatchTimer = 0;
                }
                const plugin = window.__cursorArtToolsPlugin;
                if (plugin?.eventBus?.off && themeWsBound) {
                    plugin.eventBus.off("ws-main", onThemeRelatedWs);
                    themeWsBound = false;
                }
            };

            const sides = [
                {
                    dockId: "dockLeft",
                    panelSelector: "#layouts .layout__dockl",
                    placeholderId: "starter-dockLeft-ph",
                    layoutKey: "leftDock",
                    fallbackType: "file",
                },
                {
                    dockId: "dockRight",
                    panelSelector: "#layouts .layout__dockr",
                    placeholderId: "starter-dockRight-ph",
                    layoutKey: "rightDock",
                    fallbackType: "outline",
                },
            ];

            const DEFAULT_BLOCK_LH = 1.65;
            const DEFAULT_RECENT_MAX = 8;
            const DEFAULT_FAV_MAX = 8;
            const FACTORY_HIDDEN_DOCK_TYPES = ["inbox", "bookmark", "agentChat"];
            const clampBlockLh = (n) => {
                const x = Number(n);
                if (!Number.isFinite(x)) {
                    return DEFAULT_BLOCK_LH;
                }
                return Math.min(2.6, Math.max(1.2, Math.round(x * 20) / 20));
            };
            const clampListMax = (n) => {
                const x = Number(n);
                if (!Number.isFinite(x)) {
                    return DEFAULT_RECENT_MAX;
                }
                return Math.min(32, Math.max(0, Math.round(x)));
            };
            const listShowFromParsed = (explicit, maxRaw, defaultMax, defaultShow) => {
                const max = clampListMax(maxRaw ?? defaultMax);
                if (typeof explicit === "boolean") {
                    return {show: explicit, max: max > 0 ? max : defaultMax};
                }
                if (max <= 0) {
                    return {show: false, max: defaultMax};
                }
                return {show: typeof defaultShow === "boolean" ? defaultShow : true, max};
            };

            const MAX_FAVORITE_DOCS = 100;
            const normalizeFavoriteDocs = (list) => {
                if (!Array.isArray(list)) {
                    return [];
                }
                const seen = new Set();
                const out = [];
                for (const item of list) {
                    const id = typeof item === "string" ? item : item?.id;
                    if (!id || typeof id !== "string" || seen.has(id)) {
                        continue;
                    }
                    seen.add(id);
                    out.push({
                        id,
                        title: typeof item?.title === "string" ? item.title : "",
                        icon: typeof item?.icon === "string" ? item.icon : "",
                    });
                    if (out.length >= MAX_FAVORITE_DOCS) {
                        break;
                    }
                }
                return out;
            };

            const boolFrom = (parsed, key, fallback) =>
                typeof parsed?.[key] === "boolean" ? parsed[key] : fallback;

            const createFactoryConfig = () => ({
                hiddenDockTypes: [...FACTORY_HIDDEN_DOCK_TYPES],
                adaptiveTopbarHeight: true,
                dockInContent: true,
                customDocRefStyle: false,
                plainTableHead: true,
                blockLineHeight: DEFAULT_BLOCK_LH,
                hideNotebooks: false,
                hideTabNewDoc: true,
                hideTabSwitch: true,
                showRecentDocs: false,
                showFavoriteDocs: true,
                recentDocsMax: DEFAULT_RECENT_MAX,
                favoriteDocsMax: DEFAULT_FAV_MAX,
                favoriteDocs: [],
                recentDocs: [],
                seededOfficialDefaults: false,
                ...createDefaultEditorConfig(),
                editorFeaturesMigrated: true,
            });

            /** @type {object} */
            let config = createFactoryConfig();
            let applyDocRefFeature = () => {};
            let applyStyleFeatures = () => {};
            let applyHideNotebooks = () => {};
            let applyRecentDocs = () => {};
            let applyFavoriteDocs = () => {};
            let applySvgDefaultIcons = () => {};
            let syncFavButtons = () => {};

            const supportsOfficialSvgDefault = () =>
                typeof window.siyuan?.config?.fileTree?.useSVGDefaultIcon === "boolean";

            const officialSvgDefaultOn = () => window.siyuan?.config?.fileTree?.useSVGDefaultIcon === true;

            const useSvgDefaultIcon = () =>
                window.siyuan?.config?.fileTree?.useSVGDefaultIcon === true;

            const supportsOfficialHideStatusBar = () =>
                typeof window.siyuan?.config?.appearance?.hideStatusBar === "boolean";

            const officialHideStatusBarOn = () => window.siyuan?.config?.appearance?.hideStatusBar === true;

            /** 每侧记住上一次选中的 dock type（展开时用） */
            const lastType = {
                leftDock: "file",
                rightDock: "outline",
            };

            const normalizeConfig = (parsed) => {
                const factory = createFactoryConfig();
                const recentMeta = listShowFromParsed(
                    parsed?.showRecentDocs,
                    parsed?.recentDocsMax,
                    factory.recentDocsMax,
                    factory.showRecentDocs
                );
                const favMeta = listShowFromParsed(
                    parsed?.showFavoriteDocs,
                    parsed?.favoriteDocsMax,
                    factory.favoriteDocsMax,
                    factory.showFavoriteDocs
                );
                return {
                    hiddenDockTypes: Array.isArray(parsed?.hiddenDockTypes)
                        ? parsed.hiddenDockTypes.filter((t) => typeof t === "string")
                        : [...factory.hiddenDockTypes],
                    adaptiveTopbarHeight: boolFrom(parsed, "adaptiveTopbarHeight", factory.adaptiveTopbarHeight),
                    dockInContent: boolFrom(parsed, "dockInContent", factory.dockInContent),
                    customDocRefStyle: boolFrom(parsed, "customDocRefStyle", factory.customDocRefStyle),
                    plainTableHead: boolFrom(parsed, "plainTableHead", factory.plainTableHead),
                    blockLineHeight: clampBlockLh(parsed?.blockLineHeight ?? factory.blockLineHeight),
                    hideNotebooks: boolFrom(parsed, "hideNotebooks", factory.hideNotebooks),
                    hideTabNewDoc: boolFrom(parsed, "hideTabNewDoc", factory.hideTabNewDoc),
                    hideTabSwitch: boolFrom(parsed, "hideTabSwitch", factory.hideTabSwitch),
                    showRecentDocs: recentMeta.show,
                    showFavoriteDocs: favMeta.show,
                    recentDocsMax: recentMeta.max,
                    favoriteDocsMax: favMeta.max,
                    favoriteDocs: normalizeFavoriteDocs(parsed?.favoriteDocs),
                    recentDocs: normalizeFavoriteDocs(parsed?.recentDocs).slice(0, recentMeta.max),
                    seededOfficialDefaults: parsed?.seededOfficialDefaults === true,
                    ...normalizeEditorConfig(parsed),
                    editorFeaturesMigrated: typeof parsed?.editorFeaturesMigrated === "boolean"
                        ? parsed.editorFeaturesMigrated
                        : factory.editorFeaturesMigrated,
                };
            };

            const readLegacyLocal = () => {
                try {
                    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
                    if (!raw) {
                        return null;
                    }
                    return normalizeConfig(JSON.parse(raw));
                } catch (e) {
                    return null;
                }
            };

            const loadConfigFromFile = async (path = CONFIG_PATH) => {
                try {
                    const res = await fetch("/api/file/getFile", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({path}),
                    });
                    const text = await res.text();
                    if (!text) {
                        return null;
                    }
                    const parsed = JSON.parse(text);
                    // 文件不存在等：内核返回 { code, msg, data }
                    if (parsed && typeof parsed.code === "number" && !("hiddenDockTypes" in parsed)) {
                        return null;
                    }
                    return normalizeConfig(parsed);
                } catch (e) {
                    return null;
                }
            };

            const saveConfigToFile = async (next) => {
                config = normalizeConfig({...config, ...next});
                const blob = new Blob([JSON.stringify(config, null, 2)], {type: "application/json"});
                const fd = new FormData();
                fd.append("path", CONFIG_PATH);
                fd.append("file", new File([blob], "config.json", {type: "application/json"}));
                fd.append("isDir", "false");
                fd.append("modTime", String(Date.now()));
                try {
                    const res = await fetch("/api/file/putFile", {method: "POST", body: fd});
                    const result = await res.json();
                    if (result && typeof result.code === "number" && result.code !== 0) {
                        console.warn("[starter] 保存配置失败", result);
                        return false;
                    }
                    try {
                        localStorage.removeItem(LEGACY_STORAGE_KEY);
                    } catch (e) {
                        /* ignore */
                    }
                    return true;
                } catch (e) {
                    console.warn("[starter] 保存配置失败", e);
                    return false;
                }
            };

            const pluginHost = window.__cursorArtToolsPlugin;
            if (pluginHost) {
                pluginHost.getEditorConfig = () => normalizeEditorConfig(config);
                pluginHost.patchEditorConfig = (editorCfg) => saveConfigToFile({
                    ...normalizeEditorConfig(editorCfg),
                    editorFeaturesMigrated: true,
                });
            }

            const initConfig = async () => {
                const fromFile = await loadConfigFromFile(CONFIG_PATH);
                if (fromFile) {
                    config = fromFile;
                    return;
                }
                const fromLegacyFile = await loadConfigFromFile(LEGACY_CONFIG_PATH);
                if (fromLegacyFile) {
                    config = fromLegacyFile;
                    await saveConfigToFile(fromLegacyFile);
                    return;
                }
                const legacy = readLegacyLocal();
                if (legacy && legacy.hiddenDockTypes.length) {
                    config = legacy;
                    await saveConfigToFile(legacy);
                    return;
                }
                config = createFactoryConfig();
                await saveConfigToFile(config);
            };

            const getDock = (layoutKey) => window.siyuan?.layout?.[layoutKey];

            const isHiddenType = (type) => config.hiddenDockTypes.includes(type);

            const isPanelOpen = (dock) => {
                if (!dock?.layout?.element) {
                    return false;
                }
                const el = dock.layout.element;
                if (el.classList.contains("fn__none")) {
                    return false;
                }
                if ((el.style.width || "").startsWith("0") || (el.style.height || "").startsWith("0")) {
                    return false;
                }
                return el.clientWidth > 8 || el.clientHeight > 8;
            };

            const getActiveType = (dock) => {
                for (const group of dock.elements || []) {
                    const active = group?.querySelector?.(".dock__item--active[data-type]");
                    if (active) {
                        return active.getAttribute("data-type") || "";
                    }
                }
                return "";
            };

            const pickOpenType = (dock, layoutKey, fallbackType) => {
                const candidates = [lastType[layoutKey], fallbackType, ...Object.keys(dock.data || {})];
                for (const type of candidates) {
                    if (type && dock.data?.[type] && !isHiddenType(type)) {
                        return type;
                    }
                }
                return "";
            };

            /** 与官方 dock 图标点击相同：toggleModel(type, false, true) */
            const clickDockType = (dock, type) => {
                if (!type || typeof dock.toggleModel !== "function") {
                    return;
                }
                dock.toggleModel(type, false, true);
            };

            const toggleSidePanel = (layoutKey, fallbackType) => {
                const dock = getDock(layoutKey);
                if (!dock) {
                    return;
                }
                if (isPanelOpen(dock)) {
                    const active = getActiveType(dock);
                    const type = active || lastType[layoutKey] || fallbackType;
                    if (active) {
                        lastType[layoutKey] = active;
                    }
                    clickDockType(dock, type);
                    return;
                }
                const type = pickOpenType(dock, layoutKey, fallbackType);
                if (type) {
                    lastType[layoutKey] = type;
                }
                clickDockType(dock, type);
            };

            const rememberDockClick = (e) => {
                const item = e.target?.closest?.(".dock__item[data-type]");
                if (!item || item.classList.contains("dock__item--pin")) {
                    return;
                }
                const type = item.getAttribute("data-type");
                if (!type) {
                    return;
                }
                for (const side of sides) {
                    const dock = getDock(side.layoutKey);
                    if (!dock?.elements) {
                        continue;
                    }
                    if (dock.elements.some((group) => group?.contains?.(item))) {
                        lastType[side.layoutKey] = type;
                        break;
                    }
                }
            };

            /**
             * 表层限制：已激活的 dock 图标再点时，拦住 click 冒泡到 window.globalClick，
             * 从而不会走 toggleModel(type, false, true) 收起侧栏。
             * 不改写 Dock.toggleModel / 不 hook 官方逻辑 → 顶栏两按钮直接调 API 仍可折叠。
             * 监听在 document 冒泡阶段（早于 window 上的 globalClick）。
             */
            const suppressActiveDockCollapse = (e) => {
                const item = e.target?.closest?.(".dock__item[data-type]");
                if (!item || item.classList.contains("dock__item--pin")) {
                    return;
                }
                if (!item.classList.contains("dock__item--active")) {
                    return;
                }
                e.stopPropagation();
            };

            /** 若正在显示将被隐藏的面板，先收起 */
            const closeIfActiveHidden = (hiddenTypes) => {
                const set = new Set(hiddenTypes);
                for (const side of sides) {
                    const dock = getDock(side.layoutKey);
                    if (!dock || !isPanelOpen(dock)) {
                        continue;
                    }
                    const active = getActiveType(dock);
                    if (active && set.has(active)) {
                        lastType[side.layoutKey] = active;
                        clickDockType(dock, active);
                    }
                }
            };

            const applyHiddenDockTypes = () => {
                let style = document.getElementById(HIDE_STYLE_ID);
                if (!style) {
                    style = document.createElement("style");
                    style.id = HIDE_STYLE_ID;
                    document.head.appendChild(style);
                }
                if (!isCursorArtTheme()) {
                    style.textContent = "";
                    return;
                }
                const rules = config.hiddenDockTypes
                    .map((type) => {
                        const safe = type.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
                        return `.dock__item[data-type="${safe}"]{display:none!important}`;
                    })
                    .join("");
                style.textContent = rules;
            };

            const ensureSettingStyles = () => {
                let style = document.getElementById(SETTINGS_STYLE_ID);
                if (!style) {
                    style = document.createElement("style");
                    style.id = SETTINGS_STYLE_ID;
                    document.head.appendChild(style);
                }
                style.textContent = `
#starterSettingsDialog.b3-dialog {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    z-index: 100000 !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
    background: transparent;
}
#starterSettingsDialog .b3-dialog__scrim {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-color: var(--b3-mask-background);
}
#starterSettingsDialog .starter-settings-window {
    position: relative;
    z-index: 1;
    width: min(640px, 92vw);
    height: 80vh;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    background-color: var(--b3-theme-surface);
    box-shadow: var(--b3-dialog-shadow);
}
#starterSettingsDialog .b3-dialog__header {
    flex-shrink: 0;
}
#starterSettingsDialog .b3-dialog__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
#starterSettingsDialog .starter-settings-content {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    padding: 0;
}
#starterSettingsDialog .starter-settings-panes {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 16px 16px 16px;
}
#starterSettingsDialog [data-starter-pane] {
    display: none;
    flex-direction: column;
    gap: 24px;
    width: 100%;
}
#starterSettingsDialog [data-starter-pane].starter-settings-pane--active {
    display: flex;
}
#starterSettingsDialog .starter-settings-tabs {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 12px 16px 0;
    border-bottom: 1px solid var(--b3-border-color);
}
#starterSettingsDialog .starter-settings-tab {
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: 8px 8px 0 0;
    padding: 8px 14px;
    cursor: pointer;
    color: var(--b3-theme-on-surface);
    font: inherit;
    font-size: 14px;
    opacity: 0.72;
}
#starterSettingsDialog .starter-settings-tab:hover {
    opacity: 1;
    background: var(--b3-list-hover);
}
#starterSettingsDialog .starter-settings-tab--active {
    opacity: 1;
    color: var(--b3-theme-primary);
    box-shadow: inset 0 -2px 0 var(--b3-theme-primary);
}
#starterSettingsDialog .starter-settings-section {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    overflow: hidden;
    background: var(--b3-theme-surface);
}
#starterSettingsDialog .starter-settings-section__title {
    padding: 10px 14px;
    font-weight: 600;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    background: var(--b3-theme-background);
    border-bottom: 1px solid var(--b3-border-color);
}
#starterSettingsDialog .starter-settings-section__desc {
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--b3-theme-on-surface-light);
    background: var(--b3-theme-background);
    border-bottom: 1px solid var(--b3-border-color);
    white-space: pre-wrap;
}
#starterSettingsDialog .starter-settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
}
#starterSettingsDialog .starter-settings-row + .starter-settings-row {
    border-top: 1px solid var(--b3-border-color);
}
#starterSettingsDialog .starter-settings-text {
    min-width: 0;
    flex: 1;
}
#starterSettingsDialog .starter-settings-title {
    font-size: 14px;
    color: var(--b3-theme-on-background);
    line-height: 1.4;
}
#starterSettingsDialog .starter-settings-desc {
    margin-top: 4px;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.8;
    line-height: 1.45;
    word-break: break-word;
}
#starterSettingsDialog .starter-settings-action {
    flex-shrink: 0;
}
#starterSettingsDialog .starter-settings-action .b3-button {
    margin: 0;
}
#starterSettingsDialog .starter-settings-empty {
    padding: 28px 12px;
    text-align: center;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
}
#starterSettingsDialog .starter-settings-path__val {
    display: block;
    word-break: break-all;
    user-select: text;
}
#starterSettingsDialog .starter-settings-footer {
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--b3-border-color);
}
#starterSettingsDialog .starter-settings-lh {
    align-items: center;
    flex-shrink: 0;
    gap: 10px;
    min-width: 160px;
}
#starterSettingsDialog .starter-settings-lh .b3-slider {
    width: 120px;
}
#starterSettingsDialog .b3-slider:disabled {
    opacity: 0.4;
}
#starterSettingsDialog .starter-settings-lh__val {
    min-width: 2.6em;
    color: var(--b3-theme-on-surface);
    font-variant-numeric: tabular-nums;
}
#starterSettingsDialog .starter-settings-notice {
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--b3-theme-on-surface);
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
}
#starterSettingsDialog .starter-settings-pane--locked {
    opacity: 0.55;
    pointer-events: none;
}
#starterSettingsDialog .starter-settings-mount {
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
}
`;
            };

            const ensureFeatureStyles = () => {
                let style = document.getElementById(FEATURE_STYLE_ID);
                if (!style) {
                    style = document.createElement("style");
                    style.id = FEATURE_STYLE_ID;
                    document.head.appendChild(style);
                }
                style.textContent = `
html.starter-hide-tab-new #layouts .layout__center .layout-tab-bar--readonly .block__icon[data-type="new"],
html.starter-hide-tab-more #layouts .layout__center .layout-tab-bar--readonly .block__icon[data-type="more"] {
    display: none !important;
}
html.starter-hide-tab-new.starter-hide-tab-more #layouts .layout__center .layout-tab-bar--readonly {
    min-width: 24px;
}
html.starter-hide-notebook .sy__file li[data-type="navigation-root"] {
    display: none !important;
}
html.starter-hide-notebook .sy__file > ul.b3-list.fn__flex-column {
    display: none !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 18px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 0 !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 36px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 18px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 54px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 36px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 72px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 54px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 90px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 72px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 108px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 90px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > ul > ul > li[data-type="navigation-file"] {
    --file-toggle-width: 126px !important;
}
html.starter-hide-notebook .sy__file ul[data-url] > ul > ul > ul > ul > ul > ul > ul > li[data-type="navigation-file"] > .b3-list-item__toggle {
    padding-left: 108px !important;
}
#layouts .sy__file {
    overflow: hidden;
}
#layouts .sy__file > .starter-file-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}
#layouts .sy__file > .starter-file-scroll > .fn__flex-1 {
    flex: 0 0 auto;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
}
#layouts .sy__file .starter-recent-docs,
#layouts .sy__file .starter-fav-docs {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    overflow: visible;
    max-height: none;
    padding-bottom: 10px;
}
#layouts .sy__file .starter-recent-docs__head,
#layouts .sy__file .starter-fav-docs__head {
    flex-shrink: 0;
    cursor: pointer;
}
#layouts .sy__file .starter-recent-docs__head .b3-list-item__text,
#layouts .sy__file .starter-fav-docs__head .b3-list-item__text {
    color: var(--b3-theme-on-surface);
    font-size: 12px;
}
#layouts .sy__file .starter-recent-docs__list,
#layouts .sy__file .starter-fav-docs__list {
    overflow: visible;
}
#layouts .sy__file .starter-recent-docs.starter-recent-docs--collapsed .starter-recent-docs__list,
#layouts .sy__file .starter-fav-docs.starter-fav-docs--collapsed .starter-fav-docs__list {
    display: none;
}
#layouts .sy__file .starter-recent-docs__item--current,
#layouts .sy__file .starter-fav-docs__item--current {
    background-color: var(--b3-list-hover);
}
#layouts .sy__file .starter-recent-docs__empty .b3-list-item__text,
#layouts .sy__file .starter-fav-docs__more .b3-list-item__text {
    color: var(--b3-theme-on-surface-light);
}
#layouts .sy__file [data-starter-recent-doc],
#layouts .sy__file [data-starter-fav-doc],
#layouts .sy__file .starter-fav-docs__more {
    cursor: pointer;
}
#layouts .layout__center .protyle-breadcrumb > .starter-fav-btn {
    flex-shrink: 0;
}
html.starter-plain-table-head .b3-typography table thead th,
html.starter-plain-table-head .protyle-wysiwyg table thead th,
html.starter-plain-table-head .protyle-wysiwyg [data-node-id] table thead th {
    font-weight: 400 !important;
}
html.starter-plain-table-head .b3-typography table thead th *:not(strong):not(b):not([data-type~="strong"]),
html.starter-plain-table-head .protyle-wysiwyg table thead th *:not(strong):not(b):not([data-type~="strong"]) {
    font-weight: inherit !important;
}
html.starter-block-line-height .protyle-wysiwyg [data-node-id].p,
html.starter-block-line-height .b3-typography p {
    line-height: var(--starter-block-line-height);
}
html.starter-custom-doc-ref .b3-typography span[data-type~="block-ref"][data-id]:not(.av__celltext):not([custom-fhelper-child-nav] *),
html.starter-custom-doc-ref .protyle-wysiwyg [data-node-id] span[data-type~="block-ref"][data-id]:not(.av__celltext):not([custom-fhelper-child-nav] *) {
    font-weight: 700;
    color: var(--b3-theme-on-background);
    text-decoration: none;
    border-bottom: none;
}
`;
            };

            const getConfigAbsPath = () => {
                const ws = String(window.siyuan?.config?.system?.workspaceDir || "").replace(/[\\/]+$/, "");
                if (!ws) {
                    return "";
                }
                const sep = ws.includes("\\") ? "\\" : "/";
                return ws + sep + CONFIG_PATH.replace(/^\//, "").split("/").join(sep);
            };

            const openConfigInFolder = () => {
                const abs = getConfigAbsPath();
                try {
                    const req = window.require;
                    if (typeof req === "function" && abs) {
                        const shell = req("electron").shell;
                        if (shell && typeof shell.showItemInFolder === "function") {
                            shell.showItemInFolder(abs);
                            return;
                        }
                    }
                } catch {
                    /* 非 Electron 或无 shell */
                }
                const copied = abs || CONFIG_PATH;
                const done = () => {
                    try {
                        showMessage(`已复制配置路径：${copied}`, 4000, "info");
                    } catch {
                        /* ignore */
                    }
                };
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(copied).then(done, done);
                    return;
                }
                done();
            };

            const loadThemeVersion = async () => {
                try {
                    const res = await fetch("/appearance/themes/cursorart/theme.json", {cache: "no-store"});
                    if (!res.ok) {
                        return "";
                    }
                    const parsed = await res.json();
                    return typeof parsed?.version === "string" ? parsed.version : "";
                } catch {
                    return "";
                }
            };

            const listDockTools = () => {
                const map = new Map();
                document.querySelectorAll(".dock__item[data-type]").forEach((el) => {
                    if (el.classList.contains("dock__item--pin")) {
                        return;
                    }
                    const type = el.getAttribute("data-type");
                    if (!type || map.has(type)) {
                        return;
                    }
                    let label = el.getAttribute("data-title") || el.getAttribute("aria-label") || type;
                    label = String(label).split("\n")[0].trim();
                    // 去掉快捷键后缀「 ⇧⌘A」之类
                    label = label.replace(/\s+[⇧⌃⌥⌘↑↓←→\dA-Za-z+\-]+$/u, "").trim() || type;
                    map.set(type, {type, label});
                });
                return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "zh"));
            };

            const closeSettingsDialog = () => {
                document.getElementById(DIALOG_ID)?.remove();
            };

            const openSettingsDialog = () => {
                closeSettingsDialog();
                ensureSettingStyles();
                pluginHost?._editorFeatures?.ensureSettingStyles?.();
                const tools = listDockTools();
                const themeOn = isCursorArtTheme();
                const editor = pluginHost?._editorFeatures;

                const settingRow = (title, desc, controlHtml) => `<div class="starter-settings-row">
          <div class="starter-settings-text">
            <div class="starter-settings-title">${title}</div>
            ${desc ? `<div class="starter-settings-desc">${desc}</div>` : ""}
          </div>
          ${controlHtml ? `<div class="starter-settings-action">${controlHtml}</div>` : ""}
        </div>`;
                const settingSection = (title, desc, rowsHtml) => `<div class="starter-settings-section">
          <div class="starter-settings-section__title">${title}</div>
          ${desc ? `<div class="starter-settings-section__desc">${desc}</div>` : ""}
          ${rowsHtml}
        </div>`;
                const switchHtml = (attr, checked, disabled) =>
                    `<input class="b3-switch fn__flex-center" type="checkbox" ${attr}${checked}${disabled ? " disabled" : ""}>`;
                const sliderHtml = (attr, min, max, step, value, valAttr) =>
                    `<div class="fn__flex starter-settings-lh">
          <input class="b3-slider" type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attr}>
          <span class="starter-settings-lh__val" ${valAttr}>${value}</span>
        </div>`;

                const rows = tools.length
                    ? tools
                          .map(({type, label}) => {
                              const checked = isHiddenType(type) ? "" : " checked";
                              return settingRow(
                                  label,
                                  `data-type: ${type}`,
                                  switchHtml(`data-starter-hide-type="${type}"`, checked, !themeOn)
                              );
                          })
                          .join("")
                    : `<div class="starter-settings-empty">未检测到侧栏工具图标，请稍后再试。</div>`;
                const adaptiveChecked = config.adaptiveTopbarHeight !== false ? " checked" : "";
                const dockInContentChecked = config.dockInContent !== false ? " checked" : "";
                const dockNotice = themeOn
                    ? ""
                    : `<div class="starter-settings-notice">当前不是 cursor极简 主题，本页布局功能不可用。请在「设置 → 外观」中把亮色/暗色主题都换成 cursor极简。</div>`;
                const dockLockClass = themeOn ? "" : " starter-settings-pane--locked";

                const docRefChecked = config.customDocRefStyle !== false ? " checked" : "";
                const tableHeadChecked = config.plainTableHead !== false ? " checked" : "";
                const hideNbChecked = config.hideNotebooks === true ? " checked" : "";
                const hideTabNewChecked = config.hideTabNewDoc === true ? " checked" : "";
                const hideTabSwitchChecked = config.hideTabSwitch === true ? " checked" : "";
                const showRecentChecked = config.showRecentDocs !== false ? " checked" : "";
                const showFavChecked = config.showFavoriteDocs !== false ? " checked" : "";
                const svgDefaultChecked = officialSvgDefaultOn() ? " checked" : "";
                const blockLh = clampBlockLh(config.blockLineHeight);
                const recentMax = Math.max(1, clampListMax(config.recentDocsMax));
                const favMax = Math.max(1, clampListMax(config.favoriteDocsMax));
                const svgDefaultTitle = window.siyuan?.languages?.useSVGDefaultIcon || "默认使用 SVG 图标";
                const svgDefaultRow = supportsOfficialSvgDefault()
                    ? settingRow(
                          svgDefaultTitle,
                          "与思源「设置 → 文档树」里的同名开关是同一个；打开后未设图标的文档用线框 SVG，关闭则用 emoji",
                          switchHtml("data-starter-svg-default", svgDefaultChecked)
                      )
                    : "";
                const hideStatusChecked = officialHideStatusBarOn() ? " checked" : "";
                const hideStatusTitle = window.siyuan?.languages?.appearance16 || "隐藏底部状态栏";
                const hideStatusRow = supportsOfficialHideStatusBar()
                    ? settingRow(
                          hideStatusTitle,
                          "与思源「设置 → 外观」里的同名开关是同一个；只控制整条状态栏显隐，不改里面显示哪些",
                          switchHtml("data-starter-hide-status", hideStatusChecked)
                      )
                    : "";

                const dialog = document.createElement("div");
                dialog.id = DIALOG_ID;
                dialog.className = "b3-dialog b3-dialog--open";
                dialog.innerHTML = `
        <div class="b3-dialog__scrim" data-starter-dlg="scrim"></div>
        <div class="b3-dialog__container starter-settings-window">
          <div class="b3-dialog__header">cursor极简 设置</div>
          <div class="b3-dialog__body">
            <div class="b3-dialog__content starter-settings-content">
              <div class="starter-settings-tabs">
                <button type="button" class="starter-settings-tab starter-settings-tab--active" data-starter-dlg="tab" data-starter-tab="dock">侧栏</button>
                <button type="button" class="starter-settings-tab" data-starter-dlg="tab" data-starter-tab="style">样式</button>
                <button type="button" class="starter-settings-tab" data-starter-dlg="tab" data-starter-tab="edit">编辑</button>
                <button type="button" class="starter-settings-tab" data-starter-dlg="tab" data-starter-tab="slash">斜杠菜单</button>
                <button type="button" class="starter-settings-tab" data-starter-dlg="tab" data-starter-tab="sync">配置同步</button>
                <button type="button" class="starter-settings-tab" data-starter-dlg="tab" data-starter-tab="about">关于</button>
              </div>
              <div class="starter-settings-panes">
              <div data-starter-pane="dock" class="starter-settings-pane--active">
                ${dockNotice}
                <div class="${dockLockClass.trim()}">
                ${settingSection(
                    "布局",
                    "仅在当前主题为 cursor极简 时生效",
                    settingRow(
                        "开启自适应标题栏高度",
                        "按屏幕缩放把标题栏与文档 Tab 压到约 55 设备像素",
                        switchHtml("data-starter-adaptive-topbar", adaptiveChecked, !themeOn)
                    ) +
                    settingRow(
                        "将侧边工具按钮放入内容视图",
                        "把左右 dock 图标移到侧栏内容区顶部横条",
                        switchHtml("data-starter-dock-in-content", dockInContentChecked, !themeOn)
                    )
                )}
                ${settingSection(
                    "侧栏工具",
                    "开关打开 = 显示该工具图标；关闭 = 隐藏（仅本主题生效）",
                    rows
                )}
                </div>
              </div>
              <div data-starter-pane="style">
                <div data-starter-default-icons class="starter-settings-mount"></div>
                ${settingSection(
                    "文档树",
                    "",
                    svgDefaultRow +
                    settingRow(
                        "隐藏笔记本",
                        "文件树不显示笔记本名称，其中文档作为第一级列出",
                        switchHtml("data-starter-hide-notebook", hideNbChecked)
                    ) +
                    settingRow(
                        "显示最近打开",
                        "文件树顶部列出最近打开的文档",
                        switchHtml("data-starter-show-recent", showRecentChecked)
                    ) +
                    settingRow(
                        "最近打开条数",
                        "最多显示几条",
                        sliderHtml("data-starter-recent-max", 1, 32, 1, recentMax, "data-starter-recent-max-val")
                    ) +
                    settingRow(
                        "显示收藏",
                        "文件树顶部列出收藏的文档；面包屑五角星仍可用来收藏",
                        switchHtml("data-starter-show-fav", showFavChecked)
                    ) +
                    settingRow(
                        "收藏条数",
                        "默认显示条数，超出可点「更多」展开",
                        sliderHtml("data-starter-fav-max", 1, 32, 1, favMax, "data-starter-fav-max-val")
                    )
                )}
                ${hideStatusRow ? settingSection("界面", "", hideStatusRow) : ""}
                ${settingSection(
                    "Tab 栏",
                    "",
                    settingRow(
                        "隐藏新建文档",
                        "藏掉文档 Tab 条上的「+」",
                        switchHtml("data-starter-hide-tab-new", hideTabNewChecked)
                    ) +
                    settingRow(
                        "隐藏页签切换",
                        "藏掉文档 Tab 条右侧的下拉按钮",
                        switchHtml("data-starter-hide-tab-switch", hideTabSwitchChecked)
                    )
                )}
                ${settingSection(
                    "正文",
                    "",
                    settingRow(
                        "链接样式",
                        "开启 = 文档引用显示图标、加粗与下划线；关闭 = 思源原生块引用",
                        switchHtml("data-starter-doc-ref-style", docRefChecked)
                    ) +
                    settingRow(
                        "表格表头不加粗",
                        "开启 = 表头与单元格同字重；关闭 = 官方强制加粗",
                        switchHtml("data-starter-plain-table-head", tableHeadChecked)
                    ) +
                    settingRow(
                        "块行间距",
                        "正文行高倍数，官方约 1.625",
                        sliderHtml("data-starter-block-lh", 1.2, 2.6, 0.05, blockLh.toFixed(2), "data-starter-block-lh-val")
                    )
                )}
              </div>
              <div data-starter-pane="edit">
                <div data-starter-edit-mount class="starter-settings-mount"></div>
              </div>
              <div data-starter-pane="slash">
                <div data-starter-slash-mount class="starter-settings-mount"></div>
              </div>
              <div data-starter-pane="sync">
                <div data-starter-sync-mount class="starter-settings-mount"></div>
              </div>
              <div data-starter-pane="about">
                ${settingSection(
                    "版本",
                    "",
                    settingRow(
                        "插件 cursor极简工具",
                        `当前版本 ${PLUGIN_VERSION}`,
                        ""
                    ) +
                    settingRow(
                        "主题 cursor极简",
                        `<span data-starter-theme-ver>读取中…</span>`,
                        ""
                    )
                )}
                ${settingSection(
                    "支持",
                    "",
                    settingRow(
                        "支持作者",
                        "打开支持页，为作者点赞或赞助",
                        `<button type="button" class="b3-button b3-button--outline" data-starter-dlg="support-author">打开</button>`
                    ) +
                    settingRow(
                        "复位喜欢按钮",
                        "清掉本机电脑名下的「已点过爱心」记录，顶栏重新显示爱心。换电脑或电脑名变化也会再出现",
                        `<button type="button" class="b3-button b3-button--outline" data-starter-dlg="reset-donate">复位</button>`
                    )
                )}
                ${settingSection(
                    "维护",
                    "",
                    settingRow(
                        "恢复默认配置",
                        "把侧栏、样式、编辑、斜杠菜单等设置恢复为安装时的默认值；收藏与最近打开名单保留",
                        `<button type="button" class="b3-button b3-button--outline" data-starter-dlg="restore-defaults">恢复</button>`
                    ) +
                    settingRow(
                        "配置保存位置",
                        `<span class="starter-settings-path__val">${CONFIG_PATH}</span>`,
                        `<button type="button" class="b3-button b3-button--outline" data-starter-dlg="open-path">打开</button>`
                    )
                )}
              </div>
              </div>
            </div>
          </div>
        </div>`;

                if (editor) {
                    const iconHost = dialog.querySelector("[data-starter-default-icons]");
                    const editHost = dialog.querySelector("[data-starter-edit-mount]");
                    const slashHost = dialog.querySelector("[data-starter-slash-mount]");
                    const syncHost = dialog.querySelector("[data-starter-sync-mount]");
                    if (iconHost) {
                        editor.mountDefaultIcons(iconHost);
                    }
                    if (editHost) {
                        editor.mountEditTab(editHost);
                    }
                    if (slashHost) {
                        editor.mountSlashTab(slashHost);
                    }
                    if (syncHost) {
                        editor.mountConfigSyncTab(syncHost);
                    }
                } else {
                    const editHost = dialog.querySelector("[data-starter-edit-mount]");
                    if (editHost) {
                        editHost.innerHTML = `<div class="starter-settings-notice">编辑、斜杠菜单与配置同步需禁用 fhelper 后才会启用。</div>`;
                    }
                }

                const persistLayout = () => {
                    if (!themeOn) {
                        return;
                    }
                    const hidden = [];
                    dialog.querySelectorAll("[data-starter-hide-type]").forEach((input) => {
                        if (!input.checked) {
                            hidden.push(input.getAttribute("data-starter-hide-type"));
                        }
                    });
                    const adaptiveTopbarHeight = !!dialog.querySelector("[data-starter-adaptive-topbar]")?.checked;
                    const dockInContent = !!dialog.querySelector("[data-starter-dock-in-content]")?.checked;
                    closeIfActiveHidden(hidden);
                    saveConfigToFile({hiddenDockTypes: hidden, adaptiveTopbarHeight, dockInContent});
                    syncLayoutFeaturesToTheme();
                };

                const persistStyle = (extra = {}) => {
                    const patch = {
                        customDocRefStyle: !!dialog.querySelector("[data-starter-doc-ref-style]")?.checked,
                        plainTableHead: !!dialog.querySelector("[data-starter-plain-table-head]")?.checked,
                        hideNotebooks: !!dialog.querySelector("[data-starter-hide-notebook]")?.checked,
                        hideTabNewDoc: !!dialog.querySelector("[data-starter-hide-tab-new]")?.checked,
                        hideTabSwitch: !!dialog.querySelector("[data-starter-hide-tab-switch]")?.checked,
                        showRecentDocs: !!dialog.querySelector("[data-starter-show-recent]")?.checked,
                        showFavoriteDocs: !!dialog.querySelector("[data-starter-show-fav]")?.checked,
                        blockLineHeight: clampBlockLh(dialog.querySelector("[data-starter-block-lh]")?.value),
                        recentDocsMax: Math.max(1, clampListMax(dialog.querySelector("[data-starter-recent-max]")?.value)),
                        favoriteDocsMax: Math.max(1, clampListMax(dialog.querySelector("[data-starter-fav-max]")?.value)),
                        ...extra,
                    };
                    return saveConfigToFile(patch).then(() => {
                        applyDocRefFeature();
                        applyStyleFeatures();
                        applyHideNotebooks();
                        applyRecentDocs();
                        applyFavoriteDocs();
                    });
                };

                let sliderTimer = 0;
                const persistStyleSoon = () => {
                    window.clearTimeout(sliderTimer);
                    sliderTimer = window.setTimeout(() => persistStyle(), 200);
                };

                const onClose = () => {
                    dialog.removeEventListener("click", onClick);
                    document.removeEventListener("keydown", onKey, true);
                    closeSettingsDialog();
                };
                const restoreFactoryConfig = async () => {
                    const next = {
                        ...createFactoryConfig(),
                        favoriteDocs: config.favoriteDocs,
                        recentDocs: config.recentDocs,
                        seededOfficialDefaults: true,
                        editorFeaturesMigrated: true,
                    };
                    await saveConfigToFile(next);
                    closeIfActiveHidden(config.hiddenDockTypes);
                    if (supportsOfficialSvgDefault()) {
                        await persistOfficialSvgDefault(true);
                    }
                    if (supportsOfficialHideStatusBar()) {
                        await persistOfficialHideStatusBar(true);
                    }
                    applySvgDefaultIcons();
                    applyHideStatusBar(officialHideStatusBarOn());
                    applyHiddenDockTypes();
                    syncLayoutFeaturesToTheme();
                    applyDocRefFeature();
                    applyStyleFeatures();
                    applyHideNotebooks();
                    applyRecentDocs();
                    applyFavoriteDocs();
                    pluginHost?._editorFeatures?.applyConfig?.(normalizeEditorConfig(config));
                    showMessage("已恢复默认配置");
                    onClose();
                    openSettingsDialog();
                };
                const onClick = (e) => {
                    const t = e.target?.closest?.("[data-starter-dlg]");
                    if (!t) {
                        return;
                    }
                    const act = t.getAttribute("data-starter-dlg");
                    if (act === "scrim") {
                        onClose();
                        return;
                    }
                    if (act === "reset-donate") {
                        e.preventDefault();
                        resetDonateHeart();
                        t.textContent = "已复位";
                        return;
                    }
                    if (act === "restore-defaults") {
                        e.preventDefault();
                        const title = "恢复默认配置";
                        const text = "将侧栏、样式、编辑、斜杠菜单等设置恢复为安装时的默认值。收藏与最近打开名单会保留。";
                        const run = () => {
                            restoreFactoryConfig().catch((err) => {
                                console.warn("[cursorart-tools] restore defaults failed", err);
                                showMessage("恢复默认配置失败");
                            });
                        };
                        if (typeof confirm === "function") {
                            confirm(title, text, run);
                        } else if (window.confirm(`${title}\n\n${text}`)) {
                            run();
                        }
                        return;
                    }
                    if (act === "support-author") {
                        e.preventDefault();
                        openDonateInBrowser(`${DONATE_PAGE_URL}/?from=settings`);
                        return;
                    }
                    if (act === "open-path") {
                        e.preventDefault();
                        openConfigInFolder();
                        return;
                    }
                    if (act === "tab") {
                        const tab = t.getAttribute("data-starter-tab");
                        dialog.querySelectorAll("[data-starter-tab]").forEach((btn) => {
                            btn.classList.toggle("starter-settings-tab--active", btn.getAttribute("data-starter-tab") === tab);
                        });
                        dialog.querySelectorAll("[data-starter-pane]").forEach((pane) => {
                            pane.classList.toggle(
                                "starter-settings-pane--active",
                                pane.getAttribute("data-starter-pane") === tab
                            );
                        });
                        const panes = dialog.querySelector(".starter-settings-panes");
                        if (panes) {
                            panes.scrollTop = 0;
                        }
                    }
                };
                const onKey = (e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onClose();
                    }
                };
                dialog.addEventListener("click", onClick);
                document.addEventListener("keydown", onKey, true);
                document.body.appendChild(dialog);

                if (themeOn) {
                    dialog.querySelector("[data-starter-adaptive-topbar]")?.addEventListener("change", persistLayout);
                    dialog.querySelector("[data-starter-dock-in-content]")?.addEventListener("change", persistLayout);
                    dialog.querySelectorAll("[data-starter-hide-type]").forEach((input) => {
                        input.addEventListener("change", persistLayout);
                    });
                }

                dialog.querySelector("[data-starter-doc-ref-style]")?.addEventListener("change", persistStyle);
                dialog.querySelector("[data-starter-plain-table-head]")?.addEventListener("change", (e) => {
                    document.documentElement.classList.toggle("starter-plain-table-head", !!e.target.checked);
                    persistStyle();
                });
                dialog.querySelector("[data-starter-svg-default]")?.addEventListener("change", (e) => {
                    persistOfficialSvgDefault(!!e.target.checked).then(() => applySvgDefaultIcons());
                });
                dialog.querySelector("[data-starter-hide-status]")?.addEventListener("change", (e) => {
                    persistOfficialHideStatusBar(!!e.target.checked).then(() => {
                        applyHideStatusBar(officialHideStatusBarOn());
                    });
                });
                dialog.querySelector("[data-starter-hide-notebook]")?.addEventListener("change", (e) => {
                    const on = !!e.target.checked;
                    document.documentElement.classList.toggle("starter-hide-notebook", on);
                    if (on) {
                        startHideNotebooks();
                    } else {
                        stopHideNotebooks();
                    }
                    persistStyle();
                });
                dialog.querySelector("[data-starter-hide-tab-new]")?.addEventListener("change", (e) => {
                    document.documentElement.classList.toggle("starter-hide-tab-new", !!e.target.checked);
                    persistStyle();
                });
                dialog.querySelector("[data-starter-hide-tab-switch]")?.addEventListener("change", (e) => {
                    document.documentElement.classList.toggle("starter-hide-tab-more", !!e.target.checked);
                    persistStyle();
                });
                const recentInput = dialog.querySelector("[data-starter-recent-max]");
                const recentVal = dialog.querySelector("[data-starter-recent-max-val]");
                const syncRecentControls = () => {
                    const on = !!dialog.querySelector("[data-starter-show-recent]")?.checked;
                    if (recentInput) {
                        recentInput.disabled = !on;
                    }
                    persistStyle();
                    applyRecentDocs();
                };
                dialog.querySelector("[data-starter-show-recent]")?.addEventListener("change", syncRecentControls);
                if (recentInput) {
                    recentInput.disabled = !dialog.querySelector("[data-starter-show-recent]")?.checked;
                }
                recentInput?.addEventListener("input", () => {
                    const v = Math.max(1, clampListMax(recentInput.value));
                    if (recentVal) {
                        recentVal.textContent = String(v);
                    }
                    config.recentDocsMax = v;
                    applyRecentDocs();
                    persistStyleSoon();
                });
                const favMaxInput = dialog.querySelector("[data-starter-fav-max]");
                const favMaxVal = dialog.querySelector("[data-starter-fav-max-val]");
                const syncFavControls = () => {
                    const on = !!dialog.querySelector("[data-starter-show-fav]")?.checked;
                    if (favMaxInput) {
                        favMaxInput.disabled = !on;
                    }
                    persistStyle();
                    applyFavoriteDocs();
                };
                dialog.querySelector("[data-starter-show-fav]")?.addEventListener("change", syncFavControls);
                if (favMaxInput) {
                    favMaxInput.disabled = !dialog.querySelector("[data-starter-show-fav]")?.checked;
                }
                favMaxInput?.addEventListener("input", () => {
                    const v = Math.max(1, clampListMax(favMaxInput.value));
                    if (favMaxVal) {
                        favMaxVal.textContent = String(v);
                    }
                    applyFavoriteDocs();
                    persistStyleSoon();
                });
                const lhInput = dialog.querySelector("[data-starter-block-lh]");
                const lhVal = dialog.querySelector("[data-starter-block-lh-val]");
                lhInput?.addEventListener("input", () => {
                    const v = clampBlockLh(lhInput.value);
                    if (lhVal) {
                        lhVal.textContent = v.toFixed(2);
                    }
                    document.documentElement.classList.add("starter-block-line-height");
                    document.documentElement.style.setProperty("--starter-block-line-height", String(v));
                    persistStyleSoon();
                });

                const verEl = dialog.querySelector("[data-starter-theme-ver]");
                if (verEl) {
                    loadThemeVersion().then((ver) => {
                        verEl.textContent = ver ? `当前版本 ${ver}` : "未检测到主题包（请安装 cursor极简）";
                    });
                }
            };

            if (pluginHost) {
                pluginHost._openSettingsDialog = openSettingsDialog;
            }

            const unmountToggles = () => {
                document.getElementById(TOGGLE_LEFT_ID)?.remove();
                document.getElementById(TOGGLE_RIGHT_ID)?.remove();
                // 兼容旧版合并容器
                document.getElementById("starterSideToggles")?.remove();
            };

            const mountToggles = () => {
                const toolbar = document.getElementById("toolbar");
                const barWorkspace = document.getElementById("barWorkspace");
                const windowControls = document.getElementById("windowControls");
                if (!toolbar || !barWorkspace || !windowControls) {
                    return false;
                }
                if (document.getElementById(TOGGLE_LEFT_ID) && document.getElementById(TOGGLE_RIGHT_ID)) {
                    return true;
                }
                if (!window.siyuan?.layout?.leftDock) {
                    return false;
                }

                // 清掉旧位置/半残留
                unmountToggles();

                sides.forEach((side) => {
                    const dock = getDock(side.layoutKey);
                    const active = dock && getActiveType(dock);
                    if (active) {
                        lastType[side.layoutKey] = active;
                    }
                });

                const mkBtn = (id, layoutKey, iconId, label) => {
                    const btn = document.createElement("div");
                    btn.id = id;
                    btn.className = "toolbar__item ariaLabel starter-side-toggle";
                    btn.dataset.starterSide = layoutKey;
                    btn.setAttribute("aria-label", label);
                    btn.setAttribute("role", "button");
                    btn.setAttribute("tabindex", "0");
                    btn.style.webkitAppRegion = "no-drag";
                    btn.innerHTML = `<svg><use xlink:href="#${iconId}"></use></svg>`;

                    const run = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const conf = sides.find((s) => s.layoutKey === layoutKey);
                        toggleSidePanel(layoutKey, conf?.fallbackType || "file");
                    };
                    btn.addEventListener("pointerdown", (e) => {
                        if (e.button !== 0) {
                            return;
                        }
                        run(e);
                    });
                    btn.addEventListener("keydown", (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            run(e);
                        }
                    });
                    return btn;
                };

                // 左栏：紧挨「思源」标题（#barWorkspace）之后
                const leftBtn = mkBtn(TOGGLE_LEFT_ID, "leftDock", "iconPanelLeft", "显示/隐藏左侧栏");
                barWorkspace.insertAdjacentElement("afterend", leftBtn);

                // 右栏：最小化等窗口按钮（#windowControls）左侧
                const rightBtn = mkBtn(TOGGLE_RIGHT_ID, "rightDock", "iconPanelRight", "显示/隐藏右侧栏");
                toolbar.insertBefore(rightBtn, windowControls);
                return true;
            };

            const unmountOne = ({dockId, placeholderId}) => {
                const dock = document.getElementById(dockId);
                const ph = document.getElementById(placeholderId);
                if (dock) {
                    const panel = dock.closest("." + PANEL_CLASS);
                    if (panel) {
                        panel.classList.remove(PANEL_CLASS);
                    }
                    dock.classList.remove(TOP_CLASS);
                    delete dock.dataset.starterMounted;
                }
                if (!dock || !ph || !ph.parentNode) {
                    return;
                }
                ph.parentNode.insertBefore(dock, ph);
                ph.remove();
            };

            const mountOne = ({dockId, panelSelector, placeholderId}) => {
                const dock = document.getElementById(dockId);
                const panel = document.querySelector(panelSelector);
                if (!dock || !panel) {
                    return false;
                }
                if (dock.dataset.starterMounted === "1" && dock.parentElement === panel) {
                    panel.classList.add(PANEL_CLASS);
                    dock.classList.add(TOP_CLASS);
                    return true;
                }

                if (!document.getElementById(placeholderId) && dock.parentElement !== panel) {
                    const ph = document.createElement("div");
                    ph.id = placeholderId;
                    ph.setAttribute("hidden", "");
                    dock.parentNode.insertBefore(ph, dock);
                }

                if (dock.parentElement !== panel) {
                    panel.insertBefore(dock, panel.firstChild);
                } else if (panel.firstChild !== dock) {
                    panel.insertBefore(dock, panel.firstChild);
                }

                dock.classList.add(TOP_CLASS);
                panel.classList.add(PANEL_CLASS);
                dock.dataset.starterMounted = "1";
                return true;
            };

            const mountAllDocks = () => sides.every((side) => mountOne(side));

            const getPcName = () => {
                try {
                    const req = window.require;
                    if (typeof req === "function") {
                        const hostname = req("os")?.hostname?.();
                        if (hostname) {
                            return String(hostname);
                        }
                    }
                } catch {
                    /* 非 Electron 走思源设备名 */
                }
                try {
                    const name = window.siyuan?.config?.system?.name;
                    if (name) {
                        return String(name);
                    }
                } catch {
                    /* 无设备名则视为未点过 */
                }
                return "";
            };

            const migrateDonateFlag = () => {
                try {
                    if (localStorage.getItem(DONATE_FLAG_KEY) !== "1") {
                        return;
                    }
                    const pc = getPcName();
                    if (pc) {
                        localStorage.setItem(DONATE_HOST_KEY, pc);
                    }
                    localStorage.removeItem(DONATE_FLAG_KEY);
                } catch {
                    /* 无痕模式忽略 */
                }
            };

            const hasClickedDonate = () => {
                migrateDonateFlag();
                const pc = getPcName();
                if (!pc) {
                    return false;
                }
                try {
                    return localStorage.getItem(DONATE_HOST_KEY) === pc;
                } catch {
                    return false;
                }
            };

            const markDonateClicked = () => {
                const pc = getPcName();
                try {
                    if (pc) {
                        localStorage.setItem(DONATE_HOST_KEY, pc);
                    }
                    localStorage.removeItem(DONATE_FLAG_KEY);
                } catch {
                    /* 无痕模式仍尽量打开页面 */
                }
            };

            const unmountDonateHeart = () => {
                document.getElementById(DONATE_HEART_ID)?.remove();
            };

            const openDonateInBrowser = (url) => {
                try {
                    const req = window.require;
                    if (typeof req === "function") {
                        const shell = req("electron").shell;
                        if (shell && typeof shell.openExternal === "function") {
                            return Promise.resolve(shell.openExternal(url)).then(
                                () => true,
                                () => {
                                    window.open(url, "_blank");
                                    return true;
                                }
                            );
                        }
                    }
                } catch {
                    /* 走 window.open */
                }
                window.open(url, "_blank");
                return Promise.resolve(true);
            };

            const onDonateHeartClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const heart = document.getElementById(DONATE_HEART_ID);
                if (heart?.dataset.starterOpening === "1") {
                    return;
                }
                if (heart) {
                    heart.dataset.starterOpening = "1";
                }
                const url = `${DONATE_PAGE_URL}/?from=theme`;
                Promise.resolve(openDonateInBrowser(url)).finally(() => {
                    markDonateClicked();
                    unmountDonateHeart();
                });
            };

            /** 顶栏 #barForward（前进）之后、文档 Tab 之前；点过则不再插入 */
            const mountDonateHeart = () => {
                if (hasClickedDonate()) {
                    unmountDonateHeart();
                    return true;
                }
                const barForward = document.getElementById("barForward");
                const drag = document.getElementById("drag");
                const toolbar = document.getElementById("toolbar");
                const existing = document.getElementById(DONATE_HEART_ID);
                if (existing && barForward && existing.previousElementSibling === barForward) {
                    return true;
                }
                if (existing) {
                    existing.remove();
                }
                if (!toolbar || (!barForward && !drag)) {
                    return false;
                }

                const heart = document.createElement("div");
                heart.id = DONATE_HEART_ID;
                heart.className = "toolbar__item ariaLabel";
                heart.setAttribute("aria-label", "喜欢 cursor极简");
                heart.setAttribute("role", "button");
                heart.setAttribute("tabindex", "0");
                heart.style.webkitAppRegion = "no-drag";
                heart.innerHTML = '<svg class="ft__pink"><use xlink:href="#iconHeart"></use></svg>';
                heart.addEventListener("click", onDonateHeartClick);
                heart.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                        onDonateHeartClick(ev);
                    }
                });
                if (barForward) {
                    barForward.insertAdjacentElement("afterend", heart);
                } else {
                    toolbar.insertBefore(heart, drag);
                }
                return true;
            };

            const resetDonateHeart = () => {
                try {
                    localStorage.removeItem(DONATE_FLAG_KEY);
                    localStorage.removeItem(DONATE_HOST_KEY);
                } catch {
                    /* 无痕模式仍尽量重新挂上 */
                }
                unmountDonateHeart();
                return mountDonateHeart();
            };

            /** 大纲跟随：视口顶部附近的标题 → 官方 Outline.setCurrent */
            const OUTLINE_FOLLOW_TOP_SLOP = 8;
            const OUTLINE_FOLLOW_NEAR_BAND = 140;
            const OUTLINE_JUMP_IGNORE_MS = 500;
            let outlineFollowRaf = 0;
            let outlineFollowPending = null;
            let outlineJumpUntil = 0;

            const isOutlineModel = (model) =>
                !!(model && typeof model.setCurrent === "function" && typeof model.setCurrentByPreview === "function");

            const isUsableHeading = (el) => {
                if (!el || el.getAttribute("data-type") !== "NodeHeading") {
                    return false;
                }
                if (el.closest(".bq, .callout-content, [data-type='NodeBlockQueryEmbed']")) {
                    return false;
                }
                return true;
            };

            const collectOutlineModels = () => {
                const list = [];
                const seen = new Set();
                const push = (model) => {
                    if (!isOutlineModel(model) || seen.has(model)) {
                        return;
                    }
                    seen.add(model);
                    list.push(model);
                };
                for (const key of ["leftDock", "rightDock", "bottomDock"]) {
                    push(window.siyuan?.layout?.[key]?.data?.outline);
                }
                const walk = (node) => {
                    if (!node) {
                        return;
                    }
                    if (node.model) {
                        push(node.model);
                    }
                    const children = node.children;
                    if (Array.isArray(children)) {
                        children.forEach(walk);
                    }
                };
                walk(window.siyuan?.layout?.layout);
                return list;
            };

            const getProtyleRootId = (protyleEl) =>
                protyleEl?.querySelector?.(".protyle-title")?.getAttribute("data-node-id") || "";

            const headingBeforeOrSelf = (block) => {
                if (!block) {
                    return null;
                }
                if (isUsableHeading(block)) {
                    return block;
                }
                const wysiwyg = block.closest(".protyle-wysiwyg");
                if (!wysiwyg) {
                    return null;
                }
                const headings = wysiwyg.querySelectorAll('[data-type="NodeHeading"]');
                let best = null;
                for (const h of headings) {
                    if (!isUsableHeading(h)) {
                        continue;
                    }
                    if (h === block || (h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                        best = h;
                    }
                }
                return best;
            };

            const findViewportHeading = (protyleEl) => {
                const content = protyleEl.querySelector(".protyle-content");
                const wysiwyg = protyleEl.querySelector(".protyle-wysiwyg");
                if (!content || !wysiwyg) {
                    return null;
                }
                const contentTop = content.getBoundingClientRect().top;
                const passedY = contentTop + OUTLINE_FOLLOW_TOP_SLOP;
                const bandY = contentTop + OUTLINE_FOLLOW_NEAR_BAND;
                const headings = wysiwyg.querySelectorAll('[data-type="NodeHeading"]');
                let lastPassed = null;
                let firstInBand = null;
                for (const h of headings) {
                    if (!isUsableHeading(h)) {
                        continue;
                    }
                    const top = h.getBoundingClientRect().top;
                    if (top <= passedY) {
                        lastPassed = h;
                        continue;
                    }
                    if (!firstInBand && top <= bandY) {
                        firstInBand = h;
                    }
                }
                return firstInBand || lastPassed;
            };

            const getCaretHeading = (protyleEl) => {
                const wysiwyg = protyleEl.querySelector(".protyle-wysiwyg");
                const sel = window.getSelection();
                if (!wysiwyg || !sel || sel.rangeCount === 0) {
                    return null;
                }
                const node = sel.getRangeAt(0).startContainer;
                if (!wysiwyg.contains(node)) {
                    return null;
                }
                const el = node.nodeType === 1 ? node : node.parentElement;
                const block = el?.closest?.("[data-node-id]");
                return headingBeforeOrSelf(block);
            };

            const syncOutlineFromProtyle = (protyleEl, preferCaret) => {
                if (!protyleEl || protyleEl.classList.contains("fn__none")) {
                    return;
                }
                const rootId = getProtyleRootId(protyleEl);
                if (!rootId) {
                    return;
                }
                const heading = (preferCaret && getCaretHeading(protyleEl)) || findViewportHeading(protyleEl);
                if (!heading) {
                    return;
                }
                const id = heading.getAttribute("data-node-id");
                if (!id) {
                    return;
                }
                for (const outline of collectOutlineModels()) {
                    if (outline.blockId && outline.blockId !== rootId) {
                        continue;
                    }
                    const focused = outline.element?.querySelector?.(".b3-list-item--focus");
                    if (focused?.getAttribute("data-node-id") === id) {
                        continue;
                    }
                    outline.setCurrent(heading);
                }
            };

            const scheduleOutlineFollow = (protyleEl, preferCaret) => {
                outlineFollowPending = {protyleEl, preferCaret};
                if (outlineFollowRaf) {
                    return;
                }
                outlineFollowRaf = requestAnimationFrame(() => {
                    outlineFollowRaf = 0;
                    const job = outlineFollowPending;
                    outlineFollowPending = null;
                    if (job) {
                        syncOutlineFromProtyle(job.protyleEl, job.preferCaret);
                    }
                });
            };

            const onOutlineJumpPointer = (e) => {
                const t = e.target;
                if (!(t instanceof Element)) {
                    return;
                }
                if (!t.closest(".sy__outline .b3-list-item[data-node-id]")) {
                    return;
                }
                outlineJumpUntil = Date.now() + OUTLINE_JUMP_IGNORE_MS;
            };

            const onEditorScrollCapture = (e) => {
                const t = e.target;
                if (!(t instanceof Element) || !t.classList.contains("protyle-content")) {
                    return;
                }
                if (t.closest(".sy__outline")) {
                    return;
                }
                if (!t.closest("#layouts .layout__center")) {
                    return;
                }
                if (Date.now() < outlineJumpUntil) {
                    return;
                }
                const protyleEl = t.closest(".protyle");
                scheduleOutlineFollow(protyleEl, false);
            };

            const onSelectionOutlineFollow = () => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                    return;
                }
                const node = sel.getRangeAt(0).startContainer;
                const el = node.nodeType === 1 ? node : node.parentElement;
                const protyleEl = el?.closest?.("#layouts .layout__center .protyle");
                if (!protyleEl) {
                    return;
                }
                scheduleOutlineFollow(protyleEl, true);
            };

            const onProtyleSwitchOutlineFollow = () => {
                const el =
                    document.querySelector("#layouts .layout__center .layout__wnd--active .protyle:not(.fn__none)") ||
                    document.querySelector("#layouts .layout__center .protyle:not(.fn__none)");
                if (el) {
                    scheduleOutlineFollow(el, true);
                }
            };

            const startOutlineFollow = () => {
                document.addEventListener("pointerdown", onOutlineJumpPointer, true);
                document.addEventListener("scroll", onEditorScrollCapture, {capture: true, passive: true});
                document.addEventListener("selectionchange", onSelectionOutlineFollow);
                document.addEventListener("loaded-protyle-static", onProtyleSwitchOutlineFollow);
                document.addEventListener("switch-protyle", onProtyleSwitchOutlineFollow);
                startOutlineDefaultExpand();
            };

            const stopOutlineFollow = () => {
                document.removeEventListener("pointerdown", onOutlineJumpPointer, true);
                document.removeEventListener("scroll", onEditorScrollCapture, true);
                document.removeEventListener("selectionchange", onSelectionOutlineFollow);
                document.removeEventListener("loaded-protyle-static", onProtyleSwitchOutlineFollow);
                document.removeEventListener("switch-protyle", onProtyleSwitchOutlineFollow);
                stopOutlineDefaultExpand();
                if (outlineFollowRaf) {
                    cancelAnimationFrame(outlineFollowRaf);
                    outlineFollowRaf = 0;
                }
                outlineFollowPending = null;
                outlineJumpUntil = 0;
            };

            /** 大纲：第一次成为父标题时默认展开，不改用户已折叠的项 */
            const outlineKnownParents = new Set();
            const outlinePrimedRoots = new Set();
            let outlineExpandObs = null;
            let outlineExpandRaf = 0;

            const outlineIsFiltering = (outlineEl) => {
                const input = outlineEl
                    ?.closest?.(".sy__outline, .fn__flex-1")
                    ?.querySelector?.("input.b3-text-field.search__label");
                return !!(input && input.value);
            };

            const expandOutlineLi = (li) => {
                const arrow = li.querySelector(".b3-list-item__arrow");
                arrow?.classList.add("b3-list-item__arrow--open");
                const next = li.nextElementSibling;
                if (next && next.tagName === "UL") {
                    next.classList.remove("fn__none");
                }
                if (next?.nextElementSibling?.tagName === "UL") {
                    next.nextElementSibling.classList.remove("fn__none");
                }
            };

            const expandNewOutlineParents = () => {
                for (const outline of collectOutlineModels()) {
                    const el = outline.element;
                    if (!(el instanceof HTMLElement) || outlineIsFiltering(el)) {
                        continue;
                    }
                    const rootId = outline.blockId || "";
                    const parents = [];
                    el.querySelectorAll("li.b3-list-item[data-node-id]").forEach((li) => {
                        const next = li.nextElementSibling;
                        const id = li.getAttribute("data-node-id");
                        if (!id) {
                            return;
                        }
                        if (next && next.tagName === "UL") {
                            parents.push({
                                li,
                                id,
                                collapsed: next.classList.contains("fn__none"),
                            });
                        } else {
                            outlineKnownParents.delete(id);
                        }
                    });
                    if (!outlinePrimedRoots.has(rootId)) {
                        const allCollapsed = parents.length > 0 && parents.every((p) => p.collapsed);
                        if (allCollapsed) {
                            parents.forEach((p) => {
                                expandOutlineLi(p.li);
                                outlineKnownParents.add(p.id);
                            });
                            if (typeof outline.saveExpendIds === "function") {
                                outline.saveExpendIds();
                            }
                        } else {
                            parents.forEach((p) => outlineKnownParents.add(p.id));
                        }
                        outlinePrimedRoots.add(rootId);
                        continue;
                    }
                    let changed = false;
                    parents.forEach((p) => {
                        if (outlineKnownParents.has(p.id)) {
                            return;
                        }
                        outlineKnownParents.add(p.id);
                        if (p.collapsed) {
                            expandOutlineLi(p.li);
                            changed = true;
                        }
                    });
                    if (changed && typeof outline.saveExpendIds === "function") {
                        outline.saveExpendIds();
                    }
                }
            };

            const scheduleOutlineDefaultExpand = () => {
                if (outlineExpandRaf) {
                    return;
                }
                outlineExpandRaf = requestAnimationFrame(() => {
                    outlineExpandRaf = 0;
                    expandNewOutlineParents();
                });
            };

            const startOutlineDefaultExpand = () => {
                outlineExpandObs?.disconnect();
                const host = document.querySelector("#layouts") || document.body;
                outlineExpandObs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        const t = m.target;
                        if (t instanceof Element && t.closest(".sy__outline")) {
                            scheduleOutlineDefaultExpand();
                            return;
                        }
                        for (const n of m.addedNodes) {
                            if (n.nodeType === 1 && (n.classList?.contains("sy__outline") || n.querySelector?.(".sy__outline"))) {
                                scheduleOutlineDefaultExpand();
                                return;
                            }
                        }
                    }
                });
                outlineExpandObs.observe(host, {childList: true, subtree: true});
                scheduleOutlineDefaultExpand();
            };

            const stopOutlineDefaultExpand = () => {
                outlineExpandObs?.disconnect();
                outlineExpandObs = null;
                if (outlineExpandRaf) {
                    cancelAnimationFrame(outlineExpandRaf);
                    outlineExpandRaf = 0;
                }
                outlineKnownParents.clear();
                outlinePrimedRoots.clear();
            };

            /** 面包屑：隐藏官方块级条，在旁边画文档路径（避免官方异步 render 盖掉） */
            const PATH_BAR_CLASS = "starter-doc-path";
            const pathCrumbCache = new Map();
            const pathCrumbInflight = new Map();
            let pathBarHostObs = null;
            let pathBarTitleObs = null;
            let pathBarRaf = 0;

            const postJson = async (url, body) => {
                const res = await fetch(url, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                });
                return res.json();
            };

            const persistOfficialSvgDefault = async (on) => {
                const ft = window.siyuan?.config?.fileTree;
                if (!ft || typeof ft.useSVGDefaultIcon !== "boolean") {
                    return true;
                }
                if (ft.useSVGDefaultIcon === on) {
                    return true;
                }
                try {
                    const res = await postJson("/api/setting/setFiletree", {...ft, useSVGDefaultIcon: on});
                    if (res?.code !== 0) {
                        console.warn("[starter] 写入思源 useSVGDefaultIcon 失败", res);
                        return false;
                    }
                    if (res.data && typeof res.data === "object") {
                        window.siyuan.config.fileTree = res.data;
                    } else {
                        ft.useSVGDefaultIcon = on;
                    }
                    return true;
                } catch (e) {
                    console.warn("[starter] 写入思源 useSVGDefaultIcon 失败", e);
                    return false;
                }
            };

            const applyHideStatusBar = (hidden) => {
                document.getElementById("status")?.classList.toggle("fn__none", !!hidden);
                const layoutElement = window.siyuan?.layout?.layout?.children?.[0]?.element;
                if (!(layoutElement instanceof HTMLElement)) {
                    return;
                }
                layoutElement.style.marginBottom = hidden ? "var(--b3-layout-space)" : "";
            };

            const persistOfficialHideStatusBar = async (hidden) => {
                const ap = window.siyuan?.config?.appearance;
                if (!ap || typeof ap.hideStatusBar !== "boolean") {
                    return true;
                }
                if (ap.hideStatusBar === hidden) {
                    applyHideStatusBar(hidden);
                    return true;
                }
                try {
                    const res = await postJson("/api/setting/setAppearance", {...ap, hideStatusBar: hidden});
                    if (res?.code !== 0) {
                        console.warn("[starter] 写入思源 hideStatusBar 失败", res);
                        return false;
                    }
                    ap.hideStatusBar = hidden;
                    applyHideStatusBar(hidden);
                    return true;
                } catch (e) {
                    console.warn("[starter] 写入思源 hideStatusBar 失败", e);
                    return false;
                }
            };

            const seedOfficialDefaultsIfNeeded = async () => {
                if (config.seededOfficialDefaults) {
                    return;
                }
                const jobs = [];
                if (supportsOfficialSvgDefault()) {
                    jobs.push(persistOfficialSvgDefault(true));
                }
                if (supportsOfficialHideStatusBar()) {
                    jobs.push(persistOfficialHideStatusBar(true));
                }
                if (jobs.length) {
                    await Promise.all(jobs);
                }
                await saveConfigToFile({seededOfficialDefaults: true});
                applySvgDefaultIcons();
            };

            const escapeHtml = (s) =>
                String(s)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;");

            const parsePathIds = (path) => {
                const ids = [];
                const re = /(\d{14}-[0-9a-z]+)/gi;
                let m = re.exec(path);
                while (m) {
                    ids.push(m[1]);
                    m = re.exec(path);
                }
                return ids;
            };

            const isBlockId = (id) => /^\d{14}-[0-9a-z]+$/i.test(id || "");

            const collectRemoveDocIds = (payload) => {
                const ids = [];
                const push = (value) => {
                    if (Array.isArray(value)) {
                        value.forEach(push);
                        return;
                    }
                    if (typeof value === "string") {
                        if (isBlockId(value)) {
                            ids.push(value);
                            return;
                        }
                        parsePathIds(value).forEach((id) => ids.push(id));
                    }
                };
                push(payload?.ids);
                push(payload?.id);
                push(payload?.rootID);
                const pathIds = parsePathIds(payload?.path || "");
                if (pathIds.length) {
                    ids.push(pathIds[pathIds.length - 1]);
                }
                if (Array.isArray(payload?.paths)) {
                    payload.paths.forEach((p) => {
                        const fromPath = parsePathIds(p);
                        if (fromPath.length) {
                            ids.push(fromPath[fromPath.length - 1]);
                        }
                    });
                }
                return [...new Set(ids.filter(isBlockId))];
            };

            const docStillExists = async (id) => {
                if (!isBlockId(id)) {
                    return false;
                }
                const pathRes = await postJson("/api/filetree/getPathByID", {id});
                if (pathRes?.code !== 0) {
                    return false;
                }
                const path = typeof pathRes.data === "string" ? pathRes.data : pathRes.data?.path || "";
                return !!path;
            };

            const openDocById = (id) => {
                if (!id) {
                    return;
                }
                if (typeof window.openFileByURL === "function") {
                    window.openFileByURL(`siyuan://blocks/${id}`);
                    return;
                }
                const treeItem = document.querySelector(
                    `#layouts .sy__file ul[data-url] .b3-list-item[data-node-id="${id}"]`
                );
                if (treeItem) {
                    treeItem.click();
                    return;
                }
                const a = document.createElement("a");
                a.href = `siyuan://blocks/${id}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            };

            const loadPathCrumbs = async (rootId) => {
                if (!rootId) {
                    return null;
                }
                if (pathCrumbCache.has(rootId)) {
                    return pathCrumbCache.get(rootId);
                }
                if (pathCrumbInflight.has(rootId)) {
                    return pathCrumbInflight.get(rootId);
                }
                const job = (async () => {
                    const [fullRes, pathRes] = await Promise.all([
                        postJson("/api/filetree/getFullHPathByID", {id: rootId}),
                        postJson("/api/filetree/getPathByID", {id: rootId}),
                    ]);
                    if (fullRes?.code !== 0 || pathRes?.code !== 0) {
                        return null;
                    }
                    const names = String(fullRes.data || "")
                        .split("/")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    const pathData = pathRes.data || {};
                    const ids = parsePathIds(pathData.path || "");
                    const box = pathData.notebook || "";
                    if (!names.length) {
                        return null;
                    }
                    const crumbs = names.map((name, index) => {
                        const last = index === names.length - 1;
                        const id = index === 0 ? box : ids[index - 1] || (last ? rootId : "");
                        return {name, box, id};
                    });
                    pathCrumbCache.set(rootId, crumbs);
                    return crumbs;
                })();
                pathCrumbInflight.set(rootId, job);
                try {
                    return await job;
                } finally {
                    pathCrumbInflight.delete(rootId);
                }
            };

            const crumbsHtml = (crumbs, rootId) => {
                const n = crumbs.length;
                return crumbs
                    .map((c, index) => {
                        const last = index === n - 1;
                        const keep = n <= 3 || index === 0 || index >= n - 2;
                        const idAttr = c.id ? ` data-starter-doc-id="${c.id}"` : "";
                        const item = `<span class="starter-doc-path__item${keep ? " starter-doc-path__item--keep" : " starter-doc-path__item--mid"}" data-starter-path-item="1"${idAttr} data-starter-root="${rootId}" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>`;
                        if (last) {
                            return item;
                        }
                        return `${item}<span class="starter-doc-path__sep">/</span>`;
                    })
                    .join("");
            };

            const ensurePathBar = (host) => {
                let bar = host.querySelector(`:scope > .${PATH_BAR_CLASS}`);
                if (bar) {
                    return bar;
                }
                const official = host.querySelector(":scope > .protyle-breadcrumb__bar");
                if (!official) {
                    return null;
                }
                bar = document.createElement("div");
                bar.className = `protyle-breadcrumb__bar ${PATH_BAR_CLASS}`;
                official.insertAdjacentElement("afterend", bar);
                bar.addEventListener(
                    "wheel",
                    (event) => {
                        bar.scrollLeft += event.deltaY;
                    },
                    {passive: true}
                );
                return bar;
            };

            const bindPathTitle = (title) => {
                if (!pathBarTitleObs || !title || title.dataset.starterPathBound === "1") {
                    return;
                }
                title.dataset.starterPathBound = "1";
                pathBarTitleObs.observe(title, {attributes: true, attributeFilter: ["data-node-id"]});
            };

            const fillPathBar = async (bar, rootId) => {
                if (!bar || !rootId) {
                    return;
                }
                const req = String((Number(bar.dataset.starterPathReq) || 0) + 1);
                bar.dataset.starterPathReq = req;
                const crumbs = await loadPathCrumbs(rootId);
                if (bar.dataset.starterPathReq !== req || !crumbs || !bar.isConnected) {
                    return;
                }
                if (bar.dataset.starterPathRoot === rootId && bar.querySelector("[data-starter-path-item]")) {
                    return;
                }
                bar.innerHTML = crumbsHtml(crumbs, rootId);
                bar.dataset.starterPathRoot = rootId;
            };

            const refreshAllPathBars = () => {
                document.querySelectorAll("#layouts .layout__center .protyle-breadcrumb").forEach((host) => {
                    const protyleEl = host.closest(".protyle");
                    const title = protyleEl?.querySelector(".protyle-title");
                    bindPathTitle(title);
                    const rootId = title?.getAttribute("data-node-id") || "";
                    const bar = ensurePathBar(host);
                    if (bar && rootId) {
                        fillPathBar(bar, rootId);
                    }
                    syncFavButtons();
                });
            };

            const schedulePathBars = () => {
                if (pathBarRaf) {
                    return;
                }
                pathBarRaf = requestAnimationFrame(() => {
                    pathBarRaf = 0;
                    refreshAllPathBars();
                    scheduleRecentDocs(true);
                });
            };

            const onProtylePathBreadcrumb = () => {
                schedulePathBars();
            };

            const onPathCrumbClick = (e) => {
                const item = e.target?.closest?.("[data-starter-path-item]");
                if (!item || !item.closest(`#layouts .layout__center .${PATH_BAR_CLASS}`)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const docId = item.getAttribute("data-starter-doc-id");
                const rootId = item.getAttribute("data-starter-root");
                if (docId && docId !== rootId) {
                    openDocById(docId);
                }
            };

            const startPathBreadcrumb = () => {
                pathBarTitleObs = new MutationObserver(schedulePathBars);
                pathBarHostObs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const n of m.addedNodes) {
                            if (n.nodeType !== 1) {
                                continue;
                            }
                            if (n.classList?.contains("protyle-breadcrumb") || n.querySelector?.(".protyle-breadcrumb")) {
                                schedulePathBars();
                                return;
                            }
                        }
                    }
                });
                const center = document.querySelector("#layouts .layout__center") || document.body;
                pathBarHostObs.observe(center, {childList: true, subtree: true});
                document.addEventListener("click", onPathCrumbClick, true);
                document.addEventListener("loaded-protyle-static", onProtylePathBreadcrumb);
                document.addEventListener("switch-protyle", onProtylePathBreadcrumb);
                schedulePathBars();
            };

            const stopPathBreadcrumb = () => {
                document.removeEventListener("click", onPathCrumbClick, true);
                document.removeEventListener("loaded-protyle-static", onProtylePathBreadcrumb);
                document.removeEventListener("switch-protyle", onProtylePathBreadcrumb);
                pathBarHostObs?.disconnect();
                pathBarTitleObs?.disconnect();
                pathBarHostObs = null;
                pathBarTitleObs = null;
                if (pathBarRaf) {
                    cancelAnimationFrame(pathBarRaf);
                    pathBarRaf = 0;
                }
                document.querySelectorAll(`.${PATH_BAR_CLASS}`).forEach((el) => el.remove());
                document.querySelectorAll("#layouts .layout__center .starter-fav-btn").forEach((el) => el.remove());
                document.querySelectorAll(".protyle-title[data-starter-path-bound]").forEach((el) => {
                    delete el.dataset.starterPathBound;
                });
                pathCrumbCache.clear();
                pathCrumbInflight.clear();
            };

            /** 文档块引用：识别 rootID===id；图标写进 document 样式表，禁止改 span.style / 正文 */
            const DOC_REF_SEL =
                ".b3-typography span[data-type~='block-ref'][data-id], " +
                "#layouts .layout__center .protyle-wysiwyg span[data-type~='block-ref'][data-id]";
            const DOC_REF_SKIP_HOST = "[custom-fhelper-child-nav]";
            const DOC_REF_NOT = `:not(.av__celltext):not(${DOC_REF_SKIP_HOST} *)`;
            const DOC_REF_STYLE_ID = "starterDocRefStyle";
            const DOC_REF_LEAK_RE = /\{:[^}]*--starter-doc-ref-[^}]*\}/g;
            const DOC_REF_CLASSES = [
                "starter-doc-ref",
                "starter-doc-ref--skip",
                "starter-doc-ref--icon",
                "starter-doc-ref--img",
            ];
            const docRefCache = new Map();
            const docRefInflight = new Map();
            /** @type {Map<string, {kind: "skip"|"icon"|"img"|"svg", glyph?: string, src?: string, svgId?: string}>} */
            const docRefPainted = new Map();
            let docRefObs = null;
            let docRefTimer = 0;
            let docRefStarted = false;
            let docRefCleaning = false;

            const hexToEmoji = (icon) => {
                if (!icon || /[./]/.test(icon)) {
                    return "";
                }
                try {
                    return String.fromCodePoint(
                        ...String(icon)
                            .split("-")
                            .map((p) => parseInt(p, 16))
                    );
                } catch {
                    return "";
                }
            };

            const defaultDocGlyph = () => {
                const raw = window.siyuan?.storage?.["local-images"]?.file || "1f4c4";
                return hexToEmoji(raw) || "📄";
            };

            const FILE_TREE_SVG_IDS = {
                file: "iconFile",
                folder: "iconFileText",
                notebook: "iconNotebook",
            };

            const defaultFileSvgId = (kind) => FILE_TREE_SVG_IDS[kind] || FILE_TREE_SVG_IDS.file;

            const svgUseHTML = (svgId) => {
                const id = String(svgId || FILE_TREE_SVG_IDS.file).replace(/"/g, "");
                return `<svg><use xlink:href="#${id}"></use></svg>`;
            };

            const defaultEmojiForKind = (kind) => {
                const images = window.siyuan?.storage?.["local-images"] || {};
                if (kind === "notebook") {
                    return images.note || "1f5c3";
                }
                if (kind === "folder") {
                    return images.folder || "1f4d1";
                }
                return images.file || "1f4c4";
            };

            const defaultIconHTML = (kind) => {
                if (useSvgDefaultIcon()) {
                    return svgUseHTML(defaultFileSvgId(kind));
                }
                return hexToEmoji(defaultEmojiForKind(kind)) || defaultDocGlyph();
            };

            const refreshOfficialDefaultTreeIcons = () => {
                document.querySelectorAll("#layouts .sy__file ul[data-url] [data-default-icon]").forEach((li) => {
                    const kind = li.getAttribute("data-default-icon");
                    if (kind !== "file" && kind !== "folder" && kind !== "notebook") {
                        return;
                    }
                    const wrap = Array.from(li.children).find(
                        (el) =>
                            el.classList.contains("b3-list-item__icon") || el.classList.contains("b3-list-item__graphic")
                    );
                    if (!wrap) {
                        return;
                    }
                    wrap.innerHTML = defaultIconHTML(kind);
                });
            };

            const svgSymbolDataUri = (svgId) => {
                const symbol = document.getElementById(svgId);
                if (!symbol) {
                    return "";
                }
                const viewBox = symbol.getAttribute("viewBox") || "0 0 32 32";
                const dims = String(viewBox).split(/[\s,]+/).map(Number);
                const vbSize = dims[2] || 32;
                const strokeW = Math.max(vbSize / 18, 1.25);
                const inner = String(symbol.innerHTML)
                    .replace(/\sfill="[^"]*"/gi, "")
                    .replace(/\sstroke="[^"]*"/gi, "")
                    .replace(/\sstroke-width="[^"]*"/gi, "");
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#000" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
                return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
            };

            const isStockFileGlyph = (icon) => {
                const v = (icon || "").trim();
                if (!v) {
                    return true;
                }
                const raw = String(window.siyuan?.storage?.["local-images"]?.file || "1f4c4");
                if (v === raw || v.toLowerCase() === raw.toLowerCase()) {
                    return true;
                }
                const emoji = hexToEmoji(raw);
                return v === "📄" || v === "1f4c4" || !!(emoji && v === emoji);
            };

            const officialTreeItem = (id) => {
                if (!id) {
                    return null;
                }
                return document.querySelector(`#layouts .sy__file ul[data-url] .b3-list-item[data-node-id="${id}"]`);
            };

            const loadDocRefMeta = (id, opts) => {
                const forceApi = !!opts?.forceApi;
                if (!forceApi && docRefCache.has(id)) {
                    return Promise.resolve(docRefCache.get(id));
                }
                if (!forceApi && docRefInflight.has(id)) {
                    return docRefInflight.get(id);
                }
                const job = (async () => {
                    if (!forceApi) {
                        const tree = metaFromFileTree(id);
                        if (tree) {
                            docRefCache.set(id, tree);
                            return tree;
                        }
                    }
                    const res = await postJson("/api/block/getBlockInfo", {id});
                    const isDoc = res?.code === 0 && res.data?.rootID === id;
                    const meta = {isDoc, icon: isDoc ? res.data?.rootIcon || "" : ""};
                    docRefCache.set(id, meta);
                    return meta;
                })();
                docRefInflight.set(id, job);
                return job.finally(() => {
                    if (docRefInflight.get(id) === job) {
                        docRefInflight.delete(id);
                    }
                });
            };

            const metaFromFileTree = (id) => {
                const li = officialTreeItem(id);
                if (!li) {
                    return null;
                }
                const wrap = li.querySelector(":scope > .b3-list-item__icon");
                const img = wrap?.querySelector("img");
                const src = img?.getAttribute("src") || "";
                if (src.includes("/emojis/")) {
                    return {isDoc: true, icon: src.split("/emojis/")[1].split("?")[0]};
                }
                if (src.includes("api/icon")) {
                    return {isDoc: true, icon: src.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "")};
                }
                const useEl = wrap?.querySelector("use");
                if (useEl) {
                    const href = useEl.getAttribute("href") || useEl.getAttribute("xlink:href") || "";
                    const svgId = href.replace(/^#/, "");
                    const defaultKind = li.getAttribute("data-default-icon") || "";
                    return {isDoc: true, icon: "", svgId, defaultKind};
                }
                const emoji = wrap?.textContent?.trim() || "";
                return {isDoc: true, icon: emoji};
            };

            const collectDocRefSpans = () => {
                const spans = [];
                document.querySelectorAll(DOC_REF_SEL).forEach((span) => {
                    if (!(span instanceof HTMLElement)) {
                        return;
                    }
                    if (span.classList.contains("av__celltext") || span.closest(".code-block, .hljs")) {
                        return;
                    }
                    if (span.closest(DOC_REF_SKIP_HOST)) {
                        return;
                    }
                    if (!span.getAttribute("data-id")) {
                        return;
                    }
                    spans.push(span);
                });
                return spans;
            };

            const glyphFromIcon = (icon) => {
                const hex = hexToEmoji(icon);
                if (hex) {
                    return hex;
                }
                if (icon && !/[./]/.test(icon) && !/^[0-9a-f-]{4,}$/i.test(icon)) {
                    return icon;
                }
                return defaultDocGlyph();
            };

            const escCssId = (id) => (window.CSS?.escape ? CSS.escape(id) : String(id));

            const cssContent = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;

            const docRefSels = (ids, pseudo = "") =>
                ids
                    .flatMap((id) => {
                        const e = escCssId(id);
                        return [
                            `html.starter-custom-doc-ref .b3-typography span[data-type~="block-ref"][data-id="${e}"]${DOC_REF_NOT}${pseudo}`,
                            `html.starter-custom-doc-ref .protyle-wysiwyg [data-node-id] span[data-type~="block-ref"][data-id="${e}"]${DOC_REF_NOT}${pseudo}`,
                        ];
                    })
                    .join(",\n");

            const metaToPaint = (meta) => {
                if (!meta.isDoc) {
                    return {kind: "skip"};
                }
                const icon = (meta.icon || "").trim();
                if (icon && (icon.includes(".") || icon.startsWith("api/"))) {
                    const src = icon.startsWith("api/") || icon.startsWith("/")
                        ? `/${icon.replace(/^\//, "")}`
                        : `/emojis/${icon}`;
                    return {kind: "img", src};
                }
                if (icon) {
                    return {kind: "icon", glyph: glyphFromIcon(icon)};
                }
                if (useSvgDefaultIcon()) {
                    const svgId = meta.svgId || defaultFileSvgId(meta.defaultKind || "file");
                    if (document.getElementById(svgId)) {
                        return {kind: "svg", svgId};
                    }
                }
                return {kind: "icon", glyph: defaultDocGlyph()};
            };

            const rememberDocRef = (id, meta) => {
                const next = metaToPaint(meta);
                const prev = docRefPainted.get(id);
                if (
                    prev &&
                    prev.kind === next.kind &&
                    prev.glyph === next.glyph &&
                    prev.src === next.src &&
                    prev.svgId === next.svgId
                ) {
                    return false;
                }
                docRefPainted.set(id, next);
                return true;
            };

            const renderDocRefSheet = () => {
                let el = document.getElementById(DOC_REF_STYLE_ID);
                if (!el) {
                    el = document.createElement("style");
                    el.id = DOC_REF_STYLE_ID;
                    document.head.appendChild(el);
                }
                const skips = [];
                const docs = [];
                const icons = new Map();
                const imgs = new Map();
                const svgs = new Map();
                for (const [id, info] of docRefPainted) {
                    if (info.kind === "skip") {
                        skips.push(id);
                        continue;
                    }
                    docs.push(id);
                    if (info.kind === "icon") {
                        const list = icons.get(info.glyph) || [];
                        list.push(id);
                        icons.set(info.glyph, list);
                    } else if (info.kind === "svg" && info.svgId) {
                        const list = svgs.get(info.svgId) || [];
                        list.push(id);
                        svgs.set(info.svgId, list);
                    } else if (info.src) {
                        const list = imgs.get(info.src) || [];
                        list.push(id);
                        imgs.set(info.src, list);
                    }
                }
                const parts = [];
                if (skips.length) {
                    parts.push(`${docRefSels(skips)} {
            font-weight: inherit;
            color: var(--b3-protyle-inline-blockref-color);
            text-decoration: none;
            border-bottom: none;
            padding: 0;
            background-image: none;
        }`);
                }
                if (docs.length) {
                    parts.push(`${docRefSels(docs)} {
            position: relative;
            padding-left: 1.28em;
            padding-bottom: 0.14em;
            font-weight: 700;
            color: var(--b3-theme-on-background);
            text-decoration: none;
            background-image: linear-gradient(var(--b3-border-color), var(--b3-border-color));
            background-repeat: no-repeat;
            background-size: 100% 1px;
            background-position: 0 100%;
            background-origin: content-box;
            background-clip: content-box;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
            transition: none;
        }`);
                    parts.push(`${docRefSels(docs, "::before")} {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            display: block;
            width: 1.05em;
            margin: 0;
            pointer-events: none;
            background-image: none;
        }`);
                }
                for (const [glyph, ids] of icons) {
                    parts.push(`${docRefSels(ids, "::before")} {
            content: ${cssContent(glyph)};
            font-weight: 400;
            font-family: var(--b3-font-family-emoji);
            line-height: 1;
            text-align: center;
            speak: never;
        }`);
                }
                for (const [src, ids] of imgs) {
                    const url = String(src).replace(/\\/g, "/").replace(/"/g, "%22");
                    parts.push(`${docRefSels(ids, "::before")} {
            content: "";
            width: 1.05em;
            height: 1.05em;
            vertical-align: -0.18em;
            background: url("${url}") center / contain no-repeat;
        }`);
                }
                for (const [svgId, ids] of svgs) {
                    const uri = svgSymbolDataUri(svgId);
                    if (!uri) {
                        const glyph = defaultDocGlyph();
                        parts.push(`${docRefSels(ids, "::before")} {
            content: ${cssContent(glyph)};
            font-weight: 400;
            font-family: var(--b3-font-family-emoji);
            line-height: 1;
            text-align: center;
            speak: never;
        }`);
                        continue;
                    }
                    parts.push(`${docRefSels(ids, "::before")} {
            content: "";
            width: 1.05em;
            height: 1.05em;
            background-color: currentColor;
            background-image: none;
            -webkit-mask: ${uri} center / contain no-repeat;
            mask: ${uri} center / contain no-repeat;
            -webkit-mask-mode: alpha;
            mask-mode: alpha;
        }`);
                }
                el.textContent = parts.join("\n");
            };

            const stripDocRefPollution = (span) => {
                let textChanged = false;
                span.style.removeProperty("--starter-doc-ref-glyph");
                span.style.removeProperty("--starter-doc-ref-img");
                if (span.getAttribute("style") === "") {
                    span.removeAttribute("style");
                }
                span.classList.remove(...DOC_REF_CLASSES);
                const cleanText = (node) => {
                    if (!node || node.nodeType !== Node.TEXT_NODE) {
                        return;
                    }
                    const next = node.textContent.replace(DOC_REF_LEAK_RE, "");
                    if (next !== node.textContent) {
                        node.textContent = next;
                        textChanged = true;
                    }
                };
                span.childNodes.forEach(cleanText);
                cleanText(span.nextSibling);
                return textChanged;
            };

            const refreshDocRefs = async () => {
                const spans = collectDocRefSpans();
                if (!spans.length && !docRefPainted.size) {
                    return;
                }
                docRefCleaning = true;
                const dirtyHosts = new Set();
                try {
                    for (const span of spans) {
                        if (stripDocRefPollution(span)) {
                            const host = span.closest(".protyle-wysiwyg");
                            if (host) {
                                dirtyHosts.add(host);
                            }
                        }
                    }
                    dirtyHosts.forEach((host) => {
                        host.dispatchEvent(new InputEvent("input", {bubbles: true, cancelable: true}));
                    });
                } finally {
                    requestAnimationFrame(() => {
                        docRefCleaning = false;
                    });
                }
                let sheetDirty = false;
                const needApi = [];
                for (const span of spans) {
                    const id = span.getAttribute("data-id");
                    const tree = metaFromFileTree(id);
                    if (tree) {
                        docRefCache.set(id, tree);
                    }
                    const meta = tree || docRefCache.get(id);
                    if (meta) {
                        if (rememberDocRef(id, meta)) {
                            sheetDirty = true;
                        }
                    } else {
                        needApi.push(id);
                    }
                }
                if (sheetDirty) {
                    renderDocRefSheet();
                }
                if (!needApi.length) {
                    return;
                }
                const ids = [...new Set(needApi)];
                await Promise.all(ids.map((id) => loadDocRefMeta(id)));
                let afterDirty = false;
                for (const id of ids) {
                    const meta = docRefCache.get(id);
                    if (meta && rememberDocRef(id, meta)) {
                        afterDirty = true;
                    }
                }
                if (afterDirty) {
                    renderDocRefSheet();
                }
            };

            const scheduleDocRefs = () => {
                if (docRefCleaning || docRefTimer) {
                    return;
                }
                docRefTimer = requestAnimationFrame(() => {
                    docRefTimer = 0;
                    refreshDocRefs();
                });
            };

            const patchListedIconsFromCache = (ids) => {
                const iconOf = (id) => {
                    const meta = docRefCache.get(id);
                    if (!meta || !meta.isDoc) {
                        return null;
                    }
                    return String(meta.icon || "");
                };
                let changed = false;
                const bump = (arr) =>
                    arr.map((d) => {
                        const icon = iconOf(d.id);
                        if (icon === null || d.icon === icon) {
                            return d;
                        }
                        changed = true;
                        return {...d, icon};
                    });
                const favoriteDocs = bump(config.favoriteDocs);
                const recentDocs = bump(config.recentDocs);
                if (changed) {
                    saveConfigToFile({favoriteDocs, recentDocs});
                }
            };

            const onDocIconsChanged = (ids, opts) => {
                const unique = [...new Set((ids || []).filter(Boolean))];
                if (!unique.length) {
                    return;
                }
                unique.forEach((id) => {
                    docRefCache.delete(id);
                    docRefInflight.delete(id);
                });
                const forceApi = !!opts?.forceApi;
                if (forceApi) {
                    unique.forEach((id) => docRefPainted.delete(id));
                    Promise.all(unique.map((id) => loadDocRefMeta(id, {forceApi: true}))).then(() => {
                        if (config.customDocRefStyle !== false) {
                            let dirty = false;
                            unique.forEach((id) => {
                                const meta = docRefCache.get(id);
                                if (meta && rememberDocRef(id, meta)) {
                                    dirty = true;
                                }
                            });
                            if (dirty) {
                                renderDocRefSheet();
                            }
                        }
                        patchListedIconsFromCache(unique);
                        applyRecentDocs();
                        applyFavoriteDocs();
                    });
                    return;
                }
                if (config.customDocRefStyle !== false) {
                    scheduleDocRefs();
                }
                applyRecentDocs();
                applyFavoriteDocs();
            };

            let docIconWatchObs = null;
            let docIconWatchRaf = 0;
            let docIconWatchRetry = 0;
            let docIconWatchTries = 0;
            const docIconWatchIds = new Set();

            const flushDocIconWatch = () => {
                docIconWatchRaf = 0;
                const ids = [...docIconWatchIds];
                docIconWatchIds.clear();
                onDocIconsChanged(ids);
            };

            const queueDocIconId = (id) => {
                if (!id) {
                    return;
                }
                docIconWatchIds.add(id);
                if (!docIconWatchRaf) {
                    docIconWatchRaf = requestAnimationFrame(flushDocIconWatch);
                }
            };

            const startDocIconWatch = () => {
                if (docIconWatchObs) {
                    return;
                }
                const host = document.querySelector("#layouts .sy__file");
                if (!host) {
                    if (docIconWatchTries >= 40) {
                        return;
                    }
                    if (!docIconWatchRetry) {
                        docIconWatchTries += 1;
                        docIconWatchRetry = setTimeout(() => {
                            docIconWatchRetry = 0;
                            startDocIconWatch();
                        }, 400);
                    }
                    return;
                }
                docIconWatchTries = 0;
                if (docIconWatchRetry) {
                    clearTimeout(docIconWatchRetry);
                    docIconWatchRetry = 0;
                }
                docIconWatchObs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        const el = m.target instanceof Element ? m.target : m.target.parentElement;
                        const li = el?.closest?.("#layouts .sy__file ul[data-url] .b3-list-item[data-node-id]");
                        if (!li) {
                            continue;
                        }
                        if (m.type === "attributes" && m.attributeName === "data-default-icon") {
                            queueDocIconId(li.getAttribute("data-node-id"));
                            continue;
                        }
                        if (el?.closest?.(".b3-list-item__icon")) {
                            queueDocIconId(li.getAttribute("data-node-id"));
                        }
                    }
                });
                docIconWatchObs.observe(host, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ["data-default-icon", "src", "href", "xlink:href"],
                });
            };

            const stopDocIconWatch = () => {
                docIconWatchObs?.disconnect();
                docIconWatchObs = null;
                if (docIconWatchRetry) {
                    clearTimeout(docIconWatchRetry);
                    docIconWatchRetry = 0;
                }
                docIconWatchTries = 0;
                if (docIconWatchRaf) {
                    cancelAnimationFrame(docIconWatchRaf);
                    docIconWatchRaf = 0;
                }
                docIconWatchIds.clear();
            };

            const startDocRefs = () => {
                if (docRefStarted) {
                    refreshDocRefs();
                    return;
                }
                docRefStarted = true;
                document.addEventListener("loaded-protyle-static", scheduleDocRefs);
                document.addEventListener("switch-protyle", scheduleDocRefs);
                const host = document.querySelector("#layouts .layout__center") || document.body;
                docRefObs = new MutationObserver(scheduleDocRefs);
                docRefObs.observe(host, {childList: true, subtree: true});
                startDocIconWatch();
                refreshDocRefs();
            };

            const stopDocRefs = () => {
                document.removeEventListener("loaded-protyle-static", scheduleDocRefs);
                document.removeEventListener("switch-protyle", scheduleDocRefs);
                docRefObs?.disconnect();
                docRefObs = null;
                if (docRefTimer) {
                    cancelAnimationFrame(docRefTimer);
                    docRefTimer = 0;
                }
                document.getElementById(DOC_REF_STYLE_ID)?.remove();
                document.querySelectorAll(DOC_REF_SEL).forEach((el) => {
                    if (!(el instanceof HTMLElement)) {
                        return;
                    }
                    el.classList.remove(...DOC_REF_CLASSES);
                    el.style.removeProperty("--starter-doc-ref-glyph");
                    el.style.removeProperty("--starter-doc-ref-img");
                    if (el.getAttribute("style") === "") {
                        el.removeAttribute("style");
                    }
                });
                docRefCache.clear();
                docRefInflight.clear();
                docRefPainted.clear();
                docRefStarted = false;
            };

            applyDocRefFeature = () => {
                const on = config.customDocRefStyle !== false;
                document.documentElement.classList.toggle("starter-custom-doc-ref", on);
                if (on) {
                    startDocRefs();
                } else {
                    stopDocRefs();
                }
            };

            const FILE_TREE_SEL = "#layouts .sy__file";
            let fileTreeObs = null;
            let fileTreeRaf = 0;

            const expandFileTreeNotebooks = () => {
                document.querySelectorAll(`${FILE_TREE_SEL} ul[data-url] > li[data-type="navigation-root"]`).forEach((li) => {
                    const arrow = li.querySelector(":scope > .b3-list-item__toggle .b3-list-item__arrow");
                    if (arrow && !arrow.classList.contains("b3-list-item__arrow--open")) {
                        li.querySelector(":scope > .b3-list-item__toggle")?.click();
                    }
                });
            };

            const refreshHideNotebooks = () => {
                if (!document.documentElement.classList.contains("starter-hide-notebook")) {
                    return;
                }
                expandFileTreeNotebooks();
            };

            const scheduleHideNotebooks = () => {
                if (fileTreeRaf) {
                    return;
                }
                fileTreeRaf = requestAnimationFrame(() => {
                    fileTreeRaf = 0;
                    refreshHideNotebooks();
                });
            };

            const startHideNotebooks = () => {
                if (!fileTreeObs) {
                    const host = document.querySelector("#layouts") || document.body;
                    fileTreeObs = new MutationObserver((mutations) => {
                        for (const m of mutations) {
                            const t = m.target;
                            if (t instanceof Element && t.closest(".sy__file")) {
                                scheduleHideNotebooks();
                                return;
                            }
                            for (const n of m.addedNodes) {
                                if (
                                    n.nodeType === 1 &&
                                    (n.classList?.contains("sy__file") || n.querySelector?.(".sy__file"))
                                ) {
                                    scheduleHideNotebooks();
                                    return;
                                }
                            }
                        }
                    });
                    fileTreeObs.observe(host, {childList: true, subtree: true});
                }
                expandFileTreeNotebooks();
            };

            const stopHideNotebooks = () => {
                fileTreeObs?.disconnect();
                fileTreeObs = null;
                if (fileTreeRaf) {
                    cancelAnimationFrame(fileTreeRaf);
                    fileTreeRaf = 0;
                }
            };

            applyHideNotebooks = () => {
                const on = config.hideNotebooks === true;
                document.documentElement.classList.toggle("starter-hide-notebook", on);
                if (on) {
                    startHideNotebooks();
                } else {
                    stopHideNotebooks();
                }
            };

            const RECENT_HOST_CLASS = "starter-recent-docs";
            const FAV_HOST_CLASS = "starter-fav-docs";
            const FAV_BTN_CLASS = "starter-fav-btn";
            const SCROLL_CLASS = "starter-file-scroll";
            const STAR_SVG =
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.1l3.25 6.58 7.26.8-5.48 5.07 1.54 7.23L12 17.2 5.43 20.78l1.54-7.23L1.49 8.48l7.26-.8L12 1.1z"/></svg>';
            const TREE_TOGGLE_SPACE =
                '<span class="b3-list-item__toggle"><svg class="b3-list-item__arrow fn__hidden"><use xlink:href="#iconRight"></use></svg></span>';
            const isRecentShown = () => config.showRecentDocs !== false;
            const isFavShown = () => config.showFavoriteDocs !== false;
            const getRecentMax = () => (isRecentShown() ? clampListMax(config.recentDocsMax) : 0);
            const getFavMax = () => (isFavShown() ? clampListMax(config.favoriteDocsMax) : 0);

            const isClosedNotebookList = (el, fileEl) =>
                el === fileEl.lastElementChild &&
                el.tagName === "UL" &&
                el.classList.contains("b3-list") &&
                !el.getAttribute("data-url");

            const ensureFileScroll = (fileEl) => {
                const icons = fileEl.querySelector(":scope > .block__icons");
                if (!icons) {
                    return fileEl.querySelector(`:scope > .${SCROLL_CLASS}`);
                }
                let scroll = fileEl.querySelector(`:scope > .${SCROLL_CLASS}`);
                if (!scroll) {
                    if (!icons.nextElementSibling) {
                        return null;
                    }
                    const toMove = [];
                    for (let el = icons.nextElementSibling; el; el = el.nextElementSibling) {
                        if (el.classList.contains(SCROLL_CLASS) || isClosedNotebookList(el, fileEl)) {
                            break;
                        }
                        toMove.push(el);
                    }
                    scroll = document.createElement("div");
                    scroll.className = SCROLL_CLASS;
                    icons.insertAdjacentElement("afterend", scroll);
                    toMove.forEach((el) => scroll.appendChild(el));
                }
                const stray = [];
                for (let el = scroll.nextElementSibling; el; el = el.nextElementSibling) {
                    if (isClosedNotebookList(el, fileEl) || el.classList.contains(SCROLL_CLASS)) {
                        break;
                    }
                    stray.push(el);
                }
                stray.forEach((el) => scroll.appendChild(el));
                return scroll;
            };

            const unwrapFileScroll = () => {
                document.querySelectorAll(`#layouts .sy__file > .${SCROLL_CLASS}`).forEach((scroll) => {
                    const parent = scroll.parentElement;
                    if (!parent) {
                        scroll.remove();
                        return;
                    }
                    while (scroll.firstChild) {
                        parent.insertBefore(scroll.firstChild, scroll);
                    }
                    scroll.remove();
                });
            };

            const isTreeChild = (el) =>
                el &&
                !el.classList.contains(FAV_HOST_CLASS) &&
                !el.classList.contains(RECENT_HOST_CLASS) &&
                !el.classList.contains(SCROLL_CLASS);
            let recentRecordTimer = 0;
            let recentMountObs = null;
            let recentStarted = false;
            let recentCollapsed = false;
            let recentRenderKey = "";

            const getActiveDocId = () => {
                const title =
                    document.querySelector(
                        "#layouts .layout__center .layout__wnd--active .protyle:not(.fn__none) .protyle-title"
                    ) || document.querySelector("#layouts .layout__center .protyle:not(.fn__none) .protyle-title");
                const fromTitle = title?.getAttribute("data-node-id") || "";
                if (fromTitle) {
                    return fromTitle;
                }
                const tab =
                    document.querySelector(
                        "#layouts .layout__center .layout__wnd--active .layout-tab-bar .item--focus:not(.item--readonly)"
                    ) ||
                    document.querySelector("#layouts .layout__center .layout-tab-bar .item--focus:not(.item--readonly)");
                const raw = tab?.getAttribute("data-initdata");
                if (!raw) {
                    return "";
                }
                try {
                    const data = JSON.parse(raw);
                    return data.rootId || data.rootID || "";
                } catch (err) {
                    return "";
                }
            };

            let listNavSource = "";
            let listNavId = "";
            let listNavGuardUntil = 0;
            let treeFocusObs = null;
            let treeFocusHost = null;
            const snapshotFileScroll = () =>
                [...document.querySelectorAll(`#layouts .sy__file .${SCROLL_CLASS}`)].map((el) => el.scrollTop);
            const restoreFileScroll = (tops) => {
                document.querySelectorAll(`#layouts .sy__file .${SCROLL_CLASS}`).forEach((el, i) => {
                    if (typeof tops[i] === "number") {
                        el.scrollTop = tops[i];
                    }
                });
            };
            const clearOfficialTreeFocus = () => {
                document
                    .querySelectorAll(`#layouts .sy__file ul[data-url] .b3-list-item--focus`)
                    .forEach((el) => el.classList.remove("b3-list-item--focus"));
            };
            const sidebarCurrentId = (source) =>
                listNavSource === source ? listNavId : "";
            const unpinSidebarLists = () => {
                listNavSource = "";
                listNavId = "";
                paintSidebarCurrent();
            };
            const paintSidebarCurrent = () => {
                const favId = sidebarCurrentId("fav");
                const recentId = sidebarCurrentId("recent");
                document.querySelectorAll("#layouts .sy__file [data-starter-fav-doc]").forEach((li) => {
                    const on = !!(favId && li.getAttribute("data-node-id") === favId);
                    li.classList.toggle("starter-fav-docs__item--current", on);
                    li.classList.toggle("b3-list-item--focus", on);
                });
                document.querySelectorAll("#layouts .sy__file [data-starter-recent-doc]").forEach((li) => {
                    const on = !!(recentId && li.getAttribute("data-node-id") === recentId);
                    li.classList.toggle("starter-recent-docs__item--current", on);
                    li.classList.toggle("b3-list-item--focus", on);
                });
            };
            const holdSidebarNav = (tops) => {
                const source = listNavSource;
                const id = listNavId;
                const run = () => {
                    if (listNavSource !== source || listNavId !== id) {
                        return;
                    }
                    restoreFileScroll(tops);
                    clearOfficialTreeFocus();
                    paintSidebarCurrent();
                };
                run();
                requestAnimationFrame(run);
                [40, 120, 280, 500].forEach((ms) => setTimeout(run, ms));
            };
            const pinSidebarNav = (source, id) => {
                if (!id) {
                    return;
                }
                listNavSource = source;
                listNavId = id;
                listNavGuardUntil = Date.now() + 1000;
                paintSidebarCurrent();
                clearOfficialTreeFocus();
                const tops = snapshotFileScroll();
                openDocById(id);
                holdSidebarNav(tops);
            };
            const releaseSidebarNavIfStale = (activeId) => {
                if (listNavSource !== "fav" && listNavSource !== "recent") {
                    return;
                }
                if (Date.now() < listNavGuardUntil) {
                    return;
                }
                if (activeId && activeId !== listNavId) {
                    unpinSidebarLists();
                }
            };
            const startTreeFocusGuard = () => {
                const host = document.querySelector("#layouts .sy__file") || document.body;
                if (treeFocusObs && treeFocusHost === host) {
                    return;
                }
                treeFocusObs?.disconnect();
                treeFocusHost = host;
                treeFocusObs = new MutationObserver((mutations) => {
                    if (listNavSource === "fav" || listNavSource === "recent") {
                        clearOfficialTreeFocus();
                    }
                    const listed = new Set([
                        ...config.favoriteDocs.map((d) => d.id),
                        ...config.recentDocs.map((d) => d.id),
                    ]);
                    if (!listed.size) {
                        return;
                    }
                    for (const m of mutations) {
                        if (m.type !== "childList") {
                            continue;
                        }
                        for (const n of m.removedNodes) {
                            if (!(n instanceof Element)) {
                                continue;
                            }
                            if (n.closest?.(".starter-fav-docs, .starter-recent-docs")) {
                                continue;
                            }
                            const hit =
                                (n.matches?.("li.b3-list-item[data-node-id]") &&
                                    listed.has(n.getAttribute("data-node-id"))) ||
                                [...(n.querySelectorAll?.("li.b3-list-item[data-node-id]") || [])].some((li) =>
                                    listed.has(li.getAttribute("data-node-id"))
                                );
                            if (hit) {
                                scheduleSweepMissingListedDocs();
                                return;
                            }
                        }
                    }
                });
                treeFocusObs.observe(host, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeFilter: ["class"],
                });
            };
            const stopTreeFocusGuard = () => {
                treeFocusObs?.disconnect();
                treeFocusObs = null;
                treeFocusHost = null;
                listNavSource = "";
                listNavId = "";
            };

            const snapshotDoc = (id, hintEl) => {
                const titleEl =
                    hintEl?.querySelector?.(".protyle-title") ||
                    document.querySelector(`#layouts .layout__center .protyle-title[data-node-id="${id}"]`);
                const name = titleEl?.querySelector(".protyle-title__input")?.textContent?.trim() || "";
                const hintName = hintEl?.querySelector?.(":scope > .b3-list-item__text")?.textContent?.trim() || "";
                const treeLi = officialTreeItem(id);
                const treeName = treeLi?.querySelector(":scope > .b3-list-item__text")?.textContent?.trim() || "";
                const tree = metaFromFileTree(id);
                const known =
                    config.favoriteDocs.find((d) => d.id === id) || config.recentDocs.find((d) => d.id === id);
                const rawIcon = tree ? tree.icon || "" : known?.icon || "";
                return {
                    id,
                    title: name || hintName || treeName || known?.title || "",
                    icon: useSvgDefaultIcon() && !tree && isStockFileGlyph(rawIcon) ? "" : rawIcon,
                };
            };

            const paintForListedDoc = (item) => {
                const tree = item?.id ? metaFromFileTree(item.id) : null;
                if (tree) {
                    return metaToPaint(tree);
                }
                const icon = (item?.icon || "").trim();
                return metaToPaint({
                    isDoc: true,
                    icon: useSvgDefaultIcon() && isStockFileGlyph(icon) ? "" : icon,
                });
            };

            const listedIconKey = (item) => {
                const paint = paintForListedDoc(item);
                if (paint.kind === "svg") {
                    return `svg:${paint.svgId || ""}`;
                }
                if (paint.kind === "img") {
                    return `img:${paint.src || ""}`;
                }
                return `g:${paint.glyph || ""}`;
            };

            const recentIconInner = (item) => {
                const paint = paintForListedDoc(item);
                if (paint.kind === "img" && paint.src) {
                    return `<img src="${escapeHtml(paint.src)}" alt="">`;
                }
                if (paint.kind === "svg" && paint.svgId) {
                    return svgUseHTML(paint.svgId);
                }
                return escapeHtml(paint.glyph || defaultDocGlyph());
            };

            const removeRecentHosts = () => {
                document.querySelectorAll(`#layouts .sy__file .${RECENT_HOST_CLASS}`).forEach((el) => el.remove());
                recentRenderKey = "";
            };

            const onRecentHostClick = (e) => {
                const host = e.currentTarget;
                const from = e.target instanceof Element ? e.target : e.target?.parentElement;
                const toggle = from?.closest?.("[data-starter-recent='toggle']");
                if (toggle && host.contains(toggle)) {
                    e.preventDefault();
                    e.stopPropagation();
                    recentCollapsed = !host.classList.contains("starter-recent-docs--collapsed");
                    host.classList.toggle("starter-recent-docs--collapsed", recentCollapsed);
                    host.querySelector(".starter-recent-docs__head .b3-list-item__arrow")
                        ?.classList.toggle("b3-list-item__arrow--open", !recentCollapsed);
                    return;
                }
                const item = from?.closest?.("[data-starter-recent-doc]");
                if (!item || !host.contains(item)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                pinSidebarNav("recent", item.getAttribute("data-node-id"));
            };

            const ensureRecentHost = (fileEl) => {
                const scroll = ensureFileScroll(fileEl);
                if (!scroll) {
                    return null;
                }
                let host = scroll.querySelector(`:scope > .${RECENT_HOST_CLASS}`);
                if (host) {
                    return host;
                }
                host = document.createElement("div");
                host.className = RECENT_HOST_CLASS;
                host.innerHTML = `<div class="b3-list-item starter-recent-docs__head" data-starter-recent="toggle">
          <span class="b3-list-item__toggle">
            <svg class="b3-list-item__arrow b3-list-item__arrow--open"><use xlink:href="#iconRight"></use></svg>
          </span>
          <span class="b3-list-item__text">最近打开</span>
        </div>
        <ul class="b3-list b3-list--background starter-recent-docs__list"></ul>`;
                host.addEventListener("click", onRecentHostClick);
                const fav = scroll.querySelector(`:scope > .${FAV_HOST_CLASS}`);
                const tree = [...scroll.children].find(isTreeChild);
                if (fav) {
                    fav.insertAdjacentElement("afterend", host);
                } else if (tree) {
                    scroll.insertBefore(host, tree);
                } else {
                    scroll.appendChild(host);
                }
                return host;
            };

            const renderRecentHosts = (items) => {
                const max = getRecentMax();
                if (max <= 0 || !items.length) {
                    removeRecentHosts();
                    return;
                }
                const currentId = sidebarCurrentId("recent");
                const shown = items.slice(0, max);
                const key = `${max}|${recentCollapsed ? 1 : 0}|${currentId}|${shown
                    .map((d) => `${d.id || ""}\t${d.title || ""}\t${listedIconKey(d)}`)
                    .join("|")}`;
                const files = document.querySelectorAll(FILE_TREE_SEL);
                if (!files.length) {
                    return;
                }
                files.forEach((fileEl) => {
                    const host = ensureRecentHost(fileEl);
                    if (!host) {
                        return;
                    }
                    host.classList.toggle("starter-recent-docs--collapsed", recentCollapsed);
                    const arrow = host.querySelector(".starter-recent-docs__head .b3-list-item__arrow");
                    arrow?.classList.toggle("b3-list-item__arrow--open", !recentCollapsed);
                    const list = host.querySelector(".starter-recent-docs__list");
                    if (!list) {
                        return;
                    }
                    if (key === recentRenderKey && list.childElementCount) {
                        list.querySelectorAll("[data-starter-recent-doc]").forEach((li) => {
                            li.classList.toggle(
                                "starter-recent-docs__item--current",
                                li.getAttribute("data-node-id") === currentId
                            );
                            li.classList.toggle("b3-list-item--focus", li.getAttribute("data-node-id") === currentId);
                        });
                        return;
                    }
                    list.innerHTML = shown
                        .map((item) => {
                            const id = item.id || "";
                            const title = item.title || "无标题";
                            const current = id && id === currentId ? " starter-recent-docs__item--current b3-list-item--focus" : "";
                            return `<li class="b3-list-item${current}" data-node-id="${escapeHtml(id)}" data-starter-recent-doc>
          ${TREE_TOGGLE_SPACE}
          <span class="b3-list-item__icon">${recentIconInner(item)}</span>
          <span class="b3-list-item__text">${escapeHtml(title)}</span>
        </li>`;
                        })
                        .join("");
                });
                recentRenderKey = key;
            };

            const renderStoredRecentDocs = () => {
                renderRecentHosts(config.recentDocs);
            };

            const recordRecentDocById = async (id, hintEl) => {
                const persistMax = clampListMax(config.recentDocsMax);
                if (persistMax <= 0) {
                    renderStoredRecentDocs();
                    return;
                }
                if (!id) {
                    renderStoredRecentDocs();
                    return;
                }
                if (!(await docStillExists(id))) {
                    dropListedDocsByIds([id]);
                    return;
                }
                const item = snapshotDoc(id, hintEl);
                const prev = config.recentDocs[0];
                if (
                    prev?.id === item.id &&
                    prev.title === item.title &&
                    prev.icon === item.icon &&
                    config.recentDocs.length <= persistMax
                ) {
                    renderStoredRecentDocs();
                    return;
                }
                const next = [item, ...config.recentDocs.filter((d) => d.id !== id)].slice(0, persistMax);
                const save = saveConfigToFile({recentDocs: next});
                renderStoredRecentDocs();
                await save;
            };

            const recordRecentDoc = () => recordRecentDocById(getActiveDocId());

            let pendingRecordId = "";
            let pendingRecordHint = null;
            let listedDocSweepTimer = 0;

            const dropListedDocsByIds = (ids) => {
                const gone = new Set((ids || []).filter(isBlockId));
                if (!gone.size) {
                    return;
                }
                if (pendingRecordId && gone.has(pendingRecordId)) {
                    pendingRecordId = "";
                    pendingRecordHint = null;
                    if (recentRecordTimer) {
                        clearTimeout(recentRecordTimer);
                        recentRecordTimer = 0;
                    }
                }
                if (listNavId && gone.has(listNavId)) {
                    unpinSidebarLists();
                }
                const favNext = config.favoriteDocs.filter((d) => !gone.has(d.id));
                const recentNext = config.recentDocs.filter((d) => !gone.has(d.id));
                const favChanged = favNext.length !== config.favoriteDocs.length;
                const recentChanged = recentNext.length !== config.recentDocs.length;
                if (!favChanged && !recentChanged) {
                    return;
                }
                const patch = {};
                if (favChanged) {
                    patch.favoriteDocs = favNext;
                }
                if (recentChanged) {
                    patch.recentDocs = recentNext;
                }
                saveConfigToFile(patch);
                if (recentChanged) {
                    renderStoredRecentDocs();
                }
                if (favChanged) {
                    applyFavoriteDocs();
                    syncFavButtons();
                }
            };

            const sweepMissingListedDocs = async () => {
                const ids = [
                    ...new Set([
                        ...config.favoriteDocs.map((d) => d.id),
                        ...config.recentDocs.map((d) => d.id),
                    ]),
                ].filter(isBlockId);
                if (!ids.length) {
                    return;
                }
                const checks = await Promise.all(ids.map(async (id) => [id, await docStillExists(id)]));
                dropListedDocsByIds(checks.filter(([, ok]) => !ok).map(([id]) => id));
            };

            const scheduleSweepMissingListedDocs = () => {
                if (listedDocSweepTimer) {
                    clearTimeout(listedDocSweepTimer);
                }
                listedDocSweepTimer = setTimeout(() => {
                    listedDocSweepTimer = 0;
                    sweepMissingListedDocs();
                }, 400);
            };

            const onKernelWsMain = (e) => {
                handleKernelPush(e?.detail && typeof e.detail === "object" ? e.detail : e);
            };

            const collectUpdatedIconIds = (msg) => {
                const ids = [];
                const visitOp = (op) => {
                    if (!op || op.action !== "updateAttrs") {
                        return;
                    }
                    const data = op.data && typeof op.data === "object" ? op.data : {};
                    const next = data.new && typeof data.new === "object" ? data.new : data;
                    const prev = data.old && typeof data.old === "object" ? data.old : {};
                    if (!Object.prototype.hasOwnProperty.call(next, "icon") && !Object.prototype.hasOwnProperty.call(prev, "icon")) {
                        return;
                    }
                    if (String(next.icon || "") === String(prev.icon || "") && "icon" in next && "icon" in prev) {
                        return;
                    }
                    if (op.id) {
                        ids.push(op.id);
                    }
                };
                if (msg.cmd === "transactions" && Array.isArray(msg.data)) {
                    msg.data.forEach((tx) => {
                        (tx?.doOperations || []).forEach(visitOp);
                    });
                }
                if ((msg.cmd === "setBlockAttrs" || msg.cmd === "updateAttrs") && msg.data) {
                    const attrs = msg.data.attrs || msg.data.new || msg.data;
                    if (attrs && typeof attrs === "object" && Object.prototype.hasOwnProperty.call(attrs, "icon") && msg.data.id) {
                        ids.push(msg.data.id);
                    }
                    visitOp(msg.data);
                }
                return ids;
            };

            const handleKernelPush = (msg) => {
                if (!msg || typeof msg !== "object") {
                    return;
                }
                const cmd = msg.cmd;
                if (cmd === "removeDoc" || cmd === "removeDocs") {
                    dropListedDocsByIds(collectRemoveDocIds(msg.data));
                    scheduleSweepMissingListedDocs();
                    return;
                }
                if (cmd === "unmount" || cmd === "removeNotebook" || cmd === "removeBox") {
                    scheduleSweepMissingListedDocs();
                    return;
                }
                const iconIds = collectUpdatedIconIds(msg);
                if (iconIds.length) {
                    onDocIconsChanged(iconIds, {forceApi: true});
                }
            };

            const onMainWsMessage = (event) => {
                let msg = event?.data;
                if (typeof msg === "string") {
                    try {
                        msg = JSON.parse(msg);
                    } catch (err) {
                        return;
                    }
                }
                handleKernelPush(msg);
            };

            let mainWsHooked = null;
            let mainWsPoll = 0;
            const hookMainWs = () => {
                const sock = window.siyuan?.ws?.ws;
                if (!sock || sock === mainWsHooked) {
                    return;
                }
                mainWsHooked?.removeEventListener?.("message", onMainWsMessage);
                mainWsHooked = sock;
                sock.addEventListener("message", onMainWsMessage);
            };
            const unhookMainWs = () => {
                mainWsHooked?.removeEventListener?.("message", onMainWsMessage);
                mainWsHooked = null;
                if (mainWsPoll) {
                    clearInterval(mainWsPoll);
                    mainWsPoll = 0;
                }
            };

            let nativeFetch = null;
            const hookFiletreeFetch = () => {
                if (nativeFetch || typeof window.fetch !== "function") {
                    return;
                }
                nativeFetch = window.fetch.bind(window);
                window.fetch = (input, init) => {
                    const req = nativeFetch(input, init);
                    try {
                        const url = typeof input === "string" ? input : input?.url || "";
                        if (/\/api\/filetree\/removeDoc/i.test(url)) {
                            let payload = {};
                            try {
                                if (typeof init?.body === "string") {
                                    payload = JSON.parse(init.body);
                                }
                            } catch (err) {
                                payload = {};
                            }
                            dropListedDocsByIds(collectRemoveDocIds(payload));
                            scheduleSweepMissingListedDocs();
                        }
                    } catch (err) {
                        /* ignore */
                    }
                    return req;
                };
            };
            const unhookFiletreeFetch = () => {
                if (nativeFetch) {
                    window.fetch = nativeFetch;
                    nativeFetch = null;
                }
            };

            let recentRenderTimer = 0;
            let recentPollTimer = 0;
            const scheduleRecord = (id, hintEl) => {
                if (id) {
                    pendingRecordId = id;
                    pendingRecordHint = hintEl || null;
                }
                if (recentRecordTimer) {
                    clearTimeout(recentRecordTimer);
                }
                recentRecordTimer = setTimeout(() => {
                    recentRecordTimer = 0;
                    const recId = pendingRecordId || getActiveDocId();
                    const hint = pendingRecordHint;
                    pendingRecordId = "";
                    pendingRecordHint = null;
                    recordRecentDocById(recId, hint);
                }, 150);
            };

            const scheduleRecentDocs = (record) => {
                if (record) {
                    scheduleRecord("", null);
                    return;
                }
                if (recentRenderTimer) {
                    clearTimeout(recentRenderTimer);
                }
                recentRenderTimer = setTimeout(() => {
                    recentRenderTimer = 0;
                    renderStoredRecentDocs();
                }, 80);
            };

            const onProtyleRecentDocs = (e) => {
                const protyle = e?.detail?.protyle;
                const id = protyle?.block?.rootID || protyle?.options?.blockId || "";
                scheduleRecord(id, protyle?.element);
            };

            const getSiyuanPlugins = () => {
                const list = window.siyuan?.ws?.app?.plugins || window.siyuan?.app?.plugins;
                return Array.isArray(list) ? list : [];
            };

            const recentBusBinds = [];
            let recentBusPoll = 0;
            let recentCustomBus = null;
            const bindPluginBuses = () => {
                hookMainWs();
                const register = window.siyuan?.registerCustomEventBus;
                if (!recentCustomBus && typeof register === "function") {
                    try {
                        recentCustomBus = register("cursorart-recent");
                        recentCustomBus?.on?.("switch-protyle", onProtyleRecentDocs);
                        recentCustomBus?.on?.("loaded-protyle-static", onProtyleRecentDocs);
                        recentCustomBus?.on?.("ws-main", onKernelWsMain);
                    } catch (err) {
                        recentCustomBus = null;
                    }
                }
                getSiyuanPlugins().forEach((p) => {
                    if (!p?.eventBus?.on || recentBusBinds.some((b) => b.bus === p.eventBus)) {
                        return;
                    }
                    p.eventBus.on("switch-protyle", onProtyleRecentDocs);
                    p.eventBus.on("loaded-protyle-static", onProtyleRecentDocs);
                    p.eventBus.on("ws-main", onKernelWsMain);
                    recentBusBinds.push({bus: p.eventBus});
                });
            };
            const unbindPluginBuses = () => {
                recentBusBinds.forEach(({bus}) => {
                    bus.off?.("switch-protyle", onProtyleRecentDocs);
                    bus.off?.("loaded-protyle-static", onProtyleRecentDocs);
                    bus.off?.("ws-main", onKernelWsMain);
                });
                recentBusBinds.length = 0;
                recentCustomBus?.off?.("switch-protyle", onProtyleRecentDocs);
                recentCustomBus?.off?.("loaded-protyle-static", onProtyleRecentDocs);
                recentCustomBus?.off?.("ws-main", onKernelWsMain);
                recentCustomBus = null;
                if (recentBusPoll) {
                    clearInterval(recentBusPoll);
                    recentBusPoll = 0;
                }
            };

            const tabRootId = (tab) => {
                const raw = tab?.getAttribute?.("data-initdata");
                if (!raw) {
                    return "";
                }
                try {
                    const data = JSON.parse(raw);
                    return data.rootId || data.rootID || "";
                } catch (err) {
                    return "";
                }
            };

            const onRecentOpenPointer = (e) => {
                const from = e.target instanceof Element ? e.target : e.target?.parentElement;
                if (!from) {
                    return;
                }
                if (from.closest?.(".b3-list-item__action")) {
                    return;
                }
                const treeToggle = from.closest?.(".b3-list-item__toggle");
                if (
                    treeToggle &&
                    !from.closest?.("[data-starter-recent-doc], [data-starter-fav-doc]")
                ) {
                    return;
                }
                const docLi = from.closest?.(
                    "[data-starter-recent-doc], [data-starter-fav-doc], #layouts .sy__file ul[data-url] .b3-list-item"
                );
                if (docLi) {
                    const id = docLi.getAttribute("data-node-id");
                    if (docLi.hasAttribute("data-starter-fav-doc") || docLi.hasAttribute("data-starter-recent-doc")) {
                        /* 打开由列表 click 处理；此处只记最近 */
                    } else {
                        unpinSidebarLists();
                    }
                    if (id) {
                        scheduleRecord(id, docLi);
                    }
                    return;
                }
                const tab = from.closest?.("#layouts .layout-tab-bar .item:not(.item--readonly)");
                if (tab) {
                    unpinSidebarLists();
                    scheduleRecord(tabRootId(tab), null);
                }
            };

            const onRecentActiveMut = (mutations) => {
                for (const m of mutations) {
                    if (m.type === "childList") {
                        for (const n of m.addedNodes) {
                            if (
                                n.nodeType === 1 &&
                                (n.classList?.contains("protyle") ||
                                    n.classList?.contains("protyle-title") ||
                                    n.querySelector?.(".protyle-title, .protyle"))
                            ) {
                                scheduleRecentDocs(true);
                                return;
                            }
                        }
                        continue;
                    }
                    const t = m.target;
                    if (!(t instanceof Element)) {
                        continue;
                    }
                    if (m.attributeName === "data-node-id" && t.classList.contains("protyle-title")) {
                        scheduleRecentDocs(true);
                        return;
                    }
                    if (m.attributeName === "class") {
                        if (
                            t.classList.contains("protyle") ||
                            t.classList.contains("layout__wnd") ||
                            (t.classList.contains("item") && t.closest(".layout-tab-bar"))
                        ) {
                            scheduleRecentDocs(true);
                            return;
                        }
                    }
                }
            };

            let recentActiveObs = null;
            const attachRecentActiveObs = () => {
                if (recentActiveObs) {
                    return true;
                }
                const center = document.querySelector("#layouts .layout__center");
                if (!center) {
                    return false;
                }
                recentActiveObs = new MutationObserver(onRecentActiveMut);
                recentActiveObs.observe(center, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeFilter: ["class", "data-node-id"],
                });
                return true;
            };

            const startRecentDocs = () => {
                if (recentStarted) {
                    return;
                }
                recentStarted = true;
                startTreeFocusGuard();
                hookMainWs();
                if (!mainWsPoll) {
                    mainWsPoll = setInterval(hookMainWs, 1000);
                }
                hookFiletreeFetch();
                document.addEventListener("loaded-protyle-static", onProtyleRecentDocs);
                document.addEventListener("switch-protyle", onProtyleRecentDocs);
                document.addEventListener("pointerdown", onRecentOpenPointer, true);
                bindPluginBuses();
                recentBusPoll = setInterval(bindPluginBuses, 1000);
                setTimeout(() => {
                    if (recentBusPoll) {
                        clearInterval(recentBusPoll);
                        recentBusPoll = 0;
                    }
                }, 12000);
                attachRecentActiveObs();
                recentPollTimer = setInterval(() => {
                    if (!attachRecentActiveObs()) {
                        return;
                    }
                    const id = getActiveDocId();
                    releaseSidebarNavIfStale(id);
                    if (id && id !== config.recentDocs[0]?.id) {
                        scheduleRecord(id, null);
                    }
                }, 400);
                const host = document.querySelector("#layouts") || document.body;
                recentMountObs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const n of m.addedNodes) {
                            if (
                                n.nodeType === 1 &&
                                (n.classList?.contains("sy__file") || n.querySelector?.(".sy__file"))
                            ) {
                                startTreeFocusGuard();
                                scheduleRecentDocs(false);
                                return;
                            }
                        }
                    }
                });
                recentMountObs.observe(host, {childList: true, subtree: true});
                scheduleRecentDocs(true);
                scheduleSweepMissingListedDocs();
            };

            const stopRecentDocs = () => {
                recentStarted = false;
                document.removeEventListener("loaded-protyle-static", onProtyleRecentDocs);
                document.removeEventListener("switch-protyle", onProtyleRecentDocs);
                document.removeEventListener("pointerdown", onRecentOpenPointer, true);
                unbindPluginBuses();
                unhookMainWs();
                unhookFiletreeFetch();
                recentActiveObs?.disconnect();
                recentActiveObs = null;
                recentMountObs?.disconnect();
                recentMountObs = null;
                if (recentRecordTimer) {
                    clearTimeout(recentRecordTimer);
                    recentRecordTimer = 0;
                }
                if (recentRenderTimer) {
                    clearTimeout(recentRenderTimer);
                    recentRenderTimer = 0;
                }
                if (recentPollTimer) {
                    clearInterval(recentPollTimer);
                    recentPollTimer = 0;
                }
                if (listedDocSweepTimer) {
                    clearTimeout(listedDocSweepTimer);
                    listedDocSweepTimer = 0;
                }
                removeRecentHosts();
            };

            applyRecentDocs = () => {
                startRecentDocs();
                renderStoredRecentDocs();
            };

            const isFavDoc = (id) => !!(id && config.favoriteDocs.some((d) => d.id === id));

            const toggleFavoriteDoc = async (id, protyleEl) => {
                if (!id) {
                    return;
                }
                let next;
                if (isFavDoc(id)) {
                    next = config.favoriteDocs.filter((d) => d.id !== id);
                } else {
                    next = [snapshotDoc(id, protyleEl), ...config.favoriteDocs.filter((d) => d.id !== id)];
                }
                await saveConfigToFile({favoriteDocs: next});
                applyFavoriteDocs();
                syncFavButtons();
            };

            let favCollapsed = false;
            let favListExpanded = false;
            let favRenderKey = "";
            let favMountObs = null;
            let favStarted = false;

            const removeFavHosts = () => {
                document.querySelectorAll(`#layouts .sy__file .${FAV_HOST_CLASS}`).forEach((el) => el.remove());
                favRenderKey = "";
            };

            const onFavHostClick = (e) => {
                const host = e.currentTarget;
                const from = e.target instanceof Element ? e.target : e.target?.parentElement;
                const unfav = from?.closest?.("[data-starter-unfav]");
                if (unfav && host.contains(unfav)) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavoriteDoc(unfav.closest("[data-starter-fav-doc]")?.getAttribute("data-node-id") || "");
                    return;
                }
                const more = from?.closest?.("[data-starter-fav='more']");
                if (more && host.contains(more)) {
                    e.preventDefault();
                    e.stopPropagation();
                    favListExpanded = !favListExpanded;
                    renderFavHosts(config.favoriteDocs);
                    return;
                }
                const toggle = from?.closest?.("[data-starter-fav='toggle']");
                if (toggle && host.contains(toggle)) {
                    e.preventDefault();
                    e.stopPropagation();
                    favCollapsed = !host.classList.contains("starter-fav-docs--collapsed");
                    host.classList.toggle("starter-fav-docs--collapsed", favCollapsed);
                    host.querySelector(".starter-fav-docs__head .b3-list-item__arrow")
                        ?.classList.toggle("b3-list-item__arrow--open", !favCollapsed);
                    return;
                }
                const item = from?.closest?.("[data-starter-fav-doc]");
                if (!item || !host.contains(item)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                pinSidebarNav("fav", item.getAttribute("data-node-id"));
            };

            const ensureFavHost = (fileEl) => {
                const scroll = ensureFileScroll(fileEl);
                if (!scroll) {
                    return null;
                }
                let host = scroll.querySelector(`:scope > .${FAV_HOST_CLASS}`);
                if (host) {
                    return host;
                }
                host = document.createElement("div");
                host.className = FAV_HOST_CLASS;
                host.innerHTML = `<div class="b3-list-item starter-fav-docs__head" data-starter-fav="toggle">
          <span class="b3-list-item__toggle">
            <svg class="b3-list-item__arrow b3-list-item__arrow--open"><use xlink:href="#iconRight"></use></svg>
          </span>
          <span class="b3-list-item__text">收藏</span>
        </div>
        <ul class="b3-list b3-list--background starter-fav-docs__list"></ul>`;
                host.addEventListener("click", onFavHostClick);
                const recent = scroll.querySelector(`:scope > .${RECENT_HOST_CLASS}`);
                if (recent) {
                    scroll.insertBefore(host, recent);
                } else {
                    const tree = [...scroll.children].find(isTreeChild);
                    if (tree) {
                        scroll.insertBefore(host, tree);
                    } else {
                        scroll.appendChild(host);
                    }
                }
                return host;
            };

            const renderFavHosts = (items) => {
                const max = getFavMax();
                if (max <= 0 || !items.length) {
                    removeFavHosts();
                    return;
                }
                const currentId = sidebarCurrentId("fav");
                const hidden = Math.max(0, items.length - max);
                if (hidden === 0) {
                    favListExpanded = false;
                }
                const shown = favListExpanded ? items : items.slice(0, max);
                const key = `${max}|${favCollapsed ? 1 : 0}|${favListExpanded ? 1 : 0}|${currentId}|${items
                    .map((d) => `${d.id}\t${d.title || ""}\t${listedIconKey(d)}`)
                    .join("|")}`;
                const files = document.querySelectorAll(FILE_TREE_SEL);
                if (!files.length) {
                    return;
                }
                files.forEach((fileEl) => {
                    const host = ensureFavHost(fileEl);
                    if (!host) {
                        return;
                    }
                    host.classList.toggle("starter-fav-docs--collapsed", favCollapsed);
                    host.querySelector(".starter-fav-docs__head .b3-list-item__arrow")
                        ?.classList.toggle("b3-list-item__arrow--open", !favCollapsed);
                    const list = host.querySelector(".starter-fav-docs__list");
                    if (!list) {
                        return;
                    }
                    if (key === favRenderKey && list.childElementCount) {
                        list.querySelectorAll("[data-starter-fav-doc]").forEach((li) => {
                            const on = li.getAttribute("data-node-id") === currentId;
                            li.classList.toggle("starter-fav-docs__item--current", on);
                            li.classList.toggle("b3-list-item--focus", on);
                        });
                        return;
                    }
                    const rows = shown.map((item) => {
                        const id = item.id || "";
                        const title = item.title || "无标题";
                        const current = id && id === currentId ? " starter-fav-docs__item--current b3-list-item--focus" : "";
                        return `<li class="b3-list-item b3-list-item--hide-action${current}" data-node-id="${escapeHtml(id)}" data-starter-fav-doc>
          ${TREE_TOGGLE_SPACE}
          <span class="b3-list-item__icon">${recentIconInner(item)}</span>
          <span class="b3-list-item__text">${escapeHtml(title)}</span>
          <span class="b3-list-item__action ariaLabel" data-starter-unfav aria-label="取消收藏">
            <svg><use xlink:href="#iconClose"></use></svg>
          </span>
        </li>`;
                    });
                    if (hidden > 0) {
                        const label = favListExpanded ? "折叠" : `更多（${hidden}）`;
                        rows.push(
                            `<li class="b3-list-item starter-fav-docs__more" data-starter-fav="more">
          ${TREE_TOGGLE_SPACE}
          <span class="b3-list-item__text">${label}</span>
        </li>`
                        );
                    }
                    list.innerHTML = rows.join("");
                });
                favRenderKey = key;
            };

            const onFavBtnClick = (e) => {
                const from = e.target instanceof Element ? e.target : e.target?.parentElement;
                const btn = from?.closest?.("[data-starter-fav='1']");
                if (!btn || !btn.closest("#layouts .layout__center .protyle-breadcrumb")) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                toggleFavoriteDoc(btn.getAttribute("data-starter-doc-id") || "", btn.closest(".protyle"));
            };

            const placeFavButton = (host, btn) => {
                const locate = host.querySelector(':scope > [data-type="fhelper-locate-in-tree"]');
                const lock = host.querySelector(':scope > [data-type="readonly"]');
                const space = host.querySelector(":scope > .protyle-breadcrumb__space");
                const anchor = locate || lock;
                if (anchor) {
                    if (btn.nextElementSibling !== anchor) {
                        anchor.insertAdjacentElement("beforebegin", btn);
                    }
                    return;
                }
                if (space && space.nextElementSibling !== btn) {
                    space.insertAdjacentElement("afterend", btn);
                }
            };

            syncFavButtons = () => {
                document.querySelectorAll("#layouts .layout__center .protyle-breadcrumb").forEach((host) => {
                    const protyleEl = host.closest(".protyle");
                    const id = protyleEl?.querySelector(".protyle-title")?.getAttribute("data-node-id") || "";
                    let btn = host.querySelector(`:scope > .${FAV_BTN_CLASS}`);
                    if (!btn) {
                        btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = `block__icon fn__flex-center ariaLabel ${FAV_BTN_CLASS}`;
                        btn.setAttribute("data-starter-fav", "1");
                        btn.innerHTML = STAR_SVG;
                    }
                    placeFavButton(host, btn);
                    const on = isFavDoc(id);
                    btn.classList.toggle("starter-fav-btn--on", on);
                    btn.setAttribute("data-starter-doc-id", id);
                    btn.setAttribute("aria-label", on ? "取消收藏" : "收藏");
                });
            };

            const startFavoriteDocs = () => {
                if (favStarted) {
                    return;
                }
                favStarted = true;
                startTreeFocusGuard();
                document.addEventListener("click", onFavBtnClick, true);
                document.addEventListener("loaded-protyle-static", syncFavButtons);
                document.addEventListener("switch-protyle", syncFavButtons);
                const layout = document.querySelector("#layouts") || document.body;
                favMountObs = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const n of m.addedNodes) {
                            if (
                                n.nodeType === 1 &&
                                (n.classList?.contains("sy__file") || n.querySelector?.(".sy__file"))
                            ) {
                                startTreeFocusGuard();
                                applyFavoriteDocs();
                                return;
                            }
                        }
                    }
                });
                favMountObs.observe(layout, {childList: true, subtree: true});
            };

            const stopFavoriteDocs = () => {
                favStarted = false;
                document.removeEventListener("click", onFavBtnClick, true);
                document.removeEventListener("loaded-protyle-static", syncFavButtons);
                document.removeEventListener("switch-protyle", syncFavButtons);
                favMountObs?.disconnect();
                favMountObs = null;
                removeFavHosts();
                document.querySelectorAll(`.${FAV_BTN_CLASS}`).forEach((el) => el.remove());
                unwrapFileScroll();
            };

            applyFavoriteDocs = () => {
                startFavoriteDocs();
                renderFavHosts(config.favoriteDocs);
                syncFavButtons();
            };

            applySvgDefaultIcons = () => {
                refreshOfficialDefaultTreeIcons();
                docRefCache.clear();
                docRefPainted.clear();
                applyRecentDocs();
                applyFavoriteDocs();
                applyDocRefFeature();
            };

            applyStyleFeatures = () => {
                const root = document.documentElement;
                root.classList.toggle("starter-plain-table-head", config.plainTableHead !== false);
                root.classList.toggle("starter-hide-tab-new", config.hideTabNewDoc === true);
                root.classList.toggle("starter-hide-tab-more", config.hideTabSwitch === true);
                root.classList.add("starter-block-line-height");
                root.style.setProperty("--starter-block-line-height", String(config.blockLineHeight));
            };

            const tryMount = async () => {
                await initConfig();
                await seedOfficialDefaultsIfNeeded();
                ensureSettingStyles();
                ensureFeatureStyles();
                if (pluginHost) {
                    await installEditorFeatures(pluginHost);
                }
                startThemeWatch();
                applyHiddenDockTypes();
                startOutlineFollow();
                startPathBreadcrumb();
                applyDocRefFeature();
                applyStyleFeatures();
                applyHideNotebooks();
                applyRecentDocs();
                applyFavoriteDocs();
                startDocIconWatch();
                const okDocks = !isCursorArtTheme() || config.dockInContent === false || mountAllDocks();
                const okToggles = mountToggles();
                const okHeart = mountDonateHeart();
                if (okDocks && okToggles && okHeart) {
                    return;
                }
                const obs = new MutationObserver(() => {
                    applyHiddenDockTypes();
                    schedulePathBars();
                    startDocIconWatch();
                    if (isCursorArtTheme() && config.dockInContent !== false) {
                        mountAllDocks();
                    }
                    const t = mountToggles();
                    const h = mountDonateHeart();
                    const d =
                        !isCursorArtTheme() ||
                        config.dockInContent === false ||
                        document.getElementById("dockLeft")?.dataset?.starterMounted === "1";
                    if (d && t && h && docIconWatchObs) {
                        obs.disconnect();
                    }
                });
                obs.observe(document.body, {childList: true, subtree: true});
                setTimeout(() => obs.disconnect(), 15000);
            };

            document.addEventListener("click", rememberDockClick, true);
            document.addEventListener("click", suppressActiveDockCollapse, false);

            window.destroyTheme = async () => {
                document.removeEventListener("click", rememberDockClick, true);
                document.removeEventListener("click", suppressActiveDockCollapse, false);
                stopThemeWatch();
                layoutFeaturesOn = false;
                document.documentElement.classList.remove(
                    "starter-adaptive-topbar",
                    "starter-default-topbar",
                    "starter-custom-doc-ref",
                    "starter-plain-table-head",
                    "starter-block-line-height",
                    "starter-hide-notebook",
                    "starter-hide-tab-new",
                    "starter-hide-tab-more"
                );
                document.documentElement.style.removeProperty("--starter-block-line-height");
                stopOutlineFollow();
                stopPathBreadcrumb();
                stopHideNotebooks();
                stopRecentDocs();
                stopFavoriteDocs();
                stopTreeFocusGuard();
                stopDocIconWatch();
                stopDocRefs();
                closeSettingsDialog();
                document.getElementById(HIDE_STYLE_ID)?.remove();
                document.getElementById(SETTINGS_STYLE_ID)?.remove();
                document.getElementById(FEATURE_STYLE_ID)?.remove();
                unmountDonateHeart();
                unmountToggles();
                sides.forEach(unmountOne);
                if (pluginHost) {
                    uninstallEditorFeatures(pluginHost);
                }
            };

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", tryMount, {once: true});
            } else {
                tryMount();
            }
        })();

    }

    async onunload() {
        try {
            uninstallEditorFeatures(this);
            if (typeof window.destroyTheme === "function") {
                await window.destroyTheme();
            }
        } finally {
            delete window.destroyTheme;
            delete window.__cursorArtToolsPlugin;
            window.__cursorArtToolsLoaded = false;
        }
    }
};
