// Deterministic real-component UI checks; fixtures never touch user data or the network.
// Usage: node scripts/capture-benchmark-radar-refresh.mjs before|after
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw Error("Choose before or after.");
const output = path.join(root, "docs/assets/benchmark-radar-refresh");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-refresh-ui-"));
const baseline = new Map(stage === "before" ? ["BenchmarkRadarView.tsx", "styles.css"].map(file => [path.join(root, "src", file), execFileSync("git", ["show", `57ca05a:src/${file}`], { cwd: root, encoding: "utf8" })]) : []);
const source = file => JSON.stringify(path.join(root, "src", file));
fs.copyFileSync(path.join(output, "fixture.json"), path.join(temporary, "payload.json"));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="module-toolbar-actions"></div><div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import BenchmarkRadarView from ${source("BenchmarkRadarView.tsx")};
import {UISettingsProvider} from ${source("i18n.tsx")};
import {applyAppearance,normalizeAppearance} from ${source("appearance.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
import payload from './payload.json';
const theme=new URLSearchParams(location.search).get('theme')||'paper';
localStorage.setItem('archimedes-language','en');
applyAppearance(document.documentElement,normalizeAppearance({preset:theme}),theme);
document.body.className='theme-'+theme;
window.fixtureMode='online'; window.fixtureCalls=[]; window.fixtureTimers=new Set();
const set=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
window.setInterval=(...args)=>{const id=set(...args);window.fixtureTimers.add(id);return id;};
window.clearInterval=id=>{window.fixtureTimers.delete(id);clear(id);};
window.researchDesk={getBenchmarkRadarData:async(options={})=>{
 window.fixtureCalls.push(options);
 if(options.cachedOnly)return {...payload,source:'cached',fetchedAt:'2026-10-15T08:00:00Z'};
 await new Promise(resolve=>setTimeout(resolve,100));
 if(window.fixtureMode==='slow')await new Promise(resolve=>{window.fixtureRelease=resolve;});
 if(window.fixtureMode==='offline')return {...payload,source:'cached',refreshError:'Offline fixture'};
 return options.refresh?{...payload,radar:payload.radar.map((r,i)=>i===0?{...r,name:'Refreshed '+r.name}:r)}:payload;
}};
const app=createRoot(document.getElementById('root'));
window.unmountFixture=()=>app.unmount();
app.render(<React.StrictMode><UISettingsProvider><BenchmarkRadarView/></UISettingsProvider></React.StrictMode>);
`);

try {
  await build({ root: temporary, configFile: false, base: "./", resolve: {
    dedupe: ["react", "react-dom"],
    alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") },
  }, plugins: [{ name: "radar-before", load: id => baseline.get(id) }], build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 4000 } });
  const runner = path.join(temporary, "capture.cjs");
  fs.writeFileSync(runner, `(${capture.toString()})(${JSON.stringify({ temporary, output, stage })});`);
  execFileSync(require("electron"), ["--js-flags=--max-old-space-size=512", runner], { cwd: root, stdio: "inherit", timeout: 120_000 });
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
  app.setPath("userData", path.join(temporary, "profile"));
  app.commandLine.appendSwitch("disable-gpu");
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true } });
    const errors = [];
    win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    const evaluate = code => win.webContents.executeJavaScript(code);
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error("Timed out: " + expression);
    };
    const checks = [];
    for (const theme of ["paper", "charcoal"]) {
      win.setSize(1440, 1000);
      await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme } });
      await waitFor("document.querySelectorAll('.benchmark-row').length === 3");
      if (stage === "after") await waitFor("!document.querySelector('.benchmark-refresh').disabled");
      await evaluate("document.fonts.ready");
      win.showInactive();
      fs.writeFileSync(path.join(output, `${theme}-${stage}.png`), (await win.webContents.capturePage()).toPNG());
      if (stage === "after") {
        assert.ok(await evaluate("fixtureCalls.some(c=>c.cachedOnly)&&fixtureCalls.some(c=>!c.cachedOnly)"));
        assert.ok(await evaluate("document.querySelector('.benchmark-data-status').textContent.includes('2026-10-15')"));
        assert.ok(await evaluate("document.querySelector('.benchmark-signal b').textContent === 'Code available'"));
        await evaluate("document.querySelector('.benchmark-forecast').open=true");
        assert.ok(await evaluate("document.querySelector('.benchmark-forecast').textContent.includes('7 days')"));
        assert.ok(await evaluate("document.querySelector('.benchmark-forecast').textContent.includes('not benchmark quality')"));
        fs.writeFileSync(path.join(output, `${theme}-forecast-after.png`), (await win.webContents.capturePage()).toPNG());
        await evaluate("fixtureMode='slow';document.querySelector('.benchmark-refresh').click()");
        await waitFor("Boolean(window.fixtureRelease)");
        const calls = await evaluate("fixtureCalls.length");
        await evaluate("document.querySelector('.benchmark-refresh').click()");
        assert.equal(await evaluate("fixtureCalls.length"), calls);
        assert.ok(await evaluate("fixtureCalls.at(-1).refresh"));
        await evaluate("fixtureMode='online';fixtureRelease()");
        await waitFor("document.querySelector('.benchmark-row h2').textContent.startsWith('Refreshed ')");
        await evaluate("fixtureMode='offline';document.querySelector('.benchmark-refresh').click()");
        await waitFor("Boolean(document.querySelector('.benchmark-update-warning'))");
        assert.equal(await evaluate("document.querySelectorAll('.benchmark-row').length"), 3);
        fs.writeFileSync(path.join(output, `${theme}-offline-after.png`), (await win.webContents.capturePage()).toPNG());
      }
      win.setSize(780, 1000);
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
      fs.writeFileSync(path.join(output, `${theme}-narrow-${stage}.png`), (await win.webContents.capturePage()).toPNG());
      if (stage === "after") {
        await evaluate("unmountFixture()");
        assert.equal(await evaluate("fixtureTimers.size"), 0);
        const count = await evaluate("fixtureCalls.length");
        await evaluate("dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))");
        assert.equal(await evaluate("fixtureCalls.length"), count);
      }
      checks.push({ theme, stage, overflow: false, refreshAndFallback: stage === "after", cleanup: stage === "after" });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, `${stage}-checks.json`), JSON.stringify(checks, null, 2) + "\n");
    console.log(JSON.stringify(checks));
    win.destroy();
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
}
