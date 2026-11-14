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
  global.cancelAnimationFrame = () => {};
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.ResizeObserver = class { observe() {} disconnect() {} };
  React = require("react");
  ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const icons = require("lucide-react");
  const scope = {
    React, ...React,
    ...Object.fromEntries(["Brain", "Workflow", "Check", "ChevronDown", "Key", "LoaderCircle", "Network", "RefreshCw", "Route", "Save", "Server", "Sparkle", "X"].map((name) => [name, icons[name]])),
    useUISettings: () => ({ t: translate }),
    createPortal: require("react-dom").createPortal,
    ...Object.fromEntries(["anthropicLogo", "claudeLogo", "opencodeLogo", "geminiLogo", "minimaxLogo", "zaiLogo", "deepseekLogo", "moonshotLogo", "openaiLogo", "qwenLogo"].map((name) => [name, name])),
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
  await load("Menu", ["MenuSurface", "MenuItem"]);
  await load("AgentBackendSettings", ["AgentBackendSettings"]);
  ({ ModelSettingsModal } = await load("ModelSettingsModal", ["ModelSettingsModal"]));
});

after(() => {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.IS_REACT_ACT_ENVIRONMENT;
  delete global.requestAnimationFrame;
  delete global.cancelAnimationFrame;
  delete global.HTMLElement;
  delete global.Node;
  delete global.ResizeObserver;
});

