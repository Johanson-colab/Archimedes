const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, ModelSettingsModal;
const calls = {};
const translate = (key) => key;

before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.requestAnimationFrame = (callback) => { callback(); return 1; };
  React = require("react");
  ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const icons = require("lucide-react");
  const scope = {
    React, ...React,
    ...Object.fromEntries(["BrainCircuit", "Bot", "Check", "ChevronDown", "KeyRound", "LoaderCircle", "Network", "RefreshCw", "Route", "Save", "Server", "Sparkles", "X"].map((name) => [name, icons[name]])),
    useUISettings: () => ({ t: translate }),
    MenuSurface: ({ open, children }) => open ? children : null,
    ...Object.fromEntries(["anthropicLogo", "geminiLogo", "minimaxLogo", "zaiLogo", "deepseekLogo", "moonshotLogo", "openaiLogo", "qwenLogo"].map((name) => [name, name])),
  };
  async function load(name, exports) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", `${name}.tsx`), "utf8");
    const withoutImports = source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/export default function/g, "function").replace(/export function/g, "function").replace(/export \{ providers \};/g, "");
    const { code } = await transformWithOxc(withoutImports, `${name}.tsx`, { jsx: { runtime: "classic" } });
    const values = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${exports.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, values);
    return values;
  }
  await load("SettingsPrimitives", ["SettingsGroup", "SettingsRow", "SettingsSection"]);
  await load("Tabs", ["Tab", "Tabs"]);
  await load("AgentBackendSettings", ["AgentBackendSettings"]);
  ({ ModelSettingsModal } = await load("ModelSettingsModal", ["ModelSettingsModal"]));
});

after(() => {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.IS_REACT_ACT_ENVIRONMENT;
  delete global.requestAnimationFrame;
});

