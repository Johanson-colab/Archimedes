const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { scaffoldApp } = require('../electron/research-app-scaffold.cjs');
const { createFrontend, executeCommand } = require('../electron/research-app-frontend.cjs');
const { createDelivery } = require('../electron/research-app-delivery.cjs');
const { createSetup } = require('../electron/research-app-setup.cjs');
const { checkBrowser } = require('../electron/research-app-browser-check.cjs');
const { createResearchAppRuntime, readApp } = require('../electron/research-app-runtime.cjs');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'react-app-chromium-'))), results = [];
  const runtime = createResearchAppRuntime({ approve: async () => true });
  // Deterministic CI uses the repository's installed, lockfile-controlled compiler packages.
  // Production uses npm ci; a fresh registry install was also exercised separately during development.
  const builder = createFrontend({ approve: async () => true, execute: async (command, args, cwd, signal) => {
    if (command === 'npm' || command === 'npm.cmd') {
      const target = path.join(cwd, 'node_modules'); fs.mkdirSync(target, { recursive: true });
      const installed = path.join(__dirname, '../node_modules');
      for (const entry of fs.readdirSync(installed)) if (!entry.startsWith('.')) fs.symlinkSync(path.resolve(installed, entry), path.join(target, entry), process.platform === 'win32' ? 'junction' : 'dir');
      return '';
    }
    return executeCommand(command, args, cwd, signal);
  } });
  const capture = (name, image) => { if (process.env.ARCHIMEDES_REACT_EVIDENCE) { fs.mkdirSync(process.env.ARCHIMEDES_REACT_EVIDENCE, { recursive: true }); fs.writeFileSync(path.join(process.env.ARCHIMEDES_REACT_EVIDENCE, `${name}.png`), image.toPNG()); } };
  try {
    // Matched pre-upgrade surface, using the same prototype title/input and viewport.
    if (process.env.ARCHIMEDES_REACT_EVIDENCE) {
      const draft = scaffoldApp({ workspace, appId: 'before', frontend: 'plain', name: 'Research studio' });
      const file = path.join(draft.directory, 'public/app.js'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('textContent = input;', 'textContent = input.toUpperCase();'));
      const run = await runtime.start(workspace, 'before');
      await checkBrowser({ url: run.url, steps: [{ action: 'fill', selector: '#input', value: 'Evidence makes research questions testable.' }, { action: 'click', selector: '#task button' }, { action: 'expect', selector: '#output', text: 'EVIDENCE MAKES RESEARCH QUESTIONS TESTABLE.' }], onFrame: image => capture('before-paper', image) });
      await runtime.stop(workspace, 'before'); void draft;
    }
    for (const [index, layout] of ['canvas', 'editorial', 'workspace'].filter(value => !process.env.ARCHIMEDES_REACT_LAYOUT || process.env.ARCHIMEDES_REACT_LAYOUT === value).entries()) {
      const kind = index === 1 ? 'python-http' : 'static', id = `react-${layout}`;
      const draft = scaffoldApp({ workspace, appId: id, name: 'Research studio', kind, layout });
      const source = path.join(draft.directory, 'src/App.tsx');
      if (kind === 'static') fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace(': input.trim();', ': input.trim().toUpperCase();'));
      else { const py = path.join(draft.directory, 'app.py'); fs.writeFileSync(py, fs.readFileSync(py, 'utf8').replace("value['input'].strip()", "value['input'].strip().upper()")); }
      if (layout === 'workspace') {
        const file = path.join(draft.directory, 'research-app.json'), manifest = JSON.parse(fs.readFileSync(file)); manifest.agents = ['codex']; fs.writeFileSync(file, JSON.stringify(manifest));
        let text = fs.readFileSync(source, 'utf8').replace('appFetch, useHostContext', 'appFetch, requestAgent, useHostContext');
        text = text.replace('  const [busy, setBusy]', '  const [agentResult, setAgentResult] = useState("");\n  const [busy, setBusy]');
        text = text.replace('<footer className="workspace-footer">', '<button id="agent-check" onClick={async () => { window.postMessage({type: \"archimedes:context\", theme: \"paper\", tokens: {\"--surface-ground\": \"#00ff00\"}}, \"*\"); setAgentResult(await requestAgent(\"codex\", \"Summarize the sample\")); }}>Test Agent adapter</button><output id="agent-result">{agentResult}</output><footer className="workspace-footer">');
        fs.writeFileSync(source, text);
      }
      const planFile = path.join(draft.directory, 'research-app.checks.json'), plan = JSON.parse(fs.readFileSync(planFile)); delete plan.starter;
      plan.description = 'Process a passage and inspect the actual returned text'; plan.browser[0].value = 'Evidence makes research questions testable.'; plan.browser.at(-1).text = 'EVIDENCE MAKES RESEARCH QUESTIONS TESTABLE.';
      if (layout === 'workspace') plan.browser.push({ action: 'click', selector: '#agent-check' }, { action: 'expect', selector: '#agent-result', text: 'Test adapter replied' });
      fs.writeFileSync(planFile, JSON.stringify(plan));
      let repairs = 0;
      const nativeRepair = process.env.ARCHIMEDES_REACT_NATIVE_REPAIR ? require('../electron/research-app-repair.cjs').createAppRepair({ getConfig: () => require('../electron/agent-backend-config.cjs').get(), approve: async () => true, approveTool: async () => true, runNative: require('../electron/agent/external-backend.cjs').runNative }) : null;
      const pipeline = createDelivery({ approve: async () => true, build: builder.build, setup: createSetup({ approve: async () => true }).setup,
        browser: options => checkBrowser({ ...options, runAgent: async input => { assert.equal(input.backend, 'codex'); return 'Test adapter replied'; }, onFrame: image => capture(`${layout}-paper`, image) }),
        repair: async options => { repairs++; if (nativeRepair) { await nativeRepair({ ...options, backend: process.env.ARCHIMEDES_REACT_NATIVE_REPAIR }); return; } fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('const broken: number = "wrong";', 'const broken: number = 1;')); },
      });
      assert.equal(readApp(workspace, id).needsBuild, true);
      const verified = await pipeline.validate(workspace, id); assert.equal(verified.status, 'ready', JSON.stringify(verified));
      await runtime.install(workspace, id);
      const run = await runtime.start(workspace, id); assert.equal(run.status, 'running', run.error);
      const dark = await checkBrowser({ url: run.url, app: readApp(workspace, id), theme: 'charcoal', steps: plan.browser, runAgent: async input => { assert.equal(input.backend, 'codex'); return 'Test adapter replied'; }, onFrame: image => capture(`${layout}-charcoal`, image) });
      assert.equal(dark.passed, true, dark.error); assert.equal(dark.observations.theme, 'charcoal'); assert.equal(dark.observations.hasHostBridge, false);
      assert.equal(dark.observations.background, 'rgb(20, 17, 16)');
      if (layout === 'canvas') { const mobile = await checkBrowser({ url: run.url, app: readApp(workspace, id), viewport: { width: 420, height: 900 }, steps: plan.browser, onFrame: image => capture('canvas-mobile', image) }); assert.equal(mobile.passed, true, mobile.error); }
      await runtime.stop(workspace, id);
      if (layout === 'canvas') {
        fs.appendFileSync(source, '\nconst broken: number = "wrong"; void broken;');
        const repaired = await pipeline.validate(workspace, id, { repairBackend: 'codex' }); assert.equal(repaired.status, 'ready', JSON.stringify(repaired)); assert.equal(repairs, 1);
        const css = path.join(draft.directory, 'src/app.css');
        fs.appendFileSync(css, '\nbody { background: #00ff00 !important; }');
        const rejected = await pipeline.validate(workspace, id); assert.equal(rejected.status, 'failed'); assert.match(rejected.error, /background does not match/);
        fs.mkdirSync(path.join(draft.directory, '.data')); fs.writeFileSync(path.join(draft.directory, '.data/sentinel'), 'preserved');
        await pipeline.restore(workspace, id);
        assert.equal(readApp(workspace, id).needsBuild, false); assert.equal(runtime.list(workspace).find(item => item.id === id).delivery.status, 'ready');
        assert.equal(fs.readFileSync(path.join(draft.directory, '.data/sentinel'), 'utf8'), 'preserved');
      }
      results.push({ layout, kind, typechecked: true, bundled: true, paperAndCharcoal: true, repairs, repairAdapter: process.env.ARCHIMEDES_REACT_NATIVE_REPAIR || "deterministic-test" });
    }
    console.log(JSON.stringify(results));
  } finally { await runtime.shutdown(); fs.rmSync(workspace, { recursive: true, force: true }); }
}).then(() => app.quit(), error => { console.error(error.stack || error); app.exit(1); });
