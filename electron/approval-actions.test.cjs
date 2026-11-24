const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('approval card countdown, manual decisions and conversation changes', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const { createServer } = await import('vite');
  const vite = await createServer({ root: path.resolve(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom', configFile: false });
  const { ApprovalActions } = await vite.ssrLoadModule('/src/ApprovalActions.tsx');
  const { UISettingsProvider } = await vite.ssrLoadModule('/src/i18n.tsx');
  const root = createRoot(document.getElementById('root'));
  let now = 0, nextId = 1;
  const timers = new Map();
  const originalNow = performance.now;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  window.setInterval = fn => { const id = nextId++; timers.set(id, fn); return id; };
  window.clearInterval = id => timers.delete(id);
  const advance = async ms => { now += ms; await act(async () => { for (const fn of [...timers.values()]) fn(); }); };
  const decisions = [];
  const action = id => ({ id, kind: 'command', ownerThreadId: 'thread-1', payload: { remoteOperation: 'ssh_remote_exec' } });
  const render = async value => act(async () => root.render(React.createElement(UISettingsProvider, null, value && React.createElement(ApprovalActions, {
    action: value, agentBusy: true, onApprove: id => decisions.push(['run', id]), onReject: id => decisions.push(['dismiss', id]),
  }))));
  try {
    await render(action('auto'));
    assert.match(document.body.textContent, /Auto-run in 10s/);
    await advance(9000);
    assert.match(document.body.textContent, /Auto-run in 1s/);
    await advance(1000);
    assert.deepEqual(decisions, [['run', 'auto']]);
    await render(action('early'));
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Run').click());
    await advance(11000);
    assert.deepEqual(decisions.at(-1), ['run', 'early']);
    assert.equal(decisions.length, 2);
    await render(action('dismissed'));
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Dismiss').click());
    await advance(11000);
    assert.deepEqual(decisions.at(-1), ['dismiss', 'dismissed']);
    assert.equal(decisions.length, 3);
    await render(action('old-thread'));
    await advance(4000);
    await render(null);
    await advance(11000);
    assert.equal(decisions.length, 3);
    await render(action('new-thread'));
    assert.match(document.body.textContent, /Auto-run in 10s/);
    await advance(10000);
    assert.deepEqual(decisions.at(-1), ['run', 'new-thread']);
    await render(action('replaced'));
    await advance(5000);
    await render(action('replacement'));
    assert.match(document.body.textContent, /Auto-run in 10s/);
    await advance(5000);
    assert.equal(decisions.length, 4);
    await advance(5000);
    assert.deepEqual(decisions.at(-1), ['run', 'replacement']);
    await render({ id: 'read', kind: 'command', ownerThreadId: 'thread-1', payload: { remoteOperation: 'ssh_remote_read' } });
    assert.doesNotMatch(document.body.textContent, /Auto-run/);
    await advance(11000);
    assert.equal(decisions.length, 5);
  } finally {
    await act(async () => root.unmount());
    Object.defineProperty(performance, 'now', { configurable: true, value: originalNow });
    await vite.close();
    dom.window.close();
    delete global.window; delete global.document; delete global.navigator; delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
