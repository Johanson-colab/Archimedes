const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

test("Work composer keeps attachment snapshots separate and recovers failed queued messages", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
  const start = source.indexOf("function ConversationView(");
  const end = source.indexOf("\nconst ConversationMessage", start);
  const { code } = await transformWithOxc(source.slice(start, end), "ConversationView.tsx", { jsx: { runtime: "classic" } });
  const none = () => null;
  const bindings = {
    React, ...React, ...require("lucide-react"),
    useUISettings: () => ({ t: value => value }),
    researchModes: [{ id: "standard" }],
    nativeUsage: none,
    readComposerDraft: none,
    readComposerHistory: () => [],
    writeComposerDraft: none,
    writeComposerHistory: none,
    chatModeFromThread: mode => mode,
    estimateAttachmentContextCharacters: () => 0,
    CONTEXT_INSTRUCTION_OVERHEAD_CHARS: 0,
    COMPOSER_HISTORY_LIMIT: 30,
    requestAnimationFrame: none,
    shouldSubmitPaperChatKey: event => event.key === "Enter",
    workspacePathName: value => value,
    WorkspaceMarkdownProvider: ({ children }) => children,
    ConversationHistory: none, ContextPicker: none, HarnessPicker: none, MenuSurface: none, MenuItem: none,
    MenuLabel: none, MenuDivider: none, VoiceInputButton: none, desktopBridge: {},
    ContextChips: ({ items }) => items.map(item => React.createElement("output", { key: item.id }, item.id)),
  };
  const ConversationView = new Function(...Object.keys(bindings), `${code}\nreturn ConversationView;`)(...Object.values(bindings));
  const sent = [];
  let attach;
  let finish;
  function Harness() {
    const [items, setItems] = React.useState([]);
    const [busy, setBusy] = React.useState(false);
    attach = id => setItems([{ id, type: "image" }]);
    return React.createElement(ConversationView, {
      draftKey: "work",
      researchMode: "standard",
      modelCapabilities: { contextCharacterLimits: {} },
      agentBusy: busy,
      nativeQuestions: [],
      messages: [],
      trajectoryEvents: [],
      contextItems: items,
      onAddContext: setItems,
      onRemoveContext: id => setItems(current => current.filter(item => item.id !== id)),
      onResearchMode: none,
      onResearchGraphAvailability: none,
      onRemoteServerChange: none,
      onSubmit: (text, _mode, _effort, _length, attachments) => {
        sent.push([text, attachments.map(item => item.id)]);
        setBusy(true);
        return new Promise(resolve => { finish = success => { setBusy(false); resolve(success); }; });
      },
    });
  }

  const root = createRoot(document.getElementById("root"));
  const field = () => document.querySelector("textarea");
  const images = () => [...document.querySelectorAll("output")].map(item => item.textContent);
  const type = text => React.act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set;
    setValue.call(field(), text);
    field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const enter = () => React.act(async () => { field().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  const paste = id => React.act(async () => attach(id));
  const settle = success => React.act(async () => finish(success));

  try {
    await React.act(async () => root.render(React.createElement(Harness)));
    await paste("red");
    await type("Initial");
    await enter();
    assert.deepEqual(images(), [], "sending detaches the submitted image immediately");

    await paste("blue");
    await type("Queued with image");
    await enter();
    assert.deepEqual(images(), [], "queuing detaches the submitted image immediately");
    await type("Queued without image");
    await enter();
    await settle(true);

    await settle(false);
    assert.equal(field().value, "Queued with image", "a failed follow-up restores the text");
    assert.deepEqual(images(), ["blue"], "a failed follow-up restores its own image");
    await enter();
    await settle(true);
    assert.deepEqual(sent, [
      ["Initial", ["red"]],
      ["Queued with image", ["blue"]],
      ["Queued with image", ["blue"]],
      ["Queued without image", []],
    ]);

    await paste("green");
    await type("New draft");
    await settle(false);
    assert.equal(field().value, "New draft");
    assert.deepEqual(images(), ["green"]);
    const retry = [...document.querySelectorAll("button")].find(button => button.textContent === "Retry queued messages");
    assert.ok(retry, "a failed follow-up remains actionable beside a newer draft");
    await React.act(async () => retry.click());
    assert.equal(document.querySelector("#composer-error"), null);
    assert.deepEqual(sent.at(-1), ["Queued without image", []]);
    assert.deepEqual(images(), ["green"], "retrying the queued item preserves the new draft's image");
    await settle(true);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    delete globalThis.document;
    delete globalThis.window;
  }
});
