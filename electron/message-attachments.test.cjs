const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');

test('turn attachments persist, load images lazily, and survive forks', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-message-'));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-message-idle-'));
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const thread = store.createResearchThread({ prompt: 'Question', mode: 'free-chat', visibility: 'private' });
  const task = store.startTask({ prompt: 'Question' });
  const image = 'data:image/png;base64,YQ==';
  const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: 'Question', mode: 'free-chat', contextItems: [
    { type: 'image', name: 'Picture', image: { dataUrl: image, sizeBytes: 1 } },
    { type: 'file', name: 'notes.txt', path: '/workspace/notes.txt', detail: 'notes' },
  ] });
  store.finishTask(task.id, { response: 'Answer', status: 'completed' });
  store.finishResearchTurn(turn.id, { response: 'Answer' });
  const user = store.getResearchThread(thread.id).messages[0];
  assert.equal(user.attachments.length, 2);
  assert.equal(user.attachments[1].name, 'notes.txt');
  assert.equal(JSON.stringify(user).includes(image), false);
  assert.equal(store.getResearchTurnImage(thread.id, turn.id, 0), image);
  assert.equal(store.getResearchTurnImage(thread.id, turn.id, 1), null);
  assert.throws(() => store.getResearchTurnImage(thread.id, turn.id, -1), /position/);
  store.openWorkspace(idle);
  store.openWorkspace(root);
  assert.equal(store.getResearchThread(thread.id).messages[0].attachments[0].name, 'Picture');
  const fork = store.forkResearchThread(thread.id);
  assert.equal(store.getResearchTurnImage(fork.id, fork.turns[0].id, 0), image);
  assert.equal(store.getResearchTurnImage(fork.id, turn.id, 0), null);
});

test('sent image loads for display and opens a larger preview', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'); const { act } = React; const { createRoot } = require('react-dom/client');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  const start = source.indexOf('function MessageAttachmentView('), end = source.indexOf('\nconst MarkdownContent', start);
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(source.slice(start, end), 'message-attachment.tsx', { jsx: { runtime: 'classic' } });
  const image = 'data:image/png;base64,YQ==';
  const Dialog = ({ children }) => React.createElement('div', { role: 'dialog' }, children);
  const build = new Function('React', 'useState', 'useRef', 'useEffect', 'useUISettings', 'desktopBridge', 'Dialog', 'FileText', 'X', `${code}\nreturn MessageAttachmentView;`);
  const View = build(React, React.useState, React.useRef, React.useEffect, () => ({ t: (s, p) => s.replace('{name}', p?.name || '') }), { getResearchTurnImage: async () => image }, Dialog, () => null, () => null);
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(View, { attachment: { type: 'image', name: 'Picture', position: 0, threadId: 'thread' }, turnId: 'turn' })));
    assert.equal(document.querySelector('.message-attachment-image img').getAttribute('src'), image);
    await act(async () => document.querySelector('.message-attachment-image button').click());
    assert.equal(document.querySelector('[role="dialog"] img').getAttribute('src'), image);
    await act(async () => document.querySelector('[role="dialog"] button').click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => root.render(React.createElement(View, { attachment: { type: 'file', name: 'notes.md', position: 1 }, turnId: 'turn' })));
    assert.match(document.querySelector('.message-attachment-file').textContent, /notes.md/);
  } finally { await act(async () => root.unmount()); dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; }
});
