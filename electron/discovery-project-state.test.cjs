const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { JSDOM } = require("jsdom");
const fixture = require("./test-support/discovery-fixture.cjs");
let dom, React, createRoot;
const scope = {};

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  for (const key of ["window", "document", "HTMLElement", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react");
  ({ createRoot } = require("react-dom/client"));
  const icons = require("lucide-react");
  for (const name of ["ArrowUp", "BookOpen", "Calendar", "Check", "ChevronLeft", "ChevronRight", "Clock3", "Code2", "ExternalLink", "FileText", "Flame", "GraduationCap", "LoaderCircle", "Plus", "RefreshCw", "Search"]) scope[name] = icons[name];
  Object.assign(scope, { React, ...React, readableError: (error) => error.message, useUISettings: () => ({ t: (key) => key }),
    DailyThumbnail: () => null, DailyPaperPreview: () => null, InlineNotice: () => null, LoadingState: () => null, StateView: () => null,
    DAILY_RANGES: [{ id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }], DAILY_TOPICS: [{ id: "all", label: "All" }, { id: "coding_agents", label: "Coding agents" }],
    conferenceCatalog: require("../shared/conferences.json"), ReactMarkdown: ({ children }) => children, remarkMath: undefined, rehypeKatex: undefined,
    formatPaperDate: (value) => value, formatFeedTime: (value) => value,
  });
  const { transformWithOxc } = await import("vite");
  async function load(file, names, part = (source) => source) {
    const source = part(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"))
      .replace(/^import[^\n]*\n/gm, "").replace(/export (?:default )?(?=function)/g, "");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn { ${names} };`)(...Object.values(scope)));
  }
  await load("discovery-state.ts", "discoveryStorageKey, readDiscoveryControls, writeDiscoveryControls");
  await load("Tabs.tsx", "Tabs, Tab, FilterGroup, FilterButton");
  await load("ConferenceDiscovery.tsx", "ConferenceDiscovery");
  await load("LibraryView.tsx", "DailyDiscovery", (text) => text.slice(text.indexOf("function DailyDiscovery("), text.indexOf("\nfunction DailyPaperPreview")));
});

after(() => {
  dom.window.close();
  for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key];
});

function select(selector, value) {
  const node = document.querySelector(selector);
  assert.ok(node);
  return React.act(async () => { node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}

function enter(selector, value) {
  const node = document.querySelector(selector);
  assert.ok(node);
  return React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

function click(label, parent = document) {
  const node = [...parent.querySelectorAll("button")].find((button) => button.textContent.trim() === label || button.getAttribute("aria-label") === label);
  assert.ok(node, label);
  return React.act(async () => node.click());
}

test("daily controls restore per project and switching during Save preserves the original library", async () => {
  const root = createRoot(document.getElementById("root"));
  const caches = [], saves = [];
  let finishSave;
  const bridge = {
    getCachedDailyPapers: async (options) => { caches.push(options); return { ...fixture.feed(options), stale: false }; },
    discoverDailyPapers: async () => assert.fail("The existing desktop cache should satisfy this flow."),
    addLibraryPaper: (id, paper) => new Promise((resolve) => { finishSave = () => { saves.push([id, paper.title]); resolve(); }; }),
  };
  const render = (project) => {
    const key = scope.discoveryStorageKey("/data/root", project);
    const libraries = ["first", "second"].map((suffix) => ({ id: `${project}-${suffix}`, name: `${project} ${suffix}` }));
    return React.act(async () => root.render(React.createElement(scope.DailyDiscovery, { key, storageKey: key, bridge, libraries, loadingLibraries: false, onImported: async () => {} })));
  };
  const target = () => document.querySelector(".daily-save-target select").value;
  const query = () => document.querySelector(".daily-search-input-row input").value;
  try {
    await render("A");
    await click("30 days");
    await click("Coding agents");
    await select(".daily-save-target select", "A-second");
    await enter(".daily-search-input-row input", "evidence");
    await click("Search");
    await click("Save");
    await render("B");
    assert.equal(query(), "");
    await select(".daily-save-target select", "B-second");
    await React.act(async () => finishSave());
    assert.deepEqual(saves, [["A-second", fixture.paper.title]]);
    assert.equal(target(), "B-second");
    assert.ok(!document.querySelector(".daily-paper-row .imported"));
    await render("A");
    assert.equal(target(), "A-second");
    assert.equal(query(), "evidence");
    assert.deepEqual(caches.at(-1), { mode: "latest", range: "30d", topic: "coding_agents", query: "evidence", limit: 60 });
  } finally { await React.act(async () => root.unmount()); }
});

test("an explicit conference open is consumed before another project mounts discovery", async () => {
  const app = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
  assert.match(app, /key=\{`\$\{workspace\}:\$\{activeProjectId \|\| ""\}:\$\{dailyStartRequest\}`\}/);
  assert.match(app, /setDailyStartRequest\(\(value\) => value \+ 1\)/);
  assert.match(app, /if \(dailyStartMode !== "conference"\) return;\s*setDailyStartMode\("latest"\);/);

  const root = createRoot(document.getElementById("root"));
  const first = scope.discoveryStorageKey("/data/root", "explicit-open");
  const second = scope.discoveryStorageKey("/data/root", "another-project");
  const defaults = { mode: "latest", range: "7d", topic: "all", query: "", submittedQuery: "", targetLibraryId: "" };
  const bridge = {
    getCachedDailyPapers: async (options) => ({ ...fixture.feed(options), stale: false }),
    discoverDailyPapers: async (options) => fixture.feed(options),
    getCachedConferencePapers: async (options) => ({ ...fixture.feed(options), papers: [], catalog_total: 0, presentation_counts: { oral: 0, spotlight: 0, poster: 0, unknown: 0 }, sources: [], warnings: [], total: 0, status: "available", stale: false }),
    searchConferencePapers: async (options) => fixture.feed(options),
  };
  const render = (storageKey, request, initialMode) => React.act(async () => root.render(React.createElement(scope.DailyDiscovery, {
    key: `${storageKey}:${request}`, storageKey, bridge, libraries: [], loadingLibraries: true, initialMode, onImported: async () => {},
  })));
  try {
    await render(first, 1, "conference");
    assert.ok(document.querySelector('[aria-label="Conference year"]'));
    await render(first, 1, "latest");
    assert.ok(document.querySelector('[aria-label="Conference year"]'));
    assert.equal(scope.readDiscoveryControls(first, defaults).mode, "conference");
    await render(second, 1, "latest");
    assert.ok(document.querySelector(".daily-search-input-row"));
  } finally { await React.act(async () => root.unmount()); }
});

test("conference controls restore through the existing official catalog cache", async () => {
  const root = createRoot(document.getElementById("root"));
  const results = [];
  const bridge = {
    getCachedConferencePapers: async (options) => {
      results.push(options);
      return { ...fixture.feed(options), papers: [], catalog_total: 0, presentation_counts: { oral: 0, spotlight: 0, poster: 0, unknown: 0 }, sources: [], warnings: [], total: 0, status: "available", stale: false };
    },
    searchConferencePapers: async () => assert.fail("The existing catalog cache should satisfy this flow."),
  };
  const render = (project) => {
    const key = `${scope.discoveryStorageKey("/data/root", project)}:conference`;
    return React.act(async () => root.render(React.createElement(scope.ConferenceDiscovery, { key, storageKey: key, bridge, topic: "all", targetLibraryId: `${project}-first`, onImported: async () => {} })));
  };
  try {
    await render("A");
    await select('[aria-label="Conference year"]', "2024");
    const oral = [...document.querySelectorAll(".conference-presentation-tabs button")].find((button) => button.textContent.startsWith("Oral"));
    await React.act(async () => oral.click());
    await enter('[aria-label="Search conference papers"]', "retrieval");
    await click("Search");
    await render("B");
    assert.equal(document.querySelector('[aria-label="Search conference papers"]').value, "");
    await render("A");
    assert.equal(document.querySelector('[aria-label="Search conference papers"]').value, "retrieval");
    assert.deepEqual(results.at(-1), { conference: "icml", year: 2024, presentation: "oral", topic: "all", query: "retrieval", offset: 0, limit: 40 });
  } finally { await React.act(async () => root.unmount()); }
});
