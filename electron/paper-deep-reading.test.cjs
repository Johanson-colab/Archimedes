const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { normalizeReport, normalizeSection, SECTION_IDS } = require('../shared/paper-deep-reading.cjs');
const { generateDeepReading, ask, inspectPDF, createCodexReadingCall } = require('./paper-deep-reading.cjs');
const { renderReport, markdown } = require('./paper-deep-reading-render.cjs');
const { report, samplePdf, bi } = require('./test-support/deep-reading.cjs');
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-deep-reading-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }

test('structured readings preserve bilingual evidence and reject unsafe or incomplete content', t => {
  const root = temp(t), fixture = report(root), normalized = normalizeReport(fixture);
  assert.equal(normalized.skill.id, 'paper-deep-reading');
  const hostile = structuredClone(fixture); hostile.assets[0].path = '../../secret.jpg'; assert.throws(() => normalizeReport(hostile), /figure reference/);
  const short = structuredClone(fixture); short.sections[1].blocks = [{ type: 'paragraph', text: bi('摘要', 'Summary') }]; assert.throws(() => normalizeReport(short), /core chapter/);
  const missing = structuredClone(fixture); missing.sections[2].blocks[1].text.en = ''; assert.throws(() => normalizeReport(missing), /text.en/);
  assert.throws(() => normalizeSection({ id: 'method', title: bi('Method'), blocks: [{ type: 'script', text: bi('bad') }] }, { pageCount: 1 }), /Unsupported/);
});

