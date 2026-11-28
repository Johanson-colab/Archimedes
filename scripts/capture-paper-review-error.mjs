// Deterministic real-component Electron evidence for localized Paper review errors.
// Usage: node scripts/capture-paper-review-error.mjs before|after
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const output = path.join(root, "docs/assets/model-paper-review-localization");
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-error-ui-"));
const source = name => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before"
  ? [["PaperReviewView.tsx", execFileSync("git", ["show", "origin/main:src/PaperReviewView.tsx"], { cwd: root, encoding: "utf8" })]].map(([name, text]) => [path.join(root, "src", name), text])
  : []);
const baselineSource = id => baseline.get(String(id).split("?")[0]);

fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import PaperReviewView from ${source("PaperReviewView.tsx")};
import { ConfirmProvider } from ${source("ConfirmDialog.tsx")};
import { UISettingsProvider } from ${source("i18n.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import ${source("tokens.css")};
import ${source("styles.css")};
import ${source("typography.css")};

const still = document.createElement('style');
still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
localStorage.setItem('archimedes-language', 'zh');
applyAppearance(document.documentElement, normalizeAppearance({ preset: 'paper' }), 'paper');
document.body.className = 'theme-paper';
const bridge = {
  getPaperReviewSettings: async () => { throw new Error('The review failed'); },
  listPaperReviewVenues: async () => [],
  listPaperReviewPapers: async () => [],
  listPaperReviewRuns: async () => [],
  getPaperReviewRun: async () => null,
  onPaperReviewProgress: () => () => {},
};
createRoot(document.getElementById('root')).render(
  <UISettingsProvider>
    <ConfirmProvider>
      <PaperReviewView bridge={bridge} workspace="/fixture/workspace" projectId={null} active />
    </ConfirmProvider>
  </UISettingsProvider>,
);
`);

try {
  await build({
    root: temporary,
    configFile: false,
    base: "./",
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: path.join(root, "node_modules/react"),
        "react-dom": path.join(root, "node_modules/react-dom"),
        "lucide-react": path.join(root, "node_modules/lucide-react"),
      },
    },
    plugins: [{ name: "paper-review-baseline", enforce: "pre", load: id => baselineSource(id) }],
    build: { outDir: path.join(temporary, "dist"), emptyOutDir: true, minify: false, chunkSizeWarningLimit: 4000 },
  });
  const runner = path.join(temporary, "capture.cjs");
  fs.writeFileSync(runner, `(${capture.toString()})(${JSON.stringify({ temporary, output, stage })});`);
  execFileSync(require("electron"), [runner], { cwd: root, stdio: "inherit", timeout: 120_000 });
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  const assert = require("node:assert/strict");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const errors = [];
    win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await win.webContents.executeJavaScript("Boolean(document.querySelector('.pra-notice.error'))")) break;
      await pause(50);
    }
    assert.ok(await win.webContents.executeJavaScript("Boolean(document.querySelector('.pra-notice.error'))"), "Paper review error did not appear");
    await pause(150);
    await win.webContents.executeJavaScript("document.fonts.ready");
    win.showInactive();
    fs.writeFileSync(path.join(output, `paper-review-error-${stage}.png`), (await win.webContents.capturePage()).toPNG());
    const state = await win.webContents.executeJavaScript(`(() => ({
      error: document.querySelector('.pra-notice.error')?.textContent || '',
      overflow: document.documentElement.scrollWidth > innerWidth,
    }))()`);
    assert.equal(state.error, stage === "after" ? "评审失败" : "The review failed");
    assert.equal(state.overflow, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, `${stage}-checks.json`), JSON.stringify({ stage, ...state, errors }, null, 2) + "\n");
    console.log(JSON.stringify({ stage, ...state, errors }));
    win.destroy();
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
