const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
let React, createRoot, View, dom;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:5173/" });
  for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const scope = { researchAppContext: () => ({ type: "archimedes:context", theme: document.documentElement.dataset.theme || "paper", tokens: {}, language: "en" }), React, ...React, ...require("lucide-react"), useUISettings: () => ({ t: (value) => value }), researchAppCategories: [{ id: "analysis", label: "Analysis & visualization" }] };
  const { transformWithOxc } = await import("vite");
  for (const [name, exports] of [["StateView", "StateView"], ["ResearchAppsView", "ResearchAppsView"]]) {
    const source = fs.readFileSync(path.join(__dirname, `../src/${name}.tsx`), "utf8").replace(/^import .*?;\r?\n/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function");
    const { code } = await transformWithOxc(source, `${name}.tsx`, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${exports}};`)(...Object.values(scope)));
  }
  View = scope.ResearchAppsView;
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key]; });
const draft = { delivery: { status: "ready", canRestore: false }, id: "sample", name: "Sample App", category: "analysis", status: "stopped", installed: false, pinned: false, logs: "", error: "", url: null };
function button(text) { return [...document.querySelectorAll("button")].find((element) => element.textContent === text); }
test("workspace Apps are visible as drafts without implicit execution", async () => {
  const root = createRoot(document.getElementById("root"));
  const opened = [];
  await React.act(async () => root.render(React.createElement(View, { workspace: "/project", apps: [{ ...draft, delivery: undefined }], bridge: {}, onOpen: (id) => opened.push(id), onRefresh: () => {}, onBack: () => {} })));
  assert.match(document.body.textContent, /Created Research Apps/);
  assert.match(document.body.textContent, /Draft/);
  await React.act(async () => document.querySelector(".created-app-card").click());
  assert.deepEqual(opened, ["sample"]);
  await React.act(async () => root.unmount());
});
test("preview has explicit start/stop, isolated iframe and separate install action", async () => {
  const root = createRoot(document.getElementById("root"));
  const operations = [];
  const bridge = {
    startResearchApp: async () => { operations.push("start"); return { ...draft, status: "running", url: "http://127.0.0.1:34567/" }; },
    stopResearchApp: async () => { operations.push("stop"); return draft; },
    installResearchApp: async () => { operations.push("install"); return []; },
  };
  await React.act(async () => root.render(React.createElement(View, { workspace: "/project", appId: "sample", apps: [draft], bridge, onOpen: () => {}, onRefresh: () => {}, onBack: () => {} })));
  assert.deepEqual(operations, []);
  await React.act(async () => button("Start preview").click());
  const frame = document.querySelector("iframe");
  assert.equal(frame.src, "http://127.0.0.1:34567/");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-same-origin allow-forms allow-downloads");
  assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
  assert.doesNotMatch(frame.getAttribute("sandbox"), /top-navigation|popups/);
  await React.act(async () => button("Install and pin").click());
  await React.act(async () => button("Stop app").click());
  assert.equal(document.querySelector("iframe"), null);
  assert.deepEqual(operations, ["start", "install", "stop"]);
  await React.act(async () => root.unmount());
});
test("opening a pinned installed App starts once and reports a startup failure", async () => {
  const root = createRoot(document.getElementById("root"));
  let starts = 0;
  const bridge = { startResearchApp: async () => { starts++; return { ...draft, status: "failed", error: "Python environment missing" }; } };
  const props = { workspace: "/project", appId: "sample", apps: [{ ...draft, installed: true, pinned: true }], bridge, onOpen: () => {}, onRefresh: () => {}, onBack: () => {} };
  await React.act(async () => root.render(React.createElement(View, props)));
  await React.act(async () => root.render(React.createElement(View, { ...props, apps: [{ ...draft, installed: true, pinned: true }] })));
  assert.equal(starts, 1);
  assert.match(document.body.textContent, /Python environment missing/);
  assert.equal(document.querySelector("iframe"), null);
  await React.act(async () => root.unmount());
});

test('a pinned Python App without an environment shows setup instead of attempting startup', async () => {
  const root = createRoot(document.getElementById('root')); let starts = 0;
  const props = { workspace: '/project', appId: 'sample', apps: [{ ...draft, installed: true, pinned: true, needsSetup: true }], bridge: { startResearchApp: async () => { starts++; return draft; } }, onOpen: () => {}, onRefresh: () => {}, onBack: () => {} };
  await React.act(async () => root.render(React.createElement(View, props)));
  assert.equal(starts, 0); assert.ok(button('Set up dependencies')); assert.equal(button('Start preview'), undefined);
  assert.match(document.body.textContent, /Setup required/); assert.doesNotMatch(document.body.textContent, /App could not start/);
  await React.act(async () => root.unmount());
});

test('successful setup clears stale startup failures and enables explicit preview', async () => {
  const root = createRoot(document.getElementById('root')); let apps = [{ ...draft, needsSetup: true, status: 'failed', error: 'App Python environment is missing' }];
  const bridge = {
    setupResearchApp: async () => { apps = [{ ...draft, needsSetup: false }]; },
    stopResearchApp: async () => draft,
  };
  const render = () => root.render(React.createElement(View, { workspace: '/project', appId: 'sample', apps, bridge, onOpen: () => {}, onRefresh: render, onBack: () => {} }));
  await React.act(async () => render());
  await React.act(async () => button('Set up dependencies').click());
  assert.ok(button('Start preview')); assert.doesNotMatch(document.body.textContent, /Python environment is missing|App could not start/);
  await React.act(async () => root.unmount());
});

test("installing and pinning a draft updates controls without starting it until reopened", async () => {
  let root = createRoot(document.getElementById("root"));
  let starts = 0, apps = [draft];
  const bridge = {
    installResearchApp: async () => { apps = [{ ...draft, installed: true, pinned: true }]; return apps; },
    startResearchApp: async () => { starts++; return { ...draft, status: "running", url: "http://127.0.0.1:34567/" }; },
  };
  const render = () => root.render(React.createElement(View, { workspace: "/project", appId: "sample", apps, bridge, onOpen: () => {}, onRefresh: render, onBack: () => {} }));
  await React.act(async () => render());
  await React.act(async () => button("Install and pin").click());
  assert.ok(button("Unpin app"));
  assert.equal(button("Install and pin"), undefined);
  assert.equal(starts, 0);
  await React.act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await React.act(async () => render());
  assert.equal(starts, 1);
  assert.ok(document.querySelector("iframe"));
  await React.act(async () => root.unmount());
});

test("only the active App frame and origin can request a declared Agent", async () => {
  const root = createRoot(document.getElementById("root")); let calls = 0;
  const item = { ...draft, installed: true, pinned: true, status: 'running', url: 'http://127.0.0.1:34567/', agents: ['codex'] };
  const bridge = { runResearchAppAgent: async () => { calls++; return 'ok'; } };
  await React.act(async () => root.render(React.createElement(View, { workspace: '/project', appId: 'sample', apps: [item], bridge, onOpen: () => {}, onRefresh: () => {}, onBack: () => {} })));
  const frame = document.querySelector('iframe').contentWindow;
  const data = { type: 'archimedes:agent-request', requestId: 'test-1', backend: 'codex', prompt: 'Explain the chart' };
  await React.act(async () => {
    window.dispatchEvent(new window.MessageEvent('message', { data, origin: 'http://127.0.0.1:12345', source: frame }));
    window.dispatchEvent(new window.MessageEvent('message', { data, origin: 'http://127.0.0.1:34567', source: window }));
    window.dispatchEvent(new window.MessageEvent('message', { data: { ...data, backend: 'claude' }, origin: 'http://127.0.0.1:34567', source: frame }));
  });
  assert.equal(calls, 0);
  await React.act(async () => window.dispatchEvent(new window.MessageEvent('message', { data, origin: 'http://127.0.0.1:34567', source: frame })));
  assert.equal(calls, 1);
  await React.act(async () => root.unmount());
});

test('unverified drafts cannot install and validation/cancel/restore use the host pipeline', async () => {
  const root = createRoot(document.getElementById('root')); const calls = [];
  let item = { ...draft, delivery: { status: 'draft', canRestore: true } };
  const render = () => root.render(React.createElement(View, { workspace: '/project', appId: 'sample', apps: [item], bridge: {
    validateResearchApp: async (_workspace, _id, backend) => { calls.push(backend || 'validate'); },
    restoreResearchApp: async () => { calls.push('restore'); },
    cancelResearchAppValidation: async () => { calls.push('cancel'); },
  }, onOpen: () => {}, onRefresh: render, onBack: () => {} }));
  await React.act(async () => render());
  assert.equal(button('Install and pin').disabled, true);
  await React.act(async () => button('Validate app').click());
  await React.act(async () => button('Validate and repair').click());
  await React.act(async () => button('Restore verified version').click());
  item = { ...item, delivery: { status: 'checking', canRestore: true } };
  await React.act(async () => render());
  assert.equal(button('Validate app'), undefined);
  await React.act(async () => button('Cancel validation').click());
  assert.deepEqual(calls, ['validate', 'codex', 'restore', 'cancel']);
  await React.act(async () => root.unmount());
});

test('all running Apps receive live theme context, including Apps without Agent permissions', async () => {
  const root = createRoot(document.getElementById('root'));
  const item = { ...draft, status: 'running', url: 'http://127.0.0.1:34567/', agents: [] };
  await React.act(async () => root.render(React.createElement(View, { workspace: '/project', appId: 'sample', apps: [item], bridge: {}, onOpen: () => {}, onRefresh: () => {}, onBack: () => {} })));
  const frame = document.querySelector('iframe').contentWindow, messages = [];
  frame.postMessage = (data, origin) => messages.push({ data, origin });
  await React.act(async () => {
    window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'archimedes:context-request' }, origin: 'http://127.0.0.1:11111', source: frame }));
  });
  assert.equal(messages.length, 0);
  await React.act(async () => window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'archimedes:context-request' }, origin: 'http://127.0.0.1:34567', source: frame })));
  assert.equal(messages[0].data.type, 'archimedes:context');
  await React.act(async () => { document.documentElement.dataset.theme = 'charcoal'; await Promise.resolve(); });
  assert.equal(messages.at(-1).data.theme, 'charcoal'); assert.equal(messages.at(-1).origin, 'http://127.0.0.1:34567');
  await React.act(async () => root.unmount()); delete document.documentElement.dataset.theme;
});
