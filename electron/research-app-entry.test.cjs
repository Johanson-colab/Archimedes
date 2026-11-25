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
    hiddenCoreModules: new Set(["reproduce", "image-creation", "extensions", "data-charts", "daily", "writing"]),
    mainNavigationRef: { current: 0 },
    setCoreModuleEnabled: async (id) => { enabled.push(id); },
    updateMainSection: (section) => calls.push(section),
    setAppEntryError: (error) => { scope.error = error; },
    setDailyStartMode: (mode) => { scope.dailyMode = mode; },
    setDailyOpened: (open) => { scope.dailyOpen = open; },
    setLiteratureReviewOpened: (open) => { scope.literatureReviewOpen = open; },
    setImageCreationOpened: (open) => { scope.figureOpen = open; },
    setDataChartsOpened: (open) => { scope.chartsOpen = open; },
    setDataAnalysisOpened() {}, setResearchMode() {},
    setExtensionsTab: (tab) => { scope.extensionsTab = tab; },
    setReproduceId: (id) => { scope.reproduceId = id; },
    t: (key) => key,
    ...overrides,
  };
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(["setMainSection", "openResearchApp", "activateSidebarEntry", "openWelcomeWorkflow", "runProactiveSuggestion"].map(extract).join("\n"), "app-entry.tsx");
  const functions = new Function("scope", `with(scope) { ${code}; return { setMainSection, openResearchApp, activateSidebarEntry, openWelcomeWorkflow, runProactiveSuggestion }; }`)(scope);
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
  h.openWelcomeWorkflow("writing"); await settle();
  assert.deepEqual(h.enabled, ["writing"]);
  assert.equal(h.calls.at(-1), "writing");
  h.openWelcomeWorkflow("illustration"); await settle();
  assert.equal(h.enabled.at(-1), "image-creation");
  assert.equal(h.scope.figureOpen, true);
  h.openWelcomeWorkflow("literature"); await settle();
  assert.equal(h.enabled.at(-1), "daily");
  assert.equal(h.scope.dailyMode, "latest");
  assert.equal(h.scope.dailyOpen, true);
  await h.runProactiveSuggestion({ action: { kind: "open", target: "literature-review" } });
  assert.equal(h.scope.literatureReviewOpen, true);
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

test("the command palette opens chart references for the exact legacy name", async (t) => {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  t.after(async () => {
    await React.act(() => root.unmount());
    dom.window.close();
    delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  const h = await harness({ hiddenCoreModules: new Set(["data-charts"]) });
  const metadata = require("../shared/research-apps.json");
  const entries = [
    { id: "data-analysis", labelKey: "Data analysis" },
    { id: "data-charts", labelKey: "Paper chart references" },
  ];
  Object.assign(h.scope, {
    React,
    activateSidebarEntry: h.activateSidebarEntry,
    legacyResearchAppLabel: id => metadata.apps[id]?.legacyLabel,
    registeredSidebarEntries: entries.map(entry => ({ ...entry, commandId: "open-" + entry.id, destination: { section: entry.id }, icon: () => null })),
  });
  const mapping = /const moduleCommands: PaletteCommand\[\] = ([\s\S]*?);\n  const moduleButton/.exec(source)[1];
  const commands = await h.evaluate(mapping);
  const { transformWithOxc } = await import("vite");
  const paletteSource = fs.readFileSync(path.join(__dirname, "../src/CommandPalette.tsx"), "utf8")
    .replace(/^import .*;$/gm, "").replace("export default ", "");
  const { code } = await transformWithOxc(paletteSource, "CommandPalette.tsx", { jsx: { runtime: "classic" } });
  const Palette = new Function("React", "Dialog", "Search", "StateView", `const { useEffect, useMemo, useRef, useState } = React; ${code.replace(/^export \{\};?$/gm, "")}\nreturn CommandPalette;`)(
    React, ({ children }) => React.createElement("section", null, children), () => null, () => null,
  );

  for (const [query, destination] of [["Data charts", "data-charts"], ["Data analysis", "data-analysis"]]) {
    await React.act(() => root.render(React.createElement(Palette, { key: query, open: true, commands, onClose() {} })));
    const input = document.querySelector('[aria-label="Search commands"]');
    await React.act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, query);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(() => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(h.calls.at(-1), destination, query);
  }
  assert.deepEqual(h.enabled, ["data-charts"]);
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

test("a late visibility save does not override newer navigation", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = await harness({ setCoreModuleEnabled: () => pending });
  const older = h.openResearchApp("image-creation");
  assert.equal(await h.openResearchApp("library"), true);
  release();
  assert.equal(await older, false);
  assert.deepEqual(h.calls, ["library"]);
  assert.equal(h.scope.figureOpen, undefined);

  let reject;
  h.scope.setCoreModuleEnabled = () => new Promise((_resolve, fail) => { reject = fail; });
  const failing = h.openResearchApp("reproduce");
  h.setMainSection("chat");
  reject(new Error("late save failure"));
  assert.equal(await failing, false);
  assert.deepEqual(h.calls, ["library", "chat"]);
  assert.equal(h.scope.error, "");
});
