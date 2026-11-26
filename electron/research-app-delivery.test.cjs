const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { scaffoldApp } = require('./research-app-scaffold.cjs');
const { createResearchAppRuntime, readApp } = require('./research-app-runtime.cjs');
const { createDelivery } = require('./research-app-delivery.cjs');
const records = require('./research-app-delivery-store.cjs');
const { readAcceptance } = require('./research-app-acceptance.cjs');
const success = { passed: true, scope: 'host-http-and-browser', checks: [{ path: '/', status: 200, passed: true }], browser: { passed: true, checks: [{ action: 'click', passed: true }, { action: 'expect', passed: true }] } };
function fixture(t, kind = 'static') {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-delivery-')));
  const app = scaffoldApp({ workspace, appId: 'sample', kind });
  const planFile = path.join(app.directory, 'research-app.checks.json');
  const plan = JSON.parse(fs.readFileSync(planFile)); delete plan.starter; plan.description = 'Verify the requested input processing workflow'; fs.writeFileSync(planFile, JSON.stringify(plan));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return { workspace, dir: app.directory, app: () => readApp(workspace, 'sample') };
}
function delivery(options = {}) { return createDelivery({ approve: async () => true, browser: async () => success.browser, verify: async () => success, ...options }); }

test('scaffold refuses overwrite and path traversal; starter-only workflows cannot be delivered', t => {
  const f = fixture(t);
  assert.throws(() => scaffoldApp({ workspace: f.workspace, appId: 'sample' }), /already exists/);
  assert.throws(() => scaffoldApp({ workspace: f.workspace, appId: '../other' }), /Invalid/);
  scaffoldApp({ workspace: f.workspace, appId: 'starter' });
  assert.throws(() => readAcceptance(readApp(f.workspace, 'starter')), /starter workflow/);
  const planFile = path.join(f.dir, 'research-app.checks.json'), plan = JSON.parse(fs.readFileSync(planFile));
  plan.http[0].path = '//example.com'; fs.writeFileSync(planFile, JSON.stringify(plan));
  assert.throws(() => readAcceptance(f.app()), /HTTP/);
});

test('installation requires current browser and HTTP evidence; source changes invalidate it', async t => {
  const f = fixture(t), runtime = createResearchAppRuntime({ approve: async () => true });
  t.after(() => runtime.shutdown());
  await assert.rejects(runtime.install(f.workspace, 'sample'), /Validate this App version/);
  const pipeline = delivery();
  assert.equal((await pipeline.validate(f.workspace, 'sample')).status, 'ready');
  await runtime.install(f.workspace, 'sample');
  fs.appendFileSync(path.join(f.dir, 'public/app.js'), '\n// changed version');
  assert.equal(runtime.list(f.workspace)[0].delivery.status, 'draft');
  assert.match((await runtime.start(f.workspace, 'sample')).error, /Validate this App version/);
  await assert.rejects(runtime.install(f.workspace, 'sample'), /Validate/);
});

test('HTTP-only success and absent browser evidence can never certify an App', async t => {
  const f = fixture(t);
  const pipeline = delivery({ verify: async () => ({ passed: true, checks: success.checks }) });
  assert.equal((await pipeline.validate(f.workspace, 'sample')).status, 'failed');
  assert.throws(() => records.requireVerified(f.app()), /Validate/);
});

test('configuration failures stop before repair and secrets are never copied into records', async t => {
  const f = fixture(t, 'python-http'); let repairs = 0;
  const pipeline = delivery({ repair: async () => repairs++ });
  assert.equal((await pipeline.validate(f.workspace, 'sample', { repairBackend: 'codex' })).status, 'needs-configuration');
  assert.equal(repairs, 0);
});

test('failed checks feed repairs, which are bounded to two attempts; no change is not a fix', async t => {
  const f = fixture(t); let calls = 0, repairs = 0;
  const pipeline = delivery({ verify: async () => { calls++; return { passed: false, error: 'Missing result element' }; }, repair: async ({ error }) => { assert.match(error, /Missing result/); repairs++; fs.appendFileSync(path.join(f.dir, 'public/app.js'), `\n// repair ${repairs}`); } });
  const result = await pipeline.validate(f.workspace, 'sample', { repairBackend: 'claude' });
  assert.equal(result.status, 'failed'); assert.equal(repairs, 2); assert.equal(calls, 3);
  const unchanged = delivery({ verify: async () => ({ passed: false }), repair: async () => {} });
  assert.match((await unchanged.validate(f.workspace, 'sample', { repairBackend: 'opencode' })).error, /no source changes/);
});

