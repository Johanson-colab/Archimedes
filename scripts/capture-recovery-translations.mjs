// Captures recovery warnings in the Chinese Reproduce and Research Graph surfaces.
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
const baselineCommit = "6f56e993";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-recovery-translations-"));
const output = path.join(root, "docs/assets/recovery-translations");
fs.mkdirSync(output, { recursive: true });

const messages = [
  "Remote process status is unconfirmed after the app closed. Check the SSH host before running again.",
  "The app stopped while this was running. Start it again.",
  "A process with the saved PID is still present. Verify its identity before stopping or rerunning it.",
  "The run process is no longer available.",
];
const baseline = stage === "before" ? Object.fromEntries(["reproduce", "researchGraph"].map(name => {
  const file = `src/i18n/translations/${name}.ts`;
  return [path.join(root, file), execFileSync("git", ["show", `${baselineCommit}:${file}`], { cwd: root, encoding: "utf8" })];
})) : null;
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider,useUISettings} from ${source("i18n.tsx")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
localStorage.setItem('archimedes-language','zh');
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0;background:#fff}.fixture{width:860px;padding:16px;background:#fff}.fixture h3{font:600 14px system-ui;margin:0 0 8px}.reproduce-note{max-width:none!important;white-space:normal!important}.experiment-plan-row{display:block!important}.experiment-plan-row p{white-space:normal!important}'; document.head.append(still);
const messages=${JSON.stringify(messages)};
function Fixture(){
 const {t}=useUISettings();
 return <main className="codex-shell theme-paper fixture"><h3>Reproduce</h3>
  {messages.slice(0,2).map(message=><div className="reproduce-note bad" key={message}>{t(message)}</div>)}
  <h3 style={{marginTop:'18px'}}>Research Graph</h3>
  {messages.slice(2).map(message=><div className="experiment-plan-row" key={message}><span>Run error</span><p>{t(message)}</p></div>)}
 </main>;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture/></UISettingsProvider>);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline-shards", enforce: "pre", load(id) { return baseline?.[id] ?? null; } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage, messages }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 460, show: false, webPreferences: { contextIsolation: true } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 200));
    const text = await win.webContents.executeJavaScript("document.querySelector('.fixture').innerText");
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify({ stage, viewport: [900, 460], text }, null, 2) + "\n");
    console.log(JSON.stringify({ stage, text }));
    const translated = text.includes("无法确认远程进程状态") && text.includes("运行进程已不可用");
    const passed = stage === "before" ? messages.every(message => text.includes(message)) && !translated : translated;
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, messages }) + ");");
console.log(JSON.stringify({ runner }));
