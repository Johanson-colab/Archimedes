const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

test('work mode buttons route the next message without accepting research and preserve pinned-session navigation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client');
  const stages = (await import('../src/research-path.ts')).researchStages;
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/ResearchPathPanel.tsx'), 'utf8').replace(/^import .*;\n/gm, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'ResearchPathPanel.tsx', { jsx: { runtime: 'classic' } });
  const icons = require('lucide-react'), scope = { React, ArrowUpRight: icons.ArrowUpRight, Pin: icons.Pin, X: icons.X, useUISettings: () => ({ t: value => value }) };
  const Panel = new Function(...Object.keys(scope), `${code}\nreturn ResearchPathPanel;`)(...Object.values(scope));
  const root = createRoot(document.getElementById('root')), selected = [];
  let opened = 0;
  const props = { stages, activeStage: stages[0], projectName: 'Evidence study', threadTitle: 'Research task', pinned: false, threadInactive: false, hasThread: true, agentBusy: false, onChangeMode: stage => selected.push(stage.mode), onTogglePin() {}, onOpenThread: () => opened++, onCollapse() {} };
  try {
    await React.act(async () => root.render(React.createElement(Panel, props)));
    const modes = [...document.querySelectorAll('[aria-label="Work modes"] button')];
    assert.equal(modes.length, 5); assert.equal(modes[0].getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(document.body.textContent, /Accept & advance|Research cycle complete|\d \/ 5/);
    await React.act(async () => modes[2].click()); assert.deepEqual(selected, ['experiment-setup']);
    await React.act(async () => root.render(React.createElement(Panel, { ...props, pinned: true, threadInactive: true })));
    assert.ok([...document.querySelectorAll('[aria-label="Work modes"] button')].every(button => button.disabled));
    await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Open pinned session').click());
    assert.equal(opened, 1);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; }
});
