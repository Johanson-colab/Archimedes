const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

test("switching Work sessions keeps edits and selected excerpts with their notes", async (t) => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  t.after(() => {
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    delete globalThis.document;
    delete globalThis.window;
  });
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const read = file => fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const translation = key => key;
  const { ArrowUpToLine, LoaderCircle, NotebookPen, Replace } = require("lucide-react");
  const bindings = { React, ...React, ArrowUpToLine, LoaderCircle, NotebookPen, Replace, useUISettings: () => ({ t: translation }) };
  const notes = read("NotesView.tsx").replace(/^(?:import|export type) .*;\r?\n/gm, "").replace("export default function", "function");
  const { code: notesCode } = await transformWithOxc(notes, "NotesView.tsx", { jsx: { runtime: "classic" } });
  const NotesView = new Function(...Object.keys(bindings), `${notesCode.replace(/^export \\{\\};?$/gm, "")}\nreturn NotesView;`)(...Object.values(bindings));

  const app = read("App.tsx");
  const start = app.indexOf("\n  useEffect(() => {", app.indexOf("async function saveLocalIdentity"));
  const end = app.indexOf('  useEffect(() => {\n    if (!workbenchActiveTabs.has("changes"))', start);
  const view = app.match(/notes: (<NotesView\b[\s\S]*?\/>),/)[1];
  const { code } = await transformWithOxc(`function Harness({ noteKey }) {
    const activeThreadId = noteKey;
    const [noteValues, setNoteValues] = useState({});
    const [noteLoadedKey, setNoteLoadedKey] = useState(null);
    const [noteSaveState, setNoteSaveState] = useState("idle");
    const noteKeyRef = useRef(noteKey);
    noteKeyRef.current = noteKey;
    const noteEditsRef = useRef(new Map());
    const noteValuesRef = useRef(noteValues);
    noteValuesRef.current = noteValues;
    const noteValue = noteLoadedKey === noteKey ? noteValues[noteKey] ?? "" : "";
    const sendNoteToChat = text => sent.push([noteKey, text]);
    ${app.slice(start, end)}
    return (${view});
  }`, "NotesHarness.tsx", { jsx: { runtime: "classic" } });

  const stored = { a: "Alpha original", b: "Beta original" };
  const sent = [];
  const timers = new Map();
  let timerId = 0;
  let failSave = false;
  const scope = {
    ...bindings, NotesView, sent, t: translation,
    desktopBridge: {
      getWorkbenchNote: async (key) => ({ content: stored[key], updatedAt: "existing" }),
      saveWorkbenchNote: async (key, content) => {
        if (failSave) throw new Error("Notes unavailable");
        stored[key] = content;
      },
    },
    window: {
      setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id),
    },
  };
  const Harness = new Function(...Object.keys(scope), `${code}\nreturn Harness;`)(...Object.values(scope));
  const root = createRoot(document.getElementById("root"));
  const editor = () => document.querySelector(".notes-editor");
  const action = text => [...document.querySelectorAll(".notes-view button")].find(button => button.textContent === text);
  const show = key => React.act(async () => root.render(React.createElement(Harness, { noteKey: key })));
  const select = () => React.act(async () => {
    editor().setSelectionRange(0, editor().value.length);
    editor().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  const edit = text => React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(editor(), text);
    editor().dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));
  });
  const waitForSave = () => React.act(async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    for (const callback of callbacks) callback();
  });

  try {
    await show("a");
    await select();
    await React.act(async () => action("Send selection").click());
    await show("b");
    assert.equal(Boolean(action("Send selection")), false, "an old selection must not be offered in a new session");
    await select();
    await React.act(async () => action("Send selection").click());
    assert.deepEqual(sent, [["a", "Alpha original"], ["b", "Beta original"]]);

    await show("a");
    await edit("Alpha latest");
    await show("b");
    await show("a");
    assert.equal(editor().value, "Alpha latest", "reopening before the debounce retains the in-memory edit");
    await show("b");
    await waitForSave();
    assert.deepEqual(stored, { a: "Alpha latest", b: "Beta original" });

    await show("a");
    await edit("Alpha failed");
    await show("b");
    failSave = true;
    await waitForSave();
    assert.equal(stored.a, "Alpha latest");
    assert.equal(Boolean(document.querySelector(".notes-save-state.error")), false);
    await show("a");
    assert.equal(editor().value, "Alpha failed");
    assert.ok(document.querySelector(".notes-save-state.error"));
    failSave = false;
    await React.act(async () => action("Retry").click());
    assert.deepEqual(stored, { a: "Alpha failed", b: "Beta original" });
    assert.ok(document.querySelector(".notes-save-state.saved"));
  } finally {
    await React.act(async () => root.unmount());
  }
});
