const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('image attachments preview and remove independently alongside other context', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ContextPicker.tsx'), 'utf8');
  const start = source.indexOf('export function ContextChips(');
  const end = source.indexOf('\nfunction PickerAction(', start);
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(source.slice(start, end).replace('export function', 'function'), 'context-chips.tsx', { jsx: { runtime: 'classic' } });
  const Dialog = ({ children, onClose }) => React.createElement('div', { role: 'dialog' }, children, React.createElement('button', { onClick: onClose, 'data-close': true }));
  const translate = (value, params = {}) => value.replace('{name}', params.name || '');
  const component = new Function('React', 'useState', 'useUISettings', 'Dialog', 'X', 'ContextTypeIcon', 'formatAttachmentSize', `${code}\nreturn ContextChips;`)(React, React.useState, () => ({ t: translate }), Dialog, () => null, () => null, () => '1 KB');
  const root = createRoot(document.getElementById('root'));
  const items = [{ id: 'img1', type: 'image', name: 'First', image: { dataUrl: 'data:image/png;base64,YQ==', sizeBytes: 1 } }, { id: 'img2', type: 'image', name: 'Second', image: { dataUrl: 'data:image/png;base64,Yg==', sizeBytes: 1 } }, { id: 'file', type: 'file', name: 'notes.md' }];
  let removed;
  try {
    await act(async () => root.render(React.createElement(component, { items, onRemove: id => { removed = id; } })));
    assert.equal(document.querySelectorAll('.attached-image').length, 2);
    assert.match(document.querySelector('.attached-context-chip').textContent, /notes.md/);
    await act(async () => document.querySelectorAll('.attached-image-open')[1].click());
    assert.equal(document.querySelector('[role="dialog"] img').getAttribute('src'), items[1].image.dataUrl);
    await act(async () => document.querySelector('[data-close]').click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => document.querySelector('.attached-image-remove').click());
    assert.equal(removed, 'img1');
    assert.equal(document.querySelector('[role="dialog"]'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
