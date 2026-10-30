const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

test("typing leaves long history and navigation untouched while history updates remain visible", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};

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
  const ConversationMessage = ({ message }) => {
    historyRenders += 1;
    return React.createElement("article", { "data-turn-id": message.id }, message.text);
  };
  const TurnRail = ({ messages }) => {
    railRenders += 1;
    return React.createElement("nav", { "data-turn-count": messages.length });
  };
  const ChatActivityTimeline = () => { activityRenders += 1; return null; };
  const buildHistory = new Function("React", "memo", "useState", "useRef", "useMemo", "useCallback", "useEffect", "ConversationMessage", "TurnRail", "ChatActivityTimeline", "INITIAL_VISIBLE_MESSAGE_COUNT", "HISTORY_MESSAGE_PAGE_SIZE", `${componentSource}\nreturn ConversationHistory;`);
  const ConversationHistory = buildHistory(React, React.memo, React.useState, React.useRef, React.useMemo, React.useCallback, React.useEffect, ConversationMessage, TurnRail, ChatActivityTimeline, 60, 40);
  const messages = Array.from({ length: 100 }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" : "user", text: `Message ${index}` }));
  const stableProps = { messages, events: [], trajectoryEvents: [], agentBusy: false, interrupting: false, pendingAction: null, changeSets: [], welcomeVisible: false, onWelcomeAction: () => {}, onApprove: () => {}, onReject: () => {}, onOpenFile: () => {} };
  let setDraft;
  let setHistory;
  function Harness() {
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

    await act(async () => setHistory((current) => [...current, { id: "100", role: "user", text: "New message" }]));
    assert.equal(document.querySelectorAll("article").length, 60);
    assert.equal(document.querySelector("nav").dataset.turnCount, "60");
    assert.match(document.body.textContent, /New message/);
    await act(async () => document.querySelector(".conversation-load-history").click());
    await act(async () => document.querySelector(".conversation-load-history").click());
    assert.equal(document.querySelectorAll("article").length, 101);
    await act(async () => setHistory((current) => [...current, { id: "101", role: "assistant", text: "New answer" }]));
    assert.equal(document.querySelectorAll("article").length, 102);
    assert.equal(document.querySelector("nav").dataset.turnCount, "102");
    assert.match(document.body.textContent, /New answer/);
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
