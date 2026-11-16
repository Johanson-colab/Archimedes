const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const metrics = require('./metric-comparison.cjs');
let React, createRoot, Panel, dom;
test.before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  React = require('react'); ({ createRoot } = require('react-dom/client'));
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/MetricComparisonPanel.tsx'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'MetricComparisonPanel.tsx', { jsx: { runtime: 'classic' } });
  const scope = { React, ...React, useUISettings: () => ({ t: (text, values = {}) => text.replace(/\{([^}]+)\}/g, (_all, key) => String(values[key] ?? key)) }) };
  Panel = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, '')}\nreturn MetricComparisonPanel;`)(...Object.values(scope));
});
test.after(() => { dom.window.close(); for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete global[key]; });
const button = name => [...document.querySelectorAll('button')].find(item => item.textContent === name);
const click = async name => { assert.ok(button(name), name); await React.act(async () => button(name).click()); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(t, overrides = {}) {
  const table = await metrics.parseInput('numbers.csv', Buffer.from('metric,expected,actual,unit,dataset,tolerance\naccuracy,0.8,0.81,ratio,test,0.02\nrecall,0.9,,ratio,test,0.02\n'));
  const chosen = { token: 'chosen-a', name: table.name, sha256: table.sha256, bytes: table.bytes, format: 'csv', headers: table.headers, preview: table.rows, rowCount: table.rows.length };
  const calls = [], reports = [];
  const bridge = {
    chooseMetricComparisonInput: async () => ({ canceled: false, input: chosen }),
    listMetricComparisons: async () => reports.map(({ rows, ...summary }) => summary),
    getMetricComparison: async ({ comparisonId }) => reports.find(report => report.id === comparisonId),
    saveMetricComparison: async input => {
      calls.push(input); const compared = metrics.compare(table, input.mapping);
      const value = { id: 'comparison-a', title: input.title, owner: { runId: input.runId }, source: { name: table.name, path: 'saved/source.csv', sha256: table.sha256 }, runSnapshotSha256: 'b'.repeat(64), state: 'recorded', sourceState: 'ready', reasons: [], ...compared };
      reports.push(value); return value;
    }, ...overrides,
  };
  const root = createRoot(document.getElementById('root'));
  const props = { bridge, record: { id: 'record-a', project_id: 'project-a', workspace_id: 'workspace-a', execution_root: '/execution-a', title: 'Specific numeric claim', status: 'checks-passed' }, run: { id: 'run-a', reproduction_id: 'record-a', snapshot: { version: 1, final: null } }, ownerKey: '/data-a:project-a', projectId: 'project-a', workspaceId: 'workspace-a' };
  const render = async change => { Object.assign(props, change); await React.act(async () => root.render(React.createElement(Panel, props))); };
  t.after(async () => { await React.act(async () => root.unmount()); });
  await render({}); return { chosen, calls, reports, bridge, props, render };
}

test('actual panel requires confirmed mappings, saves once, shows all four categories and never promotes the run', async t => {
  const f = await fixture(t);
  await click('Choose CSV or JSON data');
  assert.equal(button('Compare and save').disabled, true);
  assert.match(document.body.textContent, /does not certify scientific reproduction/);
  await React.act(async () => document.querySelector('input[type="checkbox"]').click());
  await React.act(async () => { button('Compare and save').click(); button('Compare and save').click(); });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].mapping.expectedColumn, 'expected'); assert.equal(f.calls[0].mapping.actualColumn, 'actual');
  assert.equal(f.reports[0].counts.within, 1); assert.equal(f.reports[0].counts.missing, 1);
  for (const status of ['Missing value', 'Incomparable', 'Within tolerance', 'Outside tolerance']) assert.match(document.body.textContent, new RegExp(status));
  assert.equal(f.props.record.status, 'checks-passed');
  const expected = [...document.querySelectorAll('label')].find(label => label.textContent.startsWith('Expected value column')).querySelector('select');
  await React.act(async () => { expected.value = 'actual'; expected.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.equal(document.querySelector('input[type="checkbox"]').checked, false);
  assert.equal(button('Compare and save').disabled, true);
});

test('a late data chooser cannot inject source rows into another project scope', async t => {
  const pending = deferred();
  const f = await fixture(t, { chooseMetricComparisonInput: () => pending.promise });
  await click('Choose CSV or JSON data');
  await f.render({ ownerKey: '/data-b:project-b', projectId: 'project-b', workspaceId: 'workspace-b', record: { ...f.props.record, id: 'record-b', project_id: 'project-b', workspace_id: 'workspace-b', execution_root: '/execution-b' }, run: { id: 'run-b', reproduction_id: 'record-b', snapshot: null } });
  await React.act(async () => pending.resolve({ canceled: false, input: f.chosen }));
  assert.doesNotMatch(document.body.textContent, /numbers.csv/);
  assert.equal(button('Choose CSV or JSON data').disabled, false);
});

test('a user-entered fixed tolerance reaches the bridge as its exact decimal text', async t => {
  const f = await fixture(t);
  await click('Choose CSV or JSON data');
  const column = [...document.querySelectorAll('label')].find(label => label.textContent.startsWith('Absolute tolerance column')).querySelector('select');
  await React.act(async () => { column.value = ''; column.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const input = document.querySelector('input[type="number"]');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, '10000000000000001');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await React.act(async () => document.querySelector('input[type="checkbox"]').click());
  await click('Compare and save');
  assert.equal(f.calls[0].mapping.absoluteTolerance, '10000000000000001');
});

test('a changed run snapshot refreshes an open historical comparison as stale without discarding its values', async t => {
  const f = await fixture(t);
  await click('Choose CSV or JSON data'); await React.act(async () => document.querySelector('input[type="checkbox"]').click()); await click('Compare and save');
  f.reports[0] = { ...f.reports[0], state: 'stale', reasons: ['The run snapshot differs from the snapshot attached to this comparison.'] };
  await f.render({ run: { ...f.props.run, snapshot: { version: 1, final: { status: 'verified' } } } });
  assert.match(document.body.textContent, /Stale evidence/);
  assert.match(document.body.textContent, /snapshot differs/);
  assert.match(document.body.textContent, /accuracy/);
  assert.match(document.body.textContent, /0.81/);
});
