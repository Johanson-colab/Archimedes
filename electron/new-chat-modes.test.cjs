const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, Picker, draftForNewChatMode, example;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {}, ResizeObserver: class { observe() {} disconnect() {} } });
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const icons = require("lucide-react");
  const scope = { React, ...React, createPortal: require("react-dom").createPortal, Check: icons.Check, ChevronDown: icons.ChevronDown, FlaskConical: icons.FlaskConical, MessageCircle: icons.MessageCircle, Puzzle: icons.Puzzle, useUISettings: () => ({ t: (key) => key }) };
  for (const [file, names] of [["Menu", ["MenuSurface", "MenuItem"]], ["NewChatModePicker", ["NewChatModePicker", "draftForNewChatMode", "RESEARCH_EXAMPLE"]]]) {
    const text = fs.readFileSync(path.join(__dirname, `../src/${file}.tsx`), "utf8").replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/^import "[^"]+";\r?\n/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function").replace(/export const/g, "const");
    const { code } = await transformWithOxc(text, `${file}.tsx`, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names}};`)(...Object.values(scope)));
  }
  Picker = scope.NewChatModePicker; draftForNewChatMode = scope.draftForNewChatMode; example = scope.RESEARCH_EXAMPLE;
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver"]) delete global[key]; });

test("mode selection inserts an editable research example without overwriting a draft", async () => {
  const root = createRoot(document.getElementById("root"));
  function Example() {
    const [mode, setMode] = React.useState("standard");
    const [draft, setDraft] = React.useState("");
    return React.createElement(React.Fragment, null,
      React.createElement(Picker, { value: mode, onChange: (next) => { setMode(next); setDraft((current) => draftForNewChatMode(current, next)); } }),
      React.createElement("textarea", { value: draft, onChange: (event) => setDraft(event.target.value) }));
  }
  await React.act(async () => root.render(React.createElement(Example)));
  try {
    const open = () => React.act(async () => document.querySelector(".new-chat-mode-trigger").click());
    const pick = (name) => React.act(async () => [...document.querySelectorAll(".new-chat-mode-menu [role=menuitemradio]")].find((item) => item.querySelector("strong").textContent === name).click());
    await open();
    assert.deepEqual([...document.querySelectorAll(".new-chat-mode-menu strong")].map((item) => item.textContent), ["Standard", "Research", "Create"]);
    await pick("Research");
    assert.equal(document.querySelector("textarea").value, example);
    assert.match(example, /single GPU.*validation.*test set/i);
    await open(); await pick("Standard");
    assert.equal(document.querySelector("textarea").value, "");
    await React.act(async () => {
      const textarea = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(textarea, "My draft");
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await open(); await pick("Research");
    assert.equal(document.querySelector("textarea").value, "My draft");
    await open(); await pick("Create");
    assert.equal(document.querySelector("textarea").value, "My draft");
    assert.match(document.querySelector(".new-chat-mode-trigger").textContent, /Create/);
  } finally { await React.act(async () => root.unmount()); }
});
