// Credential-free Extensions Sources dialog fixture rendered by the real Electron shell.
// Build first, then run the printed runner with Electron to capture the screenshot.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2] || "after";
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-extension-sources-"));
const output = path.join(root, "docs/assets/extension-source-credentials");
fs.mkdirSync(output, { recursive: true });
const source = (name) => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before"
  ? ["ExtensionsView.tsx", "styles.css"].map((name) => [path.join(root, "src", name).replaceAll("\\", "/"), execFileSync("git", ["show", `origin/main:src/${name}`], { cwd: root, encoding: "utf8" })])
  : []);
const baselineSource = (id) => baseline.get(String(id).split("?")[0].replaceAll("\\", "/"));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UISettingsProvider } from ${source("i18n.tsx")};
import ExtensionsView from ${source("ExtensionsView.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const still = document.createElement('style');
still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
localStorage.setItem('archimedes-language', 'en');
const theme = 'paper';
applyAppearance(document.documentElement, normalizeAppearance({ preset: theme }), theme);
const sources = [
  { id: 'archimedes', name: 'Archimedes index', type: 'archimedes', url: '', enabled: true, builtin: true, count: 10, total: 10, lastSync: new Date().toISOString(), error: '' },
  { id: 'lab', name: 'Research lab index', type: 'json', url: 'https://lab.example/feed', enabled: false, builtin: false, count: 0, total: 0, lastSync: '', error: '', hasToken: true },
];
const feed = { items: [], total: 0, sources, syncedAt: new Date().toISOString() };
const bridge = {
  listInstalledExtensions: async () => ({ skills: [], plugins: [] }),
  listExtensions: async () => structuredClone(feed),
  listExtensionSources: async () => structuredClone(sources),
  saveExtensionSources: async (items) => structuredClone(items),
  resetExtensionSources: async () => structuredClone(sources),
  previewExtension: async () => ({ id: '', filename: '', language: '', content: '', item: null }),
  readExtensionFile: async () => ({ content: '', language: '', truncated: false }),
  openExternalUrl: async () => {},
  installExtension: async () => ({}),
};
createRoot(document.getElementById('root')).render(
  <UISettingsProvider>
    <ExtensionsView bridge={bridge} workspace="/Users/researcher/Archimedes Demo" tab="available" onTabChange={() => {}} attachedIds={new Set()} onAttach={() => {}} />
  </UISettingsProvider>
);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline", enforce: "pre", load(id) { return baselineSource(id); } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    await win.loadFile(path.join(temporary, "dist/index.html"));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await evaluate(() => Boolean(document.querySelector('select[aria-label="Filter by source"]')))) break;
      await pause(60);
    }
    await evaluate(() => {
      const select = document.querySelector('select[aria-label="Filter by source"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, "__manage");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await evaluate(() => Boolean(document.querySelector(".extensions-source-entry")))) break;
      await pause(60);
    }
    await pause(200);
    const state = await evaluate(() => ({
      entries: document.querySelectorAll(".extensions-source-entry").length,
      rows: [...document.querySelectorAll(".extensions-source-row")].map((row) => Math.round(row.getBoundingClientRect().width)),
      tokenVisible: Boolean(document.querySelector(".extensions-source-token input")),
      tokenWidth: Math.round(document.querySelector(".extensions-source-token")?.getBoundingClientRect().width || 0),
      dialogWidth: Math.round(document.querySelector(".extensions-source-modal")?.getBoundingClientRect().width || 0),
      overflow: [...document.querySelectorAll(".extensions-source-row")].some((row) => row.scrollWidth > row.clientWidth),
    }));
    fs.writeFileSync(path.join(output, `sources-${stage}.png`), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify(state));
    win.destroy();
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* Electron may still release profile handles. */ }
    const passed = state.entries === 2 && !state.overflow && (stage === "before" || (state.tokenVisible && state.tokenWidth > 300));
    app.exit(passed ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* The temporary profile is safe to leave for cleanup. */ }
    app.exit(1);
  });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
