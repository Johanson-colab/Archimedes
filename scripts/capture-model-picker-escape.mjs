// Captures the model picker after pressing Escape inside its search field.
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
const baselineCommit = "d1bb72d4";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-picker-escape-"));
const output = path.join(root, "docs/assets/model-picker-escape");
fs.mkdirSync(output, { recursive: true });

const pickerPath = path.join(root, "src/HarnessPicker.tsx");
const baseline = stage === "before" ? execFileSync("git", ["show", `${baselineCommit}:src/HarnessPicker.tsx`], { cwd: root, encoding: "utf8" }) : null;
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${source("i18n.tsx")};
import {ComposerModelPicker} from ${source("HarnessPicker.tsx")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
localStorage.setItem('archimedes-language','en');
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0;background:#fff!important;color:#222!important}.codex-shell{background:#fff!important;color:#222!important}.codex-shell p{color:#222!important}.harness-picker-trigger,.menu-item,.composer-model-search{font:13px system-ui!important}'; document.head.append(still);
const bridge={listCodexModelCatalog: async () => ({ models: Array.from({length:90},(_,i)=>({id:'model-'+i,label:'model-'+i})) })};
function Fixture(){
 const [value,setValue]=useState(undefined);
 return <UISettingsProvider><main className="codex-shell theme-paper" style={{padding:'16px',width:560,background:'var(--bg-app)'}}>
   <p style={{font:'13px system-ui',color:'#333'}}>Press Escape in the model search field</p>
   <ComposerModelPicker bridge={bridge} native={{backend:'codex',model:'current'}} workspace="/fixture" defaultModel="current" profiles={[]} value={value} disabled={false} bound={false} onChange={setValue} onSettings={()=>{}} />
 </main></UISettingsProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline-picker", enforce: "pre", load(id) { return baseline && id === pickerPath ? baseline : null; } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 520, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 200));
    const observe = () => win.webContents.executeJavaScript(`({
      menuOpen: Boolean(document.querySelector('[role="menu"]')),
      search: Boolean(document.querySelector('.composer-model-search'))
    })`);
    const evaluate = expression => win.webContents.executeJavaScript(expression);
    await evaluate(`document.querySelector('.harness-picker-trigger').click()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await evaluate(`[...document.querySelectorAll('.menu-item')].find(node => node.textContent.includes('Load agent models')).click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const before = await observe();
    await evaluate(`document.querySelector('.composer-model-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const after = await observe();
    const geometry = { stage, viewport: [900, 520], before, after };
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(geometry, null, 2) + "\n");
    console.log(JSON.stringify(geometry));
    const passed = before.search && (stage === "before" ? after.menuOpen : !after.menuOpen);
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
