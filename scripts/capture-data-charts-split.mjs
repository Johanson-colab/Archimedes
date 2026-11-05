// Real renderer components with deterministic catalogs and no external requests.
// Build, then run the printed Electron runner separately to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-charts-split-"));
const output = path.join(root, "docs/assets/data-charts-split");
fs.mkdirSync(output, { recursive: true });
const baselineCommit = "137198f";
const baseline = new Map(stage === "before" ? ["ImageCreationView.tsx", "sidebar-registry.tsx", "styles.css"].map(name => [path.join(root, "src", name), execFileSync("git", ["show", `${baselineCommit}:src/${name}`], { cwd: root, encoding: "utf8" })]) : []);
const appSource = stage === "before" ? execFileSync("git", ["show", `${baselineCommit}:src/App.tsx`], { cwd: root, encoding: "utf8" }) : fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const navigation = appSource.slice(appSource.indexOf('<nav className="sidebar-nav sidebar-modules"'), appSource.indexOf('</nav>', appSource.indexOf('<nav className="sidebar-nav sidebar-modules"')) + 6);
const button = appSource.slice(appSource.indexOf("  const moduleButton ="), appSource.indexOf("  const paletteCommands:"));
const source = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {Plus} from 'lucide-react';
import {UISettingsProvider,useUISettings} from ${source("i18n.tsx")};
import {normalizeAppearance,applyAppearance} from ${source("appearance.ts")};
import SettingsModal from ${source("SettingsModal.tsx")}; import ProjectSidebar from ${source("ProjectSidebar.tsx")};
import ImageCreationView from ${source("ImageCreationView.tsx")}; import DataChartsView from ${source("DataChartsView.tsx")};
import {sidebarEntries} from ${source("sidebar-registry.tsx")}; import {defaultDisabledResearchApps} from ${source("research-apps.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const params=new URLSearchParams(location.search), theme=params.get('theme')||'paper', view=params.get('view')||'diagrams';
const still=document.createElement('style');still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.append(still);
localStorage.setItem('archimedes-language','en'); const appearance=normalizeAppearance({preset:theme}); applyAppearance(document.documentElement,appearance,theme);
const diagrams=Array.from({length:6},(_,index)=>({id:'example-'+index,venue:'iclr',year:2025,title:'Example research pipeline '+(index+1),authors:['Fixture author'],pattern:'framework',image:'images/iclr/final/example-'+index+'.jpg',paper:'https://example.test/paper'}));
const papers=['bar','line','heatmap'].map((type,index)=>({paper_key:type,meta:{title:'Example '+type+' results study',venue:['NeurIPS','ICML','CVPR'][index],year:'2025'},figures:[{fig_id:type+'__1',num:1,caption:'Example '+type+' results',thumb:'figs/'+type+'.jpg',full:'figs/'+type+'.jpg',vision:{category:'data',chart_type:type}}]}));
window.fixtureRequests=[]; window.fetch=async input=>{const url=String(input);window.fixtureRequests.push(url);return {ok:true,json:async()=>url.includes('figures.json')?diagrams:{papers:url.endsWith('index-0.json')?papers:[]}}};
const bridge={listSidebarPlugins:async()=>[],listExtensions:async()=>({items:[]})};
function Fixture(){
 const {t}=useUISettings(); const [disabledCoreModules,setDisabled]=useState(defaultDisabledResearchApps);
 const [settingsOpen,setSettingsOpen]=useState(view==='settings'); const [settingsSection,setSettingsSection]=useState('plugins');
 const [mainSection,setMainSection]=useState(view==='charts'&&${stage === "after"}?'data-charts':'image-creation');
 const flatModuleEntries=sidebarEntries().filter(entry=>!disabledCoreModules.includes(entry.id));
 const activateSidebarEntry=entry=>setMainSection(entry.destination.section);
 ${button}
 const toggle=async(id,enabled)=>setDisabled(previous=>enabled?previous.filter(value=>value!==id):[...previous,id]);
 return <main className={'codex-shell theme-'+theme} style={{'--sidebar-width':'260px'}}>
  <aside className="codex-sidebar"><div className="codex-brand"><strong>Archimedes</strong></div><button className="new-task-button"><Plus size={17}/><span>{t('New research')}</span></button>
   ${navigation}
   <ProjectSidebar projects={[]} archivedProjects={[]} threads={[]} archivedThreads={[]} activeProjectId={null} activeThreadId={null} disabled={false} onNewProject={()=>{}}/>
  </aside>
  <section className="codex-main"><header className="main-toolbar"><div className="conversation-title"><strong>{mainSection==='data-charts'?'Data charts':'Image creation'}</strong></div></header><div className="main-view knowledge-main">{view!=='settings'&&(mainSection==='data-charts'?<DataChartsView active/>:<ImageCreationView active onBrowseProceedings={()=>{}}/>)}</div></section>
  <SettingsModal {...{open:settingsOpen,section:settingsSection,onSectionChange:setSettingsSection,onClose:()=>setSettingsOpen(false),appearance,theme,themePreference:theme,systemAppearance:theme,bridge,workspace:'/fixture',disabledCoreModules,onCoreModuleEnabled:toggle}}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture/></UISettingsProvider>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } }, plugins: [{ name: "baseline", load(id) { return baseline.get(id); } }], build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 4000 } });

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow, session } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu"); app.setPath("userData", path.join(temporary, "profile"));
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  app.whenReady().then(async () => {
    // Illustrative fixture images, never downloads or user-generated artifacts.
    session.defaultSession.protocol.handle("https", request => {
      const isChart = request.url.includes("paperfigure.net");
      const drawing = isChart
        ? '<path d="M65 40V265H435" fill="none" stroke="#777" stroke-width="2"/><rect x="100" y="165" width="65" height="100" fill="#adc2ce"/><rect x="210" y="105" width="65" height="160" fill="#7699aa"/><rect x="320" y="55" width="65" height="210" fill="#496f84"/>'
        : '<g fill="#eef1f3" stroke="#78909c" stroke-width="2"><rect x="30" y="115" width="110" height="80" rx="8"/><rect x="195" y="115" width="110" height="80" rx="8"/><rect x="360" y="115" width="110" height="80" rx="8"/><path d="M140 155H195M305 155H360"/></g><g font-size="18" fill="#34454d"><text x="57" y="163">Inputs</text><text x="222" y="163">Model</text><text x="380" y="163">Results</text></g>';
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320"><rect width="500" height="320" fill="white"/>'+drawing+'</svg>', { headers: { "content-type": "image/svg+xml" } });
    });
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    const observations = [];
    for (const theme of ["paper", "charcoal"]) for (const view of ["diagrams", "charts", "settings"]) {
      win.setSize(1200, 900);
      await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme, view } }); await pause();
      if (view === "charts" && stage === "before") { await evaluate(() => document.getElementById("image-creation-tab-charts").click()); await pause(); }
      if (view === "settings") { await evaluate(() => [...document.querySelectorAll(".research-apps-category")].find(node=>node.textContent.includes("Analysis & visualization")).scrollIntoView({block:'start'})); await pause(); }
      await evaluate(async () => { await document.fonts.ready; const images=[...document.querySelectorAll("img")]; images.forEach(image=>{image.loading="eager";}); await Promise.race([Promise.all(images.map(image=>image.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,1500))]); });
      const state = await evaluate(() => ({ apps:[...document.querySelectorAll(".sidebar-module-list button span:first-of-type")].map(node=>node.textContent), heading:document.querySelector(".image-creation-heading")?.textContent, charts:document.querySelectorAll(".chart-reference-card").length, diagrams:document.querySelectorAll(".image-creation-card:not(.chart-reference-card)").length, overflow:document.documentElement.scrollWidth>innerWidth, requests:window.fixtureRequests }));
      observations.push({theme,view,...state});
      fs.writeFileSync(path.join(output, `${theme}-${view}-${stage}.png`), (await win.webContents.capturePage()).toPNG());
      if (view === "diagrams") {
        await evaluate(() => document.querySelector(".image-creation-forge-button").click()); await pause();
        const forge = await evaluate(() => ({visible:Boolean(document.querySelector(".figure-forge-page")),steps:document.querySelectorAll(".forge-step").length}));
        await evaluate(() => document.querySelector(".figure-forge-back").click()); await pause();
        observations.push({theme,view:"forge",...forge,returned:await evaluate(()=>Boolean(document.querySelector('[aria-label="Search paper diagrams"]')))});
      }
      if (view === "charts") {
        win.setSize(800,900); await pause();
        observations.push({theme,view:"charts-narrow",overflow:await evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      }
    }
    console.log(JSON.stringify(observations));
    fs.writeFileSync(path.join(output, `${stage}-checks.json`), JSON.stringify(observations,null,2)+"\n");
    const passed = observations.every(item => item.view === "forge" ? item.visible && item.steps===4 && item.returned : !item.overflow && (stage === "before" || (item.view === "diagrams" ? item.diagrams===6 && !item.requests.some(url=>url.includes('paperfigure.net')) : item.view === "charts" ? item.charts===3 && item.apps.includes("Data charts") && !item.requests.some(url=>url.includes('figures.json')) : true)));
    win.destroy(); fs.rmSync(temporary,{recursive:true,force:true}); app.exit(passed?0:1);
  }).catch(error=>{console.error(error.message);fs.rmSync(temporary,{recursive:true,force:true});app.exit(1);});
}
const runner=path.join(temporary,"capture.cjs");
fs.writeFileSync(runner,"("+capture.toString()+")("+JSON.stringify({temporary,output,stage})+");");
console.log(JSON.stringify({runner}));
