const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

async function loadAssistantStream(React) {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "StreamingMessage.tsx"), "utf8");
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source, "StreamingMessage.tsx");
  const script = code.replace(/^import .*;$/m, "").replace(/^export (?:default )?/gm, "");
  return new Function("useLayoutEffect", "useSyncExternalStore", `${script}\nreturn { createAssistantStream, StreamingMessage };`)(
    React.useLayoutEffect, React.useSyncExternalStore);
}

test("typing leaves long history and navigation untouched while history updates remain visible", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const frames = new Map();
  let frameId = 0;
  global.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  global.cancelAnimationFrame = id => { frames.delete(id); };
  const paint = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
  };
  dom.window.HTMLElement.prototype.scrollTo = () => {};

  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
  const start = source.indexOf("const ConversationHistory = memo(");
  const end = source.indexOf("\nfunction ConversationView(", start);
  assert.ok(start >= 0 && end > start, "conversation history component is available");
  const { transformWithOxc } = await import("vite");
  const { code: componentSource } = await transformWithOxc(source.slice(start, end), "conversation-history.tsx", { jsx: { runtime: "classic" } });

  let historyRenders = 0;
  let railRenders = 0;
  let activityRenders = 0;
  let parentRenders = 0;
  const ConversationMessage = ({ message }) => {
    historyRenders += 1;
    return React.createElement("article", { "data-turn-id": message.id }, message.text);
  };
  const TurnRail = ({ messages }) => {
    railRenders += 1;
    return React.createElement("nav", { "data-turn-count": messages.length });
  };
  const ChatActivityTimeline = () => { activityRenders += 1; return null; };
  const { createAssistantStream, StreamingMessage } = await loadAssistantStream(React);
  const assistantStream = createAssistantStream();
  const renderAssistantDraft = ({ text }) => React.createElement("output", null, text);
  const buildHistory = new Function("React", "memo", "useState", "useRef", "useMemo", "useCallback", "useEffect", "useLayoutEffect", "useUISettings", "ConversationMessage", "TurnRail", "ChatActivityTimeline", "NativeAgentPanel", "nativeTurnEvents", "INITIAL_VISIBLE_MESSAGE_COUNT", "HISTORY_MESSAGE_PAGE_SIZE", "StreamingMessage", "renderAssistantDraft", `${componentSource}\nreturn ConversationHistory;`);
  const ConversationHistory = buildHistory(React, React.memo, React.useState, React.useRef, React.useMemo, React.useCallback, React.useEffect, React.useLayoutEffect, () => ({ t: value => value }), ConversationMessage, TurnRail, ChatActivityTimeline, () => null, () => [], 60, 40, StreamingMessage, renderAssistantDraft);
  const messages = Array.from({ length: 100 }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" : "user", text: `Message ${index}` }));
  const stableProps = { messages, assistantStream, events: [], trajectoryEvents: [], agentBusy: false, interrupting: false, pendingAction: null, changeSets: [], welcomeVisible: false, onWelcomeAction: () => {}, onApprove: () => {}, onReject: () => {}, onOpenFile: () => {}, initialScrollTop: null, onScrollTop: () => {} };
  let setDraft;
  let setHistory;
  function Harness() {
    parentRenders++;
    const [draft, updateDraft] = React.useState("");
    const [currentMessages, updateMessages] = React.useState(messages);
    setDraft = updateDraft;
    setHistory = updateMessages;
    return React.createElement(React.Fragment, null,
      React.createElement("textarea", { value: draft, onChange: () => {} }),
      React.createElement(ConversationHistory, { ...stableProps, messages: currentMessages }));
  }

  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.equal(document.querySelectorAll("article").length, 60);
    const beforeTyping = [historyRenders, railRenders, activityRenders];
    for (const draft of ["a", "ab", "abc"]) await act(async () => setDraft(draft));
    assert.equal(document.querySelector("textarea").value, "abc");
    assert.deepEqual([historyRenders, railRenders, activityRenders], beforeTyping);

    await act(async () => paint());
    const beforeStream = [historyRenders, railRenders, activityRenders, parentRenders];
    const expected = ["The result", " is repeatable", " across runs."];
    for (const chunk of expected) await act(async () => {
      for (const character of chunk) assistantStream.append("fixture", character);
      assert.equal(frames.size, 1);
      paint();
    });
    assert.equal(document.querySelector("output").textContent, expected.join(""));
    assert.equal(document.querySelector("textarea").value, "abc");
    assert.deepEqual([historyRenders, railRenders, activityRenders, parentRenders], beforeStream);

    await act(async () => setHistory((current) => [...current, { id: "100", role: "user", text: "New message" }]));
    assert.equal(document.querySelectorAll("article").length, 60);
    assert.equal(document.querySelector("nav").dataset.turnCount, "60");
    assert.match(document.body.textContent, /New message/);
    await act(async () => document.querySelector(".conversation-load-history").click());
    await act(async () => document.querySelector(".conversation-load-history").click());
    assert.equal(document.querySelectorAll("article").length, 101);
    await act(async () => {
      assistantStream.finish("fixture");
      setHistory((current) => [...current, { id: "fixture:assistant", role: "assistant", text: expected.join("") }]);
    });
    assert.equal(document.querySelectorAll("article").length, 102);
    assert.equal(document.querySelector("nav").dataset.turnCount, "102");
    assert.equal(document.querySelector("output"), null);
    assert.equal(document.querySelector('[data-turn-id="fixture:assistant"]').textContent, expected.join(""));
    await act(async () => root.render(React.createElement(ConversationHistory, { ...stableProps, pendingAction: { kind: 'write', payload: { path: 'paper.py', editPreview: { before: 'old text', after: 'new text' } } } })));
    assert.match(document.querySelector('.approval-edit-preview').textContent, /old text/);
    assert.match(document.querySelector('.approval-edit-preview').textContent, /new text/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.IS_REACT_ACT_ENVIRONMENT;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  }
});

