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

test('selected work modes reach the actual composer submit and runAgent request unchanged', async () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  const extract = name => { const start = app.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm')); assert.ok(start >= 0, name); const end = app.slice(start).search(/\n  }(?=\n)/); return app.slice(start, start + end + 4); };
  const { transformWithOxc } = await import('vite');
  const projection = app.split('\n').find(line => line.includes('const predictedMode:'));
  const { code } = await transformWithOxc([extract('changeWorkMode'), extract('submitPrompt'), projection, extract('submitCurrentPrompt')].join('\n'), 'actual-mode-submit.tsx');
  for (const mode of ['experiment-setup', 'paper-generation', 'paper-review']) {
    const requests = [], drafts = new Map();
    const noOp = () => {};
    const scope = { researchMode: 'standard', pathThreadInactive: false, composerDraftKey: 'draft', readComposerDraft: key => drafts.get(key), writeComposerDraft: (key, draft) => drafts.set(key, draft),
      setResearchMode: value => { scope.researchMode = value; }, onResearchMode: value => { scope.researchMode = value; }, prompt: 'Use this selected mode', slashRunningRef: {current:false}, slashCommands: [], pendingResearchSkill:null,
      contextItems:[], agentBusy:false, commandLockRef:{current:false}, nativeBackend:null, selectedNativeBackend:null, selectedHarness:'api', reasoningEffort:'medium', contextLength:'standard', activeThreadId: mode === 'paper-generation' ? 'existing' : null,
      activeThreadIdRef:{current: mode === 'paper-generation' ? 'existing' : null}, workspace:'/data', executionWorkspace:'/execution', activeProjectId:'project', activeWorkspace:{id:'ws'}, threadVisibility:'project', noteValuesRef:{current:{}}, draftNoteKey:'draft', initialMessages:[],
      composerRef:{current:null}, requestAnimationFrame: fn => fn(), crypto:global.crypto, rememberPrompt:noOp, setPrompt:noOp, setComposerError:noOp, setPendingResearchSkill:noOp,
      clearPendingAssistantDeltas:noOp, setAgentBusy:noOp, setInterrupting:noOp, setMessages:noOp, setNativeStream:noOp, setNativeQuestions:noOp, setEvents:noOp, setThreads:noOp, setActiveThreadId:noOp, setBoundHarness:noOp, setActiveProjectId:noOp, setActiveWorkspaceId:noOp, setChangeSets:noOp, setContextItems:noOp, setRunningThreadId:noOp,
      desktopBridge:{runAgent:async input=>{ requests.push(input); return {threadId:'returned',thread:{id:'returned',project_id:'project',workspace_id:'ws',messages:[],events:[],changeSets:[]},actions:[]}; }}, };
    // Selection is made before the composer render derives its next-message mode.
    const selectCode = (await transformWithOxc(extract('changeWorkMode'), 'choose-mode.tsx')).code;
    new Function('scope', `with(scope) { ${selectCode}; return changeWorkMode; }`)(scope)({mode});
    scope.onSubmit = async () => { throw Error('submission wiring not installed'); };
    const handlers = new Function('scope', `with(scope) { ${code}; return {submitPrompt,submitCurrentPrompt}; }`)(scope);
    scope.onSubmit = handlers.submitPrompt;
    await handlers.submitCurrentPrompt();
    assert.equal(requests[0].mode, mode);
    assert.equal(drafts.get('draft').newChatMode, mode);
    assert.equal(scope.researchMode, mode);
  }
});
