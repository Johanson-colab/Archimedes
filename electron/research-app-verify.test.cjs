const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyApp } = require('./research-app-verify.cjs');
function fixture(t, kind = 'static') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-verify-'))), app = path.join(root, 'research-apps', 'sample');
  fs.mkdirSync(path.join(app, 'public'), { recursive: true });
  fs.writeFileSync(path.join(app, 'public/index.html'), '<h1>Sample</h1>'); fs.writeFileSync(path.join(app, 'public/data.json'), '{"datasets":[{"id":"synthetic"}]}');
  fs.writeFileSync(path.join(app, 'app.py'), 'print(1)');
  fs.writeFileSync(path.join(app, 'research-app.json'), JSON.stringify({ schemaVersion: 1, id: 'sample', name: 'Sample', category: 'analysis', runtime: { kind, entry: kind === 'static' ? 'public/index.html' : 'app.py' } }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { workspace: root, appId: 'sample' };
}
test('verification exercises the host and reports HTTP evidence without claiming browser coverage', async t => {
  const app = fixture(t);
  const result = await verifyApp({ ...app, paths: ['/', '/data.json'] });
  assert.equal(result.passed, true); assert.equal(result.checks.length, 2); assert.equal(result.checks[1].datasetCount, 1);
  assert.match(result.remainingChecks[0], /not verified/);
  const failure = await verifyApp({ ...app, paths: ['/missing'] });
  assert.equal(failure.passed, false); assert.equal(failure.checks[0].status, 404);
});
test('verification blocks missing environments and rejects external URLs', async t => {
  const app = fixture(t, 'python-http');
  const result = await verifyApp(app); assert.equal(result.passed, false); assert.equal(result.blocked, 'environment');
  await assert.rejects(verifyApp({ ...app, paths: ['https://example.com'] }), /App-relative/);
  await assert.rejects(verifyApp({ ...app, paths: ['//example.com'] }), /App-relative/);
});
