const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const React = require('react');

test('search, edit outline, and draft retain selected source references', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true; global.crypto = require('node:crypto').webcrypto;
  const { createRoot } = require('react-dom/client'); const root = createRoot(document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; delete global.crypto; });
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/LiteratureReviewView.tsx'), 'utf8').replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'LiteratureReviewView.tsx', { jsx: { runtime: 'classic' } });
  const emptyError = 'No matching papers were found. Try broader keywords or another paper source.';
  const icon = () => null; const tfn = (key, values = {}) => (key === emptyError ? '未找到匹配的论文，请尝试更宽泛的关键词。' : key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
  const build = new Function('React', 'useEffect', 'useRef', 'useState', 'ArrowRight', 'BookOpenText', 'Check', 'Download', 'ExternalLink', 'History', 'LoaderCircle', 'Network', 'Plus', 'Search', 'X', 'useUISettings', `${code}\nreturn LiteratureReviewView;`);
  const View = build(React, React.useEffect, React.useRef, React.useState, icon, icon, icon, icon, icon, icon, icon, icon, icon, icon, icon, () => ({ t: tfn }));
  const paper = { external_id: 'a', title: 'Test paper', authors: ['Researcher'], year: 2024, venue: '', source: 'arxiv', abstract: 'Abstract text', url: 'https://example.org/paper', pdf_url: '', citation_count: 0 };
  const calls = [], record = { id: '12345678-1234-4234-8234-123456789012', question: 'How do agents learn from failure?', source: 'arxiv', createdAt: '2026-01-01', history: [{ query: 'test query', count: 1, round: 1 }], totalCandidates: 1, edges: [], warnings: [], results: [{ paper, reason: 'Relevant', score: 9, lanes: ['query:1'] }] };
  const savedByLibrary = { one: [], two: [] }; let refreshed = 0, failSearch = true;
  const bridge = { listLibraries: async () => [{ id: 'one', name: 'First' }, { id: 'two', name: 'Second' }], listLibraryPapers: async id => savedByLibrary[id], addLibraryPaper: async (id, value) => { const saved = { ...value, id: 'paper-id' }; savedByLibrary[id] = [saved]; return saved; }, searchLiterature: async input => { if (failSearch) throw new Error(`Error invoking remote method 'literature-search:run': Error: ${emptyError}`); calls.push(input); return record; }, listLiteratureSearchHistory: async () => [], saveLiteratureSearchHistory: async ({ record: value }) => [value], onLiteratureSearchProgress: () => () => {}, generateLiteratureOutline: async input => { calls.push(input); return [{ title: 'Findings', description: 'Compare', sources: [1] }]; }, generateLiteratureReview: async input => { calls.push(input); return { sections: [{ title: 'Findings', paragraphs: [{ text: 'A finding', sources: [1], evidence: [{ source: 1, quote: 'Abstract text' }] }] }], limitations: 'Abstracts only' }; } };
  await React.act(async () => root.render(React.createElement(View, { bridge, workspace: '/workspace', projectId: 'project', onLibraryImported: () => refreshed++ })));
  const input = document.querySelector('textarea'); await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'How do agents learn from failure?'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  async function click(text) { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(text) || item.getAttribute('aria-label') === text); assert.ok(button, text); await React.act(async () => button.click()); }
  await click('Find papers'); assert.match(document.querySelector('[role="alert"]').textContent, /未找到匹配的论文/); assert.doesNotMatch(document.body.textContent, /Error invoking remote method/); failSearch = false; await click('Find papers'); assert.match(document.body.textContent, /Test paper/); await click('Save Test paper'); assert.equal(savedByLibrary.one.length, 1); assert.equal(refreshed, 1); assert.ok(document.querySelector('[aria-label="Saved Test paper"]').disabled); const select = document.getElementById('lit-library'); await React.act(async () => { select.value = 'two'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); assert.ok(!document.querySelector('[aria-label="Save Test paper"]').disabled); await click('Save Test paper'); assert.equal(savedByLibrary.two.length, 1); await click('Select Test paper'); await click('Build outline'); assert.match(document.body.textContent, /Review the outline/); await click('Generate review');
  assert.equal(calls[1].papers[0].title, 'Test paper'); assert.equal(calls[2].outline[0].sources[0], 1); assert.match(document.body.textContent, /A finding/); assert.equal(document.querySelector('.lit-citation').getAttribute('href'), '#lit-reference-1'); assert.match(document.getElementById('lit-reference-1').textContent, /Test paper/);
});