function bridge(overrides = {}) {
  calls.savedModels = [];
  calls.savedBackends = [];
  calls.checkedBackends = [];
  calls.loadedCatalogs = [];
  calls.loadedBackends = 0;
  return {
    getModelConfig: async () => ({ provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", hasApiKey: true }),
    saveModelConfig: async (config) => { calls.savedModels.push(config); return config; },
    listProviderModels: async () => ({ models: [] }),
    getAgentBackendConfig: async () => { calls.loadedBackends++; return { backend: "api", binary: "codex", model: "" }; },
    saveAgentBackendConfig: async (config) => { calls.savedBackends.push(config); return config; },
    listCodexModelCatalog: async (config) => { calls.loadedCatalogs.push(config); return { models: [{ id: "native-model", label: "Native model", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], defaultEffort: "high" }], effectiveModelId: "native-model" }; },
    checkAgentBackend: async (config) => { calls.checkedBackends.push(config); return { ready: true, models: [{ id: "native-model", label: "Native model" }], message: "Connected" }; },
    ...overrides,
  };
}

async function mount(api, role = "agent", strict = false, executionPreferences) {
  const root = createRoot(document.getElementById("root"));
  const content = React.createElement(ModelSettingsModal, { bridge: api, open: true, embedded: true, onClose() {}, onSaved() {}, role, executionPreferences });
  await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, content) : content));
  return () => React.act(async () => root.unmount());
}
const button = (label) => [...document.querySelectorAll("button")].find((node) => node.textContent === label || node.getAttribute("aria-label") === label || node.querySelector(".ui-tab-label")?.textContent === label);
async function reveal(node) {
  const panel = node.closest('.agent-backend-panel');
  if (panel?.hidden) await React.act(async () => document.querySelector(`[aria-controls="${panel.id}"]`).click());
}
async function click(label) {
  assert.ok(button(label), `button ${label} exists`);
  await reveal(button(label));
  await React.act(async () => button(label).click());
}
async function input(label, value) {
  const field = [...document.querySelectorAll("label")].find((node) => node.textContent === label);
  const node = document.getElementById(field.htmlFor);
  await reveal(node);
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
    assert.equal(agents.textContent, "Harnesses");
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
    await click("Harnesses");
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
    await click("Harnesses");
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
    assert.deepEqual(calls.savedBackends[0], { backend: "codex", binary: "codex", model: "native-model", effort: "", permissionMode: "ask" });
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

test("keyboard switching to Harnesses closes the API model picker portal", async () => {
  const cleanup = await mount(bridge());
  try {
    await React.act(async () => document.querySelector(".model-catalog-toggle").click());
    assert.ok(document.body.querySelector(".model-catalog"), "the real MenuSurface portal is open");
    assert.ok(!document.getElementById("root").querySelector(".model-catalog"), "the popup lives outside the hidden panel");
    const apiTab = document.querySelector('.model-connection-tabs [data-value="api"]');
    await React.act(async () => {
      apiTab.focus();
      apiTab.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.equal(document.querySelector('.model-connection-tabs [data-value="agents"]').getAttribute("aria-selected"), "true");
    assert.ok(!document.body.querySelector(".model-catalog"), "the hidden API panel must not leave a floating portal");
    await click("API models");
    assert.equal(document.querySelector('[role="combobox"]').getAttribute("aria-expanded"), "false");
  } finally { await cleanup(); }
});

test("failed save keeps the actual active backend and displays an error", async () => {
  const cleanup = await mount(bridge({ saveAgentBackendConfig: async () => { throw new Error("Cannot save backend"); } }));
  try {
    await click("Harnesses");
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
    await click("Harnesses");
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
    await click("Harnesses");
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
    await click("Harnesses");
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
    await click("Harnesses");
    const toggle = document.querySelector(".agent-backend-card-toggle");
    const panel = document.getElementById(toggle.getAttribute("aria-controls"));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await React.act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
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
      await click("Harnesses");
      await click("API models");
      await click("Harnesses");
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
      await click("Harnesses");
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

test("native selects share the same style and load supported effort options when expanded", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Harnesses");
    const field = (label) => document.getElementById([...document.querySelectorAll("label")].find((node) => node.textContent === label)?.htmlFor);
    assert.equal(calls.loadedCatalogs.length, 0, "opening Models does not launch Codex");
    await reveal(field("Codex thinking effort"));
    const effort = field("Codex thinking effort");
    const permission = field("Codex permissions");
    assert.equal(calls.loadedCatalogs.length, 1, "expanding Codex loads its native catalog once");
    assert.equal(effort.tagName, "SELECT");
    assert.equal(permission.tagName, "SELECT");
    assert.equal(effort.className, permission.className);
    assert.deepEqual([...effort.options].map((option) => option.value), ["", "low", "medium", "high", "xhigh", "max", "ultra"]);
    assert.deepEqual([...permission.options].map((option) => option.value), ["ask", "auto-review", "full-access"]);
    await React.act(async () => {
      effort.value = "ultra";
      effort.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      permission.value = "auto-review";
      permission.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(calls.savedBackends.length, 0);
    await click("Use Codex");
    assert.equal(calls.savedBackends.at(-1).effort, "ultra");
    assert.equal(calls.savedBackends.at(-1).permissionMode, "auto-review");
    assert.equal(calls.savedModels.length, 0);
    assert.ok(!document.body.textContent.includes("Capabilities and permissions"));
  } finally { await cleanup(); }
});

test("a failed catalog request keeps the saved effort and can retry", async () => {
  let attempts = 0;
  const cleanup = await mount(bridge({
    getAgentBackendConfig: async () => ({ backend: "codex", binary: "codex", model: "", effort: "high" }),
    listCodexModelCatalog: async () => {
      if (++attempts === 1) throw new Error("Catalog unavailable");
      return { models: [{ id: "m", label: "Model", efforts: ["low", "high"] }], effectiveModelId: "m" };
    },
  }));
  try {
    await click("Harnesses");
    const label = [...document.querySelectorAll("label")].find((node) => node.textContent === "Codex thinking effort");
    const effort = document.getElementById(label.htmlFor);
    await reveal(effort);
    assert.equal(effort.value, "high", "saved choice is not discarded when lookup fails");
    assert.match(document.querySelector('[role="status"]').textContent, /Catalog unavailable/);
    await React.act(async () => effort.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true })));
    assert.equal(attempts, 2);
    assert.deepEqual([...effort.options].map((option) => option.value), ["", "low", "high"]);
    assert.equal(effort.value, "high");
  } finally { await cleanup(); }
});

test("Claude and OpenCode settings use independent drafts and explicit native activation", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Harnesses");
    await input("Codex model", "codex-draft");
    await click("Claude Code");
    assert.equal(document.querySelector('.agent-backend-fields input').value, "claude");
    await input("Claude Code model", "sonnet");
    await click("Check Claude Code");
    assert.equal(calls.checkedBackends.at(-1).backend, "claude");
    assert.equal(calls.checkedBackends.at(-1).permissionMode, "ask");
    await click("OpenCode");
    assert.equal(document.querySelector('.agent-backend-card[aria-label="Claude Code"] .agent-connection-status').textContent, "Connected");
    assert.equal(document.querySelector('.agent-backend-card[aria-label="OpenCode"] .agent-connection-status').textContent, "Connection not checked");
    assert.equal(document.querySelector('.agent-backend-fields input').value, "opencode");
    await input("OpenCode model", "provider/model");
    await click("Claude Code");
    assert.equal(document.querySelector('.agent-backend-fields input[list]').value, "sonnet");
    assert.equal(document.querySelector('datalist option').value, "native-model");
    await click("Use Claude Code");
    assert.equal(calls.savedBackends.at(-1).backend, "claude");
    assert.equal(calls.savedBackends.at(-1).model, "sonnet");
    await click("Use API harness");
    assert.equal(calls.savedBackends.at(-1).backend, "api");
    assert.equal(calls.savedBackends.at(-1).binary, "codex");
    assert.equal(document.querySelector('.agent-backend-fields input[list]').value, "sonnet");
    await click("Codex");
    assert.equal(document.querySelector('.agent-backend-fields input[list]').value, "codex-draft");
  } finally { await cleanup(); }
});

test("Harnesses are three expandable cards and OpenCode keeps readable static permission copy", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Harnesses");
    const cards = [...document.querySelectorAll('.agent-backend-card')];
    assert.equal(cards.length, 3);
    assert.deepEqual(cards.map(card => card.getAttribute('aria-label')), ['Codex', 'Claude Code', 'OpenCode']);
    assert.ok(cards.every(card => card.querySelector('.agent-backend-panel').hidden));
    await click("Claude Code");
    const claudeCard = document.querySelector('.agent-backend-card[aria-label="Claude Code"]');
    assert.equal(claudeCard.querySelector('.agent-backend-card-toggle').getAttribute('aria-expanded'), 'true');
    assert.ok(!claudeCard.querySelector('.agent-backend-permissions'));
    const claudeField = (label) => document.getElementById([...document.querySelectorAll("label")].find((node) => node.textContent === label)?.htmlFor);
    assert.equal(claudeField("Claude Code thinking effort").tagName, "SELECT");
    assert.equal(claudeField("Claude Code permissions").tagName, "SELECT");
    await click("OpenCode");
    const card = document.querySelector('.agent-backend-card[aria-label="OpenCode"]');
    assert.equal(card.querySelector('.agent-backend-card-toggle').getAttribute('aria-expanded'), 'true');
    assert.ok(card.querySelector('.agent-backend-permissions'));
    assert.match(card.querySelector('.agent-backend-permissions').textContent, /OpenCode/);
    assert.doesNotMatch(card.textContent, /Native permissions|Ask for approval/);
    assert.ok(!card.querySelector('.agent-backend-permissions .settings-row-control'));
    assert.doesNotMatch(card.querySelector('.agent-backend-fields').textContent, /Claude Code thinking effort|Claude Code permissions/);
    assert.deepEqual(calls.savedBackends, []);
    assert.deepEqual(calls.checkedBackends, []);
  } finally { await cleanup(); }
});

