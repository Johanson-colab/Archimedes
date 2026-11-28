const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');
const { scaffoldApp } = require('./research-app-scaffold.cjs');
const { readApp, fingerprint, sourceFiles } = require('./research-app-runtime.cjs');
const { dependencyPlan, createFrontend, buildStatus, executeCommand } = require('./research-app-frontend.cjs');
function fixture(t, options = {}) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'react-app-test-')));
  const { directory } = scaffoldApp({ workspace, appId: 'sample', ...options });
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return { workspace, directory, app: () => readApp(workspace, 'sample') };
}
test('default scaffold is a pinned React/TS/Vite project with extracted host components and flexible compositions', t => {
  const f = fixture(t, { layout: 'editorial' });
  assert.equal(f.app().needsBuild, true); assert.equal(f.app().frontend.kind, 'react-vite');
  assert.match(fs.readFileSync(path.join(f.directory, 'src/App.tsx'), 'utf8'), /const layout = "editorial"/);
  assert.ok(dependencyPlan(f.app()).packages.react);
  for (const name of ['Tabs.tsx', 'Dialog.tsx', 'DialogPortal.tsx', 'useDialogFocus.ts', 'StateView.tsx']) assert.equal(fs.readFileSync(path.join(f.directory, 'src/archimedes', name), 'utf8'), fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'));
  assert.equal(fs.readFileSync(path.join(f.directory, 'src/archimedes/tokens.css'), 'utf8'), fs.readFileSync(path.join(__dirname, '../src/tokens.css'), 'utf8'));
});
test('dependency setup rejects floating versions, external tarballs, linked packages and local npm configuration', t => {
  const f = fixture(t), pkgFile = path.join(f.directory, 'package.json'), lockFile = path.join(f.directory, 'package-lock.json');
  const pkg = fs.readFileSync(pkgFile, 'utf8'), lock = fs.readFileSync(lockFile, 'utf8');
  const changed = JSON.parse(pkg); changed.dependencies.react = '^19.0.0'; fs.writeFileSync(pkgFile, JSON.stringify(changed));
  assert.throws(() => dependencyPlan(f.app()), /exact registry/); fs.writeFileSync(pkgFile, pkg);
  const tree = JSON.parse(lock); const entry = Object.values(tree.packages).find(item => item.resolved); entry.resolved = 'https://evil.example/package.tgz'; fs.writeFileSync(lockFile, JSON.stringify(tree));
  assert.throws(() => dependencyPlan(f.app()), /npm registry/); fs.writeFileSync(lockFile, lock);
  fs.writeFileSync(path.join(f.directory, '.npmrc'), 'registry=https://example.com');
  assert.throws(() => dependencyPlan(f.app()), /npm configuration/);
});
test('build approval, compiler errors and cancellation never manufacture valid artifacts', async t => {
  const f = fixture(t); let commands = 0;
  await assert.rejects(createFrontend({ approve: async () => false, execute: async () => { commands++; } }).build(f.workspace, 'sample'), /not approved/);
  assert.equal(commands, 0);
  const builder = createFrontend({ approve: async () => true, execute: async (_command, args) => { if (args[0] === '-p') return '22.12.0'; if (args[0].includes('typescript')) throw new Error('TypeScript error: incorrect type'); return ''; } });
  await assert.rejects(builder.build(f.workspace, 'sample'), /incorrect type/);
  assert.equal(buildStatus(f.app()).current, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(builder.build(f.workspace, 'sample', { signal: controller.signal }));
});
test('output is separate from source snapshots; tampered bundles and edited source invalidate the build', async t => {
  const f = fixture(t), commands = [];
  const builder = createFrontend({ approve: async () => true, execute: async (command, args) => {
    commands.push([command, args]);
    if (args[0] === '-p') return '22.12.0';
    if (args[0].includes('vite.js')) { const dir = path.join(f.directory, args[args.indexOf('--outDir') + 1]); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Compiled fixture</h1>'); }
    return '';
  } });
  const before = fingerprint(f.app()); await builder.build(f.workspace, 'sample');
  assert.equal(buildStatus(f.app()).current, true); assert.equal(fingerprint(f.app()), before);
  assert.ok(sourceFiles(f.app()).every(file => !file.path.startsWith('public/')));
  assert.ok(commands.some(([, args]) => args.includes('--ignore-scripts')));
  fs.appendFileSync(path.join(f.directory, 'public/index.html'), 'tampered');
  assert.equal(f.app().needsBuild, true);
  fs.appendFileSync(path.join(f.directory, 'src/App.tsx'), '\n// revised');
  assert.notEqual(fingerprint(f.app()), before);
});
test('build commands do not inherit unrelated credentials', async t => {
  const f = fixture(t); process.env.ARCHIMEDES_FRONTEND_TEST_SECRET = 'synthetic';
  try { assert.equal((await executeCommand('node', ['-p', "'ARCHIMEDES_FRONTEND_TEST_SECRET' in process.env"], f.directory)).trim(), 'false'); }
  finally { delete process.env.ARCHIMEDES_FRONTEND_TEST_SECRET; }
});

test('compiler-error repair still preserves the existing acceptance contract', async t => {
  const f = fixture(t), planFile = path.join(f.directory, 'research-app.checks.json');
  const plan = JSON.parse(fs.readFileSync(planFile)); delete plan.starter; fs.writeFileSync(planFile, JSON.stringify(plan));
  const pipeline = require('./research-app-delivery.cjs').createDelivery({ build: async () => { throw new Error('TypeScript compilation failed'); }, repair: async () => {
    plan.browser.at(-1).text = 'weakened'; fs.writeFileSync(planFile, JSON.stringify(plan));
  } });
  const result = await pipeline.validate(f.workspace, 'sample', { repairBackend: 'codex' });
  assert.equal(result.status, 'failed'); assert.match(result.error, /changed the acceptance plan/);
});
