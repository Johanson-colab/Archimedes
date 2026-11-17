const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { JSDOM } = require('jsdom');
let dom, React, createRoot, Panel, Inspector;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'KeyboardEvent']) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require('react'); ({ createRoot } = require('react-dom/client'));
  const translate = key => key;
  const scope = { React, ...React, useUISettings: () => ({ t: translate }), Dialog: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null };
  for (const name of ["Activity", "FileText", "FlaskConical", "HelpCircle", "Lightbulb", "GitMerge", "GitCommitHorizontal", "History", "ArrowUpRight", "Maximize2", "Minimize2", "PanelRight", "Pin", "RefreshCw", "X"]) scope[name] = require("lucide-react")[name];
  const { transformWithOxc } = await import('vite');
  async function load(file, names) {
    const source = fs.readFileSync(path.join(__dirname, '../src/research-graph', file), 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace(/export default /g, '').replace(/export (?:const|function|type|interface) /g, match => match.slice(7));
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: 'classic' } });
    const result = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, '')}\nreturn {${names.join(',')}};`)(...Object.values(scope));
    Object.assign(scope, result); return result;
  }
  await load('graphLayout.ts', ['layoutLineage', 'LINEAGE_ROW_HEIGHT', 'LINEAGE_MARKER_Y']);
  await load('ExperimentInspector.tsx', ['ExperimentInspector']);
  ({ NodeInspector: Inspector } = await load('NodeInspector.tsx', ['NodeInspector']));
  await load('ResearchGraphView.tsx', ['ResearchGraphView']);
  ({ ResearchGraphPanel: Panel } = await load('ResearchGraphPanel.tsx', ['ResearchGraphPanel']));
});
after(() => { dom.window.close(); for (const key of ['window', 'document', 'HTMLElement', 'Node', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT']) delete global[key]; });
function node(id, kind, content = {}, overrides = {}) {
  return { id, kind, title: id, summary: '', status: 'active', archived: false, project_id: 'p', thread_id: 't', current_revision_id: `rev-${id}`, current_revision: { id: `rev-${id}`, content, created_at: '2026-11-16T09:00:00Z', source_turn_id: 'turn-source' }, created_at: `2026-11-16T09:00:0${id === 'q' ? 0 : kind === 'writing' ? 3 : 1}Z`, ...overrides };
}
function fixture() {
  const nodes = [node('q', 'question', { question: 'A research question' }), node('idea', 'idea', { hypothesis: 'Test a measurable effect' }), node('exp', 'experiment', { hypothesis: 'Compare the baseline', method: 'Hold the dataset fixed' }), node('result', 'result', { evidence: { source: 'run', runId: 'run-1' }, interpretation: { reasoning: 'Observed improvement' } }), node('draft', 'writing', { text: 'A source-grounded conclusion' }), node('old', 'idea', {}, { status: 'retracted' }), node('archived', 'idea', {}, { archived: true })];
  const link = (from, to, kind) => ({ id: `${from}-${to}`, from_node: from, to_node: to, from_revision: `rev-${from}`, to_revision: `rev-${to}`, kind });
  const graph = { projectId: 'p', threadId: 't', nodes, edges: [link('q', 'idea', 'generates'), link('idea', 'exp', 'tests'), link('exp', 'result', 'produces'), link('result', 'idea', 'supports'), link('draft', 'result', 'cites'), link('q', 'old', 'generates'), link('q', 'archived', 'generates')] };
  const bridge = { listResearchGraph: async () => graph, listExperimentRuns: async () => [], onExperimentRunUpdate: () => () => {}, getResearchNodeHistory: async id => [nodes.find(n => n.id === id).current_revision] };
  return { graph, bridge };
}
async function mounted(Component, props, run) {
  const root = createRoot(document.getElementById('root'));
  const render = async next => React.act(async () => { root.render(React.createElement(Component, next)); await tick(); });
  try { await render(props); await run({ render }); } finally { await React.act(async () => root.unmount()); }
}
const click = async element => { assert.ok(element, 'expected a clickable element'); await React.act(async () => { element.click(); await tick(); }); };
const byText = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
const props = { projectId: 'p', threadId: 't', projectName: 'Research', threadTitle: 'Session', hasThread: true, mode: 'experiment-setup', onOpenThread() {}, onCollapse() {} };

test('full activity retains citations and feedback; History reveals retracted and archived nodes', async () => {
  const { bridge } = fixture(); let input;
  window.researchDesk = { ...bridge, listResearchGraph: async value => { input = value; return bridge.listResearchGraph(); } };
  await mounted(Panel, props, async () => {
    assert.equal(input.includeArchived, true);
    assert.equal(document.querySelector('[title="draft"].research-graph-node'), null);
    await click(byText('All activity'));
    assert.ok(document.querySelector('.research-graph-edge.kind-cites'));
    assert.ok(document.querySelector('.research-graph-edge.kind-supports.feedback'));
    assert.ok(document.querySelector('[title="draft"].research-graph-node'));
    const markerShapes = ['question', 'idea', 'experiment', 'result', 'writing'].map(kind => {
      const shape = document.querySelector(`.research-lineage-marker.kind-${kind} .research-lineage-dot`);
      assert.ok(shape, `the ${kind} marker is visible`);
      return `${shape.tagName}:${shape.getAttribute('d') || ''}`;
    });
    assert.equal(new Set(markerShapes).size, markerShapes.length, 'research kinds have distinct marker shapes');
    const rows = [...document.querySelectorAll('.research-graph-node')];
    rows[0].focus();
    rows[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(document.activeElement, rows[1], 'arrow keys move between lineage rows');
    rows[1].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(document.activeElement, rows.at(-1));
    assert.equal(document.querySelector('[title="archived"].research-graph-node'), null);
    await click(document.querySelector('[title="Show history"]'));
    assert.ok(document.querySelector('[title="archived"].research-graph-node'));
    assert.ok(document.querySelector('[title="old"].research-graph-node'));
    await click(document.querySelector('[title="result"].research-graph-node'));
    assert.match(document.querySelector('[aria-label="Node details"]').textContent, /Recorded run evidence/);
    assert.match(document.querySelector('[aria-label="Connections"]').textContent, /exp/);
  });
});

test('revision history is fetched on demand and selecting an older version changes readable content', async () => {
  const current = node('idea', 'idea', { hypothesis: 'Current hypothesis' });
  const old = { ...current.current_revision, id: 'old-revision', content: { hypothesis: 'Original hypothesis' }, created_at: '2026-11-15T09:00:00Z' };
  let calls = 0;
  window.researchDesk = { getResearchNodeHistory: async () => { calls++; return [old, current.current_revision]; } };
  await mounted(Inspector, { node: current }, async () => {
    assert.equal(calls, 0);
    assert.match(document.querySelector('.research-node-fields').textContent, /Current hypothesis/);
    const details = document.querySelector('.research-node-history');
    await React.act(async () => { details.open = true; details.dispatchEvent(new dom.window.Event('toggle')); await tick(); });
    assert.equal(calls, 1);
    await click([...details.querySelectorAll('button')].find(button => button.textContent.includes('old-revi')));
    assert.match(document.querySelector('.research-node-fields').textContent, /Original hypothesis/);
    assert.match(document.querySelector('.research-node-provenance').textContent, /Historical revision/);
    assert.equal(document.querySelector('.research-graph-content-details').open, false, 'raw JSON stays secondary');
  });
});

test('a late graph response from the previous session cannot replace the new session graph', async () => {
  const { graph, bridge } = fixture(); let resolvePrevious;
  window.researchDesk = { ...bridge, listResearchGraph: ({ threadId }) => threadId === 't' ? new Promise(resolve => { resolvePrevious = resolve; }) : Promise.resolve({ projectId: 'p', threadId, nodes: [node('new-question', 'question')], edges: [] }) };
  await mounted(Panel, props, async ({ render }) => {
    await render({ ...props, threadId: 'new-thread' });
    await React.act(async () => { resolvePrevious(graph); await tick(); });
    assert.ok(document.querySelector('[title="new-question"].research-graph-node'));
    assert.equal(document.querySelector('[title="q"].research-graph-node'), null);
  });
});

test('a pinned graph identifies its session and unpinning follows the active session', async () => {
  const { graph, bridge } = fixture();
  window.researchDesk = { ...bridge, listResearchGraph: async ({ threadId }) => threadId === 't'
    ? graph : { projectId: 'p', threadId, nodes: [node('new-question', 'question')], edges: [] } };
  function PinnedGraph() {
    const [pinned, setPinned] = React.useState(true);
    return React.createElement(Panel, { ...props, threadId: pinned ? 't' : 'new-thread', threadTitle: pinned ? 'Previous research' : 'New research', pinned, threadInactive: pinned, onTogglePin: () => setPinned(value => !value) });
  }
  await mounted(PinnedGraph, {}, async () => {
    assert.match(document.querySelector('.research-graph-panel').textContent, /Previous research/);
    assert.match(document.querySelector('.research-graph-panel').textContent, /Pinned/);
    assert.ok(document.querySelector('[title="q"].research-graph-node'));
    await click(document.querySelector('[aria-label="Unpin this session"]'));
    assert.ok(document.querySelector('[title="new-question"].research-graph-node'));
    assert.equal(document.querySelector('[title="q"].research-graph-node'), null);
    assert.match(document.querySelector('.research-graph-panel').textContent, /New research/);
    assert.ok(document.querySelector('[aria-label="Pin this session"]'));
  });
});

test('an outdated revision history request cannot populate a newly updated node', async () => {
  const current = node('idea', 'idea', { hypothesis: 'First version' });
  let resolveHistory;
  window.researchDesk = { getResearchNodeHistory: () => new Promise(resolve => { resolveHistory = resolve; }) };
  await mounted(Inspector, { node: current }, async ({ render }) => {
    const details = document.querySelector('.research-node-history');
    await React.act(async () => { details.open = true; details.dispatchEvent(new dom.window.Event('toggle')); await tick(); });
    const updated = { ...current, current_revision_id: 'new-revision', current_revision: { ...current.current_revision, id: 'new-revision', content: { hypothesis: 'Updated hypothesis' } } };
    await render({ node: updated });
    await React.act(async () => { resolveHistory([current.current_revision]); await tick(); });
    assert.match(document.querySelector('.research-node-fields').textContent, /Updated hypothesis/);
    assert.equal(document.querySelector('.research-node-history').open, false);
    assert.equal(document.querySelectorAll('.research-node-history > button').length, 0);
  });
});
