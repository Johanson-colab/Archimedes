const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('work modes switch message routing without asserting scientific acceptance or completion', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'];
  const saved = Object.fromEntries(names.map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require('react'), { createRoot } = require('react-dom/client');
  const { transformWithOxc } = await import('vite');
  const { researchStages } = await import('../src/research-path.ts');
  const source = fs.readFileSync(path.join(__dirname, '../src/ResearchPathPanel.tsx'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
  const { code } = await transformWithOxc(source, 'ResearchPathPanel.tsx', { jsx: { runtime: 'classic' } });
  const Panel = new Function('React', 'useUISettings', 'ArrowUpRight', 'Pin', 'X', `${code}; return ResearchPathPanel;`)(React, () => ({ t: key => key }), () => null, () => null, () => null);
  const root = createRoot(document.getElementById('root'));
  let opened = 0, changed = [];
  function Harness({ inactive = false }) {
    const [stage, setStage] = React.useState(researchStages[0]);
    return React.createElement(Panel, { stages: researchStages, activeStage: stage, agentBusy: false, projectName: 'Project A', threadTitle: 'Session A', pinned: inactive, threadInactive: inactive, hasThread: true,
      onChangeMode: next => { changed.push(next.mode); setStage(next); }, onOpenThread: () => opened++, onTogglePin() {}, onCollapse() {} });
  }
  try {
    await React.act(async () => root.render(React.createElement(Harness)));
    assert.equal(document.querySelectorAll('.research-path-stage').length, 5);
    assert.doesNotMatch(document.body.textContent, /Accept & advance|accepted|checkpoint|cycle complete|\d\s*\/\s*5/i);
    await React.act(async () => [...document.querySelectorAll('.research-path-stage')].find(button => button.textContent === 'Ideas').click());
    assert.deepEqual(changed, ['idea-spark']);
    assert.equal(document.querySelector('.research-path-stage[aria-pressed="true"]').textContent, 'Ideas');
    assert.match(document.body.textContent, /Sets the mode for your next message\./);
    assert.equal(document.querySelectorAll('.accepted,.stale,.complete').length, 0);
    await React.act(async () => root.render(React.createElement(Harness, { inactive: true })));
    assert.ok([...document.querySelectorAll('.research-path-stage')].every(button => button.disabled));
    await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Open pinned session').click());
    assert.equal(opened, 1);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value;
  }
});

test('the work-mode floating panel is compact while custom sizes and proactive layout remain intact', async () => {
  const text = fs.readFileSync(path.join(__dirname, '../src/AgentLayer.tsx'), 'utf8');
  const beforeComponent = text.slice(0, text.indexOf('export default function AgentLayer')).replace(/^import .*;\r?\n/gm, '');
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(beforeComponent, 'agent-layer-layout.ts');
  let stored = { research: { x: 20, y: 20, w: 560, h: 220 }, proactive: { x: 30, y: 30, w: 440, h: 300 } };
  const { readLayout, defaultLayout, clampLayout } = new Function('window', `${code.replace(/^export \{\};?$/gm, '')}; return { readLayout, defaultLayout, clampLayout };`)({ localStorage: { getItem: () => JSON.stringify(stored) } });
  const size = { width: 1300, height: 900 };
  assert.equal(defaultLayout('research', size).h, 144);
  assert.equal(defaultLayout('proactive', size).h, 300);
  assert.equal(readLayout().research.h, 144, 'only the untouched former research default is compacted');
  stored.research.h = 420;
  assert.equal(readLayout().research.h, 420);
  assert.equal(clampLayout({ x: 10, y: 10, w: 560, h: 20 }, size, 'research').h, 140);
  assert.equal(clampLayout({ x: 10, y: 10, w: 560, h: 20 }, size, 'proactive').h, 220);
});
