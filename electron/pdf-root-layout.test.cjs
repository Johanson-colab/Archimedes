const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");

// This regression needs a real Chromium layout engine and a desktop display.
// Run with ARCHIMEDES_RUN_ELECTRON_LAYOUT_TESTS=1 node --test electron/pdf-root-layout.test.cjs.
test("PDF.js measuring canvases cannot resize the desktop or create root scrollbars", {
  timeout: 30000,
  skip: process.env.ARCHIMEDES_RUN_ELECTRON_LAYOUT_TESTS !== "1" ? "requires an explicitly enabled Electron desktop session" : false,
}, async t => {
  const root = path.resolve(__dirname, "..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-pdf-layout-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const stylesheet = name => pathToFileURL(path.join(root, "src", name)).href;
  fs.writeFileSync(path.join(directory, "index.html"), `<!doctype html><html data-theme="paper"><head>
    <link rel="stylesheet" href="${stylesheet("tokens.css")}"><link rel="stylesheet" href="${stylesheet("styles.css")}">
    </head><body><div id="root"><div class="codex-shell theme-paper">
    <aside class="codex-sidebar"><h2>Archimedes</h2><p>Library</p></aside>
    <div class="codex-main"><header class="main-toolbar">Library · PDF layout check</header>
    <div class="main-workspace"><div class="main-view"><div class="library-view-cache">
    <div style="padding:32px"><h1>Stable research workspace</h1><p>PDF font measurements must never move this page.</p></div>
    </div></div></div></div></div></div></body></html>`);
  fs.writeFileSync(path.join(directory, "audit.cjs"), `
    const {app,BrowserWindow}=require('electron'); const fs=require('node:fs');
    app.setPath('userData',${JSON.stringify(directory)});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{sandbox:true}});
      await win.loadFile(${JSON.stringify(path.join(directory, "index.html"))});
      const report=await win.webContents.executeJavaScript(\`(async()=>{
        await new Promise(r=>setTimeout(r,400));
        const measure=()=>({width:document.querySelector('.codex-shell').getBoundingClientRect().width,viewportWidth:innerWidth,rootHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight});
        const samples=[measure()];
        for(const lang of ['en','zh']){
          const canvas=document.createElement('canvas');canvas.className='hiddenCanvasElement';canvas.lang=lang;document.body.append(canvas);
          for(const size of [150,0,100,0]){canvas.width=canvas.height=size;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(measure())}
          canvas.remove();samples.push(measure());
        }
        const cachedCanvas=document.createElement('canvas');cachedCanvas.className='hiddenCanvasElement';cachedCanvas.width=cachedCanvas.height=0;document.body.append(cachedCanvas);
        samples.push(measure());return samples;
      })()\`);
      fs.writeFileSync(${JSON.stringify(path.join(directory, "report.json"))},JSON.stringify(report));
      if(process.env.ARCHIMEDES_LAYOUT_AUDIT_OUTPUT){
        fs.mkdirSync(process.env.ARCHIMEDES_LAYOUT_AUDIT_OUTPUT,{recursive:true});
        fs.writeFileSync(require('node:path').join(process.env.ARCHIMEDES_LAYOUT_AUDIT_OUTPUT,'report.json'),JSON.stringify(report,null,2));
        fs.writeFileSync(require('node:path').join(process.env.ARCHIMEDES_LAYOUT_AUDIT_OUTPUT,'layout.png'),(await win.capturePage()).toPNG());
      }
      app.exit();
    }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require("../scripts/electron-runtime.cjs").electronBinary(), [path.join(directory, "audit.cjs")], { env, timeout: 25000 });
  const samples = JSON.parse(fs.readFileSync(path.join(directory, "report.json"), "utf8"));
  assert.ok(samples.every(sample => sample.width === samples[0].width), `PDF font measurement changed app width: ${JSON.stringify(samples)}`);
  assert.ok(samples.every(sample => sample.rootHeight <= sample.viewportHeight), "PDF font measurement introduced document scrolling");
});
