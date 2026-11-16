const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

test("Notes appends to its named chat, preserves explicit replace intent, and a late owner callback cannot navigate another session", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const globals = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"], previous = Object.fromEntries(globals.map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react"), { createRoot } = require("react-dom/client"), icons = require("lucide-react");
  const { transformWithOxc } = await import("vite"), task = await import("../src/task-selection.ts");
  const t = (key, values) => values ? key.replace(/\{(\w+)\}/g, (_, name) => values[name]) : key;
  const source = fs.readFileSync(path.join(__dirname, "../src/NotesView.tsx"), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default ", "");
  const { code } = await transformWithOxc(source, "NotesView.tsx", { jsx: { runtime: "classic" } });
  const bindings = { React, ...React, ...icons, useUISettings: () => ({ t }) };
  const Notes = new Function(...Object.keys(bindings), `${code}\nreturn NotesView;`)(...Object.values(bindings));
  const app = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8"), start = app.indexOf("  function sendNoteToChat("), end = app.indexOf("\n  }", start) + 4;
  const callback = (await transformWithOxc(app.slice(start, end), "callback.ts", {})).code;
  const a = { dataRoot: "/data/a", projectId: "project", workspaceId: "workspace", executionRoot: "/execution", threadId: "same-id" }, b = { ...a, dataRoot: "/data/b" }, aKey = task.taskDraftKey(a), bKey = task.taskDraftKey(b);
  const state = { taskSelectionRef: { current: a }, composerDraftKey: aKey, mainSection: "news", drafts: new Map([[aKey, "EXISTING_A"], [bKey, "EXISTING_B"]]), navigations: [] };
  const scope = { ...task, ...state, queueComposerText: (key, text, mode) => state.drafts.set(key, mode === "replace" ? text : `${state.drafts.get(key)}\n\n${text}`), setMainSection: value => state.navigations.push(value) };
  const send = new Function(...Object.keys(scope), `${callback}\nreturn sendNoteToChat;`)(...Object.values(scope));
  const root = createRoot(document.getElementById("root"));
  const render = () => React.act(async () => root.render(React.createElement(Notes, { key: aKey, value: "SELECTED_NOTES", contextLabel: "Conversation notes", chatTargetLabel: "Session A", loading: false, saveState: "saved", onChange() {}, onSend: send })));
  const click = label => React.act(async () => [...document.querySelectorAll("button")].find(node => node.textContent === label).click());
  try {
    await render(); assert.ok(document.body.textContent.includes("Chat target: Session A"));
    await click("Add to chat"); assert.equal(state.drafts.get(aKey), "EXISTING_A\n\nSELECTED_NOTES"); assert.equal(state.drafts.get(bKey), "EXISTING_B");
    await click("Use as prompt"); assert.equal(state.drafts.get(aKey), "SELECTED_NOTES", "replace is reserved for the explicitly named action");
    state.taskSelectionRef.current = b; state.navigations.length = 0;
    send("LATE_NEWS_APPEND", "append");
    assert.match(state.drafts.get(aKey), /SELECTED_NOTES\n\nLATE_NEWS_APPEND$/); assert.equal(state.drafts.get(bKey), "EXISTING_B"); assert.deepEqual(state.navigations, []);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, value] of Object.entries(previous)) value === undefined ? delete global[key] : global[key] = value; }
});
