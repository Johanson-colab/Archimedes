const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
function extract(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const end = source.slice(start + 1).search(/^  (?:async )?function /m);
  return source.slice(start, start + 1 + end);
}
async function harness(overrides = {}) {
  const calls = [], enabled = [];
  const scope = {
    hiddenCoreModules: new Set(["reproduce", "image-creation", "extensions", "data-charts", "daily"]),
    setCoreModuleEnabled: async (id) => { enabled.push(id); },
    setMainSection: (section) => calls.push(section),
    setAppEntryError: (error) => { scope.error = error; },
    setDailyStartMode: (mode) => { scope.dailyMode = mode; },
    setImageCreationOpened: (open) => { scope.figureOpen = open; },
    setDataChartsOpened: (open) => { scope.chartsOpen = open; },
    setDataAnalysisOpened() {}, setResearchMode() {},
    setExtensionsTab: (tab) => { scope.extensionsTab = tab; },
    setReproduceId: (id) => { scope.reproduceId = id; },
    t: (key) => key,
    ...overrides,
  };
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(["openResearchApp", "activateSidebarEntry", "openWelcomeWorkflow", "runProactiveSuggestion"].map(extract).join("\n"), "app-entry.tsx");
  const functions = new Function("scope", `with(scope) { ${code}; return { openResearchApp, activateSidebarEntry, openWelcomeWorkflow, runProactiveSuggestion }; }`)(scope);
  scope.openResearchApp = functions.openResearchApp;
  const evaluate = async (text) => {
    const { code } = await transformWithOxc(`const value = ${text};`, "app-entry-route.tsx", { jsx: { runtime: "classic" } });
    return new Function("scope", `with(scope) { ${code}; return value; }`)(scope);
  };
  return { ...functions, scope, calls, enabled, evaluate };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("home, proactive and sidebar routes enable their actual app before showing it", async () => {
  const h = await harness();
  h.openWelcomeWorkflow("replication"); await settle();
  assert.deepEqual(h.enabled, ["reproduce"]);
  assert.equal(h.calls.at(-1), "reproduce");
  h.openWelcomeWorkflow("figure"); await settle();
  assert.equal(h.enabled.at(-1), "image-creation");
  assert.equal(h.scope.figureOpen, true);
  await h.runProactiveSuggestion({ action: { kind: "open", target: "daily" } }); await settle();
  assert.equal(h.enabled.at(-1), "daily");
  assert.equal(h.scope.dailyMode, "latest");
  h.activateSidebarEntry({ destination: { section: "data-charts" } }); await settle();
  assert.equal(h.scope.chartsOpen, true);
  assert.equal(h.calls.at(-1), "data-charts");
});

test("palette extensions and a paper's reproduction callback retain their selected destination", async () => {
  const h = await harness();
  // Execute the actual palette action; its icon is irrelevant to the route.
  const command = source.split("\n").find((line) => line.includes('id: "extensions-available"')).trim().replace(/,\s*$/, "").replace(/icon: <Puzzle size=\{15\} \/>, /, "");
  (await h.evaluate(command)).run(); await settle();
  assert.equal(h.enabled.at(-1), "extensions");
  assert.equal(h.scope.extensionsTab, "available");
  assert.equal(h.calls.at(-1), "extensions");
  const callback = /onReproduceOpened=\{(\(id\) => \{[^}]+\})\}/.exec(source)[1];
  (await h.evaluate(callback))("selected-paper-run"); await settle();
  assert.equal(h.scope.reproduceId, "selected-paper-run");
  assert.equal(h.enabled.at(-1), "reproduce");
  assert.equal(h.calls.at(-1), "reproduce");
});

test("opening waits for persisted visibility, and a failed save keeps the current page reachable", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const h = await harness({ setCoreModuleEnabled: () => pending });
  const opening = h.openResearchApp("reproduce");
  assert.deepEqual(h.calls, []);
  release(); assert.equal(await opening, true);
  assert.deepEqual(h.calls, ["reproduce"]);
  h.scope.setCoreModuleEnabled = async () => { throw new Error("cannot save settings"); };
  assert.equal(await h.openResearchApp("extensions"), false);
  assert.deepEqual(h.calls, ["reproduce"]);
  assert.match(h.scope.error, /Try again.*cannot save settings/);
});
