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
    DailyThumbnail: () => null, DailyPaperPreview: ({ paper, onClose }) => element("section", null, paper.title, element("button", { onClick: onClose }, "Close preview")),
    DAILY_RANGES: [{ id: "7d", label: "7 days" }], DAILY_TOPICS: [{ id: "all", label: "All" }],
    ConferenceDiscovery: () => null,
  };
  const icons = require("lucide-react");
  for (const name of ["Clock3", "Flame", "GraduationCap", "LoaderCircle", "RefreshCw", "Search", "Sparkle", "ArrowUp", "Plus", "Check", "Calendar", "ExternalLink", "Code2", "FileText"]) scope[name] = icons[name];
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
