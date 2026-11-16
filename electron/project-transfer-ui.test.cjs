const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
let React, createRoot, Component, dom;
test.before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  React = require('react'); ({ createRoot } = require('react-dom/client'));
  const { transformWithOxc } = await import('vite');
  const { DEFAULT_TRANSFER_SELECTION } = await import('../src/project-transfer.ts');
  const source = fs.readFileSync(path.join(__dirname, '../src/ProjectTransferDialog.tsx'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'ProjectTransferDialog.tsx', { jsx: { runtime: 'classic' } });
  const scope = { React, ...React, DEFAULT_TRANSFER_SELECTION, Dialog: props => props.open ? React.createElement('section', { role: 'dialog' }, props.children) : null, useUISettings: () => ({ t: (text, values = {}) => text.replace(/\{([^}]+)\}/g, (_all, key) => String(values[key] ?? key)) }) };
  Component = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, '')}\nreturn ProjectTransferDialog;`)(...Object.values(scope));
});
test.after(() => { dom.window.close(); for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete global[key]; });
const preview = { format: 'archimedes-project', version: 1, name: 'Project A', path: '/chosen/project.archimedes-project', counts: { papers: 1, research_threads: 2 }, fileCount: 1, totalBytes: 20, unavailable: [{ category: 'pdfs', path: 'missing.pdf', reason: 'File missing' }], files: [{ category: 'sources', root: 'root-0', path: 'paper/main.tex', bytes: 20, sha256: 'a'.repeat(64) }] };
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
async function fixture(t, bridge = {}) {
  const root = createRoot(document.getElementById('root'));
  const props = { bridge, project: { id: 'project-a', name: 'Project A' }, dataRoot: '/data-a', onClose() {} };
  const render = async change => { Object.assign(props, change); await React.act(async () => root.render(React.createElement(Component, props))); };
  t.after(async () => { await React.act(async () => root.unmount()); });
  await render({}); return { props, render };
}
const click = async label => { assert.ok(button(label), label); await React.act(async () => button(label).click()); };

test('actual dialog selects content/source files, previews missing resources and requires preview before export', async t => {
  const calls = [];
  await fixture(t, {
    chooseProjectTransferSources: async () => ({ canceled: false, files: [{ workspaceId: 'workspace-a', threadId: 'old-session', path: 'paper/main.tex' }], excluded: 1 }),
    previewProjectPackage: async (id, selection) => { calls.push({ id, selection }); return preview; },
    exportProjectPackage: async (id, selection) => { calls.push({ id, selection }); return { canceled: false, package: preview }; },
  });
  assert.equal(button('Choose destination and export').disabled, true);
  const checkbox = [...document.querySelectorAll('label')].find(item => item.textContent === 'Conversations').querySelector('input');
  await React.act(async () => checkbox.click());
  await click('Add source files');
  assert.match(document.body.textContent, /1 selected source files/);
  await click('Preview package');
  assert.equal(calls[0].selection.conversations, false);
  assert.equal(calls[0].selection.sourceFiles[0].threadId, 'old-session');
  assert.match(document.body.textContent, /Unavailable resources are not included.*missing.pdf/s);
  assert.equal(document.querySelector('code').title, 'a'.repeat(64));
  await click('Choose destination and export');
  assert.match(document.body.textContent, /Project package saved to/);
});

test('restore preview is verified before choosing a new target and returns the imported project', async t => {
  const calls = [], imported = [];
  const f = await fixture(t, { inspectProjectPackage: async () => ({ canceled: false, package: preview }), importProjectPackage: async input => { calls.push(input); return { canceled: false, project: { id: 'new-project', name: 'Restored project' } }; } });
  await f.render({ onImported: project => imported.push(project) });
  await click('Restore project folder');
  assert.equal(button('Choose folder and restore'), undefined);
  await click('Choose package and verify');
  assert.match(document.body.textContent, /Existing projects and files are kept/);
  assert.match(document.body.textContent, /Running work becomes interrupted history/);
  await click('Choose folder and restore');
  assert.equal(calls[0].packagePath, preview.path); assert.equal(imported[0].id, 'new-project');
});

test('a late source-data preview cannot replace another project or leave it busy', async t => {
  let resolve;
  const f = await fixture(t, { previewProjectPackage: () => new Promise(done => { resolve = done; }) });
  await click('Preview package');
  await f.render({ project: { id: 'project-b', name: 'Project B' }, dataRoot: '/data-b' });
  await React.act(async () => resolve(preview));
  assert.doesNotMatch(document.body.textContent, /missing.pdf/);
  assert.equal(button('Preview package').disabled, false);
  assert.equal(button('Choose destination and export').disabled, true);
});
