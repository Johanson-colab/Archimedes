const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync, deflateRawSync } = require('node:zlib');
const { ensureManagedEngine, readDownload } = require('./managed-latex-engine.cjs');
const { extractExecutable } = require('./latex-engine-archive.cjs');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const binary = Buffer.from('verified compiler fixture');
function tar(data) {
  const header = Buffer.alloc(512); header.write('tectonic'); header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header[156] = 48;
  return gzipSync(Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]));
}
function zip(data) {
  const name = Buffer.from('tectonic.exe'), compressed = deflateRawSync(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const offset = local.length + name.length + compressed.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}
const archive = tar(binary);
const engineManifest = { version: 'test', platforms: { 'linux-x64': { url: 'https://github.com/example/fixture.tar.gz', member: 'tectonic', sha256: hash(archive), executableSha256: hash(binary) } } };
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-tex-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('extracts executable bytes from tar.gz and deflated Windows ZIP without writing archive paths', () => {
  assert.deepEqual(extractExecutable(archive, 'tectonic'), binary);
  assert.deepEqual(extractExecutable(zip(binary), 'tectonic.exe', true), binary);
  assert.throws(() => extractExecutable(archive, '../tectonic'), /no/);
  assert.throws(() => extractExecutable(Buffer.alloc(10), 'tectonic.exe', true), /Invalid/);
});
test('concurrent first use downloads once; verified warm cache works offline and corrupt cache is replaced', async (t) => {
  const runtimeRoot = temporary(t); let downloads = 0;
  const options = { runtimeRoot, engineManifest, platform: 'linux', arch: 'x64', fetchImpl: async () => { downloads++; await new Promise((r) => setTimeout(r, 5)); return new Response(archive); } };
  const [first, second] = await Promise.all([ensureManagedEngine(options), ensureManagedEngine(options)]);
  assert.equal(first, second); assert.equal(downloads, 1); assert.deepEqual(fs.readFileSync(first), binary);
  const offline = await ensureManagedEngine({ ...options, fetchImpl: () => { throw new Error('offline'); } }); assert.equal(offline, first);
  fs.writeFileSync(first, 'corrupt'); await ensureManagedEngine(options); assert.equal(downloads, 2); assert.deepEqual(fs.readFileSync(first), binary);
});
test('checksum and download failures leave no executable, and retry can recover', async (t) => {
  const runtimeRoot = temporary(t); const options = { runtimeRoot, engineManifest, platform: 'linux', arch: 'x64' };
  await assert.rejects(ensureManagedEngine({ ...options, fetchImpl: async () => new Response('tampered archive') }), /checksum/);
  await assert.rejects(ensureManagedEngine({ ...options, fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
  assert.deepEqual(fs.readdirSync(runtimeRoot), []);
  const executable = await ensureManagedEngine({ ...options, fetchImpl: async () => new Response(archive) }); assert.deepEqual(fs.readFileSync(executable), binary);
  const wrongBinary = { ...engineManifest, platforms: { 'linux-x64': { ...engineManifest.platforms['linux-x64'], executableSha256: hash(Buffer.from('other binary')) } } };
  await assert.rejects(ensureManagedEngine({ ...options, engineManifest: wrongBinary, fetchImpl: async () => new Response(archive) }), /executable checksum/);
});
test('packaged archive is verified and unpacked without network access; invalid archive never downloads a replacement', async (t) => {
  const runtimeRoot = temporary(t), resourcesPath = path.join(runtimeRoot, 'resources'); fs.mkdirSync(path.join(resourcesPath, 'latex-engine'), { recursive: true });
  const bundled = path.join(resourcesPath, 'latex-engine', 'engine.tar.gz'); fs.writeFileSync(bundled, archive);
  const options = { runtimeRoot, resourcesPath, engineManifest, platform: 'linux', arch: 'x64', fetchImpl: () => { throw new Error('must not download'); } };
  const executable = await ensureManagedEngine(options);
  assert.deepEqual(fs.readFileSync(executable), binary);
  fs.rmSync(executable);
  fs.writeFileSync(bundled, 'bad'); await assert.rejects(ensureManagedEngine(options), /archive checksum/);
});
test('unsupported platforms and oversized downloads fail explicitly', async (t) => {
  await assert.rejects(ensureManagedEngine({ runtimeRoot: temporary(t), platform: 'win32', arch: 'arm64' }), /does not support/);
  await assert.rejects(readDownload(new Response('12345'), 4), /size limit/);
});