test('offline rendering keeps originals, formulas, navigation and language/player state', async t => {
  const root = temp(t), fixture = report(root);
  fixture.sections.find(s => s.id === 'experiments').blocks.push({ type: 'table', caption: bi('测试结果', 'Results'), headers: [bi('方法', 'Method'), bi('分数', 'Score')], rows: [[bi('对照', 'Control'), 12]], source: bi('原文第1页。', 'Paper p. 1.'), pages: [1] });
  const html = renderReport(fixture, root);
  assert.match(html, /data:image\/jpeg;base64/); assert.match(html, /<math/); assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.match(markdown(normalizeReport(fixture), 'zh'), /图1：受控流程示例/);
  const withWarning = normalizeReport({ ...fixture, warnings: [bi('未经独立复现。', 'Not independently reproduced.')] });
  assert.match(markdown(withWarning, 'zh'), /未经独立复现。/);
  assert.match(markdown(withWarning, 'en'), /Source PDF pages: 1\./);
  const { default: ReactMarkdown } = await import('react-markdown');
  const { default: remarkGfm } = await import('remark-gfm');
  const renderedMarkdown = require('react-dom/server').renderToStaticMarkup(require('react').createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown(withWarning, 'en')));
  assert.match(renderedMarkdown, /<table>/);
  assert.match(renderedMarkdown, /<td>Control<\/td><td>12<\/td>/);
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(w) { w.scrollBy = () => {}; w.HTMLElement.prototype.scrollIntoView = function () { w.lastAnchor = this.id; }; w.matchMedia = () => ({ matches: false, addEventListener() {} }); w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); }; w.addEventListener('error', e => errors.push(e.message)); } });
  try {
    const d = dom.window.document, player = d.querySelector('.mechanism');
    assert.equal(d.querySelector('[data-source-page]'), null);
    assert.equal(d.querySelector('.reading-source-citation').textContent, 'PDF p. 1');
    assert.equal(d.querySelectorAll('.sidebar a.sub').length, 7);
    d.querySelector('.sidebar a[href="#method"]').click(); assert.equal(dom.window.lastAnchor, 'method');
    player.querySelector('[data-action="next"]').click(); assert.equal(player.querySelector('input').value, '1');
    d.getElementById('language').click(); assert.equal(d.documentElement.lang, 'en'); assert.equal(player.querySelector('input').value, '1');
    assert.match(player.querySelector('[data-frame="1"] [lang="en"]').textContent, /Produce output/);
    player.querySelector('[data-action="static"]').click(); assert.ok([...player.querySelectorAll('[data-frame]')].every(f => !f.hidden));
    d.querySelector('[data-figure-open]').click(); assert.equal(d.getElementById('figure-dialog').open, true);
    d.getElementById('figure-close').click(); assert.equal(d.getElementById('figure-dialog').open, false);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('real PDF parsing and vision crop feed seven sequential model-authored chapters and offline artifacts', async t => {
  const root = temp(t), input = path.join(root, 'source.pdf'); fs.writeFileSync(input, samplePdf());
  let active = 0, maximum = 0, calls = 0, selected;
  const call = async (_config, messages, options) => {
    active++; maximum = Math.max(maximum, active); calls++;
    assert.equal(options.allowTools, false); assert.equal(options.requireComplete, true);
    const user = messages.findLast(m => m.role === 'user').content;
    let value;
    if (Array.isArray(user)) {
      assert.match(user[1].image_url.url, /^data:image\/jpeg;base64,/);
      value = { crops: [{ id: selected.id, crop: { x: .1, y: .2, width: .8, height: .45 }, alt: bi('原图', 'Original figure') }] };
    } else if (user.startsWith('Plan a full')) {
      selected = JSON.parse(user.split('FIGURE CANDIDATES:\n')[1].split('\nPAPER EVIDENCE:')[0])[0];
      assert.equal(selected.page, 1);
      value = { title: bi('精读', 'Reading'), subtitle: bi('测试论文', 'Test paper'), sections: SECTION_IDS.map(id => ({ id, pages: [1], focus: 'Explain the actual source.' })), assetReview: [{ id: selected.id, decision: 'use', reason: bi('核心流程', 'Core process') }] };
    } else if (user.startsWith('Audit the reading')) value = { repairs: [], notes: [] };
    else {
      const id = user.match(/^Write the complete ([\w-]+) chapter/)[1];
      value = { id, title: bi(id), blocks: [ { type: 'paragraph', text: bi('原文给出一个流程。', 'The paper gives a process.'), pages: [1] }, { type: 'paragraph', text: bi('原文报告数值12。', 'The paper reports a value of 12.'), pages: [1] } ] };
      if (id === 'method') { value.blocks.push({ type: 'figure', assetId: selected.id, caption: bi('原图说明', 'Original figure explanation') }); value.blocks.push(report(root).sections.find(s => s.id === 'method').blocks.find(b => b.type === 'mechanism')); }
    }
    active--; return { content: JSON.stringify(value) };
  };
  const stages = [];
  const result = await generateDeepReading({ paper: { title: 'Fixture' }, pdfPath: input, workspace: root, config: { apiKey: 'test' }, call, emit: e => stages.push(e.stage) });
  assert.equal(result.reading.sections.length, 7); assert.equal(result.reading.assets.length, 1); assert.equal(result.specialists.length, 4);
  assert.equal(maximum, 1); assert.equal(calls, 10); assert.ok(stages.includes('audit'));
  const directory = path.dirname(path.dirname(path.join(root, result.reading.assets[0].path)));
  for (const file of ['paper_report.html', 'paper_report.zh.md', 'paper_report.en.md', 'report.json', 'source-inventory.json']) assert.ok(fs.existsSync(path.join(directory, file)), file);
});

test('cancellation and invalid model JSON stop with bounded retries', async t => {
  let calls = 0;
  await assert.rejects(ask({ apiKey: 'test' }, [], { call: async () => { calls++; return { content: 'not json' }; } }), /JSON/);
  assert.equal(calls, 2);
  const root = temp(t), input = path.join(root, 'source.pdf'); fs.writeFileSync(input, samplePdf());
  const controller = new AbortController();
  await assert.rejects(generateDeepReading({ paper: { title: 'Fixture' }, pdfPath: input, workspace: root, config: { apiKey: 'test' }, signal: controller.signal, call: async () => { controller.abort(); throw new Error('Codex connection closed'); } }), /reading was cancelled/i);
  const staged = path.join(root, '.archimedes/paper-deep-reading'); if (fs.existsSync(staged)) assert.equal(fs.readdirSync(staged).length, 0);
});


test('reading stages use one native Codex context and pass the bundled skill and page images', async t => {
  const root = temp(t), config = { backend: 'codex', model: 'test-native', permissionMode: 'ask' };
  const runs = [], activity = [];
  const call = createCodexReadingCall({ workspace: root, pdfPath: path.join(root, 'source.pdf'), config, emit: event => activity.push(event), run: async args => {
    runs.push(args);
    assert.equal(args.nativeSkill, 'paper-deep-reading');
    assert.equal(args.config, config);
    if (runs.length === 1) assert.equal(args.bindings.get(), null);
    else assert.equal(args.bindings.get().last_turn_id, runs[0].turn.id);
    args.bindings.save({ native_thread_id: 'native-thread', workspace: root, model: 'test-native', last_turn_id: args.turn.id });
    args.emit({ type: 'native_activity', activity: { title: 'Codex · reading source' } });
    return '{"ok":true}';
  } });
  await call(config, [{ role: 'system', content: 'Instructions' }, { role: 'user', content: 'Plan' }]);
  await call(config, [{ role: 'user', content: [{ type: 'text', text: 'Inspect' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } }] }]);
  assert.equal(runs[0].thread.id, runs[1].thread.id);
  assert.match(runs[0].turn.user_message, /Original source PDF path/);
  assert.equal(runs[1].thread.turns[0].id, runs[0].turn.id);
  assert.equal(runs[1].contextItems[0].image.dataUrl, 'data:image/jpeg;base64,AA==');
  assert.equal(activity[0].type, 'activity');
});


