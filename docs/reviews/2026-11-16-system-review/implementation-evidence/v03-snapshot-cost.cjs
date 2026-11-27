const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { captureManuscriptSources } = require('../../../../electron/manuscript-snapshot.cjs');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-v03-cost-')));
try {
  fs.mkdirSync(path.join(root, 'paper/figures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'paper/main.tex'), '\\input{section}\n');
  fs.writeFileSync(path.join(root, 'paper/section.tex'), 'Snapshot measurement fixture.\n');
  const data = Buffer.alloc(256 * 1024, 31);
  for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(root, `paper/figures/asset-${i}.bin`), data);
  const durations = []; let snapshot;
  for (let i = 0; i < 5; i++) { const start = performance.now(); snapshot = captureManuscriptSources(root, 'paper/main.tex'); durations.push(Number((performance.now() - start).toFixed(3))); }
  console.log(JSON.stringify({ fixture: 'local synthetic 16 MiB / 66 files; warm filesystem; not an application performance benchmark', node: process.version, platform: process.platform, arch: process.arch, files: snapshot.files.length, bytes: snapshot.total_bytes, capture_ms: durations, source_manifest_bytes: Buffer.byteLength(JSON.stringify(snapshot)), source_copies_in_build: 0, file_hash_buffer_bytes: 64 * 1024 }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
