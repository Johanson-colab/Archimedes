// Deterministic real-component Electron evidence for Writing source-conflict recovery.
// Usage: node scripts/capture-paper-writing-conflict.mjs before|after
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
const baselineCommit = "2b82dc95";
const output = path.join(root, "docs/assets/display-preference-review-fixes");
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-writing-conflict-ui-"));
const source = name => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before"
  ? ["PaperWritingView.tsx", "paper-writing-workspace.css"].map(name => [path.join(root, "src", name), execFileSync("git", ["show", `${baselineCommit}:src/${name}`], { cwd: root, encoding: "utf8" }).replaceAll("PanelLeftOpen", "ArrowRight").replaceAll("PanelLeftClose", "ArrowLeft")])
  : []);
const baselineSource = id => baseline.get(String(id).split("?")[0]);

fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import PaperWritingView from ${source("PaperWritingView.tsx")};
import { UISettingsProvider } from ${source("i18n.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import ${source("tokens.css")};
import ${source("styles.css")};
import ${source("typography.css")};

const still = document.createElement('style');
still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
localStorage.setItem('archimedes-language', 'en');
applyAppearance(document.documentElement, normalizeAppearance({ preset: 'paper' }), 'paper');
document.body.className = 'theme-paper';

const initial = '\\\\documentclass{article}\\n\\\\begin{document}\\nOriginal manuscript.\\n\\\\end{document}\\n';
const local = '\\\\documentclass{article}\\n\\\\begin{document}\\nLocal draft preserved after conflict.\\n\\\\end{document}\\n';
const external = '\\\\documentclass{article}\\n\\\\begin{document}\\nExternal editor version.\\n\\\\end{document}\\n';
window.fixtureLocal = local;
window.fixtureExternal = external;
window.fixtureFiles = new Map([
  ['paper/main.tex', initial],
  ['paper/section.tex', 'A supporting section.\\n'],
]);
window.fixtureWrites = [];
const preview = name => ({ name: name.split('/').at(-1), path: name, kind: 'text', size: window.fixtureFiles.get(name).length, modifiedAt: '2026-11-28T00:00:00.000Z', content: window.fixtureFiles.get(name) });
const bridge = {
  listLatexProjects: async () => [{ path: 'paper/main.tex', title: 'Measured manuscript', main: true }],
  listWorkspaceFiles: async (_workspace, directory) => ({ entries: directory === 'paper' ? [
    { name: 'main.tex', path: 'paper/main.tex', type: 'file' },
    { name: 'section.tex', path: 'paper/section.tex', type: 'file' },
  ] : [], count: directory === 'paper' ? 2 : 0, truncated: false }),
  readWorkspaceFile: async (_workspace, name) => preview(name),
  writeWorkspaceFile: async (_workspace, name, content, expected) => {
    window.fixtureWrites.push({ name, expected });
    if (expected !== undefined && window.fixtureFiles.get(name) !== expected) throw new Error('The source changed on disk. Your draft is still open.');
    window.fixtureFiles.set(name, content);
    return preview(name);
  },
  compileLatexDocument: async () => ({ ok: true, engine: 'fixture', source_path: 'paper/main.tex', pdf_path: '', duration_ms: 1, diagnostics: [], log: 'Fixture build' }),
  onLatexCompileProgress: () => () => {},
  openExternalUrl: async () => {},
};
createRoot(document.getElementById('root')).render(
  <UISettingsProvider>
    <PaperWritingView bridge={bridge} workspace="/fixture/workspace" projectId="fixture-project" threadId="fixture-thread" openRequest={{ path: 'paper/main.tex', token: 1 }} onRefresh={() => {}} onAskAI={() => {}} />
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
    plugins: [{ name: "writing-baseline", enforce: "pre", load: id => baselineSource(id) }],
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
  const evaluate = (fn, argument) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(argument)})`);
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const errors = [];
    win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(() => Boolean(document.querySelector('[aria-label="Edit paper/main.tex"]')))) break;
      await pause(50);
    }
    assert.ok(await evaluate(() => Boolean(document.querySelector('[aria-label="Edit paper/main.tex"]'))), "Writing source did not open");
    await evaluate(() => {
      const checkbox = document.querySelector('.paper-auto-compile input');
      if (checkbox.checked) checkbox.click();
    });
    await evaluate(() => {
      const input = document.querySelector('[aria-label="Edit paper/main.tex"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, window.fixtureLocal);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.fixtureFiles.set('paper/main.tex', window.fixtureExternal);
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(() => document.querySelector('.latex-diagnostics')?.textContent.includes('The source changed on disk'))) break;
      await pause(50);
    }
    const conflictState = await evaluate(() => ({
      diagnostics: document.querySelector('.latex-diagnostics')?.textContent || '',
      saveState: document.querySelector('.paper-save-state')?.textContent || '',
      draft: document.querySelector('[aria-label="Edit paper/main.tex"]')?.value || '',
      disk: window.fixtureFiles.get('paper/main.tex'),
      writes: window.fixtureWrites,
    }));
    console.log(JSON.stringify({ stage, conflictState }));
    assert.ok(conflictState.diagnostics.includes('The source changed on disk'), "source conflict did not appear");
    await pause(150);
    await evaluate(() => document.fonts.ready);
    win.showInactive();
    fs.writeFileSync(path.join(output, `conflict-${stage}.png`), (await win.webContents.capturePage()).toPNG());
    const conflict = await evaluate(() => ({
      draft: document.querySelector('[aria-label="Edit paper/main.tex"]').value.includes('Local draft preserved after conflict.'),
      disk: window.fixtureFiles.get('paper/main.tex').includes('External editor version.'),
      recoveryActions: [...document.querySelectorAll('button')].filter(button => button.textContent === 'Keep my draft').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(conflict.draft, true);
    assert.equal(conflict.disk, true);
    assert.equal(conflict.overflow, false);
    assert.equal(conflict.recoveryActions, stage === "after" ? 1 : 0);
    if (stage === "after") {
      await evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Keep my draft').click());
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(() => window.fixtureFiles.get('paper/main.tex').includes('Local draft preserved after conflict.') && document.querySelector('.paper-save-state')?.textContent === 'Saved')) break;
        await pause(50);
      }
      assert.ok(await evaluate(() => window.fixtureFiles.get('paper/main.tex').includes('Local draft preserved after conflict.') && document.querySelector('.paper-save-state')?.textContent === 'Saved'), "draft recovery did not finish");
      fs.writeFileSync(path.join(output, "conflict-recovered-after.png"), (await win.webContents.capturePage()).toPNG());
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, `${stage}-checks.json`), JSON.stringify({ stage, ...conflict, errors }, null, 2) + "\n");
    console.log(JSON.stringify({ stage, ...conflict, errors }));
    win.destroy();
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
