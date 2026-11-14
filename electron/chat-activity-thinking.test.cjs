const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, Timeline;

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
    useUISettings: () => ({ chatVerbosity: "medium", t: (key) => key }),
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