test("parent activity updates preserve history callbacks while using their latest implementations", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
  const start = source.indexOf("  const historyHandlersRef = useRef(");
  const end = source.indexOf("\n  const [welcomeDismissed", start);
  assert.ok(start >= 0 && end > start);
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(`function useHistoryHandlers(onApprove, onReject, onOpenFile, onWelcomeAction) {\n${source.slice(start, end)}\nreturn { approveHistoryAction, rejectHistoryAction, openHistoryFile };\n}`, "history-handlers.tsx");
  const useHistoryHandlers = new Function("useRef", "useCallback", `${code}\nreturn useHistoryHandlers;`)(React.useRef, React.useCallback);
  let renders = 0;
  let observed = "";
  const History = React.memo(({ handlers }) => { renders++; return React.createElement("button", { onClick: handlers.approveHistoryAction }, "Approve"); }, (a, b) => a.handlers.approveHistoryAction === b.handlers.approveHistoryAction && a.handlers.rejectHistoryAction === b.handlers.rejectHistoryAction && a.handlers.openHistoryFile === b.handlers.openHistoryFile);
  function Parent({ version }) {
    const handlers = useHistoryHandlers(() => { observed = version; }, () => {}, () => {}, () => {});
    return React.createElement(History, { handlers });
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Parent, { version: "old" })));
    await act(async () => root.render(React.createElement(Parent, { version: "new" })));
    assert.equal(renders, 1);
    await act(async () => document.querySelector("button").click());
    assert.equal(observed, "new");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});

test("finished turns and cleared drafts cannot publish delayed assistant text", async (t) => {
  const { createAssistantStream } = await loadAssistantStream(require("react"));
  let scheduled;
  global.requestAnimationFrame = callback => { scheduled = callback; return 1; };
  global.cancelAnimationFrame = () => { scheduled = null; };
  t.after(() => {
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });
  const stream = createAssistantStream();
  stream.append("first", "Repeatable");
  scheduled();
  assert.deepEqual(stream.getSnapshot(), { turnId: "first", text: "Repeatable" });
  stream.append("first", " result.");
  stream.finish("first");
  assert.equal(stream.getSnapshot(), null);
  stream.append("first", " result.");
  assert.equal(scheduled, null);

  stream.append("second", "Future workspace");
  stream.clear();
  assert.equal(scheduled, null);
  assert.equal(stream.getSnapshot(), null);
  stream.append("second", "Same turn reopened");
  scheduled();
  assert.equal(stream.getSnapshot().text, "Same turn reopened");
});
