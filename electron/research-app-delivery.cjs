const { readApp } = require('./research-app-runtime.cjs');
const { readAcceptance } = require('./research-app-acceptance.cjs');
const { verifyApp } = require('./research-app-verify.cjs');
const store = require('./research-app-delivery-store.cjs');

function createDelivery({ setup, build, approve, readSecret = () => '', browser, repair, changed = () => {}, stop = async () => {}, verify = verifyApp } = {}) {
  const active = new Map(), runtimes = new Set(), pending = new Set();
  const key = (workspace, id) => `${require('node:fs').realpathSync(workspace)}\0${id}`;
  function cancel(workspace, id) { const controller = active.get(key(workspace, id)); controller?.abort(); return { cancelled: Boolean(controller) }; }
  async function validate(workspace, id, { repairBackend, signal } = {}) {
    const appKey = key(workspace, id);
    if (active.has(appKey)) throw new Error('App validation is already in progress.');
    const controller = new AbortController();
    let complete;
    const completion = new Promise(resolve => { complete = resolve; });
    active.set(appKey, controller); pending.add(completion);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    let app, attempts = 0;
    const update = state => { const record = store.saveState(app, { ...state, attempts }); changed(workspace); return record; };
    const cancelled = () => { if (controller.signal.aborted) throw new Error('Validation cancelled.'); };
    try {
      app = readApp(workspace, id); await stop(workspace, id);
      for (;;) {
        cancelled(); app = readApp(workspace, id);
        if (app.needsSetup) {
          update({ status: 'preparing' });
          if (!setup) { update({ status: 'needs-configuration', error: 'Prepare the App-local Python environment first.' }); break; }
          try { await setup(workspace, id, { signal: controller.signal }); }
          catch (error) { update({ status: 'needs-configuration', error: String(error.message).slice(0, 2000) }); break; }
          cancelled(); app = readApp(workspace, id);
        }
        if (app.environment.some(name => !readSecret(name))) { update({ status: 'needs-configuration', error: 'Add the declared keys in Settings → Environment, then validate again.' }); break; }
        let evidence, acceptedPlan;
        try { acceptedPlan = JSON.stringify(readAcceptance(app)); } catch { /* a missing/invalid plan may be repaired, but an existing valid plan is fixed */ }
        if (app.needsBuild) {
          update({ status: 'preparing' });
          try {
            if (!build) throw new Error('Frontend build requires the desktop App or the approved build CLI.');
            await build(workspace, id, { signal: controller.signal }); app = readApp(workspace, id);
          } catch (error) {
            const message = String(error.message).slice(-8000);
            if (/not approved|unavailable|Install Node|requires the desktop|package-lock|registry|ENOTFOUND|ECONN|network|npm configuration|exact.*version/i.test(message)) { update({ status: 'needs-configuration', error: message }); break; }
            evidence = { passed: false, error: message };
          }
        }
        cancelled();
        const expected = store.identity(app);
        if (!evidence) update({ status: 'checking' });
        try {
          if (!evidence) {
          const plan = readAcceptance(app); acceptedPlan = JSON.stringify(plan);
          if (!browser) throw new Error('Browser acceptance requires the Archimedes desktop app.');
          evidence = await verify({ workspace, appId: id, paths: [...new Set(['/', ...plan.http.map(check => check.path)])], httpChecks: plan.http, browser, browserSteps: plan.browser, approve, readSecret, signal: controller.signal, onRuntime: (runtime, running) => { if (running) runtimes.add(runtime); else runtimes.delete(runtime); } });
          }
        } catch (error) { evidence = { passed: false, error: String(error.message).slice(0, 2000) }; }
        cancelled();
        if (!store.same(store.identity(readApp(workspace, id)), expected)) { update({ status: 'failed', error: 'Source or environment changed during validation. Run validation again.' }); break; }
        if (evidence.passed && evidence.browser?.passed) {
          store.markVerified(app, { checks: evidence.checks, browser: evidence.browser, attempts, scope: evidence.scope }, expected); changed(workspace); break;
        }
        const error = evidence.error || evidence.checks?.filter(check => !check.passed).map(check => `${check.path}: ${check.error || check.status}`).join('; ') || 'App acceptance failed.';
        update({ status: 'failed', error, checks: evidence.checks || [], browser: evidence.browser });
        if (!repairBackend || !repair || attempts >= 2 || ['environment', 'credentials'].includes(evidence.blocked)) break;
        attempts++; update({ status: 'repairing', error });
        await repair({ app, backend: repairBackend, error, evidence, attempt: attempts, signal: controller.signal });
        cancelled();
        if (acceptedPlan && JSON.stringify(readAcceptance(readApp(workspace, id))) !== acceptedPlan) { update({ status: 'failed', error: 'Automatic repair changed the acceptance plan. Review it before validating again.' }); break; }
        if (store.same(store.identity(readApp(workspace, id)), expected)) { update({ status: 'failed', error: 'Repair made no source changes. The failed checks remain unresolved.' }); break; }
      }
      return store.deliveryStatus(readApp(workspace, id));
    } catch (error) {
      if (app) { try { app = readApp(workspace, id); update({ status: 'failed', error: String(error.message).slice(0, 2000) }); } catch { /* preserve prior failure if the manifest was damaged */ } }
      throw error;
    } finally {
      active.delete(appKey); pending.delete(completion); complete();
      signal?.removeEventListener('abort', abort);
    }
  }
  async function restore(workspace, id) {
    if (active.has(key(workspace, id))) throw new Error('Cancel validation before restoring a version.');
    await stop(workspace, id);
    const result = store.restoreVerified(workspace, id); changed(workspace);
    if (readApp(workspace, id).frontend) { result.delivery = await validate(workspace, id); }
    return result;
  }
  async function shutdown() {
    for (const controller of active.values()) controller.abort();
    await Promise.allSettled([...pending]);
    await Promise.allSettled([...runtimes].map(runtime => runtime.shutdown()));
  }
  function hasActiveValidation() { return active.size > 0 || pending.size > 0 || runtimes.size > 0; }
  return { validate, restore, cancel, shutdown, hasActiveValidation };
}
module.exports = { createDelivery };
