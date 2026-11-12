const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadOfficialTemplate, createPaperProject } = require('./official-latex-templates.cjs');
const content = '\\documentclass{article}\n\\begin{document}Test\\end{document}\n';
const template = { name: 'Fixture', sourceUrl: 'https://github.com/example/template', revision: 'test', assets: [{ path: 'main.tex', url: 'https://raw.githubusercontent.com/example/template/test/main.tex', sha256: createHash('sha256').update(content).digest('hex') }] };
test('downloads verified assets and reuses verified cache without network access', async () => {
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'template-cache-'));
  try {
    const files = await loadOfficialTemplate(template, { cacheDirectory, fetchImpl: async () => new Response(content) });
    assert.equal(files['main.tex'], content);
    const offline = await loadOfficialTemplate(template, { cacheDirectory, fetchImpl: async () => { throw new Error('offline'); } });
    assert.deepEqual(offline, files);
    fs.writeFileSync(path.join(cacheDirectory, template.assets[0].sha256), 'corrupt cache');
    await assert.rejects(loadOfficialTemplate(template, { cacheDirectory, fetchImpl: async () => new Response('wrong content') }), /checksum/);
  } finally { fs.rmSync(cacheDirectory, { recursive: true, force: true }); }
});
test('rejects unsafe asset paths and sources before downloading', async () => {
  for (const patch of [{ path: '../escape.tex' }, { url: 'http://raw.githubusercontent.com/a' }, { url: 'https://example.com/a' }]) {
    await assert.rejects(loadOfficialTemplate({ ...template, assets: [{ ...template.assets[0], ...patch }] }), /Invalid template asset/);
  }
});
test('a failed download does not create a partial paper project', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'template-failure-'));
  try {
    await assert.rejects(createPaperProject(root, 'paper', 'iclr-2027', { fetchImpl: async () => new Response('', { status: 503 }) }), /HTTP 503/);
    assert.deepEqual(fs.readdirSync(root), []);
    await assert.rejects(createPaperProject(root, 'paper', 'unknown-template'), /Unknown LaTeX template/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ICML's official example includes a PDF figure; decoding it as UTF-8 corrupts it.
test('binary template figures survive download, caching and project creation', async () => {
  const { writeLatexProject } = require('./latex-workspace.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'template-binary-'));
  const image = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x80]);
  const asset = { path: 'figure.pdf', url: 'https://raw.githubusercontent.com/example/template/test/figure.pdf', binary: true, sha256: createHash('sha256').update(image).digest('hex') };
  try {
    const files = await loadOfficialTemplate({ ...template, assets: [...template.assets, asset] }, { fetchImpl: async (url) => new Response(url.endsWith('figure.pdf') ? image : content) });
    writeLatexProject(root, 'paper', { id: 'fixture', files });
    assert.deepEqual(fs.readFileSync(path.join(root, 'paper/figure.pdf')), image);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
