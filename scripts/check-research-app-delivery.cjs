const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { scaffoldApp } = require('../electron/research-app-scaffold.cjs');
const { createDelivery } = require('../electron/research-app-delivery.cjs');
const { checkBrowser } = require('../electron/research-app-browser-check.cjs');
const { createResearchAppRuntime } = require('../electron/research-app-runtime.cjs');
const { createSetup } = require('../electron/research-app-setup.cjs');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-delivery-chromium-'))), results = [];
  const runtime = createResearchAppRuntime({ approve: async () => true });
  try {
    for (const kind of ['static', 'python-http']) {
      if (process.env.ARCHIMEDES_DELIVERY_TRACE) console.error('[fixture]', kind);
      const appId = kind === 'static' ? 'word-counter' : 'text-processor';
      const draft = scaffoldApp({ frontend: 'plain', workspace, appId, name: kind === 'static' ? 'Word counter' : 'Text processor', kind });
      const jsFile = path.join(draft.directory, 'public/app.js');
      const planFile = path.join(draft.directory, 'research-app.checks.json');
      const plan = JSON.parse(fs.readFileSync(planFile)); delete plan.starter;
      plan.description = kind === 'static' ? 'Count words from a user input' : 'Process user text through the actual Python HTTP service';
      plan.browser[0].value = 'alpha beta gamma'; plan.browser.at(-1).text = kind === 'static' ? '3 words' : 'ALPHA BETA GAMMA';
      fs.writeFileSync(planFile, JSON.stringify(plan));
      if (kind === 'static') fs.writeFileSync(jsFile, fs.readFileSync(jsFile, 'utf8').replace("textContent = input;", "textContent = input.split(/\\s+/).length + ' words';"));
      else {
        const py = path.join(draft.directory, 'app.py'); fs.writeFileSync(py, fs.readFileSync(py, 'utf8').replace("value['input'].strip()", "value['input'].strip().upper()"));
      }
      if (kind === 'static') {
        const htmlFile = path.join(draft.directory, 'public/index.html');
        fs.writeFileSync(htmlFile, fs.readFileSync(htmlFile, 'utf8').replace('</form>', '</form><button id="network-error" type="button">Check handled error</button><p id="handled-error"></p>'));
        fs.appendFileSync(jsFile, "\ndocument.querySelector('#network-error').onclick = async () => { const response = await fetch('/expected-404'); document.querySelector('#handled-error').textContent = 'Handled ' + response.status; };\n");
        plan.http.push({ path: '/expected-404', status: 404 });
        plan.browser.push({ action: 'click', selector: '#network-error' }, { action: 'expect', selector: '#handled-error', text: 'Handled 404' });
        fs.writeFileSync(planFile, JSON.stringify(plan));
      }
      let repairs = 0;
      const goodSource = fs.readFileSync(jsFile, 'utf8');
      const liveBackend = process.env.ARCHIMEDES_DELIVERY_NATIVE_REPAIR;
      const nativeRepair = liveBackend ? require('../electron/research-app-repair.cjs').createAppRepair({ getConfig: () => require('../electron/agent-backend-config.cjs').get(), approve: async () => true, approveTool: async () => true, runNative: require('../electron/agent/external-backend.cjs').runNative }) : null;
      const pipeline = createDelivery({
        approve: async () => true, setup: createSetup({ approve: async ({ packages }) => { assert.equal(packages.length, 0); return true; } }).setup,
        browser: options => checkBrowser({ ...options, onFrame: image => {
          if (process.env.ARCHIMEDES_DELIVERY_EVIDENCE) { fs.mkdirSync(process.env.ARCHIMEDES_DELIVERY_EVIDENCE, { recursive: true }); fs.writeFileSync(path.join(process.env.ARCHIMEDES_DELIVERY_EVIDENCE, `${kind}.png`), image.toPNG()); }
        } }),
        repair: async options => { repairs++; if (nativeRepair) await nativeRepair({ ...options, backend: liveBackend }); else fs.writeFileSync(jsFile, goodSource); },
      });
      await assert.rejects(runtime.install(workspace, appId), /Validate|Set up/);
      if (process.env.ARCHIMEDES_DELIVERY_TRACE) console.error('[fixture] validating');
      const verified = await pipeline.validate(workspace, appId);
      assert.equal(verified.status, 'ready', JSON.stringify(verified));
      await runtime.install(workspace, appId);
      const running = await runtime.start(workspace, appId); assert.equal(running.status, 'running', running.error);
      await runtime.stop(workspace, appId); await assert.rejects(fetch(running.url));
      if (kind === 'static') {
        fs.writeFileSync(jsFile, goodSource.replace("input.split(/\\s+/).length + ' words'", "'broken result'"));
        await assert.rejects(runtime.install(workspace, appId), /Validate/);
        const repaired = await pipeline.validate(workspace, appId, { repairBackend: 'codex' });
        assert.equal(repaired.status, 'ready', JSON.stringify(repaired)); assert.equal(repairs, 1);
        // An uncaught script exception must fail even when all declared result assertions match.
        const lastVerifiedSource = fs.readFileSync(jsFile, 'utf8');
        fs.appendFileSync(jsFile, '\nsetTimeout(() => { throw new Error("intentional regression"); }, 0);');
        const rejected = await pipeline.validate(workspace, appId);
        assert.equal(rejected.status, 'failed'); assert.match(rejected.error, /JavaScript|console/);
        fs.mkdirSync(path.join(draft.directory, '.data')); fs.writeFileSync(path.join(draft.directory, '.data/sentinel'), 'preserved');
        await pipeline.restore(workspace, appId);
        assert.equal(fs.readFileSync(jsFile, 'utf8'), lastVerifiedSource);
        assert.equal(fs.readFileSync(path.join(draft.directory, '.data/sentinel'), 'utf8'), 'preserved');
      }
      results.push({ kind, passed: true, realBrowserSteps: plan.browser.length, repairs, repairAdapter: liveBackend || "deterministic-test" });
    }
    console.log(JSON.stringify(results));
  } finally { await runtime.shutdown(); fs.rmSync(workspace, { recursive: true, force: true }); }
}).then(() => app.quit(), error => { console.error(error.stack || error); app.exit(1); });
