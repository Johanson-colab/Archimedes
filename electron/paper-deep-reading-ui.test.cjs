const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const t = (s, args = {}) => s.replace(/\{(\w+)\}/g, (m, key) => args[key] ?? m);
async function component() {
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/PaperReviewWorkbench.tsx'), 'utf8').replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'reading-workbench.tsx', { jsx: { runtime: 'classic' } });
  const icon = () => null;
  const Tab = p => React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children);
  const Tabs = p => React.createElement('div', null, React.Children.map(p.children, child => React.cloneElement(child, { onClick: () => p.onChange(child.props.value) })));
  const build = new Function('React', 'useEffect', 'useMemo', 'useRef', 'useState', 'ReactMarkdown', 'remarkGfm', 'remarkMath', 'rehypeKatex', 'BookOpenCheck', 'Download', 'LoaderCircle', 'Square', 'PaperPresentationDeck', 'PaperDeepReadingDocument', 'Tab', 'Tabs', 'InlineNotice', 'useUISettings', `${code}\nreturn PaperReviewWorkbench;`);
  return build(React, React.useEffect, React.useMemo, React.useRef, React.useState, p => React.createElement('article', null, p.children), null, null, null, icon, icon, icon, icon, () => React.createElement('div', null, 'Presentation'), p => React.createElement('article', { 'data-reading': true }, p.html), Tab, Tabs, p => React.createElement('aside', { role: 'status' }, p.children), () => ({ t }));
}
async function setup(t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client'); const root = createRoot(document.getElementById('root')); const View = await component();
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; });
  const bridge = { cleanupPaperReviewRuns: async () => ({ threadIds: [] }), onPaperReviewEvent: () => () => {}, getPaperReview: async () => null, cancelPaperDeepReading: async () => ({ cancelled: true }), exportPaperDeepReading: async () => ({ saved: false, path: '' }) };
  const props = { bridge, workspace: '/workspace', projectId: 'project', paper: { id: 'p1', title: 'Paper' }, ready: true, pageCount: 1 };
  const render = async extra => act(async () => root.render(React.createElement(View, { ...props, ...extra })));
  return { root, render, bridge, props };
}
const click = async label => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === label); assert.ok(button, label); await act(async () => button.click()); };

test('saved illustrated reading is restored, exports, and survives a failed rerun', async t => {
  const f = await setup(t);
  f.bridge.getPaperReview = async () => ({ readingHtml: 'saved illustrated content', reading: { version: 1 }, summary: 'legacy-compatible text', updated_at: 'now' });
  let exports = 0;
  f.bridge.exportPaperDeepReading = async (_id, _workspace, project) => { assert.equal(project, 'project'); exports++; return { saved: true, path: '/exports/report' }; };
  f.bridge.runPaperReview = async () => { throw new Error('Provider unavailable'); };
  await f.render(); assert.match(document.querySelector('[data-reading]').textContent, /saved illustrated/);
  await click('Export reading'); assert.equal(exports, 1); assert.match(document.body.textContent, /exports\/report/);
  await click('Read again'); assert.match(document.body.textContent, /Provider unavailable/); assert.match(document.querySelector('[data-reading]').textContent, /saved illustrated/);
  await click('Presentation'); assert.match(document.body.textContent, /Presentation/);
});

test('cancellation stops progress while preserving the existing reading', async t => {
  const f = await setup(t); let reject;
  f.bridge.getPaperReview = async () => ({ readingHtml: 'previous content', reading: { version: 1 }, summary: 'text', updated_at: 'now' });
  f.bridge.runPaperReview = () => new Promise((_resolve, failure) => { reject = failure; });
  let cancelled = 0;
  f.bridge.cancelPaperDeepReading = async id => { assert.ok(id); cancelled++; reject(new Error('The reading was cancelled.')); return { cancelled: true }; };
  await f.render(); await click('Read again'); assert.ok(document.body.textContent.includes('Stop'));
  await click('Stop'); assert.equal(cancelled, 1); assert.match(document.querySelector('[data-reading]').textContent, /previous content/); assert.match(document.body.textContent, /cancelled/);
});

test('switching papers rejects late restoration from the previous paper and retains legacy text', async t => {
  const f = await setup(t); let finishOld;
  f.bridge.getPaperReview = id => id === 'p1' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ summary: 'Paper two legacy evidence', updated_at: 'now', specialists: [] });
  await f.render(); await f.render({ paper: { id: 'p2', title: 'Second' } });
  await act(async () => finishOld({ readingHtml: 'wrong paper content', summary: 'Wrong' }));
  assert.doesNotMatch(document.body.textContent, /wrong paper content/); assert.match(document.body.textContent, /Paper two legacy evidence/);
});

test('an older desktop bridge shows a restart message instead of invoking missing methods', async t => {
  const f = await setup(t); delete f.bridge.cancelPaperDeepReading; delete f.bridge.exportPaperDeepReading;
  await f.render(); assert.match(document.body.textContent, /Restart Archimedes/);
  assert.equal([...document.querySelectorAll('button')].find(b => b.textContent === 'Generate reading').disabled, true);
});

test('the isolated document accepts source navigation only from its own frame and within PDF bounds', async t => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  global.getComputedStyle = dom.window.getComputedStyle; global.MutationObserver = dom.window.MutationObserver;
  const { createRoot } = require('react-dom/client'), root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const name of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'getComputedStyle', 'MutationObserver']) delete global[name]; });
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/PaperDeepReadingDocument.tsx'), 'utf8').replace(/^import .*;\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'reading-document.tsx', { jsx: { runtime: 'classic' } });
  const View = new Function('React', 'useCallback', 'useEffect', 'useRef', 'useUISettings', `${code}\nreturn PaperDeepReadingDocument;`)(React, React.useCallback, React.useEffect, React.useRef, () => ({ language: 'en' }));
  const opened = [];
  await act(async () => root.render(React.createElement(View, { html: '<p>Reading</p>', title: 'Reading', pageCount: 7, onOpenSource: p => opened.push(p) })));
  const frame = document.querySelector('iframe'); assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-popups');
  const send = (source, page) => window.dispatchEvent(new dom.window.MessageEvent('message', { source, data: { type: 'paper-deep-reading:source', page } }));
  send(window, 2); send(frame.contentWindow, 0); send(frame.contentWindow, 8); send(frame.contentWindow, '3'); send(frame.contentWindow, 3);
  assert.deepEqual(opened, [3]);
});
