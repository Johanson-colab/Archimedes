const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, Timeline, settings;

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/ChatActivityTimeline.tsx"), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/export default /g, "")
    .replace(/export /g, "");
  const { code } = await transformWithOxc(source, "ChatActivityTimeline.tsx", { jsx: { runtime: "classic" } });
  const icons = require("lucide-react");
  settings = { chatVerbosity: "medium", t: (key) => key };
  const scope = {
    React,
    useMemo: React.useMemo,
    useState: React.useState,
    BookOpen: icons.BookOpen,
    ChevronDown: icons.ChevronDown,
    FileCode2: icons.FileCode2,
    Search: icons.Search,
    SquareTerminal: icons.SquareTerminal,
    Wrench: icons.Wrench,
    eventFailedAnswer: () => false,
    useUISettings: () => settings,
  };
  Timeline = new Function(...Object.keys(scope), `${code}\nreturn ChatActivityTimeline;`)(...Object.values(scope));
});

after(() => {
  dom.window.close();
  delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("an empty busy turn shows Thinking immediately", async () => {
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(Timeline, {
    events: [], rawEvents: [], busy: true, interrupting: false,
  })));
  assert.match(document.body.textContent, /Thinking…/);
  assert.doesNotMatch(document.body.textContent, /Working/);
  await React.act(async () => root.unmount());
});

test("low verbosity plus expands and collapses activity steps", async () => {
  settings.chatVerbosity = "low";
  const root = createRoot(document.getElementById("root"));
  try {
    await React.act(async () => root.render(React.createElement(Timeline, {
      events: [{ title: "search academic papers", detail: "long-term memory", state: "done" }],
      rawEvents: [],
      busy: false,
      interrupting: false,
    })));
    const toggle = document.querySelector(".chat-activity-low-summary");
    assert.ok(toggle, "low verbosity summary is a button");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(document.querySelector(".chat-activity-low-steps"), null);
    await React.act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.match(document.querySelector(".chat-activity-low-steps").textContent, /Search academic papers/);
    await React.act(async () => toggle.click());
    assert.equal(document.querySelector(".chat-activity-low-steps"), null);
  } finally {
    await React.act(async () => root.unmount());
    settings.chatVerbosity = "medium";
  }
});
