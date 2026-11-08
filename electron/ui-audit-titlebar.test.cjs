const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("Windows uses a hidden overlay title bar while macOS keeps inset traffic lights", () => {
  assert.match(main, /titleBarStyle: process\.platform === "darwin" \? "hiddenInset" : overlay \? "hidden" : undefined/);
  assert.match(main, /titleBarOverlay: overlay \? titleBarOverlay\(initialTheme\) : undefined/);
  assert.match(main, /function titleBarOverlay\(theme\)/);
  // The native caption buttons must match the 44px main toolbar, otherwise the
  // hover surface spills below it.
  assert.match(main, /height: 44/);
  assert.match(main, /color: dark \? "#141414" : "#fffdf8"/);
  assert.match(main, /window:set-titlebar-theme/);
});

test("the second native menu row is hidden on Windows and Linux", () => {
  assert.match(main, /autoHideMenuBar: process\.platform !== "darwin"/);
  assert.match(main, /if \(process\.platform !== "darwin"\) browserWindow\.setMenuBarVisibility\(false\)/);
  assert.match(main, /label: "File"[\s\S]*?label: "New Window"/);
  assert.match(main, /role: "editMenu"/);
  assert.match(main, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(template\)\)/);
});

test("renderer exposes platform and updates the title bar with the theme", () => {
  assert.match(preload, /platform: process\.platform/);
  assert.match(preload, /setTitleBarTheme: \(theme\) => ipcRenderer\.invoke\("window:set-titlebar-theme", theme\)/);
  assert.match(app, /document\.documentElement\.dataset\.titlebar = platform === "win32" \? "overlay"/);
  assert.match(app, /desktopBridge\.setTitleBarTheme/);
});

test("overlay title bar exposes drag regions and reserves native control space", () => {
  assert.match(css, /html\[data-titlebar="overlay"\] \.codex-brand \{[^}]*-webkit-app-region: drag/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.main-toolbar \{[^}]*-webkit-app-region: drag/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.main-toolbar button,[\s\S]*?-webkit-app-region: no-drag/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.codex-main:not\(\.workbench-open\) \.main-toolbar \{ padding-right: calc\(18px \+ 138px\)/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.right-workbench \.workbench-header \{ -webkit-app-region: drag/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.workbench-panes\.row > \.workbench-pane:last-child \.workbench-header,[\s\S]*?\.workbench-panes\.column > \.workbench-pane:first-child \.workbench-header \{ padding-right: 146px/);
});

test("macOS inset traffic lights get clearance and the chrome stays draggable", () => {
  assert.match(css, /html\[data-titlebar="inset"\] \.codex-sidebar \{ padding-top: 20px; \}/);
  assert.match(css, /html\[data-titlebar="inset"\] \.codex-brand,[\s\S]*?html\[data-titlebar="inset"\] \.main-toolbar,[\s\S]*?-webkit-app-region: drag/);
  assert.match(css, /html\[data-titlebar="inset"\] \.main-toolbar button,[\s\S]*?-webkit-app-region: no-drag/);
});