function bridge(overrides = {}) {
  calls.savedModels = [];
  calls.savedBackends = [];
  calls.checkedBackends = [];
  calls.loadedBackends = 0;
  return {
    getModelConfig: async () => ({ provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", hasApiKey: true }),
    saveModelConfig: async (config) => { calls.savedModels.push(config); return config; },
    getAgentBackendConfig: async () => { calls.loadedBackends++; return { backend: "api", binary: "codex", model: "" }; },
    saveAgentBackendConfig: async (config) => { calls.savedBackends.push(config); return config; },
    checkAgentBackend: async (config) => { calls.checkedBackends.push(config); return { ready: true, models: [{ id: "native-model", label: "Native model" }], message: "Connected" }; },
    ...overrides,
  };
}

async function mount(api, role = "agent", strict = false) {
  const root = createRoot(document.getElementById("root"));
  const content = React.createElement(ModelSettingsModal, { bridge: api, open: true, embedded: true, onClose() {}, onSaved() {}, role });
  await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, content) : content));
  return () => React.act(async () => root.unmount());
}
const button = (label) => [...document.querySelectorAll("button")].find((node) => node.textContent === label || node.querySelector(".ui-tab-label")?.textContent === label);
const click = (label) => React.act(async () => { assert.ok(button(label), `button ${label} exists`); button(label).click(); });
async function input(label, value) {
  const field = [...document.querySelectorAll("label")].find((node) => node.textContent === label);
  const node = document.getElementById(field.htmlFor);
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

test("API and Agent tabs keep separate actions, keyboard navigation and unsaved drafts", async () => {
  const cleanup = await mount(bridge());
  try {
    const [api, agents] = document.querySelectorAll('[role="tab"]');
    assert.equal(api.textContent, "API models");
    assert.equal(agents.textContent, "Agent backends");
    assert.equal(document.getElementById(api.getAttribute("aria-controls")).hidden, false);
    assert.equal(document.getElementById(agents.getAttribute("aria-controls")).hidden, true);
    await React.act(async () => {
      api.focus();
      api.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.equal(agents.getAttribute("aria-selected"), "true");
    assert.ok(document.activeElement === agents, "keyboard focus follows the selected tab");
    assert.equal(button("Save model").closest('[role="tabpanel"]').hidden, true);
    await input("Codex model", "draft-native-model");
    await click("API models");
    await click("Agent backends");
    assert.equal(document.querySelector('.agent-backend-fields input[list]').value, "draft-native-model");
    assert.deepEqual(calls.savedBackends, []);
    assert.deepEqual(calls.checkedBackends, []);
    await click("API models");
    await click("Save model");
    assert.equal(calls.savedModels.length, 1);
    assert.deepEqual(calls.savedBackends, []);
  } finally { await cleanup(); }
});

test("checking Codex does not activate it; explicit activation and API reset persist separately", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Agent backends");
    assert.match(document.querySelector(".agent-connection-status").textContent, /not checked/);
    await click("Check Codex");
    assert.equal(calls.checkedBackends[0].backend, "codex");
    assert.deepEqual(calls.savedBackends, []);
    assert.ok(!document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connected");
    assert.equal(document.querySelector("datalist option").value, "native-model");
    await input("Codex model", "native-model");
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connection not checked");
    await click("Use Codex");
    assert.deepEqual(calls.savedBackends[0], { backend: "codex", binary: "codex", model: "native-model" });
    assert.ok(document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.equal(document.querySelector('.model-connection-tabs .ui-tab-badge').textContent, "Codex");
    await click("Use API harness");
    assert.equal(calls.savedBackends[1].backend, "api");
    assert.ok(!document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.ok(!document.querySelector('.model-connection-tabs .ui-tab-badge'));
    assert.equal(document.querySelector(".agent-runtime-status").textContent, "API harness active");
    assert.deepEqual(calls.savedModels, []);
  } finally { await cleanup(); }
});

test("failed save keeps the actual active backend and displays an error", async () => {
  const cleanup = await mount(bridge({ saveAgentBackendConfig: async () => { throw new Error("Cannot save backend"); } }));
  try {
    await click("Agent backends");
    await click("Use Codex");
    assert.match(document.querySelector('[role="alert"]').textContent, /Cannot save backend/);
    assert.ok(!document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.equal(document.querySelector(".agent-runtime-status").textContent, "API harness active");
    assert.equal(button("Use Codex").disabled, false);
  } finally { await cleanup(); }
});

test("connection errors are visible without silently changing the saved backend", async () => {
  const cleanup = await mount(bridge({
    getAgentBackendConfig: async () => ({ backend: "codex", binary: "codex", model: "" }),
    checkAgentBackend: async () => { throw new Error("Not signed in"); },
  }));
  try {
    await click("Agent backends");
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connection not checked");
    await click("Check Codex");
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connection failed");
    assert.match(document.querySelector('[role="alert"]').textContent, /Not signed in/);
    assert.ok(document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.deepEqual(calls.savedBackends, []);
  } finally { await cleanup(); }
});

test("in-flight checks lock configuration and never show an unverified connected state", async () => {
  let finish;
  const cleanup = await mount(bridge({ checkAgentBackend: () => new Promise((resolve) => { finish = resolve; }) }));
  try {
    await click("Agent backends");
    await click("Check Codex");
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Checking connection");
    assert.equal(button("Use Codex").disabled, true);
    assert.equal(document.querySelector(".agent-backend-fields input").disabled, true);
    await React.act(async () => finish({ ready: false, models: [], message: "Unavailable" }));
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connection failed");
    assert.equal(button("Use Codex").disabled, false);
  } finally { await cleanup(); }
});

test("configuration load failure is recoverable without a silent default backend", async () => {
  let attempts = 0;
  const cleanup = await mount(bridge({ getAgentBackendConfig: async () => {
    if (++attempts === 1) throw new Error("Invalid config");
    return { backend: "codex", binary: "codex", model: "" };
  } }));
  try {
    await click("Agent backends");
    assert.match(document.querySelector('[role="alert"]').textContent, /Invalid config/);
    assert.equal(button("Use Codex").disabled, true);
    await click("Reload configuration");
    assert.equal(attempts, 2);
    assert.ok(document.querySelector(".agent-backend-card .agent-backend-active"));
    assert.ok(!document.querySelector('[role="alert"]'));
  } finally { await cleanup(); }
});

test("Proactive remains API-only and never loads native backend controls", async () => {
  const cleanup = await mount(bridge(), "proactive");
  try {
    assert.ok(!document.querySelector('[role="tablist"]'));
    assert.ok(!document.querySelector(".agent-backend-settings"));
    assert.equal(calls.loadedBackends, 0);
    assert.ok(button("Save model"));
  } finally { await cleanup(); }
});

test("agent cards collapse without changing the backend and binary edits invalidate detection", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Agent backends");
    const toggle = document.querySelector(".agent-backend-card-toggle");
    const panel = document.getElementById(toggle.getAttribute("aria-controls"));
    await React.act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(panel.hidden, true);
    assert.deepEqual(calls.savedBackends, []);
    await React.act(async () => toggle.click());
    await click("Check Codex");
    await input("Codex executable", "/different/codex");
    assert.equal(document.querySelector(".agent-connection-status").textContent, "Connection not checked");
    assert.equal(document.querySelectorAll("datalist option").length, 0);
  } finally { await cleanup(); }
});

test("repeated mounting and tab switching never starts native agents or accumulates configuration loads", async () => {
  const api = bridge();
  global.gc?.();
  const baseline = process.memoryUsage().heapUsed;
  for (let cycle = 0; cycle < 25; cycle++) {
    const cleanup = await mount(api);
    try {
      await click("Agent backends");
      await click("API models");
      await click("Agent backends");
    } finally { await cleanup(); }
    assert.equal(document.getElementById("root").childElementCount, 0);
  }
  assert.equal(calls.loadedBackends, 25);
  assert.equal(calls.checkedBackends.length, 0);
  assert.equal(calls.savedBackends.length, 0);
  if (global.gc) {
    global.gc();
    console.log(JSON.stringify({ audit: "25 model settings mount/unmount cycles", heapDeltaMiB: +((process.memoryUsage().heapUsed - baseline) / 1048576).toFixed(2) }));
  }
});

test("development StrictMode double mounting remains bounded and never checks Codex automatically", async () => {
  const api = bridge();
  global.gc?.();
  const baseline = process.memoryUsage().heapUsed;
  for (let cycle = 0; cycle < 25; cycle++) {
    const cleanup = await mount(api, "agent", true);
    try {
      await click("Agent backends");
      await click("API models");
    } finally { await cleanup(); }
    assert.equal(document.getElementById("root").childElementCount, 0);
  }
  assert.equal(calls.loadedBackends, 50, "StrictMode runs the load effect twice per mount, not on every render");
  assert.equal(calls.checkedBackends.length, 0);
  assert.equal(calls.savedBackends.length, 0);
  if (global.gc) {
    global.gc();
    console.log(JSON.stringify({ audit: "25 StrictMode mount/unmount cycles", heapDeltaMiB: +((process.memoryUsage().heapUsed - baseline) / 1048576).toFixed(2) }));
  }
});
