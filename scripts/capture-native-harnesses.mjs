// Build a credential-free fixture; run the printed Electron script separately.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-harness-ui-"));
const out = path.join(root, "docs/assets/native-harnesses");
fs.mkdirSync(out, { recursive: true });
const source = (name) => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before" ? ["ModelSettingsModal.tsx", "AgentBackendSettings.tsx", "HarnessPicker.tsx", "NativeAgentPanel.tsx", "native-agent.css"].map((name) => [path.join(root, "src", name), execFileSync("git", ["show", `c18c92e:src/${name}`], { cwd: root, encoding: "utf8" })]) : []);
fs.writeFileSync(path.join(temp, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temp, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${source("i18n.tsx")};
import Models from ${source("ModelSettingsModal.tsx")};
import HarnessPicker from ${source("HarnessPicker.tsx")};
import {NativeContextUsage} from ${source("NativeAgentPanel.tsx")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const bridge={getModelConfig:async()=>({provider:'custom',baseUrl:'https://example.com/v1',model:'example-model',hasApiKey:false}),getAgentBackendConfig:async()=>({backend:'codex',binary:'codex',model:'gpt-6.1-terra',effort:'',permissionMode:'read-only'}),saveAgentBackendConfig:async x=>x};
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'paper';
createRoot(document.getElementById('root')).render(<UISettingsProvider><main className={document.documentElement.dataset.theme === "paper" ? "theme-paper" : ""} style={{display:'grid',gridTemplateColumns:'660px 1fr',gap:24,padding:24,background:'var(--surface-ground)',color:'var(--text-primary)',minHeight:'100vh'}}><section style={{minWidth:0}}><h2 style={{fontSize:18}}>Models</h2><Models bridge={bridge} open embedded onClose={()=>{}} onSaved={()=>{}}/></section><section style={{minWidth:0,display:'flex',flexDirection:'column',justifyContent:'end',paddingBottom:48}}><h2 style={{fontSize:18,marginBottom:16}}>Main Work</h2><div className="conversation-composer"><textarea placeholder="Ask anything or start a conversation..." rows={5} readOnly style={{width:'100%',resize:'none',padding:12,border:0,background:'transparent',color:'var(--text-primary)'}}/><div className="conversation-composer-footer"><div className="composer-runtime-switch"><span className="composer-runtime-local">Local</span></div><button className="composer-tool">+</button><HarnessPicker backend="codex" busy={false} onChange={async()=>{}} onSettings={()=>{}}/><span className="composer-tool">Project</span><NativeContextUsage usage={{totalTokens:17000,inputTokens:16000,cachedInputTokens:8000,outputTokens:1000,modelContextWindow:100000}}/></div></div></section></main></UISettingsProvider>);
`);
await build({ root: temp, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } }, plugins: [{ name: "baseline", load(id) { return baseline.get(id); } }], build: { outDir: path.join(temp, "dist"), minify: false, chunkSizeWarningLimit: 2000 } });
const runner = path.join(temp, "capture.cjs");
fs.writeFileSync(runner, `
const {app,BrowserWindow}=require('electron');const fs=require('node:fs');
app.commandLine.appendSwitch('disable-gpu'); app.setPath('userData',${JSON.stringify(path.join(temp, "profile"))});
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{backgroundThrottling:false,contextIsolation:true}});
for(const theme of ['paper','charcoal']) { await win.loadFile(${JSON.stringify(path.join(temp, "dist/index.html"))},{query:{theme}});await win.webContents.executeJavaScript("document.querySelector('[data-value=agents]')?.click()");let ready=false;for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,100));ready=await win.webContents.executeJavaScript("Boolean(document.querySelector('.agent-backend-card .agent-backend-active'))");if(ready)break;}if(!ready)throw Error('Settings fixture did not load');fs.writeFileSync(${JSON.stringify(out)}+'/'+theme+'-${stage}.png',(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("document.querySelector('.harness-picker-trigger').click()");await new Promise(r=>setTimeout(r,100));fs.writeFileSync(${JSON.stringify(out)}+'/'+theme+'-menu-${stage}.png',(await win.webContents.capturePage()).toPNG()); console.log(JSON.stringify({theme,stage:'${stage}',overflow:await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth')}));}
fs.rmSync(${JSON.stringify(temp)},{recursive:true,force:true});app.quit();}).catch(e=>{console.error(e.message);app.exit(1)});
`);
console.log(JSON.stringify({ runner }));
