// Captures the managed-compiler diagnostic in the Chinese Writing UI.
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
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-compiler-translation-"));
const output = path.join(root, "docs/assets/managed-compiler-translations");
fs.mkdirSync(output, { recursive: true });

const messages = [
  "The managed LaTeX compiler could not be prepared.",
  "Retry the download, or switch to the installed local compiler.",
];
const shard = stage === "before"
  ? execFileSync("git", ["show", `${baselineCommit}:src/i18n/translations/writing.ts`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src/i18n/translations/writing.ts"), "utf8");
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {AlertTriangle} from 'lucide-react';
import {UISettingsProvider,useUISettings} from ${source("i18n.tsx")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
localStorage.setItem('archimedes-language','zh');
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0}.latex-diagnostics{width:860px!important;max-width:none!important}.latex-diagnostics header,.latex-diagnostics button{display:block!important;white-space:normal!important;text-overflow:clip!important;overflow:visible!important}.latex-diagnostics button span{white-space:normal!important;text-overflow:clip!important;overflow:visible!important;display:block!important}'; document.head.append(still);
function Fixture(){
  const {t}=useUISettings();
  return <main className="codex-shell theme-paper" style={{padding:'16px',background:'var(--bg-app)'}}>
    <section className="latex-diagnostics"><header><AlertTriangle size={13}/><strong>Problems · 1</strong><span>Select a problem to jump to the source line.</span></header>
      <button type="button" className="active"><b>LaTeX</b><span>{t(${JSON.stringify(messages[0])})}{t(${JSON.stringify(messages[1])}) && <small className="latex-diagnostic-help">{t(${JSON.stringify(messages[1])})}</small>}</span></button>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture/></UISettingsProvider>);
`);
fs.writeFileSync(path.join(temporary, "shard.ts"), shard);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "writing-shard", enforce: "pre", load(id) { return id.endsWith("/src/i18n/translations/writing.ts") ? shard : null; } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage, messages }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 220, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 250));
    const text = await win.webContents.executeJavaScript("document.querySelector('.latex-diagnostics')?.innerText || ''");
    const geometry = { stage, viewport: [900, 220], text };
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(geometry, null, 2) + "\n");
    const translated = text.includes("无法准备托管的 LaTeX 编译器。") && text.includes("请重试下载，或改用已安装的本地编译器。");
    const passed = stage === "before" ? messages.every(message => text.includes(message)) && !translated : translated;
    console.log(JSON.stringify(geometry));
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, messages }) + ");");
console.log(JSON.stringify({ runner }));
