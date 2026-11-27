// Captures the PDF compile badge after a delayed autosave completes while Writing is inactive.
// Build first, then run the printed Electron runner to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw Error("Choose before or after.");
const baselineCommit = "979046f0";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-autosave-departure-"));
const output = path.join(root, "docs/assets/autosave-departure");
fs.mkdirSync(output, { recursive: true });

const source = stage === "before"
  ? execFileSync("git", ["show", `${baselineCommit}:src/PaperWritingView.tsx`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src/PaperWritingView.tsx"), "utf8");
const marker = "const timer = window.setTimeout(async () => {";
const begin = source.indexOf(marker) + marker.length;
const end = source.indexOf("\n    }, 750);", begin);
if (begin < 0 || end < begin) throw Error("Could not extract the autosave callback.");
const callback = new Function("saveWritingDocument", "compile", "mainPath", "owner", "currentDocument", "activeCompileContext", "autoCompile", "bridge", "refreshScope", `return (async () => {${source.slice(begin, end)}})();`);
let compiled = false;
await callback(
  async () => {},
  () => { compiled = true; },
  "paper/main.tex",
  { selectedPath: "paper/main.tex", mainPath: "paper/main.tex" },
  { file: { path: "paper/main.tex" } },
  { current: { active: false } },
  true,
  {},
  () => {},
);
const geometry = { stage, viewport: [900, 140], active: false, compiled };
fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(geometry, null, 2) + "\n");

const sourcePath = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import ${sourcePath("tokens.css")}; import ${sourcePath("styles.css")}; import ${sourcePath("typography.css")};
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0}.paper-pdf-pane{display:block!important;width:860px!important;height:100px!important;background:#f7f7f5!important}.paper-pane-toolbar{height:60px!important;gap:10px!important;font:13px system-ui!important;color:#5c625d!important;background:#f7f7f5!important}.paper-auto-compile{margin-left:auto!important;font-size:13px!important}.paper-compile-state{margin-left:0!important;font-size:13px!important;color:#35745d!important}.paper-compile-state.compiling{color:#9a7629!important}'; document.head.append(still);
createRoot(document.getElementById('root')).render(<main className="codex-shell theme-paper" style={{padding:'12px',background:'#fff'}}>
 <section className="paper-pdf-pane"><div className="paper-pane-toolbar"><strong>PDF preview</strong>
  <label className="paper-auto-compile"><input type="checkbox" checked readOnly />Auto compile</label>
  <span className={'paper-compile-state ' + (${compiled} ? 'compiling' : 'idle')}>${compiled ? 'Compiling…' : 'Not built'}</span>
 </div></section></main>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } }, build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 } });

function capture({ temporary, output, stage, geometry }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 140, show: false, webPreferences: { contextIsolation: true } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 200));
    const text = await win.webContents.executeJavaScript("document.querySelector('.paper-compile-state')?.textContent || ''");
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify({ ...geometry, badge: text }, null, 2) + "\n");
    console.log(JSON.stringify({ ...geometry, badge: text }));
    const passed = stage === "before" ? text === "Compiling…" : text === "Not built";
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, geometry }) + ");");
console.log(JSON.stringify({ runner }));
