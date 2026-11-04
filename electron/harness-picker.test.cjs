const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, Picker;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {}, ResizeObserver: class { observe() {} disconnect() {} } });
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const icons = require("lucide-react");
  const scope = { React, ...React, createPortal: require("react-dom").createPortal, Check: icons.Check, ChevronDown: icons.ChevronDown, Settings: icons.Settings, useUISettings: () => ({ t: (key) => key }), ArchimedesMark: () => React.createElement("svg"), openaiLogo: "openai", claudeLogo: "claude", opencodeLogo: "opencode" };
  for (const [file, names] of [["Menu", ["MenuSurface", "MenuItem"]], ["HarnessPicker", ["HarnessPicker"]]]) {
    const text = fs.readFileSync(path.join(__dirname, `../src/${file}.tsx`), "utf8").replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/^import "[^"]+";\r?\n/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function");
    const { code } = await transformWithOxc(text, `${file}.tsx`, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names}};`)(...Object.values(scope)));
  }
  Picker = scope.HarnessPicker;
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver"]) delete global[key]; });
async function mount(props) {
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(Picker, props)));
  return () => React.act(async () => root.unmount());
}
test("harness picker exposes four entries, switches only supported runtimes and opens Models", async () => {
  const changes = []; let settings = 0;
  const cleanup = await mount({ backend: "codex", busy: false, onChange: async (id) => changes.push(id), onSettings: () => { settings++; } });
  try {
    assert.deepEqual(changes, []);
    const open = () => React.act(async () => document.querySelector(".harness-picker-trigger").click());
    await open();
    const options = [...document.querySelectorAll(".harness-picker-menu > .menu-item")];
    assert.equal(options.length, 4);
    assert.deepEqual(options.map((node) => node.querySelector(".menu-item-body").textContent), ["Codex", "Claude Code", "OpenCode", "Archimedes"]);
    assert.equal(options[1].disabled, true); assert.equal(options[2].disabled, true);
    await React.act(async () => options[3].click());
    assert.deepEqual(changes, ["api"]);
    await open();
    await React.act(async () => {
      const menu = document.querySelector('[role="menu"]');
      menu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
      menu.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    assert.equal(document.activeElement.getAttribute("aria-label"), "Model settings");
    await React.act(async () => document.querySelector('[aria-label="Model settings"]').click());
    assert.equal(settings, 1);
    assert.ok(!document.querySelector(".harness-picker-menu"));
  } finally { await cleanup(); }
});
test("busy state disables switching and failed saves keep the current harness", async () => {
  let cleanup = await mount({ backend: "api", busy: true, onChange: async () => {}, onSettings: () => {} });
  assert.equal(document.querySelector(".harness-picker-trigger").disabled, true);
  await cleanup();
  cleanup = await mount({ backend: "api", busy: false, onChange: async () => { throw new Error("Save failed"); }, onSettings: () => {} });
  try {
    await React.act(async () => document.querySelector(".harness-picker-trigger").click());
    await React.act(async () => document.querySelector(".harness-picker-menu > .menu-item").click());
    assert.match(document.querySelector('[role="alert"]').textContent, /Save failed/);
    assert.match(document.querySelector(".harness-picker-trigger").textContent, /Archimedes/);
  } finally { await cleanup(); }
});
