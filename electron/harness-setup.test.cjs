const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const setup = require('./harness-setup.cjs');
const managed = require('./agent/managed-clis.cjs');
function storage(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-cli-setup-')));
  managed.initialize(root); t.after(() => { setup.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }); return root;
}
const hash = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const missing = async () => ({ installed: false });
function claudeFetch(payload, checksum = hash(payload)) {
  return async url => {
    if (url.endsWith('/latest')) return new Response('2.1.1');
    if (url.endsWith('/manifest.json')) return Response.json({ platforms: { 'darwin-arm64': { checksum } } });
    return new Response(payload);
  };
}
test('installation accepts only known harnesses and HTTPS official hosts, including redirects', async () => {
  for (const url of ['http://github.com/a', 'https://github.com.evil.test/a', 'https://user@github.com/a', 'https://localhost/a']) assert.throws(() => setup.safeUrl(url), /source/);
  assert.throws(() => setup.platformKey('linux', 'ia32'), /platform/);
  await assert.rejects(setup.install('__proto__', 1), /Unknown/);
  await assert.rejects(setup.releasePlan('codex', 'darwin', 'arm64', undefined, async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/binary' } })), /source/);
});
test('verified native binary is launch-tested, published and discoverable without changing PATH', async t => {
  storage(t); const payload = '#!/bin/sh\nprintf "test-cli 2.1.1\\n"\n';
  const beforePath = process.env.PATH;
  const result = await setup.install('claude', 1, { platform: 'darwin', arch: 'arm64', detectImpl: missing, fetchImpl: claudeFetch(payload) });
  assert.equal(result.binary, managed.binaryPath('claude')); assert.equal(result.installed, true);
  assert.equal((await setup.detect({ backend: 'claude', binary: result.binary })).installed, true);
  assert.equal(process.env.PATH, beforePath); assert.equal(fs.readFileSync(result.binary, 'utf8'), payload);
  assert.deepEqual(fs.readdirSync(path.dirname(result.binary)), ['claude']);
  await assert.rejects(setup.install('claude', 1, { detectImpl: missing }), /needs repair/);
  assert.equal(fs.readFileSync(result.binary, 'utf8'), payload);
});
test('checksum failures never execute or publish the downloaded bytes and staging is removed', async t => {
  storage(t); let executed = false;
  await assert.rejects(setup.install('claude', 1, { platform: 'darwin', arch: 'arm64', detectImpl: missing, fetchImpl: claudeFetch('bad bytes', '0'.repeat(64)), execute: async () => { executed = true; } }), /checksum/);
  assert.equal(executed, false); assert.equal(fs.existsSync(managed.binaryPath('claude')), false);
  assert.deepEqual(fs.readdirSync(path.dirname(managed.binaryPath('claude'))), []);
  assert.equal(setup.status('claude').phase, 'failed');
});
test('existing installations are reused without downloading or touching files', async t => {
  storage(t); const existing = { installed: true, binary: '/existing/cli' };
  assert.equal(await setup.install('codex', 1, { detectImpl: async () => existing, fetchImpl: async () => { throw Error('must not download'); } }), existing);
  assert.equal(setup.status('codex').phase, 'installed'); assert.equal(fs.existsSync(managed.binaryPath('codex')), false);
});
test('installs are serialized per backend and cancellation is bound to the initiating window', async t => {
  storage(t); let finish;
  const installation = setup.install('claude', 11, { detectImpl: () => new Promise(resolve => { finish = resolve; }) });
  await assert.rejects(setup.install('claude', 12), /already/);
  setup.cancel('claude', 12); finish({ installed: true }); assert.equal((await installation).installed, true);
  const cancelled = setup.install('claude', 11, { detectImpl: () => new Promise(resolve => { finish = resolve; }) });
  setup.cancel('claude', 11); finish({ installed: false });
  await assert.rejects(cancelled, /cancelled/); assert.equal(setup.status('claude').phase, 'cancelled');
  assert.equal(fs.existsSync(managed.binaryPath('claude')), false);
});
test('archive installs reject symbolic links and unsafe paths before launching a binary', async t => {
  const root = storage(t); const fixture = path.join(root, 'fixture'); fs.mkdirSync(fixture);
  fs.symlinkSync('/bin/sh', path.join(fixture, 'antigravity'));
  const archive = path.join(root, 'payload.tar.gz'); execFileSync('tar', ['-czf', archive, '-C', fixture, 'antigravity']);
  const payload = fs.readFileSync(archive);
  const fetchImpl = async url => url.endsWith('.json') ? Response.json({ version: '1.5.17', url: 'https://storage.googleapis.com/cli.tar.gz', sha512: hash(payload, 'sha512') }) : new Response(payload);
  await assert.rejects(setup.install('antigravity', 1, { platform: 'darwin', arch: 'arm64', detectImpl: missing, fetchImpl }), /Invalid CLI/);
  assert.equal(fs.existsSync(managed.binaryPath('antigravity')), false);
  let extracted = false;
  await assert.rejects(setup.install('antigravity', 1, { platform: 'darwin', arch: 'arm64', detectImpl: missing, fetchImpl, execute: async (_cmd, args) => { if (args[0] === '-tf') return { stdout: 'antigravity\n../outside\n' }; extracted = true; return { stdout: '' }; } }), /Unsafe/);
  assert.equal(extracted, false);
});
test('official OpenCode v2 metadata selects a verified platform npm binary', async () => {
  const urls = [];
  const result = await setup.releasePlan('opencode', 'win32', 'x64', undefined, async url => {
    urls.push(url);
    return Response.json(url.startsWith('https://opencode.ai') ? { version: '2.4.1', metadata: { package: '@opencode/cli' } } : { dist: { tarball: 'https://registry.npmjs.org/@opencode/cli-windows-x64-baseline/-/cli.tgz', integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64') } });
  });
  assert.match(urls[1], /cli-windows-x64-baseline/); assert.equal(result.member, 'package/bin/opencode.exe'); assert.equal(result.checksum.length, 128);
});
test('login commands quote executable paths and use each harness native sign-in command', () => {
  const file = "/tmp/with ' quote/$(touch should-not-exist)`cmd`";
  for (const [backend, args] of [['codex', ['login']], ['claude', ['auth', 'login']], ['opencode', ['auth', 'login']], ['antigravity', ['acp', '--login']]]) {
    const script = setup.loginSpec(backend, file);
    assert.match(script, /'\\''/); args.forEach(arg => assert.ok(script.includes(`'${arg}'`)));
    const windows = setup.loginSpec(backend, "C:\\with ' quote\\cli.exe", 'win32'); assert.match(windows, /with '' quote/);
  }
});
test('login opens an external terminal without reading credentials or treating launch as authenticated', async t => {
  storage(t); const requests = [];
  const result = await setup.login({ backend: 'antigravity' }, { platform: 'darwin', detectImpl: async () => ({ installed: true, binary: '/native/agy' }), spawnImpl: (command, args) => {
    requests.push({ command, args }); const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('exit', 0)); return child;
  } });
  assert.deepEqual(result, { opened: true }); assert.equal(requests[0].command, 'open'); assert.deepEqual(requests[0].args.slice(0, 2), ['-a', 'Terminal']);
  assert.match(fs.readFileSync(requests[0].args[2], 'utf8'), /'acp' '--login'/);
});

test('cancelling an in-progress download removes partial payloads without publishing an executable', async t => {
  storage(t); let started;
  const ready = new Promise(resolve => { started = resolve; });
  const payload = new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('partial payload')); started(); } });
  const fetchImpl = async url => {
    if (url.endsWith('/latest')) return new Response('2.1.1');
    if (url.endsWith('/manifest.json')) return Response.json({ platforms: { 'darwin-arm64': { checksum: '0'.repeat(64) } } });
    return new Response(payload);
  };
  const pending = setup.install('claude', 5, { platform: 'darwin', arch: 'arm64', fetchImpl, detectImpl: missing });
  // Wait for the installer to reach its streaming stage, not just fixture creation.
  await ready;
  while (setup.status('claude').phase !== 'downloading') await new Promise(resolve => setImmediate(resolve));
  setup.cancel('claude', 5); await assert.rejects(pending, /cancelled/);
  assert.equal(fs.existsSync(managed.binaryPath('claude')), false);
  assert.deepEqual(fs.readdirSync(path.dirname(managed.binaryPath('claude'))), []);
});
