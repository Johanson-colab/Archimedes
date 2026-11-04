// Renders the Benchmark Radar workspace against the bundled public index so the
// seeded, configuration-free experience has committed screenshot evidence.
// Usage: node scripts/capture-benchmark-radar.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require = createRequire(import.meta.url);
const { readIndexFile, indexPayload } = require("../electron/benchmark-radar-index.cjs");
const electronBinary = require("electron");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "electron", "assets", "benchmark-radar", "public-index.json");
const output = path.join(root, "docs", "assets", "benchmark-radar-public-index");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-ui-"));
const seed = readIndexFile(seedPath);
if (!seed) throw new Error(`No bundled Benchmark Radar index at ${path.relative(root, seedPath)}. Run npm run radar:sync first.`);
const payload = indexPayload(seed, { source: "remote" });
fs.mkdirSync(output, { recursive: true });
const from = (file) => JSON.stringify(path.join(root, "src", file));

fs.writeFileSync(path.join(temporary, "payload.json"), JSON.stringify(payload));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="fixture-toolbar" style="display:flex;align-items:center;justify-content:flex-end;height:44px;padding:0 24px;border-bottom:1px solid var(--mono-border);background:var(--mono-surface)"><div id="module-toolbar-actions"></div></div><div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import {createRoot} from 'react-dom/client';
import BenchmarkRadarView from ${from("BenchmarkRadarView.tsx")};
import ${from("tokens.css")};
import ${from("styles.css")};
import ${from("typography.css")};
import payload from './payload.json';
(window as unknown as { researchDesk: unknown }).researchDesk = { getBenchmarkRadarData: async () => payload };
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') || 'paper';
createRoot(document.getElementById('root')!).render(<BenchmarkRadarView />);
`);

try {
  await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } },
    build: { outDir: path.join(temporary, "dist"), emptyOutDir: true, minify: false, chunkSizeWarningLimit: 4000 } });
  const runner = path.join(temporary, "capture.cjs");
  fs.writeFileSync(runner, `
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.commandLine.appendSwitch('disable-gpu');
app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  for (const theme of ['paper', 'charcoal']) {
    await win.loadFile(${JSON.stringify(path.join(temporary, "dist/index.html"))}, { query: { theme } });
    win.showInactive();
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      ready = await win.webContents.executeJavaScript("Boolean(document.querySelector('.benchmark-row')) || Boolean(document.querySelector('.benchmark-empty'))");
      if (ready) break;
    }
    if (!ready) throw new Error('Benchmark Radar fixture did not render');
    await new Promise(resolve => setTimeout(resolve, 800));
    const summary = await win.webContents.executeJavaScript("({ rows: document.querySelectorAll('.benchmark-row').length, note: document.querySelector('.module-toolbar-note')?.textContent || '', overflow: document.documentElement.scrollWidth > innerWidth })");
    fs.writeFileSync(${JSON.stringify(output)} + '/' + theme + '.png', (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelectorAll('.benchmark-tabs button')[1]?.click()");
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (await win.webContents.executeJavaScript("Boolean(document.querySelector('.benchmark-directions button'))")) break;
    }
    await new Promise(resolve => setTimeout(resolve, 600));
    const library = await win.webContents.executeJavaScript("({ directions: document.querySelectorAll('.benchmark-directions section h2').length, rows: document.querySelectorAll('.benchmark-row').length, overflow: document.documentElement.scrollWidth > innerWidth })");
    fs.writeFileSync(${JSON.stringify(output)} + '/library-' + theme + '.png', (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ theme, ...summary, library }));
  }
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
`);
  execFileSync(electronBinary, ["--js-flags=--max-old-space-size=512", runner], { cwd: root, stdio: "inherit", timeout: 120_000 });
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
