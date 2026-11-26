const { readApp, createResearchAppRuntime } = require('./research-app-runtime.cjs');

// Called through the native harness's normal command approval mechanism.
// This executes local App code, does not install dependencies or persist consent.
async function verifyApp({ workspace, appId, paths = ['/'] } = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 10 || paths.some(value => typeof value !== 'string' || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))) throw new Error('Provide up to ten App-relative HTTP paths.');
  const app = readApp(workspace, appId);
  const result = { appId, scope: 'host-startup-and-http', passed: false, checks: [], remainingChecks: ['Interactive page behavior and visual layout are not verified by this command.'] };
  if (app.needsSetup) return { ...result, blocked: 'environment', error: 'App-local Python environment is missing. Set it up before claiming this App is ready.' };
  if (app.environment.length) return { ...result, blocked: 'credentials', error: 'Verify this App in the host with explicitly approved Environment keys. This command does not read the vault.' };
  const runtime = createResearchAppRuntime({ approve: async () => true });
  try {
    const started = await runtime.start(workspace, appId);
    if (started.status !== 'running') return { ...result, blocked: 'startup', error: started.error };
    for (const relative of paths) {
      const url = new URL(relative, started.url);
      if (url.origin !== new URL(started.url).origin) throw new Error('Verification cannot leave the App origin.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25000) });
      const reader = response.body?.getReader(); let bytes = 0; const chunks = [];
      try {
        if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 1_000_000) throw new Error('Verification response exceeded 1 MB.'); chunks.push(Buffer.from(chunk.value)); }
      } finally { await reader?.cancel(); }
      const check = { path: relative, status: response.status, passed: response.ok, bytes };
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); check.json = true; if (Array.isArray(data.datasets)) check.datasetCount = data.datasets.length; }
        catch { check.passed = false; check.error = 'Invalid JSON response.'; }
      }
      result.checks.push(check);
    }
    result.passed = result.checks.every(check => check.passed);
    return result;
  } finally { await runtime.shutdown(); }
}
module.exports = { verifyApp };
