const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');
const { report } = require('./test-support/deep-reading.cjs');

test('illustrated readings survive restart and keep presentation-compatible legacy fields', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-reading-store-'));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-reading-idle-'));
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const library = store.createLibrary({ name: 'Fixture' });
  const paper = store.addPaper(library.id, { title: 'Fixture paper', authors: [] });
  const reading = report(root);
  const input = { reading, specialists: ['related', 'method', 'experiments', 'limitations'].map(id => ({ id, title: id, status: 'complete', response: 'Evidence on PDF p. 1.', error: '' })), summary: { response: 'Complete illustrated reading.' }, supervisor: { reason: 'Checked source evidence.' } };
  store.savePaperReview(paper.id, input, library.project_id);
  store.openWorkspace(idle); store.openWorkspace(root);
  const saved = store.getPaperReview(paper.id, library.project_id);
  assert.equal(saved.reading.skill.id, 'paper-deep-reading'); assert.equal(saved.reading.sections.length, 7);
  assert.equal(saved.summary, input.summary.response); assert.equal(saved.specialists.length, 4);
  const invalid = structuredClone(input); invalid.reading.sections[0].blocks = [];
  assert.throws(() => store.savePaperReview(paper.id, invalid, library.project_id), /Invalid/);
  assert.equal(store.getPaperReview(paper.id, library.project_id).reading.title.en, reading.title.en);
  store.savePaperReview(paper.id, { ...input, reading: undefined, summary: { response: 'Legacy text report.' } }, library.project_id);
  const legacy = store.getPaperReview(paper.id, library.project_id);
  assert.equal(legacy.summary, 'Legacy text report.'); assert.equal(legacy.reading, undefined);
});
