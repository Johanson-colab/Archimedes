const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { JSDOM } = require("jsdom");
const store = require("./store.cjs");
const fixture = require("./test-support/discovery-fixture.cjs");
let dom, React, createRoot, scope;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const t = (key) => key;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  for (const key of ["window", "document", "HTMLElement", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const element = React.createElement;
  scope = {
    React, ...React, useUISettings: () => ({ t }),
    Dialog: ({ open, children }) => open ? element("section", { role: "dialog" }, children) : null,
    InlineNotice: ({ children }) => element("p", { role: "alert" }, children),
    StateView: ({ title, action }) => element("section", null, title, action),
    readableError: (error, fallback) => (error instanceof Error ? error.message : String(error || fallback)).replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback,
    DailyThumbnail: () => null, DailyPaperPreview: ({ paper, onClose }) => element("section", null, paper.title, element("button", { onClick: onClose }, "Close preview")),
    DAILY_RANGES: [{ id: "7d", label: "7 days" }], DAILY_TOPICS: [{ id: "all", label: "All" }, { id: "coding_agents", label: "Coding agents" }],
    ConferenceDiscovery: () => null,
  };
  const icons = require("lucide-react");
  for (const name of ["Clock3", "Flame", "GraduationCap", "LoaderCircle", "RefreshCw", "Search", "Sparkle", "ArrowUp", "Plus", "Check", "Calendar", "ExternalLink", "Code2", "FileText", "BookOpen", "ChevronLeft", "ChevronRight"]) scope[name] = icons[name];
  const { transformWithOxc } = await import("vite");
  async function load(file, names, part) {
    let source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
    if (part) source = part(source);
    source = source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/^import "[^"]+";\r?\n/gm, "").replace(/export default function/g, "function").replace(/export (function|const)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const result = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, result);
  }
  await load("discovery-state.ts", ["discoveryPaperFields", "discoveryPaperKey", "discoveryStorageKey", "readDiscoverySnapshot", "writeDiscoverySnapshot"]);
  await load("Tabs.tsx", ["Tabs", "Tab", "FilterGroup", "FilterButton"]);
  scope.conferenceCatalog = require("../shared/conferences.json");
  scope.ReactMarkdown = ({ children }) => React.createElement("span", null, children); scope.remarkMath = () => {}; scope.rehypeKatex = () => {};
  await load("ConferenceDiscovery.tsx", ["ConferenceDiscovery"]);
  await load("LibraryView.tsx", ["DailyDiscovery"], (text) => text.slice(text.indexOf("function DailyDiscovery("), text.indexOf("\nfunction DailyPaperPreview")) + text.slice(text.indexOf("\nfunction DeepSearchResults")));
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key]; });

