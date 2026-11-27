// No Docker/SSH/model process is started. These probes use current production
// modules and, for the IPC probe, its intact main-process registration block.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const repo = path.resolve(__dirname, '../../../..');

test('structured Docker-backend reads and writes stay inside the checkout through symlinks', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-repro-link-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'checkout'), outside = path.join(root, 'outside');
  fs.mkdirSync(checkout); fs.mkdirSync(outside);
  const original = 'external dataset configuration';
  fs.writeFileSync(path.join(outside, 'config.txt'), original);
  fs.symlinkSync(outside, path.join(checkout, 'data'), 'dir');
  const { createDockerBackend } = require(path.join(repo, 'electron/reproduction/docker.cjs'));
  const backend = createDockerBackend({ checkoutDir: checkout });
  let read = null, readRejected = false;
  try { read = await backend.readFile('data/config.txt'); } catch { readRejected = true; }
  let rejected = false;
  try { await backend.writeRepoFile('data/config.txt', 'rewritten by reproduction'); } catch { rejected = true; }
  const after = fs.readFileSync(path.join(outside, 'config.txt'), 'utf8');
  console.log(JSON.stringify({ probe: 'checkout-symlink', readExternalFile: read === original, readRejected, writeRejected: rejected, externalFileChanged: after !== original }));
  assert.equal(after, original, 'structured reproduction writes must not modify a sibling directory');
  assert.equal(readRejected, true);
  assert.equal(rejected, true);
});

test('Stop during provisioning prevents the pilot from starting afterward', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-repro-stop-review-')));
  const stores = require(path.join(repo, 'electron/store.cjs')), owner = stores.createWorkspaceStore(root);
  t.after(() => { owner.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const source = fs.readFileSync(path.join(repo, 'electron/main.cjs'), 'utf8');
  const start = source.indexOf('  const notifyRunFinished =');
  const end = source.indexOf('  ipcMain.handle("reproduction:plan"', start);
  assert.ok(start >= 0 && end > start, 'source block boundaries changed; reassess probe');
  const handlers = new Map();
  let releasePrepare, enteredPrepare;
  const prepareGate = new Promise(resolve => { releasePrepare = resolve; });
  const preparing = new Promise(resolve => { enteredPrepare = resolve; });
  let pilotStarted = false, pilotSignalAborted = null, disposed = 0;
  const created = owner.createReproduction({ title: 'Review only', repoUrl: 'https://github.com/example/review' });
  const record = owner.updateReproduction(created.id, { contract: { repo: { url: created.repo_url }, steps: [], findings: [] } });
  const backend = { image: 'fake', describe: () => 'fake', prepare: async () => { enteredPrepare(); await prepareGate; }, dispose: async () => { disposed++; } };
  const context = {
    console, AbortController, setTimeout, clearTimeout,
    createReproductionRunManager: require(path.join(repo, 'electron/reproduction/run-manager.cjs')).createReproductionRunManager,
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    Notification: { isSupported: () => false }, BrowserWindow: { fromWebContents: () => ({}), getAllWindows: () => [] },
    modelConfig: { getActiveModelConfig: () => ({ provider: 'custom', apiKey: 'fake-review-key' }) },
    store: owner,
    localCheckoutSnapshot: require(path.join(repo, 'electron/reproduction/run-snapshot.cjs')).localCheckoutSnapshot,
    presentReproduction: value => value, resolveWorkspace: value => value, workspaceForWindow: () => root, windowWorkspaces: new Map(),
    reproductionEnv: { values: () => ({}) }, reproductionEnvItems: () => [], sshServers: { listServers: () => [] }, repoNameFromUrl: () => 'review',
    getRepositoryCheckout: async () => ({ commit: 'fake' }), resolveAuditPath: async () => ({ root }),
    createDockerBackend: () => backend,
    runPilot: async ({ signal }) => { pilotStarted = true; pilotSignalAborted = signal.aborted; return { status: 'verified', steps: [], runbook: [], findings: [], log: '', summary: 'fake only' }; },
  };
  // Complete production registration + manager + real isolated SQLite facade.
  vm.runInNewContext(source.slice(start, end), context, { filename: 'main-reproduction-current-block.cjs' });
  const event = { sender: { id: 1, isDestroyed: () => false, send: () => {} } };
  await handlers.get('reproduction:run')(event, { id: record.id, workspace: root });
  await preparing;
  const stopped = await handlers.get('reproduction:stop')(event, { id: record.id });
  releasePrepare();
  await new Promise(setImmediate);
  console.log(JSON.stringify({ probe: 'stop-during-provisioning', stopReturned: stopped, pilotStartedAfterStop: pilotStarted, pilotSignalAborted, disposed }));
  assert.equal(pilotStarted, false, 'Stop must prevent inference/execution after setup completes');
  assert.equal(disposed, 1);
  assert.equal(owner.getReproduction(record.id).status, 'cancelled');
});

test('changing an executed runbook command invalidates its previous passed verdict', async () => {
  const { runPilot } = require(path.join(repo, 'electron/reproduction/pilot.cjs'));
  const decisions = [
    { action: 'run', command: 'old-check' },
    { action: 'advance', step: 'check', verdict: 'passed', evidence: 'Old configuration passed' },
    { action: 'revise', steps: [{ id: 'check', title: 'Run new experiment', command: 'new-check', check: { kind: 'manual', reason: 'review' } }] },
    { action: 'done', summary: 'New experiment verified' },
  ];
  const commands = [];
  const result = await runPilot({ title: 'Fake review', steps: [{ id: 'check', title: 'Old experiment', command: 'old-check', check: { kind: 'manual', reason: 'review' } }], backend: { exec: async (command, { onData }) => { commands.push(command); onData('Old configuration passed\n'); return { exitCode: 0 }; } }, complete: async () => ({ json: decisions.shift() || { action: 'ask', question: 'Stop fake review' } }) });
  console.log(JSON.stringify({ probe: 'stale-verdict', status: result.status, commands, finalCommand: result.runbook[0].command, finalStatus: result.runbook[0].status, evidence: result.runbook[0].evidence }));
  assert.notEqual(result.status, 'verified', 'a changed experiment needs its own executed evidence');
});

test('Stop while waiting for a pilot model decision is reported as stopped', async () => {
  const { runPilot } = require(path.join(repo, 'electron/reproduction/pilot.cjs'));
  const controller = new AbortController();
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const resultPromise = runPilot({ title: 'Fake review', signal: controller.signal,
    steps: [{ id: 'check', title: 'A pending check', check: { kind: 'manual', reason: 'review' } }], backend: {},
    complete: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Fake provider aborted'), { name: 'AbortError' })), { once: true });
      entered();
    }),
  });
  await waiting; controller.abort();
  const result = await resultPromise;
  console.log(JSON.stringify({ probe: 'stop-during-decision', status: result.status, summary: result.summary }));
  assert.equal(result.status, 'stopped', 'user cancellation must not become a model failure');
});
