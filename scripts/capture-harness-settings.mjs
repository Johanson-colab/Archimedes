// Credential-free React settings fixture with real Electron layout checks.
// Build first, then run the printed runner separately to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-harness-settings-"));
const output = path.join(root, "docs/assets/harness-settings-layout");
fs.mkdirSync(output, { recursive: true });
const source = name => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before" ? ["AgentBackendSettings.tsx", "styles.css"].map(name => [path.join(root, "src", name), execFileSync("git", ["show", `157287d:src/${name}`], { cwd: root, encoding: "utf8" })]) : []);
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${source("i18n.tsx")};
import Models from ${source("ModelSettingsModal.tsx")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'paper';
const profiles={codex:{binary:'codex',model:'',effort:'',permissionMode:'read-only'},claude:{binary:'claude',model:'',effort:'',permissionMode:'ask'},opencode:{binary:'opencode',model:'',effort:'',permissionMode:'ask'}};
const bridge={getModelConfig:async()=>({provider:'custom',baseUrl:'https://example.test/v1',model:'example-model',hasApiKey:false}),getAgentBackendConfig:async()=>({backend:'codex',...profiles.codex,profiles}),saveAgentBackendConfig:async x=>x};
createRoot(document.getElementById('root')).render(<UISettingsProvider><main className={'theme-'+document.documentElement.dataset.theme} style={{display:'flex',flexDirection:'column',gap:16,padding:24,height:'100vh',boxSizing:'border-box',background:'var(--surface-ground)',color:'var(--text-primary)'}}><h2 style={{fontSize:18,margin:0}}>Models</h2><div style={{flex:1,minHeight:0}}><Models bridge={bridge} open embedded onClose={()=>{}} onSaved={()=>{}}/></div></main></UISettingsProvider>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } }, plugins: [{ name: "baseline", load(id) { return baseline.get(id); } }], build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 2000 } });

// Serialize the runner as a function so browser callbacks are not double-escaped.
function captureSettings({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = () => new Promise(resolve => setTimeout(resolve, 80));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1100, height: 960, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    const observations = [];
    for (const theme of ["paper", "charcoal"]) for (const width of [1100, 680]) {
      win.setSize(width, 960);
      await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme } });
      for (let n = 0; n < 30; n++) {
        if (await evaluate(() => Boolean(document.querySelector(".agent-backend-active")))) break;
        await pause();
      }
      await evaluate(() => document.querySelector("[data-value=agents]").click()); await pause();
      await evaluate(() => document.querySelectorAll(".agent-backend-card-toggle[aria-expanded=true]").forEach(button => button.click())); await pause();
      const collapsed = await evaluate(() => {
        const cards = [...document.querySelectorAll(".agent-backend-card")].map(card => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        return { cards: cards.length, stacked: cards.length === 3 && cards.every((card, index) => !index || (Math.abs(card.x - cards[0].x) < 1 && card.y >= cards[index - 1].y + cards[index - 1].height)), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      observations.push({ theme, width, state: "collapsed", ...collapsed });
      if (width === 1100) fs.writeFileSync(path.join(output, theme + "-collapsed-" + stage + ".png"), (await win.webContents.capturePage()).toPNG());
      for (const name of ["Claude Code", "OpenCode"]) {
        await evaluate(name => {
          const button = [...document.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === name || node.textContent === name);
          if (!button) throw Error("Harness entry missing");
          button.click();
        }, name); await pause();
        await evaluate(name => {
          const card = [...document.querySelectorAll(".agent-backend-card")].find(card => card.getAttribute("aria-label") === name);
          const button = card.querySelector(".agent-backend-card-toggle");
          if (button.getAttribute("aria-expanded") !== "true") button.click();
        }, name); await pause();
        await evaluate(name => [...document.querySelectorAll(".agent-backend-card")].find(card => card.getAttribute("aria-label") === name).scrollIntoView({ block: "start" }), name); await pause();
        const geometry = await evaluate(name => {
          const card = [...document.querySelectorAll(".agent-backend-card")].find(card => card.getAttribute("aria-label") === name);
          const copy = card.querySelector(".agent-backend-permissions p") || [...card.querySelectorAll(".settings-row")].find(row => row.textContent.includes("Native permissions"))?.querySelector(".settings-row-description");
          if (!copy) throw Error("Permission guidance missing");
          const rect = copy.getBoundingClientRect(), lineHeight = parseFloat(getComputedStyle(copy).lineHeight);
          return { copyWidth: rect.width, cardWidth: card.getBoundingClientRect().width, lines: Math.round(rect.height / lineHeight), overflow: document.documentElement.scrollWidth > innerWidth };
        }, name);
        observations.push({ theme, width, state: name, ...geometry });
        if (width === 1100) fs.writeFileSync(path.join(output, theme + "-" + (name === "Claude Code" ? "claude" : "opencode") + "-" + stage + ".png"), (await win.webContents.capturePage()).toPNG());
      }
    }
    console.log(JSON.stringify(observations));
    const passed = stage === "before" || observations.every(item => !item.overflow && (item.state === "collapsed" ? item.stacked : item.copyWidth >= item.cardWidth * 0.75 && item.lines <= 5));
    fs.writeFileSync(path.join(output, stage + "-geometry.json"), JSON.stringify(observations, null, 2) + "\n");
    win.destroy(); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + captureSettings.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
