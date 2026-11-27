const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

test('large session selector defaults to latest, supports excluding sources and retry', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require('react'), { createRoot } = require('react-dom/client'), { transformWithOxc } = await import('vite');
  const code = fs.readFileSync(path.join(__dirname, '../src/SnapshotRangeDialog.tsx'), 'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, '').replace(/^import "[^"]+";\r?\n/gm, '').replace('export default function', 'function');
  const transformed = await transformWithOxc(code, 'SnapshotRangeDialog.tsx', { jsx: { runtime: 'classic' } });
  const scope = { React, ...React, X: () => null, useUISettings: () => ({ t: (key, vars) => vars ? key.replace('{selected}', vars.selected).replace('{total}', vars.total) : key }), Dialog: ({children}) => React.createElement('div',null,children), InlineNotice: ({children}) => React.createElement('div',{role:'alert'},children) };
  const Component = new Function(...Object.keys(scope), `${transformed.code.replace(/^export \{\};?$/gm, '')}\nreturn SnapshotRangeDialog;`)(...Object.values(scope));
  let attempts=0, result; const calls=[];
  const bridge={ listResearchThreadSnapshotTurns: async()=>[{id:'a',user_message:'First'},{id:'b',user_message:'Second'}], createResearchThreadSnapshot: async (...args)=>{ calls.push(args); if(++attempts===1) throw Error('SNAPSHOT_TOO_LARGE'); return {id:'done'}; } };
  const root=createRoot(document.getElementById('root'));
  try {
    await React.act(async()=>root.render(React.createElement(Component,{bridge,threadId:'thread',title:'Research',onClose(){},onCreated:value=>{result=value}})));
    const checks=[...document.querySelectorAll('input[type=checkbox]')];
    assert.deepEqual(checks.map(input=>input.checked),[true,false,true]);
    await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue').click());
    assert.match(document.querySelector('[role=alert]').textContent,/too large/);
    await React.act(async()=>checks[0].click());
    await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue').click());
    assert.deepEqual(calls,[['thread',['b'],true],['thread',['b'],false]]);assert.equal(result.id,'done');
  } finally {
    await React.act(async()=>root.unmount()); dom.window.close();
    for(const key of ['window','document','HTMLElement','Node','IS_REACT_ACT_ENVIRONMENT']) delete global[key];
  }
});
