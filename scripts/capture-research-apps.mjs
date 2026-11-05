// Captures real app navigation markup and SettingsModal without user data or credentials.
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
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-research-apps-"));
const output = path.join(root, "docs/assets/research-apps");
fs.mkdirSync(output, { recursive: true });
const baselineCommit = "f12de6b";
const baseline = new Map(stage === "before" ? ["PluginsSettingsPanel.tsx", "SettingsModal.tsx", "sidebar-registry.tsx", "styles.css", "i18n/translations/settings.ts"].map(name => [path.join(root, "src", name), execFileSync("git", ["show", `${baselineCommit}:src/${name}`], { cwd: root, encoding: "utf8" })]) : []);
const appSource = stage === "before" ? execFileSync("git", ["show", `${baselineCommit}:src/App.tsx`], { cwd: root, encoding: "utf8" }) : fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const navigation = appSource.slice(appSource.indexOf('<nav className="sidebar-nav sidebar-modules"'), appSource.indexOf('</nav>', appSource.indexOf('<nav className="sidebar-nav sidebar-modules"')) + 6);
const button = appSource.slice(appSource.indexOf("  const moduleButton ="), appSource.indexOf("  const paletteCommands:"));
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {Plus} from 'lucide-react';
import {UISettingsProvider,useUISettings} from ${source("i18n.tsx")};
import {normalizeAppearance,applyAppearance} from ${source("appearance.ts")};
import SettingsModal from ${source("SettingsModal.tsx")};
import ProjectSidebar from ${source("ProjectSidebar.tsx")};
import {sidebarEntries} from ${source("sidebar-registry.tsx")};
import {defaultDisabledResearchApps} from ${source("research-apps.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const params=new URLSearchParams(location.search), theme=params.get('theme')||'paper';
localStorage.setItem('archimedes-language',params.get('language')||'en');
const appearance=normalizeAppearance({preset:theme}); applyAppearance(document.documentElement,appearance,theme);
const bridge={listSidebarPlugins:async()=>[], listExtensions:async()=>({items:[]})};
function Fixture(){
 const {t}=useUISettings(); const [disabledCoreModules,setDisabled]=useState(${stage === "before" ? "[]" : "defaultDisabledResearchApps"});
 const [settingsOpen,setSettingsOpen]=useState(params.get('view')==='settings'); const [settingsSection,setSettingsSection]=useState('plugins');
 const [mainSection,setMainSection]=useState('chat'); const [activeModuleGroup,setActiveModuleGroup]=useState('knowledge'); const sidebarLayout='sections';
 const moduleGroups=['knowledge','create','evaluate'].map(id=>({id,label:t(id==='knowledge'?'Knowledge':id==='create'?'Create':'Evaluate'),entries:sidebarEntries(id).filter(entry=>!disabledCoreModules.includes(entry.id))})).filter(group=>group.entries.length);
 const flatModuleEntries=${stage === "before" ? "moduleGroups.flatMap(group=>group.entries)" : "sidebarEntries().filter(entry=>!disabledCoreModules.includes(entry.id))"};
 const currentModuleGroup=moduleGroups.find(group=>group.id===activeModuleGroup)||moduleGroups[0];
 const activateSidebarEntry=entry=>setMainSection(entry.destination.section);
 ${button}
 const toggle=async(id,enabled)=>setDisabled(previous=>enabled?previous.filter(value=>value!==id):[...previous,id]);
 return <main className={'codex-shell theme-'+theme} style={{'--sidebar-width':'260px'}}>
  <aside className="codex-sidebar"><div className="codex-brand"><strong>Archimedes</strong></div><button className="new-task-button"><Plus size={17}/><span>{t('New research')}</span></button>
   ${navigation}
   <ProjectSidebar projects={[]} archivedProjects={[]} threads={[]} archivedThreads={[]} activeProjectId={null} activeThreadId={null} disabled={false} onNewProject={()=>{}}/>
  </aside><section/>
  <SettingsModal {...{open:settingsOpen,section:settingsSection,onSectionChange:setSettingsSection,onClose:()=>setSettingsOpen(false),appearance,theme,themePreference:theme,systemAppearance:theme,bridge,workspace:'/fixture',disabledCoreModules,onCoreModuleEnabled:toggle,sidebarLayout,onSidebarLayoutChange:()=>{}}}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture/></UISettingsProvider>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } }, plugins: [{ name: "baseline", load(id) { return baseline.get(id); } }], build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 } });

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu"); app.setPath("userData", path.join(temporary, "profile"));
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1100, height: 960, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    const observations = [];
    for (const theme of ["paper", "charcoal"]) {
      await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme, view: "sidebar" } }); await pause();
      const sidebar = await evaluate(() => ({ label: document.querySelector(".sidebar-section-label")?.textContent, apps: [...document.querySelectorAll(".sidebar-module-list button span:first-of-type")].map(node => node.textContent), work: Boolean(document.querySelector(".work-group")) }));
      observations.push({ theme, view: "sidebar", ...sidebar });
      fs.writeFileSync(path.join(output, `${theme}-sidebar-${stage}.png`), (await win.webContents.capturePage({ x: 0, y: 0, width: 260, height: 960 })).toPNG());
      for (const width of [1100, 680]) {
        win.setSize(width, 960);
        await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme, view: "settings" } }); await pause();
        const settings = await evaluate(() => {
          const body = document.querySelector(".settings-body");
          return { heading: document.querySelector(".settings-header h2")?.textContent, categories: [...document.querySelectorAll(".research-apps-category h3")].map(node=>node.textContent), enabled: document.querySelectorAll('[role="switch"][aria-checked="true"]').length, overflow: body.scrollWidth > body.clientWidth, scrollable: body.scrollHeight > body.clientHeight };
        });
        observations.push({ theme, view: "settings", width, ...settings });
        if (width === 1100) {
          fs.writeFileSync(path.join(output, `${theme}-settings-top-${stage}.png`), (await win.webContents.capturePage()).toPNG());
          await evaluate(() => { const body = document.querySelector(".settings-body"); body.scrollTop = body.scrollHeight; }); await pause();
          fs.writeFileSync(path.join(output, `${theme}-settings-bottom-${stage}.png`), (await win.webContents.capturePage()).toPNG());
        }
      }
      win.setSize(1100, 960);
    }
    console.log(JSON.stringify(observations));
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(observations, null, 2) + "\n");
    const passed = stage === "before" || observations.every(item => item.view === "sidebar" ? item.label === "Research Apps" && item.apps.join("|") === "Library|Daily papers|Reproduce|Image creation|Paper writing" && item.work : item.heading === "Research Apps" && item.categories.length === 5 && item.enabled === 5 && !item.overflow && item.scrollable);
    win.destroy(); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
