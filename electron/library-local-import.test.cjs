const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');
const { importLocalPaper } = require('./library-local-import.cjs');

function samplePdf(text = "Research paper") {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length 44 >>\nstream\nBT /F1 12 Tf 40 200 Td (${text}) Tj ET\nendstream'.replace('${text}', text)];
  let data = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(data); data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) data += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return `${data}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

test('imports a local PDF into a library and indexes it without duplicating identical files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-local-paper-'));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-local-idle-'));
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const library = store.createLibrary({ name: 'Research' });
  const input = path.join(root, 'My paper.pdf'); fs.writeFileSync(input, samplePdf());
  const paper = await importLocalPaper({ workspace: root, libraryId: library.id, localPath: input, store });
  assert.equal(paper.title, 'My paper');
  const reader = store.getPaperReader(paper.id);
  assert.equal(reader.asset.status, 'ready');
  assert.equal(reader.asset.page_count, 1);
  assert.ok(fs.existsSync(path.join(root, reader.asset.relative_path)));
  assert.match(store.findPaperPassages(paper.id, 'Research')[0].excerpt, /Research paper/);
  const duplicate = await importLocalPaper({ workspace: root, libraryId: library.id, localPath: input, store });
  assert.equal(duplicate.id, paper.id);
  store.openWorkspace(idle); store.openWorkspace(root);
  assert.equal(store.getPaperReader(paper.id).asset.status, 'ready');
  const invalid = path.join(root, 'broken.pdf'); fs.writeFileSync(invalid, 'not a pdf');
  await assert.rejects(importLocalPaper({ workspace: root, libraryId: library.id, localPath: invalid, store }), /PDF/);
  assert.equal(store.listPapers(library.id).filter((item) => item.title === 'broken').length, 0);
  await assert.rejects(importLocalPaper({ workspace: root, libraryId: 'missing', localPath: input, store }), /library/);
  assert.equal(fs.readdirSync(path.join(root, '.archimedes', 'papers')).some((name) => name.startsWith('import-')), false);
});


test('different local PDFs with the same filename retain their assets and indexed pages', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-local-identities-'));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-local-identities-idle-'));
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const library = store.createLibrary({ name: 'Research' });
  for (const name of ['a', 'b']) fs.mkdirSync(path.join(root, name));
  const a = path.join(root, 'a', 'Paper.pdf'), b = path.join(root, 'b', 'Paper.pdf');
  fs.writeFileSync(a, samplePdf('Alpha evidence')); fs.writeFileSync(b, samplePdf('Bravo evidence'));
  const first = await importLocalPaper({ workspace: root, libraryId: library.id, localPath: a, store });
  const firstReader = store.getPaperReader(first.id), firstBytes = fs.readFileSync(path.join(root, firstReader.asset.relative_path));
  const second = await importLocalPaper({ workspace: root, libraryId: library.id, localPath: b, store });
  assert.notEqual(second.id, first.id);
  assert.equal(first.title, second.title);
  assert.deepEqual(fs.readFileSync(path.join(root, firstReader.asset.relative_path)), firstBytes);
  assert.notEqual(store.getPaperReader(second.id).asset.relative_path, firstReader.asset.relative_path);
  assert.match(store.findPaperPassages(first.id, 'Alpha')[0].excerpt, /Alpha evidence/);
  assert.match(store.findPaperPassages(second.id, 'Bravo')[0].excerpt, /Bravo evidence/);
  assert.equal((await importLocalPaper({ workspace: root, libraryId: library.id, localPath: b, store })).id, second.id);
});