async function mount(Component, props) {
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => { root.render(React.createElement(Component, props)); await tick(); await tick(); });
  return () => React.act(async () => { root.unmount(); });
}
async function click(label) {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === label || node.getAttribute("aria-label") === label);
  assert.ok(button, `Missing ${label}`); assert.equal(button.disabled, false, `${label} is disabled`);
  await React.act(async () => { button.click(); await tick(); await tick(); });
}
async function input(node, value) {
  assert.ok(node);
  const prototype = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); await tick();
  });
}
async function choose(node, value) {
  assert.ok(node);
  await React.act(async () => {
    node.value = value;
    node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await tick();
  });
}
function conferencePaper(title, year = 2026) {
  return { ...fixture.paper, title, conference: { id: "icml", year, presentation: "oral", decision: "Accepted", track: "Main", source_url: "https://example.invalid/catalog", presentation_source_url: "", retrieved_at: "2026-11-16" } };
}
function conferenceResponse(options, papers = []) {
  return { papers, total: papers.length, catalog_total: papers.length, presentation_counts: { oral: 0, poster: 0, spotlight: 0, unknown: 0 }, options, sources: ["https://example.invalid/catalog"], status: "available", warnings: [], fetched_at: "2026-11-16", cached: false, stale: false, has_more: false };
}
function database(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-discovery-")), idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-discovery-idle-"));
  store.openWorkspace(root);
  const db = store, project = db.createResearchProject({ name });
  const bridge = { listLibraries: async id => db.listLibraries(id), listLibraryPapers: async id => db.listPapers(id), createLibrary: async input => db.createLibrary(input), addLibraryPaper: async (...args) => db.addPaper(...args) };
  return { root, db, project, bridge, close() { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); } };
}
test("discovery creates a library inline, saves a paper, and remounts without searching across data roots", async () => {
  window.localStorage.clear();
  const data = database("Discovery A");
  let feeds = 0, unmount;
  data.bridge.discoverDailyPapers = async (input) => { feeds++; return fixture.feed(input); };
  function Host({ dataRoot }) {
    const [libraries, setLibraries] = React.useState(data.db.listLibraries(data.project.id));
    return React.createElement(scope.DailyDiscovery, { storageKey: scope.discoveryStorageKey(dataRoot, data.project.id), projectId: data.project.id, bridge: data.bridge, libraries, loadingLibraries: false, onImported: async () => setLibraries(data.db.listLibraries(data.project.id)) });
  }
  try {
    unmount = await mount(Host, { dataRoot: data.root });
    await input(document.querySelector('.daily-search-input-row input'), "handoff evidence"); await click("Search");
    assert.equal(document.querySelector('[aria-label="New discovery library"]'), null);
    await click("New library");
    await input(document.querySelector('[aria-label="New discovery library"]'), "Selected evidence"); await click("Create library here");
    assert.equal(document.querySelector('[aria-label="New discovery library"]'), null, "the creation control collapses after success");
    await click("Save");
    const library = data.db.listLibraries(data.project.id)[0];
    assert.equal(data.db.listPapers(library.id).length, 1);
    const before = feeds; await unmount();
    unmount = await mount(Host, { dataRoot: data.root });
    assert.equal(feeds, before, "restoring a snapshot must not trigger a new query");
    assert.equal(document.querySelector('.daily-search-input-row input').value, "handoff evidence");
    assert.ok(document.body.textContent.includes("Evidence handoff fixture"));
    assert.equal(document.querySelector('.daily-save-target select').value, library.id);
    assert.ok([...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Saved"));
    await unmount(); unmount = await mount(Host, { dataRoot: `${data.root}-other-store` });
    assert.equal(document.querySelector('.daily-search-input-row input').value, "");
    assert.equal(feeds, before + 1, "a different dataRoot has its own discovery state");
  } finally { if (unmount) await unmount(); data.close(); }
});


test("conference discovery restores the candidate page without re-querying", async () => {
  const data = database("Conference"); let unmount, calls = 0;
  const library = data.db.listLibraries(data.project.id)[0];
  const paper = { ...fixture.paper, conference: { id: "icml", year: 2026, presentation: "oral", decision: "Accepted", track: "Main", source_url: "https://example.invalid/catalog", presentation_source_url: "", retrieved_at: "2026-11-16" } };
  data.bridge.searchConferencePapers = async (options) => { calls++; return { papers: [paper], total: 1, catalog_total: 1, presentation_counts: { oral: 1, poster: 0, spotlight: 0, unknown: 0 }, options, sources: ["https://example.invalid/catalog"], status: "partial", warnings: ["Fixture partial catalog"], fetched_at: "2026-11-16", cached: false, stale: true, has_more: false }; };
  const props = { storageKey: scope.discoveryStorageKey(data.root, data.project.id) + ":conference", bridge: data.bridge, projectId: data.project.id, targetLibraryId: library.id, topic: "all", onImported: async () => {} };
  try {
    unmount = await mount(scope.ConferenceDiscovery, props);
    await input(document.querySelector('[aria-label="Search conference papers"]'), "conference evidence"); await click("Search");
    await click("Save");
    assert.equal(data.db.listPapers(library.id).length, 1);
    const before = calls; await unmount(); unmount = await mount(scope.ConferenceDiscovery, props);
    assert.equal(calls, before); assert.equal(document.querySelector('[aria-label="Search conference papers"]').value, "conference evidence");
    assert.ok(document.body.textContent.includes("Evidence handoff fixture"));
  } finally { if (unmount) await unmount(); data.close(); }
});


test("a delayed save into library A does not mark an unsaved candidate in newly selected library B as saved", async () => {
  window.localStorage.clear();
  const data = database("Pending target"), first = data.db.listLibraries(data.project.id)[0], second = data.db.createLibrary({ projectId: data.project.id, name: "Other destination" });
  let release, unmount;
  data.bridge.discoverDailyPapers = async options => fixture.feed(options);
  data.bridge.addLibraryPaper = (libraryId, paper) => new Promise(resolve => { release = () => resolve(data.db.addPaper(libraryId, paper)); });
  try {
    unmount = await mount(scope.DailyDiscovery, { storageKey: scope.discoveryStorageKey(data.root, data.project.id), projectId: data.project.id, bridge: data.bridge, libraries: [first, second], loadingLibraries: false, onImported: async () => {} });
    await click("Save");
    const target = document.querySelector('.daily-save-target select');
    await React.act(async () => { target.value = second.id; target.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await tick(); });
    await React.act(async () => { release(); await tick(); await tick(); });
    assert.equal(data.db.listPapers(first.id).length, 1); assert.equal(data.db.listPapers(second.id).length, 0);
    assert.ok([...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Save" && !button.disabled), "B's candidate stays available to save");
    assert.ok(![...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Saved"));
  } finally { if (unmount) await unmount(); data.close(); }
});

test("switching back to a cached conference key clears loading and restores that response", async () => {
  window.localStorage.clear();
  const data = database("Conference cache"), library = data.db.listLibraries(data.project.id)[0];
  let releaseIclr, unmount;
  data.bridge.searchConferencePapers = (options) => {
    if (options.conference === "iclr") return new Promise((resolve) => { releaseIclr = () => resolve(conferenceResponse(options, [conferencePaper("ICLR delayed fixture")])); });
    return Promise.resolve(conferenceResponse(options, [conferencePaper("ICML cached fixture")]));
  };
  try {
    unmount = await mount(scope.ConferenceDiscovery, { storageKey: scope.discoveryStorageKey(data.root, data.project.id) + ":conference", bridge: data.bridge, projectId: data.project.id, targetLibraryId: library.id, topic: "all", onImported: async () => {} });
    assert.ok(document.body.textContent.includes("ICML cached fixture"));
    await choose(document.querySelector('[aria-label="Conference"]'), "iclr");
    assert.ok(document.body.textContent.includes("Loading the official ICLR 2026 catalog"), "the new key is loading");
    await choose(document.querySelector('[aria-label="Conference"]'), "icml");
    assert.ok(!document.body.textContent.includes("Loading the official"), "switching back clears loading");
    assert.ok(document.body.textContent.includes("ICML cached fixture"), "the cached response is restored");
    assert.ok(!document.body.textContent.includes("ICLR delayed fixture"));
    await React.act(async () => { releaseIclr(); await tick(); await tick(); });
    assert.ok(document.body.textContent.includes("ICML cached fixture"));
    assert.ok(!document.body.textContent.includes("ICLR delayed fixture"), "the abandoned request cannot replace the current response");
  } finally { if (unmount) await unmount(); data.close(); }
});

test("a failed conference query hides the previous response and retry loads the new filters", async () => {
  window.localStorage.clear();
  const data = database("Conference retry"), library = data.db.listLibraries(data.project.id)[0];
  let fail2025 = true, unmount;
  data.bridge.searchConferencePapers = async (options) => {
    if (options.year === 2025 && fail2025) throw new Error("Fixture catalog offline");
    return conferenceResponse(options, [conferencePaper(options.year === 2025 ? "ICML 2025 fixture" : "ICML 2026 fixture", options.year)]);
  };
  try {
    unmount = await mount(scope.ConferenceDiscovery, { storageKey: scope.discoveryStorageKey(data.root, data.project.id) + ":conference", bridge: data.bridge, projectId: data.project.id, targetLibraryId: library.id, topic: "all", onImported: async () => {} });
    assert.ok(document.body.textContent.includes("ICML 2026 fixture"));
    await choose(document.querySelector('[aria-label="Conference year"]'), "2025");
    assert.ok(!document.body.textContent.includes("ICML 2026 fixture"), "the old response is hidden under the new filters");
    assert.ok(document.body.textContent.includes("Fixture catalog offline"));
    fail2025 = false;
    await click("Retry");
    assert.ok(document.body.textContent.includes("ICML 2025 fixture"));
    assert.ok(!document.body.textContent.includes("Fixture catalog offline"));
  } finally { if (unmount) await unmount(); data.close(); }
});

test("a failed daily query does not show results from the previous topic", async () => {
  window.localStorage.clear();
  const data = database("Daily failure"), library = data.db.listLibraries(data.project.id)[0];
  let failTopic = true, unmount;
  data.bridge.discoverDailyPapers = async (options) => {
    if (options.topic === "coding_agents" && failTopic) throw new Error("Fixture feed offline");
    return { ...fixture.feed(options), papers: [{ ...fixture.paper, title: options.topic === "coding_agents" ? "Daily current fixture" : "Daily previous fixture" }] };
  };
  try {
    unmount = await mount(scope.DailyDiscovery, { storageKey: scope.discoveryStorageKey(data.root, data.project.id), projectId: data.project.id, bridge: data.bridge, libraries: [library], loadingLibraries: false, onImported: async () => {} });
    assert.ok(document.body.textContent.includes("Daily previous fixture"));
    await click("Coding agents");
    assert.ok(!document.body.textContent.includes("Daily previous fixture"), "old results are hidden under the new topic");
    assert.ok(document.body.textContent.includes("Could not load the live feed"));
    assert.ok(document.body.textContent.includes("Fixture feed offline"));
    assert.ok(!document.body.textContent.includes("Showing the previous results."), "the fallback is not claimed when it no longer matches");
    failTopic = false;
    await click("Retry");
    assert.ok(document.body.textContent.includes("Daily current fixture"));
    assert.ok(!document.body.textContent.includes("Fixture feed offline"));
    failTopic = true;
    await click("Refresh");
    assert.ok(document.body.textContent.includes("Daily current fixture"), "matching results remain visible on a failed refresh");
    assert.ok(document.body.textContent.includes("Showing the previous results."), "the fallback is labeled when results still match the controls");
  } finally { if (unmount) await unmount(); data.close(); }
});

test("an explicit conference open beats saved daily mode without breaking normal restore", async () => {
  window.localStorage.clear();
  const data = database("Explicit conference"), library = data.db.listLibraries(data.project.id)[0];
  const storageKey = scope.discoveryStorageKey(data.root, data.project.id);
  const saved = JSON.stringify({ mode: "trending", range: "7d", topic: "all", searchKind: "quick", query: "", submittedQuery: "", targetLibraryId: library.id, response: fixture.feed({ mode: "trending" }), deepResponse: null });
  let feeds = 0, unmount;
  data.bridge.discoverDailyPapers = async (options) => { feeds += 1; return fixture.feed(options); };
  data.bridge.searchConferencePapers = async (options) => conferenceResponse(options);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(saved), searchKind: "deep", query: "saved search", submittedQuery: "saved search" }));
    unmount = await mount(scope.DailyDiscovery, { storageKey, projectId: data.project.id, initialMode: "conference", bridge: data.bridge, libraries: [library], loadingLibraries: false, onImported: async () => {} });
    assert.equal(document.querySelector('.conference-mode-button').getAttribute('aria-pressed'), "true", "an explicit conference open wins over the saved mode");
    assert.ok(document.querySelector('[aria-label="Conference"]'), "the conference catalog is mounted");
    await click("Latest");
    assert.ok(document.querySelector('.daily-mode-tabs [aria-selected="true"]').textContent.includes("Latest"));
    assert.equal(feeds, 1, "leaving conference opens a live feed without carrying over the old search lock");
    await unmount(); unmount = null;
    window.localStorage.setItem(storageKey, saved);
    unmount = await mount(scope.DailyDiscovery, { storageKey, projectId: data.project.id, bridge: data.bridge, libraries: [library], loadingLibraries: false, onImported: async () => {} });
    assert.equal(document.querySelector('.conference-mode-button').getAttribute('aria-pressed'), "false", "a normal restore keeps the saved daily mode");
    assert.ok(document.querySelector('.daily-mode-tabs [aria-selected="true"]').textContent.includes("Trending"));
    assert.ok(document.body.textContent.includes("Evidence handoff fixture"));
    assert.equal(feeds, 1, "restoring the matching snapshot does not re-query");
  } finally { if (unmount) await unmount(); data.close(); }
});

test("conference controls survive an uncached exit and pagination resets when the topic changes", async () => {
  const storageKey = "conference-uncached";
  const requests = [];
  const bridge = {
    searchConferencePapers: async (options) => {
      requests.push(options);
      return conferenceResponse(options, [conferencePaper("Restored selection", options.year)]);
    },
  };
  function saveControls() {
    window.localStorage.setItem(storageKey, JSON.stringify({
      conference: "iclr", year: 2025, presentation: "oral", topic: "all",
      query: "restored query", submittedQuery: "restored query", offset: 40, response: null,
    }));
  }
  const props = { storageKey, bridge, targetLibraryId: "", topic: "all", onImported: async () => {} };
  saveControls();
  let unmount = await mount(scope.ConferenceDiscovery, props);
  try {
    assert.deepEqual(requests.map(({ conference, year, presentation, query, offset }) => ({ conference, year, presentation, query, offset })), [
      { conference: "iclr", year: 2025, presentation: "oral", query: "restored query", offset: 40 },
    ]);
    await unmount();
    saveControls();
    unmount = await mount(scope.ConferenceDiscovery, { ...props, topic: "coding_agents" });
    assert.equal(requests.at(-1).offset, 0);
    assert.equal(requests.at(-1).topic, "coding_agents");
    assert.equal(document.querySelector('[aria-label="Search conference papers"]').value, "restored query");
  } finally { await unmount(); }
});

test("conference shows the create-library error and repeated Enter starts one request", async () => {
  let rejectCreation, attempts = 0;
  const bridge = {
    searchConferencePapers: async (options) => conferenceResponse(options),
    createLibrary: () => { attempts += 1; return new Promise((resolve, reject) => { rejectCreation = reject; }); },
  };
  const unmount = await mount(scope.DailyDiscovery, { storageKey: "conference-create-library", initialMode: "conference", bridge, libraries: [], loadingLibraries: false, onImported: async () => {} });
  try {
    await click("New library");
    const name = document.querySelector('[aria-label="New discovery library"]');
    await input(name, "New collection");
    await React.act(async () => {
      name.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      name.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    assert.equal(attempts, 1);
    await React.act(async () => { rejectCreation(new Error("Name is too long")); });
    assert.equal(document.querySelector('[role="alert"]').textContent, "Name is too long");
  } finally { await unmount(); }
});

test("the arXiv match remains saved when a different feed omits the DOI", () => {
  const latest = { ...fixture.paper, doi: "10.5555/example", arxiv_id: "2611.12345v2" };
  const trending = { ...latest, doi: "", arxiv_id: "2611.12345" };
  assert.equal(scope.discoveryPaperKey(latest), scope.discoveryPaperKey(trending));
});