test('automatic repairs cannot weaken acceptance assertions or certify concurrent source changes', async t => {
  const f = fixture(t);
  const pipeline = delivery({ verify: async () => ({ passed: false }), repair: async () => {
    const file = path.join(f.dir, 'research-app.checks.json'), plan = JSON.parse(fs.readFileSync(file)); plan.browser.at(-1).text = 'Ready'; fs.writeFileSync(file, JSON.stringify(plan));
  } });
  assert.match((await pipeline.validate(f.workspace, 'sample', { repairBackend: 'codex' })).error, /changed the acceptance plan/);
  const racing = delivery({ verify: async () => { fs.appendFileSync(path.join(f.dir, 'public/app.js'), '\n// concurrent edit'); return success; } });
  assert.match((await racing.validate(f.workspace, 'sample')).error, /changed during validation/);
});

test('validation has an exclusive lock and cancellation cannot produce Ready', async t => {
  const f = fixture(t); let release;
  const pipeline = delivery({ verify: () => new Promise(resolve => { release = resolve; }) });
  const pending = pipeline.validate(f.workspace, 'sample');
  await new Promise(setImmediate);
  await assert.rejects(pipeline.validate(f.workspace, 'sample'), /already in progress/);
  await assert.rejects(pipeline.restore(f.workspace, 'sample'), /Cancel validation/);
  pipeline.cancel(f.workspace, 'sample'); release(success);
  await assert.rejects(pending, /cancelled/);
  assert.notEqual(records.deliveryStatus(f.app()).status, 'ready');
});

test('restore recovers broken manifests while preserving mutable data and the rejected source', async t => {
  const f = fixture(t), pipeline = delivery(); await pipeline.validate(f.workspace, 'sample');
  fs.mkdirSync(path.join(f.dir, '.data')); fs.writeFileSync(path.join(f.dir, '.data/favorites.json'), '["keep-me"]');
  fs.mkdirSync(path.join(f.dir, '.venv')); fs.writeFileSync(path.join(f.dir, '.venv/sentinel'), 'preserved');
  fs.writeFileSync(path.join(f.dir, 'research-app.json'), '{broken'); fs.writeFileSync(path.join(f.dir, 'new-file.js'), '// rejected source');
  const result = await pipeline.restore(f.workspace, 'sample');
  assert.equal(result.restored, true); assert.equal(records.deliveryStatus(f.app()).status, 'ready');
  assert.equal(fs.readFileSync(path.join(f.dir, '.data/favorites.json'), 'utf8'), '["keep-me"]');
  assert.equal(fs.readFileSync(path.join(f.dir, '.venv/sentinel'), 'utf8'), 'preserved');
  assert.equal(fs.existsSync(path.join(f.dir, 'new-file.js')), false);
  assert.equal(fs.readFileSync(path.join(result.recoveryPath, 'new-file.js'), 'utf8'), '// rejected source');
});

test('snapshot tampering and linked storage never overwrite working source', async t => {
  const f = fixture(t); await delivery().validate(f.workspace, 'sample');
  const fingerprint = records.identity(f.app()).fingerprint;
  const snapshot = path.join(f.workspace, '.archimedes/app-delivery/sample', `${fingerprint}.snapshot.json`);
  const saved = JSON.parse(fs.readFileSync(snapshot)); saved.files[0].content = Buffer.from('tampered').toString('base64'); fs.writeFileSync(snapshot, JSON.stringify(saved));
  assert.throws(() => records.restoreVerified(f.workspace, 'sample'), /integrity/);
  assert.match(fs.readFileSync(path.join(f.dir, 'public/index.html'), 'utf8'), /Research workspace/);
});
test('an interrupted host validation is retryable after restart', t => {
  const f = fixture(t); records.saveState(f.app(), { status: 'checking' });
  const file = path.join(f.workspace, '.archimedes/app-delivery/sample/state.json');
  const state = JSON.parse(fs.readFileSync(file)); state.ownerPid = 2147483647; fs.writeFileSync(file, JSON.stringify(state));
  const status = records.deliveryStatus(f.app()); assert.equal(status.status, 'failed'); assert.match(status.error, /interrupted/);
});

test('host shutdown aborts verification and cleans up its managed runtimes', async t => {
  const f = fixture(t); let stopped = 0;
  const pipeline = delivery({ verify: async ({ signal, onRuntime }) => {
    onRuntime({ shutdown: async () => { stopped++; } }, true);
    return new Promise(resolve => signal.addEventListener('abort', () => resolve({ passed: false }), { once: true }));
  } });
  const pending = pipeline.validate(f.workspace, 'sample'); await new Promise(setImmediate);
  await pipeline.shutdown(); await assert.rejects(pending, /cancelled/); assert.equal(stopped, 1);
});