test('native execution failures are not replayed, while invalid output can be repaired in the same context', async () => {
  let attempts = 0;
  await assert.rejects(ask({ backend: 'codex' }, [], { call: async () => { attempts++; throw new Error('native outcome unknown'); } }), /outcome unknown/);
  assert.equal(attempts, 1);
  attempts = 0;
  const value = await ask({ backend: 'codex' }, [], { call: async (_config, messages) => {
    attempts++;
    if (attempts === 1) return { content: 'incomplete' };
    assert.match(messages.at(-1).content, /Do not repeat previous tool operations/);
    return { content: '{"ok":true}' };
  } });
  assert.equal(value.ok, true); assert.equal(attempts, 2);
});

test('native reading resumes completed planning, figures and chapters after interruption', async t => {
  const root = temp(t), input = path.join(root, 'source.pdf'); fs.writeFileSync(input, samplePdf());
  const paper = { id: 'checkpoint-paper', title: 'Fixture' }, config = { backend: 'codex' };
  const counts = { plan: 0, crop: 0, chapters: {}, audit: 0 }; let selected, interrupt = true;
  const call = async (_config, messages) => {
    const user = messages.findLast(m => m.role === 'user').content; let value;
    if (Array.isArray(user)) {
      counts.crop++; value = { crops: [{ id: selected.id, crop: { x: .1, y: .2, width: .8, height: .45 }, alt: bi('原图', 'Original figure') }] };
    } else if (user.startsWith('Plan a full')) {
      counts.plan++; selected = JSON.parse(user.split('FIGURE CANDIDATES:\n')[1].split('\nPAPER EVIDENCE:')[0])[0];
      value = { title: bi('精读', 'Reading'), subtitle: bi('测试论文', 'Test paper'), sections: SECTION_IDS.map(id => ({ id, pages: [1], focus: 'Explain the source.' })), assetReview: [{ id: selected.id, decision: 'use', reason: bi('核心流程', 'Core process') }] };
    } else if (user.startsWith('Audit the reading')) { counts.audit++; value = { repairs: [], notes: [] }; }
    else {
      const id = user.match(/^Write the complete ([\w-]+) chapter/)[1]; counts.chapters[id] = (counts.chapters[id] || 0) + 1;
      if (id === 'experiments' && interrupt) { interrupt = false; throw new Error('connection lost'); }
      value = { id, title: bi(id), blocks: [{ type: 'paragraph', text: bi('证据。', 'Evidence.'), pages: [1] }, { type: 'paragraph', text: bi('限制。', 'Limits.'), pages: [1] }] };
      if (id === 'method') value.blocks.push({ type: 'figure', assetId: selected.id, caption: bi('原图', 'Original') }, report(root).sections.find(s => s.id === 'method').blocks.find(b => b.type === 'mechanism'));
    }
    return { content: JSON.stringify(value) };
  };
  await assert.rejects(generateDeepReading({ paper, pdfPath: input, workspace: root, projectId: 'project', config, call }), /connection lost/);
  const directory = path.join(root, '.archimedes/paper-deep-reading/checkpoints');
  assert.equal(fs.readdirSync(directory).length, 1);
  await assert.rejects(generateDeepReading({ paper, pdfPath: input, workspace: root, projectId: 'project', ownerId: 'another-user', config, call: async (_config, messages) => {
    assert.match(messages.findLast(m => m.role === 'user').content, /^Plan a full/);
    throw new Error('different user starts independently');
  } }), /different user starts independently/);
  const result = await generateDeepReading({ paper, pdfPath: input, workspace: root, projectId: 'project', deferCheckpointCleanup: true, config, call });
  assert.ok(fs.existsSync(result.checkpointFile), 'checkpoint remains until the reading is stored');
  fs.unlinkSync(result.checkpointFile);
  assert.equal(result.reading.sections.length, 7);
  assert.equal(counts.plan, 1); assert.equal(counts.crop, 1);
  assert.equal(counts.chapters.overview, 1); assert.equal(counts.chapters.method, 1); assert.equal(counts.chapters.experiments, 2);
  assert.equal(counts.audit, 1); assert.deepEqual(fs.readdirSync(directory), []);
});


test('deadline cancellation reports the actual reason instead of a user cancellation', async t => {
  const root = temp(t), input = path.join(root, 'source.pdf'); fs.writeFileSync(input, samplePdf());
  const controller = new AbortController();
  await assert.rejects(generateDeepReading({ paper: { title: 'Fixture' }, pdfPath: input, workspace: root, config: { backend: 'codex' }, signal: controller.signal, call: async () => {
    controller.abort(new Error('Reading exceeded its time limit.')); throw new Error('Codex connection closed');
  } }), /exceeded its time limit/);
});
