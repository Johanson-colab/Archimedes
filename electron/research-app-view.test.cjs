const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
let React, createRoot, View, dom;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:5173/" });
  for (const key of ["window", "document", "HTMLElement", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const scope = { React, ...React, ...require("lucide-react"), useUISettings: () => ({ t: (value) => value }), researchAppCategories: [{ id: "analysis", label: "Analysis & visualization" }] };
  const { transformWithOxc } = await import("vite");
  for (const [name, exports] of [["StateView", "StateView"], ["ResearchAppsView", "ResearchAppsView"]]) {
    const source = fs.readFileSync(path.join(__dirname, `../src/${name}.tsx`), "utf8").replace(/^import .*?;\r?\n/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function");
    const { code } = await transformWithOxc(source, `${name}.tsx`, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${exports}};`)(...Object.values(scope)));
  }
  View = scope.ResearchAppsView;
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key]; });
const draft = { id: "sample", name: "Sample App", category: "analysis", status: "stopped", installed: false, pinned: false, logs: "", error: "", url: null };
function button(text) { return [...document.querySelectorAll("button")].find((element) => element.textContent === text); }
test("workspace Apps are visible as drafts without implicit execution", async () => {
  const root = createRoot(document.getElementById("root"));
  const opened = [];
  await React.act(async () => root.render(React.createElement(View, { workspace: "/project", apps: [draft], bridge: {}, onOpen: (id) => opened.push(id), onRefresh: () => {}, onBack: () => {} })));
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