test("Claude Code exposes native effort and permission modes", async () => {
  const cleanup = await mount(bridge());
  try {
    await click("Harnesses");
    await click("Claude Code");
    const field = (label) => document.getElementById([...document.querySelectorAll("label")].find((node) => node.textContent === label)?.htmlFor);
    const effort = field("Claude Code thinking effort");
    const permissions = field("Claude Code permissions");
    assert.deepEqual([...effort.options].map((option) => option.value), ["", "low", "medium", "high", "xhigh", "max"]);
    assert.deepEqual([...permissions.options].map((option) => option.value), ["ask", "accept-edits", "plan", "auto", "full-access"]);
    await React.act(async () => {
      effort.value = "high";
      effort.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      permissions.value = "auto";
      permissions.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await click("Use Claude Code");
    assert.equal(calls.savedBackends.at(-1).backend, "claude");
    assert.equal(calls.savedBackends.at(-1).effort, "high");
    assert.equal(calls.savedBackends.at(-1).permissionMode, "auto");
  } finally { await cleanup(); }
});

test("API execution preferences can be changed in Models without switching the harness", async () => {
  const changes = [];
  const cleanup = await mount(bridge(), "agent", false, {
    reasoningEffort: "medium", contextLength: "standard", capabilities: { thinkingEfforts: ["low", "medium", "high"], contextLengths: ["standard", "extra-long"] },
    onReasoningEffort: (value) => changes.push(["effort", value]), onContextLength: (value) => changes.push(["context", value]),
  });
  try {
    await React.act(async () => {
      const select = document.querySelector('select[aria-label="Thinking effort"]');
      assert.ok(select); select.value = "high";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      const context = document.querySelector('select[aria-label="Context length"]');
      assert.ok(context); context.value = "extra-long";
      context.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.deepEqual(changes, [["effort", "high"], ["context", "extra-long"]]);
    assert.deepEqual(calls.savedBackends, []);
  } finally { await cleanup(); }
});

test("catalog loading is bounded and ignores results for a changed executable", async () => {
  let finish;
  const requests = [];
  const cleanup = await mount(bridge({ listCodexModelCatalog: async (config) => {
    requests.push(config.binary);
    if (requests.length === 1) return new Promise((resolve) => { finish = resolve; });
    return { models: [{ id: "new-model", label: "New", efforts: ["high"] }], effectiveModelId: "new-model" };
  } }));
  try {
    await click("Harnesses");
    const toggle = document.querySelector('.agent-backend-card[aria-label="Codex"] .agent-backend-card-toggle');
    await React.act(async () => toggle.click());
    await React.act(async () => toggle.click());
    await React.act(async () => toggle.click());
    assert.deepEqual(requests, ["codex"], "reopening does not spawn another pending process");
    const effortLabel = [...document.querySelectorAll("label")].find((node) => node.textContent === "Codex thinking effort");
    const effort = document.getElementById(effortLabel.htmlFor);
    assert.equal(effort.disabled, true);
    await input("Codex executable", "/other/codex");
    await React.act(async () => finish({ models: [{ id: "old-model", label: "Old", efforts: ["low"] }], effectiveModelId: "old-model" }));
    assert.deepEqual([...effort.options].map((option) => option.value), [""], "outdated results are ignored");
    await React.act(async () => effort.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true })));
    assert.deepEqual(requests, ["codex", "/other/codex"]);
    assert.deepEqual([...effort.options].map((option) => option.value), ["", "high"]);
  } finally { await cleanup(); }
});
