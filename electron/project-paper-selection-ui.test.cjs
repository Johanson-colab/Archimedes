const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { JSDOM } = require("jsdom");
const store = require("./store.cjs");
const fixture = require("./test-support/selection-fixture.cjs");
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
  await load("project-paper-selection.ts", ["discoveryProvenance"]);
  await load("Tabs.tsx", ["Tabs", "Tab", "FilterGroup", "FilterButton"]);
  scope.conferenceCatalog = require("../shared/conferences.json");
  scope.ReactMarkdown = ({ children }) => React.createElement("span", null, children); scope.remarkMath = () => {}; scope.rehypeKatex = () => {};
  await load("ConferenceDiscovery.tsx", ["ConferenceDiscovery"]);
  await load("LibraryView.tsx", ["DailyDiscovery"], (text) => text.slice(text.indexOf("function DailyDiscovery("), text.indexOf("\nfunction DailyPaperPreview")) + text.slice(text.indexOf("\nfunction DeepSearchResults")));
  await load("ProjectPaperContext.tsx", ["ProjectPaperContext"]);
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
  const bridge = { listLibraries: async id => db.listLibraries(id), listLibraryPapers: async id => db.listPapers(id), createLibrary: async input => db.createLibrary(input), addLibraryPaper: async (...args) => db.addPaper(...args), getProjectPaperSelection: async (...args) => db.getProjectPaperSelection(...args), saveProjectPaperSelection: async (...args) => db.saveProjectPaperSelection(...args) };
  return { root, db, project, bridge, close() { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); } };
}test("daily collection saves the current query, project purpose and degraded-source provenance", async () => {
  window.localStorage.clear();
  const data = database("Discovery A");
  let feeds = 0, unmount;
  data.bridge.discoverDailyPapers = async (input) => { feeds++; return fixture.feed(input); };
  function Host({ dataRoot }) {
    const [libraries, setLibraries] = React.useState(data.db.listLibraries(data.project.id));
    return React.createElement(scope.DailyDiscovery, { storageKey: "unused-daily", projectId: data.project.id, bridge: data.bridge, libraries, loadingLibraries: false, onImported: async () => setLibraries(data.db.listLibraries(data.project.id)) });
  }
  try {
    unmount = await mount(Host, { dataRoot: data.root });
    await input(document.querySelector('.daily-search-input-row input'), "handoff evidence"); await click("Search");
    await input(document.querySelector('[aria-label="Project selection reason: Evidence handoff fixture"]'), "Baseline for project A"); await click("Save");
    const library = data.db.listLibraries(data.project.id)[0], paper = data.db.listPapers(library.id)[0];
    const selection = data.db.getProjectPaperSelection(paper.id, data.project.id);
    assert.equal(selection.reason, "Baseline for project A"); assert.equal(selection.discovery.query, "handoff evidence");
    assert.equal(selection.discovery.degraded, true); assert.deepEqual(selection.discovery.providers, ["local fixture"]);
    assert.equal(JSON.parse(selection.discovery.criteria).range, "7d");
  } finally { if (unmount) await unmount(); data.close(); }
});

test("project reasons remain separate while personal notes stay shared, including after reopening the database", async () => {
  const data = database("Selection A");
  let unmount;
  try {
    const projectB = data.db.createResearchProject({ name: "Selection B" });
    const first = data.db.createLibrary({ projectId: data.project.id, name: "A" }), second = data.db.createLibrary({ projectId: projectB.id, name: "B" });
    const paper = data.db.addPaper(first.id, fixture.paper, { reason: "A baseline", discovery: { query: "A query", providers: ["fixture"], degraded: true } });
    const same = data.db.addPaper(second.id, fixture.paper, { reason: "B limitation" }); assert.equal(same.id, paper.id);
    data.db.updatePaper(paper.id, { notes: "Personal reading notes", reading_status: "reading" });
    unmount = await mount(scope.ProjectPaperContext, { bridge: data.bridge, paperId: paper.id, projectId: projectB.id });
    assert.equal(document.querySelector("textarea").value, "B limitation");
    await input(document.querySelector("textarea"), "B changed purpose"); await click("Save selection reason"); await unmount(); unmount = null;
    assert.equal(data.db.getProjectPaperSelection(paper.id, data.project.id).reason, "A baseline");
    assert.equal(data.db.listPapers(first.id)[0].notes, "Personal reading notes"); assert.equal(data.db.listPapers(second.id)[0].reading_status, "reading");
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-selection-reopen-"));
    store.openWorkspace(idle); store.openWorkspace(data.root); fs.rmSync(idle, { recursive: true, force: true });
    const reopened = store;
    assert.equal(reopened.getProjectPaperSelection(paper.id, projectB.id).reason, "B changed purpose");
    assert.equal(reopened.getProjectPaperSelection(paper.id, data.project.id).discovery.query, "A query");
  } finally { if (unmount) await unmount(); data.close(); }
});


test("conference collection saves project purpose with the official discovery source", async () => {
  const data = database("Conference"); let unmount, calls = 0;
  const library = data.db.listLibraries(data.project.id)[0];
  const paper = { ...fixture.paper, conference: { id: "icml", year: 2026, presentation: "oral", decision: "Accepted", track: "Main", source_url: "https://example.invalid/catalog", presentation_source_url: "", retrieved_at: "2026-11-16" } };
  data.bridge.searchConferencePapers = async (options) => { calls++; return { papers: [paper], total: 1, catalog_total: 1, presentation_counts: { oral: 1, poster: 0, spotlight: 0, unknown: 0 }, options, sources: ["https://example.invalid/catalog"], status: "partial", warnings: ["Fixture partial catalog"], fetched_at: "2026-11-16", cached: false, stale: true, has_more: false }; };
  const props = { storageKey: "unused-conference", bridge: data.bridge, projectId: data.project.id, targetLibraryId: library.id, topic: "all", onImported: async () => {} };
  try {
    unmount = await mount(scope.ConferenceDiscovery, props);
    await input(document.querySelector('[aria-label="Search conference papers"]'), "conference evidence"); await click("Search");
    await input(document.querySelector('[aria-label="Project selection reason: Evidence handoff fixture"]'), "Official baseline"); await click("Save");
    const imported = data.db.listPapers(library.id)[0], selection = data.db.getProjectPaperSelection(imported.id, data.project.id);
    assert.equal(selection.reason, "Official baseline"); assert.equal(selection.discovery.query, "conference evidence");
    assert.equal(JSON.parse(selection.discovery.criteria).conference, "icml"); assert.equal(selection.discovery.degraded, true);
  } finally { if (unmount) await unmount(); data.close(); }
});

