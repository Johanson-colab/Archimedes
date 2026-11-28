// Credential-free Paper Writing fixture rendered by the real Electron shell.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const baselineCommit = "3b358265bd91c02f64eca9ccd2f37125300932c7";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-writing-conflict-"));
const output = path.join(root, "docs/assets/writing-conflict-recovery");
fs.mkdirSync(output, { recursive: true });
const baselineNames = ["PaperWritingView.tsx", "paper-writing-state.ts", "styles.css"];
const baseline = new Map(stage === "before"
  ? baselineNames.map(name => [path.join(root, "src", name), execFileSync("git", ["show", `${baselineCommit}:src/${name}`], { cwd: root, encoding: "utf8" })])
  : []);
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UISettingsProvider } from ${source("i18n.tsx")};
import PaperWritingView from ${source("PaperWritingView.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const params = new URLSearchParams(location.search);
const theme = params.get('theme') || 'paper';
localStorage.setItem('archimedes-language', 'en');
applyAppearance(document.documentElement, normalizeAppearance({ preset: theme }), theme);
const still = document.createElement('style');
still.textContent = 'html,body,#root{height:100%;margin:0}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
const workspace = '/fixture';
const main = 'paper/main.tex';
const original = '\\\\documentclass{article}\\n\\\\begin{document}\\nOriginal manuscript\\n\\\\end{document}\\n';
const files = new Map([[main, original]]);
let conflicted = false;
const preview = name => ({ name: name.split('/').at(-1), path: name, kind: 'text', size: files.get(name)?.length || 0, modifiedAt: 'now', content: files.get(name) || '' });
const bridge = {
  listLatexProjects: async () => [{ path: main, title: 'main', main: true }],
  listWorkspaceFiles: async () => ({ entries: [], count: 0, truncated: false }),
  readWorkspaceFile: async (_root, name) => preview(name),
  writeWorkspaceFile: async (_root, name, content) => {
    if (!conflicted) { conflicted = true; throw new Error('The source changed on disk. Your draft is still open.'); }
    files.set(name, content);
    return preview(name);
  },
  compileLatexDocument: async () => ({ ok: true, diagnostics: [], log: '', duration_ms: 1 }),
  onLatexCompileProgress: () => () => {},
  readManuscriptSnapshot: async () => ({ current: true }),
};
function Fixture() {
  return <PaperWritingView bridge={bridge} workspace={workspace} projectId="project-a" threadId="thread-a"
    openRequest={{ path: main, token: 1 }} onRefresh={() => {}} onAskAI={() => {}} />;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture /></UISettingsProvider>);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline", enforce: "pre", load(id) { return baseline.get(String(id).split("?")[0]); } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1180, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme: "paper" } });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await evaluate(() => Boolean(document.querySelector(".latex-editor-textarea")))) break;
      await pause(80);
    }
    await evaluate(() => {
      const input = document.querySelector(".latex-editor-textarea");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(input, "\\documentclass{article}\n\\begin{document}\nDraft kept after external edit\n\\end{document}\n");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let resolved = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      resolved = await evaluate(() => document.querySelector(".latex-diagnostics")?.textContent.includes("source changed on disk") || false);
      if (resolved) break;
      await pause(100);
    }
    const state = await evaluate(() => ({
      error: document.querySelector(".latex-diagnostics p")?.textContent.trim() || "",
      actions: [...document.querySelectorAll(".latex-diagnostics button")].map(node => node.textContent.trim()),
      draft: document.querySelector(".latex-editor-textarea")?.value || "",
    }));
    fs.writeFileSync(path.join(output, `${stage}-observations.json`), JSON.stringify(state, null, 2) + "\n");
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    win.destroy();
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* Electron may still release profile handles. */ }
    app.exit(resolved ? 0 : 1);
  }).catch(error => {
    console.error(error);
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* The temporary profile is safe to leave for cleanup. */ }
    app.exit(1);
  });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(runner);
