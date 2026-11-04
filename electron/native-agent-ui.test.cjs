const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, Panel, Usage, Question;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/NativeAgentPanel.tsx"), "utf8").replace(/^import .*;\n/gm, "").replace(/export default /g, "").replace(/export /g, "");
  const { code } = await transformWithOxc(source, "NativeAgentPanel.tsx", { jsx: { runtime: "classic" } });
  const stateSource = fs.readFileSync(path.join(__dirname, "../src/native-agent-state.ts"), "utf8").replace(/export /g, "");
  const state = await transformWithOxc(stateSource, "native-agent-state.ts");
  const nativeTurnEvents = new Function(`${state.code}\nreturn nativeTurnEvents;`)();
  const icons = require("lucide-react");
  const scope = { React, useState: React.useState, ChevronDown: icons.ChevronDown, Terminal: icons.Terminal, Wrench: icons.Wrench, useUISettings: () => ({ t: (key) => key }), nativeTurnEvents };
  [Panel, Usage, Question] = new Function(...Object.keys(scope), `${code}\nreturn [NativeAgentPanel,NativeContextUsage,NativeQuestionCard];`)(...Object.values(scope));
});
after(() => { dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; });
async function mount(component, props) {
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(component, props)));
  return () => React.act(async () => root.unmount());
}
test("native context reports unknown and displays last-request tokens without API estimates", async () => {
  let cleanup = await mount(Usage, { usage: null });
  assert.match(document.body.textContent, /Unknown/); assert.doesNotMatch(document.body.textContent, /300,000|Estimated/);
  assert.ok(document.querySelector(".context-usage-ring"));
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), null);
  await cleanup();
  cleanup = await mount(Usage, { usage: { totalTokens: 100, modelContextWindow: 1000, inputTokens: 80, cachedInputTokens: 40, outputTokens: 20 } });
  assert.match(document.body.textContent, /10%/); assert.match(document.body.textContent, /100/);
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "10");
  await cleanup();
});
test("same-title native tools remain distinct with expandable output and correct stopped state", async () => {
  const events = ["a", "b"].map((id) => ({ id, type: "native_activity", turn_id: "t", payload: { activity: { id, kind: "commandExecution", title: "Codex command", detail: "pwd", output: `/workspace/${id}`, status: id === "a" ? "completed" : "running" } } }));
  const cleanup = await mount(Panel, { events, busy: false });
  assert.equal(document.querySelectorAll(".native-activity-item").length, 2);
  assert.match(document.body.textContent, /Interrupted/);
  assert.match(document.querySelectorAll("pre")[1].textContent, /workspace\/b/);
  await cleanup();
});
test("native question options send the selected answer once and blank answers stay disabled", async () => {
  const calls = [];
  const cleanup = await mount(Question, { question: { id: "request", questions: [{ id: "q", header: "Choose", question: "Which tests?", options: [{ label: "Focused", description: "Run a bounded suite" }] }] }, onAnswer: async (...args) => calls.push(args) });
  assert.equal(document.querySelector('[type="submit"]').disabled, true);
  await React.act(async () => document.querySelector('[type="button"]').click());
  await React.act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual(calls, [["request", { q: ["Focused"] }]]);
  await cleanup();
});

test("native question IDs can match JavaScript prototype property names", async () => {
  const calls = [];
  const cleanup = await mount(Question, { question: { id: "request", questions: ["__proto__", "constructor"].map((id) => ({ id, header: "Choose", question: "Continue?", options: [{ label: "Yes", description: "Continue this task" }] })) }, onAnswer: async (...args) => calls.push(args) });
  try {
    assert.equal(document.querySelector('[type="submit"]').disabled, true);
    for (const button of document.querySelectorAll('[type="button"]')) await React.act(async () => button.click());
    await React.act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(Object.hasOwn(calls[0][1], "__proto__"), true);
    assert.deepEqual(calls[0][1].constructor, ["Yes"]);
  } finally { await cleanup(); }
});
