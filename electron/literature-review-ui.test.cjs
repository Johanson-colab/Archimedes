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
  const icon = () => null; const tfn = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
  const build = new Function('React', 'useEffect', 'useRef', 'useState', 'ArrowRight', 'BookOpenText', 'Check', 'Download', 'ExternalLink', 'History', 'LoaderCircle', 'Network', 'Search', 'X', 'useUISettings', `${code}\nreturn LiteratureReviewView;`);
  const View = build(React, React.useEffect, React.useRef, React.useState, icon, icon, icon, icon, icon, icon, icon, icon, icon, icon, () => ({ t: tfn }));
  const paper = { external_id: 'a', title: 'Test paper', authors: ['Researcher'], year: 2024, venue: '', source: 'arxiv', abstract: 'Abstract text', url: 'https://example.org/paper', pdf_url: '', citation_count: 0 };
  const calls = [], record = { id: '12345678-1234-4234-8234-123456789012', question: 'How do agents learn from failure?', source: 'arxiv', createdAt: '2026-01-01', history: [{ query: 'test query', count: 1, round: 1 }], totalCandidates: 1, edges: [], warnings: [], results: [{ paper, reason: 'Relevant', score: 9, lanes: ['query:1'] }] };
  const bridge = { searchLiterature: async input => { calls.push(input); return record; }, listLiteratureSearchHistory: async () => [], saveLiteratureSearchHistory: async ({ record: value }) => [value], onLiteratureSearchProgress: () => () => {}, generateLiteratureOutline: async input => { calls.push(input); return [{ title: 'Findings', description: 'Compare', sources: [1] }]; }, generateLiteratureReview: async input => { calls.push(input); return { sections: [{ title: 'Findings', paragraphs: [{ text: 'A finding', sources: [1], evidence: [{ source: 1, quote: 'Abstract text' }] }] }], limitations: 'Abstracts only' }; } };
  await React.act(async () => root.render(React.createElement(View, { bridge, workspace: '/workspace', projectId: 'project' })));
  const input = document.querySelector('textarea'); await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'How do agents learn from failure?'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  async function click(text) { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(text) || item.getAttribute('aria-label') === text); assert.ok(button, text); await React.act(async () => button.click()); }
  await click('Find papers'); assert.match(document.body.textContent, /Test paper/); await click('Select Test paper'); await click('Build outline'); assert.match(document.body.textContent, /Review the outline/); await click('Generate review');
  assert.equal(calls[1].papers[0].title, 'Test paper'); assert.equal(calls[2].outline[0].sources[0], 1); assert.match(document.body.textContent, /A finding/); assert.equal(document.querySelector('.lit-citation').getAttribute('href'), '#lit-reference-1'); assert.match(document.getElementById('lit-reference-1').textContent, /Test paper/);
});
