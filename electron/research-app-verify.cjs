const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readApp, sourceFiles, createResearchAppRuntime } = require('./research-app-runtime.cjs');

// Called through the native harness's normal command approval mechanism.
// This executes local App code, does not install dependencies or persist consent.
async function verifyApp({ workspace, appId, paths = ['/'], httpChecks = [], browser, browserSteps = [], approve = async () => true, readSecret = () => '', signal, onRuntime = () => {} } = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 10 || paths.some(value => typeof value !== 'string' || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))) throw new Error('Provide up to ten App-relative HTTP paths.');
  const trace = value => { if (process.env.ARCHIMEDES_DELIVERY_TRACE) console.error('[verify]', value); };
  const app = readApp(workspace, appId);
  const result = { appId, scope: 'host-startup-and-http', passed: false, checks: [], remainingChecks: ['Interactive page behavior and visual layout are not verified by this command.'] };
  if (app.needsSetup) return { ...result, blocked: 'environment', error: 'App-local Python environment is missing. Set it up before claiming this App is ready.' };
  if (app.environment.length && app.environment.some(name => !readSecret(name))) return { ...result, blocked: 'credentials', error: 'Verify this App in the host with explicitly approved Environment keys. This command does not read the vault.' };
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'research-app-check-')));
  const isolatedDir = path.join(temporary, 'research-apps', appId);
  fs.mkdirSync(isolatedDir, { recursive: true });
  let isolatedApp;
  try {
    for (const file of sourceFiles(app)) { const destination = path.join(isolatedDir, file.path); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, file.content, { mode: file.mode }); }
    if (app.runtime.kind === 'python-http') fs.symlinkSync(path.join(app.directory, '.venv'), path.join(isolatedDir, '.venv'), process.platform === 'win32' ? 'junction' : 'dir');
    isolatedApp = readApp(temporary, appId);
  } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
  const runtime = createResearchAppRuntime({ approve: request => approve({ ...request, app }), readSecret, validation: true });
  onRuntime(runtime, true);
  const cancel = () => { void runtime.shutdown().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) throw new Error('Validation cancelled.');
    trace('starting runtime');
    const started = await runtime.start(temporary, appId);
    trace('runtime ' + started.status);
    if (started.status !== 'running') return { ...result, blocked: 'startup', error: started.error, logs: started.logs?.slice(-4000) };
    for (const relative of paths) {
      if (signal?.aborted) throw new Error('Validation cancelled.');
      const url = new URL(relative, started.url);
      if (url.origin !== new URL(started.url).origin) throw new Error('Verification cannot leave the App origin.');
      trace(relative);
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(25000)]) });
      const reader = response.body?.getReader(); let bytes = 0; const chunks = [];
      try {
        if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1_000_000) throw new Error('Verification response exceeded 1 MB.'); chunks.push(Buffer.from(chunk.value)); }
      } finally { await reader?.cancel(); }
      const check = { path: relative, status: response.status, passed: response.ok, bytes };
      const assertion = httpChecks.find(item => item.path === relative);
      if (assertion?.status !== undefined) check.passed = response.status === assertion.status;
      const body = Buffer.concat(chunks).toString('utf8');
      if (assertion?.contains && !body.includes(assertion.contains)) { check.passed = false; check.error = 'Expected response text is missing.'; }
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        try { const data = JSON.parse(body); check.json = true; if (Array.isArray(data.datasets)) check.datasetCount = data.datasets.length;
          if (assertion?.json) { const rule = assertion.json; const value = rule.path ? rule.path.split('.').reduce((current, key) => current?.[key], data) : data; if ((Object.hasOwn(rule, 'equals') && JSON.stringify(value) !== JSON.stringify(rule.equals)) || (rule.minItems !== undefined && (!Array.isArray(value) || value.length < rule.minItems))) { check.passed = false; check.error = 'JSON result did not satisfy its acceptance assertion.'; } } }
        catch { check.passed = false; check.error = 'Invalid JSON response.'; }
      }
      if (assertion?.json && !check.json) { check.passed = false; check.error = 'Expected JSON response.'; }
      result.checks.push(check);
    }
    result.passed = result.checks.every(check => check.passed);
    trace('HTTP done');
    if (result.passed && browser) {
      result.browser = await browser({ url: started.url, steps: browserSteps, signal, runtime, app: isolatedApp, originalApp: app });
      result.passed = result.browser.passed; result.scope = 'host-http-and-browser';
      result.remainingChecks = ['Only the declared acceptance workflow was checked; scientific validity and untested workflows are not certified.'];
      if (!result.passed) result.error = result.browser.error;
    }
    return result;
  } catch (error) { return { ...result, passed: false, error: String(error.message).slice(0, 2000) }; }
  finally { signal?.removeEventListener('abort', cancel); await runtime.shutdown(); onRuntime(runtime, false); fs.rmSync(temporary, { recursive: true, force: true }); }
}
module.exports = { verifyApp };
