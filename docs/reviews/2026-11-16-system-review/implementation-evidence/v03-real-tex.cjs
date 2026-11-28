// Real executable / real bundle integration, separate from controlled-compiler tests.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { compileLatexDocument } = require('../../../../electron/latex-workspace.cjs');
const { readManuscriptSnapshot } = require('../../../../electron/manuscript-snapshot.cjs');
const manifest = require('../../../../shared/latex-engine.json');

async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-v03-real-')));
  const executable = process.env.ARCHIMEDES_TEX_EXECUTABLE || '/opt/homebrew/bin/tectonic';
  const start = Date.now();
  const cache = process.env.ARCHIMEDES_TEX_CACHE || path.join(root, '.archimedes/isolated-tex-cache');
  const timeoutMs = Number(process.env.ARCHIMEDES_TEX_TIMEOUT_MS) || 360_000;
  const result = { executable, executable_sha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), published_managed_sha256: manifest.platforms['darwin-arm64'].executableSha256, engine: spawnSync(executable, ['--version'], { encoding: 'utf8' }).stdout.trim(), bundle: manifest.bundleUrl, cache_provenance: process.env.ARCHIMEDES_TEX_CACHE ? 'task-owned retained partial download cache' : 'new empty task-owned cache', timeout_ms: timeoutMs, fixture: 'real Tectonic, article + section + bibliography', cold: null, warm_offline: null, cleanup: false };
  try {
    fs.mkdirSync(path.join(root, 'paper'));
    fs.writeFileSync(path.join(root, 'paper/main.tex'), '\\documentclass{article}\n\\begin{document}\n\\input{section}\n\\bibliographystyle{plain}\\bibliography{refs}\n\\end{document}\n');
    fs.writeFileSync(path.join(root, 'paper/section.tex'), 'First version. Citation \\cite{sample}.\n');
    fs.writeFileSync(path.join(root, 'paper/refs.bib'), '@article{sample,author={Doe, Jane},title={First bibliography},journal={Example},year={2026}}\n');
    const options = { executable, managed: true, bundle: manifest.bundleUrl, timeoutMs, idleTimeoutMs: 60_000, env: { TECTONIC_CACHE_DIR: cache, XDG_CACHE_HOME: path.join(root, '.archimedes/isolated-xdg-cache') } };
    const cold = await compileLatexDocument(root, 'paper/main.tex', options);
    result.cold = { ok: cold.ok, timed_out: cold.timed_out, duration_ms: cold.duration_ms, diagnostics: cold.diagnostics, log: cold.log, snapshot: cold.source_snapshot };
    if (!cold.ok) return result;
    const firstPdf = fs.readFileSync(path.join(root, cold.pdf_path));
    fs.writeFileSync(path.join(root, 'paper/section.tex'), 'Second version. Citation \\cite{sample}.\n');
    fs.writeFileSync(path.join(root, 'paper/refs.bib'), '@article{sample,author={Doe, Jane},title={Updated bibliography},journal={Example},year={2026}}\n');
    const warm = await compileLatexDocument(root, 'paper/main.tex', { ...options, spawnImpl: (command, args, spawnOptions) => spawn(command, ['--only-cached', ...args], spawnOptions) });
    result.warm_offline = { ok: warm.ok, duration_ms: warm.duration_ms, diagnostics: warm.diagnostics, log: warm.log, snapshot: warm.source_snapshot };
    assert.equal(warm.ok, true, warm.log);
    assert.deepEqual(fs.readFileSync(path.join(root, cold.pdf_path)), firstPdf);
    assert.notEqual(warm.pdf_path, cold.pdf_path);
    assert.equal(readManuscriptSnapshot(root, cold.source_snapshot.manifest_path).current, false);
    assert.equal(readManuscriptSnapshot(root, warm.source_snapshot.manifest_path).current, true);
    result.retained_build_bytes = [cold, warm].map(item => ({ pdf: item.source_snapshot.pdf.bytes, log: item.source_snapshot.log.bytes, manifest: fs.statSync(path.join(root, item.source_snapshot.manifest_path)).size }));
    return result;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    result.cleanup = !fs.existsSync(root); result.duration_ms = Date.now() - start;
    console.log(JSON.stringify(result, null, 2));
  }
}
main().then(result => { if (!result.cold?.ok || !result.warm_offline?.ok) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
