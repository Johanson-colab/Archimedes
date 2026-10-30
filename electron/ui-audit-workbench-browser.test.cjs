const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const tabs = read("src/workbench-tabs.tsx");
const settingsPanel = read("src/WorkbenchSettingsPanel.tsx");
const browser = read("src/BrowserView.tsx");
const css = read("src/styles.css");
const i18n = read("src/i18n.tsx");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");
const workbenchSettings = read("electron/workbench-settings.cjs");

test("Browser is an optional workbench tab that starts hidden", () => {
  assert.match(tabs, /id: "browser"/);
  assert.match(tabs, /optional: true/);
  assert.match(tabs, /OPTIONAL_WORKBENCH_TAB_IDS/);
  assert.match(tabs, /hidden: \[\.\.\.OPTIONAL_WORKBENCH_TAB_IDS\]/);
  assert.match(tabs, /WORKBENCH_PREFERENCES_VERSION = 2/);
  assert.match(tabs, /if \(version < WORKBENCH_PREFERENCES_VERSION\)/);
  assert.match(workbenchSettings, /OPTIONAL_TAB_IDS = \["browser"\]/);
  assert.match(workbenchSettings, /PREFERENCES_VERSION = 2/);
  assert.match(settingsPanel, /workbench-settings-tag/);
  assert.match(i18n, /"Optional": "可选"/);
  assert.match(read("src/RightWorkbench.tsx"), /!workbenchTabDefinition\(id\)\.optional/);
});

test("Browser panel is mounted only after its tab is opened", () => {
  assert.match(app, /import BrowserView from "\.\/BrowserView"/);
  assert.match(app, /browser: <BrowserView active=\{workbenchOpen && workbenchTab === "browser"\} onOpenExternal=/);
  assert.match(app, /openExternalUrl/);
  assert.match(bridge, /openExternalUrl: \(url: string\) => Promise<\{ opened: boolean \}>/);
  assert.match(preload, /app:open-external/);
  assert.match(main, /ipcMain\.handle\("app:open-external"/);
});

test("Browser loads one isolated https/http page without node access", () => {
  assert.match(browser, /BROWSER_PARTITION = "archimedes-browser"/);
  assert.match(browser, /createElement\("webview"\)/);
  assert.match(browser, /setAttribute\("partition", BROWSER_PARTITION\)/);
  assert.match(browser, /webpreferences", "contextIsolation=yes, sandbox=yes, nodeIntegration=no"/);
  assert.match(browser, /normalizeBrowserAddress/);
  assert.match(browser, /protocol !== "http:" && parsed\.protocol !== "https:"/);
  assert.match(browser, /Open in system browser/);
  assert.match(browser, /browser-empty/);
  assert.match(browser, /browser-error/);
  assert.match(main, /WORKBENCH_BROWSER_PARTITION = "archimedes-browser"/);
  assert.match(main, /function isWebPage/);
  assert.match(main, /const allowed = browserTab \? isWebPage\(params\.src\) : isEmbeddableProjectPage\(params\.src\)/);
});

test("Browser blocks permissions, downloads, and popups stay out of the app", () => {
  assert.match(main, /setPermissionRequestHandler\(\(_contents, _permission, callback\) => callback\(false\)\)/);
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(main, /session\.on\("will-download", \(event, item\) => \{[\s\S]*?event\.preventDefault\(\)[\s\S]*?const url = item\.getURL\(\)[\s\S]*?shell\.openExternal\(url\)/);
  assert.match(main, /if \(browserTab && isWebPage\(url\)\) void shell\.openExternal\(url\)/);
  assert.match(main, /if \(!\(browserTab \? isWebPage\(url\) : isEmbeddableProjectPage\(url\)\)\) event\.preventDefault\(\)/);
  assert.match(css, /\.browser-toolbar/);
  assert.match(css, /\.browser-page-host webview/);
});
