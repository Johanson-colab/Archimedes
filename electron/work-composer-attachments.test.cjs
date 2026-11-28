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
  const drafts = new Map();
  const bindings = {
    React, ...React, ...require("lucide-react"),
    useUISettings: () => ({ t: value => value }),
    researchModes: [{ id: "standard" }],
    nativeUsage: none,
    readComposerDraft: key => drafts.get(key),
    readComposerHistory: () => [],
    writeComposerDraft: (key, draft) => drafts.set(key, draft),
    writeComposerHistory: none,
    chatModeFromThread: mode => mode,
    estimateAttachmentContextCharacters: () => 0,
    CONTEXT_INSTRUCTION_OVERHEAD_CHARS: 0,
    COMPOSER_HISTORY_LIMIT: 30,
    requestAnimationFrame: none,
    cancelAnimationFrame: none,
    shouldSubmitPaperChatKey: event => event.key === "Enter",
    workspacePathName: value => value,
    WorkspaceMarkdownProvider: ({ children }) => children,
    ConversationHistory: none, ContextPicker: none, HarnessPicker: none, ComposerModelPicker: none, MenuSurface: none, MenuItem: none,
    MenuLabel: none, MenuDivider: none, VoiceInputButton: none, desktopBridge: {},
    ContextChips: ({ items }) => items.map(item => React.createElement("output", { key: item.id }, item.id)),
  };
  const ConversationView = new Function(...Object.keys(bindings), `${code}\nreturn ConversationView;`)(...Object.values(bindings));
  const sent = [];
  let attach;
  let finish;
  const emptySession = { context: [], queued: [], paused: false };
  function Harness({ owner }) {
    const [sessions, setSessions] = React.useState({});
    const [busy, setBusy] = React.useState(false);
    const session = sessions[owner] ?? emptySession;
    const updateSession = update => setSessions(current => ({ ...current, [owner]: update(current[owner] ?? emptySession) }));
    const setItems = update => updateSession(current => ({ ...current, context: update(current.context) }));
    attach = id => setItems(() => [{ id, type: "image" }]);
    return React.createElement(ConversationView, {
      key: owner,
      draftKey: owner,
      researchMode: "standard",
      modelCapabilities: { contextCharacterLimits: {} },
      agentBusy: busy,
      nativeQuestions: [],
      messages: [],
      trajectoryEvents: [],
      contextItems: session.context,
      composerSession: session,
      onComposerSessionChange: updateSession,
      onAddContext: items => setItems(() => items),
      onRemoveContext: id => setItems(current => current.filter(item => item.id !== id)),
      onResearchMode: none,
      onResearchGraphAvailability: none,
      onRemoteServerChange: none,
      onSubmit: ({ draft, contextItems }) => {
        sent.push([draft, contextItems.map(item => item.id)]);
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
  const show = owner => React.act(async () => root.render(React.createElement(Harness, { owner })));
  const button = label => [...document.querySelectorAll("button")].find(element => element.textContent === label);

  try {
    await show("work");
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
    assert.equal(field().value, "", "a failed turn with followers stays queued instead of taking the editor");
    assert.deepEqual(images(), [], "the failed turn keeps its attachments in the queue");
    assert.equal(document.querySelectorAll(".composer-queue-item").length, 2);
    await React.act(async () => button("Retry queued messages").click());
    assert.deepEqual(sent.at(-1), ["Queued with image", ["blue"]]);
    await settle(true);
    assert.deepEqual(sent.at(-1), ["Queued without image", []]);
    await settle(true);
    assert.deepEqual(sent, [
      ["Initial", ["red"]],
      ["Queued with image", ["blue"]],
      ["Queued with image", ["blue"]],
      ["Queued without image", []],
    ]);

    await paste("green");
    await type("Draft that will fail");
    await enter();
    await paste("green");
    await type("New draft");
    await settle(false);
    assert.equal(field().value, "New draft");
    assert.deepEqual(images(), ["green"]);
    const retry = button("Retry queued messages");
    assert.ok(retry, "a failed follow-up remains actionable beside a newer draft");
    await React.act(async () => retry.click());
    assert.equal(document.querySelector("#composer-error"), null);
    assert.deepEqual(sent.at(-1), ["Draft that will fail", ["green"]]);
    assert.deepEqual(images(), ["green"], "retrying the queued item preserves the new draft's image");
    await settle(true);

    await paste("purple");
    await type("Pending in Work");
    await enter();
    await paste("orange");
    await type("Follow-up in Work");
    await enter();
    await paste("green");
    await type("Newer draft in Work");
    await show("other");
    await settle(false);
    assert.deepEqual(images(), []);
    assert.equal(field().value, "");
    assert.equal(Boolean(button("Retry queued messages")), false);
    await show("work");
    assert.equal(field().value, "Newer draft in Work");
    assert.deepEqual(images(), ["green"]);
    assert.equal(document.querySelectorAll(".composer-queue-item").length, 2);

    await React.act(async () => button("Retry queued messages").click());
    assert.deepEqual(sent.at(-1), ["Pending in Work", ["purple"]]);
    await settle(true);
    assert.deepEqual(sent.at(-1), ["Follow-up in Work", ["orange"]]);
    await settle(true);
    assert.equal(document.querySelectorAll(".composer-queue-item").length, 0);
    assert.deepEqual(images(), ["green"]);

    await type("Accepted while away");
    await enter();
    for (const text of ["Discard first", "Discard second", "Discard third"]) {
      await type(text);
      await enter();
    }
    await show("other");
    await settle(true);
    await show("work");
    assert.ok(button("Send queued messages"), "a detached success leaves its follow-ups actionable");
    await React.act(async () => document.querySelector('[aria-label="Remove queued message 1"]').click());
    assert.equal(document.querySelectorAll(".composer-queue-item").length, 2);
    await React.act(async () => button("Clear queue").click());
    await show("other");
    await show("work");
    assert.equal(document.querySelectorAll(".composer-queue-item").length, 0);
    assert.deepEqual(sent.at(-1), ["Accepted while away", ["green"]]);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    delete globalThis.document;
    delete globalThis.window;
  }
});
