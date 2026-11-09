const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stagePdf } = require('./paper-to-slides.cjs');
const { prepareResearchSkill } = require('./agent/research-skills.cjs');
function temp(t) { const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-slides-'))); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('selected PDF is copied to an isolated workspace task without overwriting the source', t => {
  const root = temp(t), input = path.join(root, 'research.pdf'); fs.writeFileSync(input, '%PDF-1.7\nexample');
  const one = stagePdf(root, input), two = stagePdf(root, input);
  assert.notEqual(one, two); assert.match(one, /paper-to-slides/); assert.equal(fs.readFileSync(one, 'utf8'), '%PDF-1.7\nexample');
  assert.equal(fs.readFileSync(input, 'utf8'), '%PDF-1.7\nexample');
  const fake = path.join(root, 'fake.pdf'); fs.writeFileSync(fake, 'not a PDF'); assert.throws(() => stagePdf(root, fake), /not a PDF/);
});
test('Codex and Claude install distinct bundled skills, preserve user changes, and resume', t => {
  const root = temp(t), records = [];
  for (const backend of ['codex', 'claude']) {
    const skill = prepareResearchSkill({ workspace: root, backend, thread: { id: backend, events: [] }, requested: 'paper-to-slides', recordEvent: e => records.push(e) });
    assert.match(fs.readFileSync(skill.skillFile, 'utf8'), /name: archimedes-paper2slides/);
    assert.ok(fs.existsSync(path.join(path.dirname(skill.skillFile), 'scripts', 'render_pptx.py')));
    assert.equal(fs.existsSync(path.join(path.dirname(skill.skillFile), 'scripts', 'audit_deck.py')), backend === 'codex');
    const resumed = prepareResearchSkill({ workspace: root, backend, thread: { id: backend, events: records }, requested: undefined });
    assert.equal(resumed.skillFile, skill.skillFile);
    fs.appendFileSync(skill.skillFile, '\nuser edit');
    assert.throws(() => prepareResearchSkill({ workspace: root, backend, thread: { id: backend, events: [] }, requested: 'paper-to-slides' }), /modified/);
  }
  assert.throws(() => prepareResearchSkill({ workspace: root, backend: 'opencode', thread: { id: 'x', events: [] }, requested: 'paper-to-slides' }), /Codex or Claude/);
});

test('page opens a PDF, switches example and sends the selected harness and settings', async () => {
  const { JSDOM } = require('jsdom'); const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'];
  const saved = Object.fromEntries(keys.map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require('react'), { createRoot } = require('react-dom/client'), icons = require('lucide-react');
  const scope = { React, ...React, ...icons, useUISettings: () => ({ t: key => key }), cover: 'cover.webp', motivation: 'motivation.webp', architecture: 'architecture.webp', collaboration: 'collaboration.webp', results: 'results.webp', examples: 'examples.webp', training: 'training.webp', evaluation: 'evaluation.webp' };
  const source = fs.readFileSync(path.join(__dirname, '../src/PaperToSlidesView.tsx'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export default /g, '');
  const { transformWithOxc } = await import('vite'); const { code } = await transformWithOxc(source, 'PaperToSlidesView.tsx', { jsx: { runtime: 'classic' } });
  const { PaperToSlidesView } = new Function(...Object.keys(scope), `${code}\nreturn {PaperToSlidesView};`)(...Object.values(scope));
  const root = createRoot(document.getElementById('root')); let submitted;
  const click = node => React.act(async () => { assert.ok(node); node.click(); });
  try {
    await React.act(async () => root.render(React.createElement(PaperToSlidesView, { bridge: { choosePaperReviewPdf: async () => '/papers/a.pdf' }, workspace: '/work', busy: false, onStart: async input => { submitted = input; } })));
    assert.ok(document.querySelector('.slides-primary').disabled);
    await click(document.querySelector('[aria-label="Next slide"]')); assert.match(document.querySelector('.slides-gallery-frame img').src, /motivation/);
    await click(document.querySelector('.slides-secondary')); assert.match(document.querySelector('.slides-file-name').textContent, /a.pdf/);
    const select = document.querySelector('.slides-fields select');
    await React.act(async () => { select.value = 'claude'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await click(document.querySelector('.slides-primary'));
    assert.equal(submitted.backend, 'claude'); assert.equal(submitted.pdfPath, '/papers/a.pdf'); assert.equal(submitted.length, 'auto');
  } finally { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value; }
});
