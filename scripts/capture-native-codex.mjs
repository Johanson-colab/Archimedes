// Isolated, credential-free component evidence. Never starts the desktop backend.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2] || "after";
const buildOnly = process.argv.includes("--build-only");
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-native-ui-"));
const output = path.join(root, "docs/assets/native-codex");
fs.mkdirSync(output, { recursive: true });
const from = (file) => JSON.stringify(path.join(root, "src", file));
const baseline = stage === "before" ? execFileSync("git", ["show", "4d894f2:src/AgentBackendSettings.tsx"], { cwd: root, encoding: "utf8" }) : null;
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${from("i18n.tsx")};
import Settings from ${from("AgentBackendSettings.tsx")};
import LegacyActivity from ${from("ChatActivityTimeline.tsx")};
import NativeActivity, {NativeContextUsage, NativeQuestionCard} from ${from("NativeAgentPanel.tsx")};
import ${from("tokens.css")};
import ${from("styles.css")};
import ${from("typography.css")};
const bridge = {getAgentBackendConfig: async()=>({backend:'codex',binary:'codex',model:'',effort:'',permissionMode:'read-only'}), saveAgentBackendConfig:async x=>x, checkAgentBackend:async()=>({ready:true,models:[],message:'Connected'})};
const activities = ['a','b'].map((id,i)=>({id,type:'native_activity',turn_id:'t',payload:{activity:{id,kind:'commandExecution',title:'Codex · commandExecution',detail:i?'cat README.md':'rg --files',status:'completed',output:i?'# Example research project\\nRun the focused tests before changing experiments.':'README.md\\nexperiments/baseline.py'}}}));
const events=[...activities,{id:'p',type:'native_plan',turn_id:'t',payload:{plan:{explanation:'Inspect the project before proposing changes.',steps:[{step:'Read project structure',status:'completed'},{step:'Explain the experiment workflow',status:'in_progress'}]}}},{id:'d',type:'native_diff',turn_id:'t',payload:{diff:'diff --git a/README.md b/README.md\\n+Document baseline evaluation.'}}];
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'paper';
createRoot(document.getElementById('root')).render(<UISettingsProvider><main style={{display:'grid',gridTemplateColumns:'600px 1fr',gap:32,padding:32,background:'var(--surface-ground)',color:'var(--text-primary)',minHeight:'100vh'}}>
<section><h2 style={{fontSize:18,marginBottom:20}}>Models · Agent backends</h2><Settings bridge={bridge}/></section>
<section style={{minWidth:0,padding:20,background:'var(--surface-canvas)',borderRadius:12}}><h2 style={{fontSize:18}}>Main Work</h2><p style={{marginTop:24,fontSize:14}}>Inspect this local project and explain the experiment workflow.</p>
${stage === "after" ? `<NativeActivity events={events} busy={false}/><NativeQuestionCard question={{id:'q1',questions:[{id:'target',header:'Experiment',question:'Which experiment should we inspect first?',options:[{label:'Baseline',description:'Start with the existing evaluation'}]}]}} onAnswer={async()=>{}}/><NativeContextUsage usage={{inputTokens:12000,cachedInputTokens:8000,outputTokens:1600,totalTokens:13600,modelContextWindow:272000}}/>` : `<LegacyActivity events={[]} rawEvents={[{id:'old',type:'tool_result',turn_id:'t',payload:{name:'codex:commandExecution',content:'README.md'}}]} busy={false} interrupting={false}/>`}
<p style={{marginTop:24,fontSize:14}}>This project contains a baseline experiment and evaluation instructions.</p></section></main></UISettingsProvider>);
`);
try {
  await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } },
    plugins: baseline ? [{ name: "baseline-settings", load(id) { if (id === path.join(root, "src/AgentBackendSettings.tsx")) return baseline; } }] : [],
    build: { outDir: path.join(temporary, "dist"), emptyOutDir: true, minify: false, chunkSizeWarningLimit: 2000 } });
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
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      ready = await win.webContents.executeJavaScript("Boolean(document.querySelector('.agent-backend-card .agent-backend-active'))");
      if (ready) break;
    }
    if (!ready) throw new Error('Fixture configuration did not load');
    fs.writeFileSync(${JSON.stringify(output)} + '/' + theme + '-${stage}.png', (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ theme, stage: ${JSON.stringify(stage)}, horizontalOverflow: await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth') }));
  }
  fs.rmSync(${JSON.stringify(temporary)}, { recursive: true, force: true });
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
`);
  if (buildOnly) console.log(JSON.stringify({ runner }));
  else execFileSync(path.join(root, "node_modules/.bin/electron"), ["--js-flags=--max-old-space-size=192", runner], { cwd: root, stdio: "inherit", timeout: 30_000 });
} finally { if (!buildOnly) fs.rmSync(temporary, { recursive: true, force: true }); }
