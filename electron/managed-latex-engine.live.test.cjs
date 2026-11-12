const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const { createManagedCompiler } = require('./managed-latex-engine.cjs');
// Optional real-engine integration test. The local fixture must be a flat
// Tectonic directory bundle with a SHA256SUM. It is never shipped to users.
test('real managed compiler fetches fonts/packages and recompiles with the server offline', {
  skip: !process.env.ARCHIMEDES_TEX_TEST_BUNDLE ? 'Set ARCHIMEDES_TEX_TEST_BUNDLE to a local TeX fixture' : false,
  timeout: 180_000,
}, async (t) => {
  const bundle = process.env.ARCHIMEDES_TEX_TEST_BUNDLE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-tex-live-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entries = [], offsets = new Map(); let offset = 0, requests = 0;
  for (const name of fs.readdirSync(bundle)) {
    const file = path.join(bundle, name), stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile()) continue;
    const entry = { name, offset, size: stat.size }; entries.push(entry); offsets.set(offset, entry); offset += stat.size + 1;
  }
  const index = gzipSync(Buffer.from(entries.map((entry) => `${entry.name} ${entry.offset} ${entry.size}\n`).join('')));
  const server = http.createServer((req, res) => {
    requests++;
    if (req.url.endsWith('.index.gz')) { res.writeHead(200, { 'content-length': index.length }); res.end(index); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-length': offset, 'accept-ranges': 'bytes' }); res.end(); return; }
    const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
    const entry = range && offsets.get(Number(range[1]));
    if (!entry) { res.writeHead(404); res.end(); return; }
    const data = fs.readFileSync(path.join(bundle, entry.name)).subarray(0, Number(range[2]) - Number(range[1]) + 1);
    res.writeHead(206, { 'content-length': data.length, 'content-range': `bytes ${entry.offset}-${entry.offset + data.length - 1}/${offset}` }); res.end(data);
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(path.join(root, 'paper'));
  fs.writeFileSync(path.join(root, 'paper/main.tex'), '\\documentclass{article}\n\\font\\conferencefont=phvb at 8pt\n\\begin{document}{\\conferencefont Managed Helvetica font.}\\end{document}\n');
  const compile = createManagedCompiler({ runtimeRoot: path.join(root, 'runtime'), resourcesPath: process.env.ARCHIMEDES_TEX_TEST_RESOURCES, bundle: `http://127.0.0.1:${server.address().port}/bundle.tar` });
  const cold = await compile(root, 'paper/main.tex');
  assert.equal(cold.ok, true, cold.log); assert.equal(cold.engine, 'tectonic'); assert.ok(requests > 2);
  const downloaded = requests;
  await new Promise((resolve) => server.close(resolve));
  const queued = compile(root, 'paper/main.tex');
  const coalesced = compile(root, 'paper/main.tex');
  assert.equal(queued, coalesced, 'coalesce queued autosave builds');
  const warm = await queued;
  assert.equal(warm.ok, true, warm.log); assert.equal(requests, downloaded);
  assert.equal(fs.readFileSync(path.join(root, warm.pdf_path)).subarray(0, 5).toString(), '%PDF-');
  await assert.rejects(compile(root, '../outside.tex'), /workspace-relative/);
  assert.equal((await compile(root, 'paper/main.tex')).ok, true, 'a rejected build must not block later builds');
});
