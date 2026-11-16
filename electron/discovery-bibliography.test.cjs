const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { JSDOM } = require("jsdom");
const { DatabaseSync } = require("node:sqlite");
const { createHash } = require("node:crypto");
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
  await load("discovery-state.ts", ["discoveryPaperFields", "discoveryPaperKey", "discoveryStorageKey", "readDiscoverySnapshot", "writeDiscoverySnapshot", "discoveryProvenance"]);
  await load("bibliography.ts", ["parseBibliography", "exportBibliography", "matchBibliographyPaper", "metadataDifferences"]);
  await load("Tabs.tsx", ["Tabs", "Tab", "FilterGroup", "FilterButton"]);
  scope.conferenceCatalog = require("../shared/conferences.json");
  scope.ReactMarkdown = ({ children }) => React.createElement("span", null, children); scope.remarkMath = () => {}; scope.rehypeKatex = () => {};
  await load("ConferenceDiscovery.tsx", ["ConferenceDiscovery"]);
  await load("LibraryView.tsx", ["DailyDiscovery"], (text) => text.slice(text.indexOf("function DailyDiscovery("), text.indexOf("\nfunction DailyPaperPreview")) + text.slice(text.indexOf("\nfunction DeepSearchResults")));
  await load("ProjectPaperContext.tsx", ["ProjectPaperContext"]);
  await load("BibliographyDialog.tsx", ["BibliographyDialog"]);
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `archimedes-literature-${name}-`));
  const db = store.createWorkspaceStore(root);
  const project = db.createResearchProject({ name });
  const bridge = {
    listLibraries: async (id) => db.listLibraries(id), listLibraryProjects: async () => db.listLibraryProjects(),
    listLibraryPapers: async (id) => db.listPapers(id), createLibrary: async (data) => db.createLibrary(data),
    addLibraryPaper: async (...args) => db.addPaper(...args),
    getProjectPaperSelection: async (...args) => db.getProjectPaperSelection(...args),
    saveProjectPaperSelection: async (...args) => db.saveProjectPaperSelection(...args),
    setPaperBibliography: async (...args) => db.setPaperBibliography(...args),
    repairLibraryPaperMetadata: async (...args) => db.repairLibraryPaperMetadata(...args),
  };
  return { root, db, project, bridge, close() { db.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

function restoredDatabase(t) {
  const data = database("Restore and reimport"); let raw;
  t.after(() => { raw?.close(); data.close(); });
  const sourceLibrary = data.db.listLibraries(data.project.id)[0];
  const original = data.db.addPaper(sourceLibrary.id, fixture.paper, { reason: "Original project purpose" });
  data.db.updatePaper(original.id, { notes: "Original personal notes" });
  const pdf = Buffer.from("%PDF-1.4 restoration-interchange-fixture"), relative = `.archimedes/papers/${original.id}.pdf`;
  fs.mkdirSync(path.dirname(path.join(data.root, relative)), { recursive: true }); fs.writeFileSync(path.join(data.root, relative), pdf);
  data.db.replacePaperReaderAsset(original.id, { relative_path: relative, sha256: createHash("sha256").update(pdf).digest("hex"), size_bytes: pdf.length, page_count: 1, pages: [{ page_number: 1, text: "Indexed restored evidence" }] });
  const packages = path.join(data.root, "packages"), restored = path.join(data.root, "restored"); fs.mkdirSync(packages); fs.mkdirSync(restored);
  raw = new DatabaseSync(path.join(data.root, ".archimedes/archimedes.db"));
  const transfer = require("./project-transfer.cjs"), exported = transfer.exportProject(raw, data.project.id, { dataRoot: data.root, userId: "local-user", destinationParent: packages });
  const imported = transfer.importProject(raw, exported.path, { dataRoot: data.root, userId: "local-user", targetParent: restored });
  const library = data.db.listLibraries(imported.projectId)[0], paper = data.db.listPapers(library.id)[0];
  data.db.repairLibraryPaperMetadata(paper.id, { title: "Restored custom title" });
  data.db.updatePaper(paper.id, { notes: "Restored private notes", reading_status: "read" });
  data.db.setPaperBibliography(paper.id, { citekey: "restoredKey", entryType: "article" });
  data.db.saveProjectPaperSelection(paper.id, imported.projectId, { reason: "Restored project purpose" });
  return { ...data, imported, sourceLibrary, original, library, paper, pdf };
}

test("Daily collection after restoring a project reuses its local paper and preserves original/restored reading state", async t => {
  window.localStorage.clear();
  const data = restoredDatabase(t); let unmount;
  const target = data.db.createLibrary({ projectId: data.imported.projectId, name: "Another collection in restored project" });
  data.bridge.discoverDailyPapers = async options => fixture.feed(options);
  try {
    unmount = await mount(scope.DailyDiscovery, { storageKey: scope.discoveryStorageKey(data.root, data.imported.projectId), projectId: data.imported.projectId, bridge: data.bridge, libraries: [target], loadingLibraries: false, onImported: async () => {} });
    await input(document.querySelector('[aria-label="Project selection reason: Evidence handoff fixture"]'), "Chosen after restoring");
    await click("Save");
    const saved = data.db.listPapers(target.id);
    assert.equal(saved.length, 1); assert.equal(saved[0].id, data.paper.id);
    assert.equal(saved[0].title, "Restored custom title"); assert.equal(saved[0].notes, "Restored private notes");
    assert.equal(data.db.getProjectPaperSelection(data.paper.id, data.imported.projectId).reason, "Chosen after restoring");
    assert.equal(data.db.getProjectPaperSelection(data.original.id, data.project.id).reason, "Original project purpose");
    assert.equal(data.db.listPapers(data.sourceLibrary.id)[0].notes, "Original personal notes");
    const asset = data.db.getPaperReader(data.paper.id).asset;
    assert.ok(fs.readFileSync(path.join(data.root, asset.relative_path)).equals(data.pdf));
    assert.equal(data.db.getPaperReader(data.paper.id).pages[0].text, "Indexed restored evidence");
  } finally { if (unmount) await unmount(); }
});

test("restored BibTeX preview and explicit repair target the same local identity without changing the source project", async t => {
  const data = restoredDatabase(t); let unmount;
  try {
    unmount = await mount(scope.BibliographyDialog, { bridge: data.bridge, library: data.library, onClose() {}, onChanged: async () => {} });
    await input(document.querySelector('[aria-label="BibTeX source"]'), fixture.bibtex);
    let repair = [...document.querySelectorAll("label")].find(node => node.textContent.startsWith("Repair selected metadata: title:"));
    assert.ok(repair?.textContent.includes('"Restored custom title"'), "preview uses B's current metadata, not global A");
    await click("Import selected references");
    let saved = data.db.listPapers(data.library.id);
    assert.equal(saved.length, 1); assert.equal(saved[0].id, data.paper.id); assert.equal(saved[0].title, "Restored custom title");
    await input(document.querySelector('[aria-label="BibTeX source"]'), fixture.bibtex + "\n");
    repair = [...document.querySelectorAll("label")].find(node => node.textContent.startsWith("Repair selected metadata: title:"));
    await React.act(async () => { repair.querySelector("input").click(); await tick(); }); await click("Import selected references");
    saved = data.db.listPapers(data.library.id);
    assert.equal(saved.length, 1); assert.equal(saved[0].id, data.paper.id); assert.equal(saved[0].title, fixture.paper.title);
    assert.equal(saved[0].notes, "Restored private notes"); assert.equal(saved[0].citekey, "restoredKey"); assert.equal(saved[0].reading_status, "read");
    assert.equal(data.db.listPapers(data.sourceLibrary.id)[0].notes, "Original personal notes");
    assert.equal(data.db.getProjectPaperSelection(data.paper.id, data.imported.projectId).reason, "Restored project purpose");
    assert.equal(data.db.getProjectPaperSelection(data.original.id, data.project.id).reason, "Original project purpose");
    assert.ok(fs.readFileSync(path.join(data.root, data.db.getPaperReader(data.paper.id).asset.relative_path)).equals(data.pdf));
  } finally { if (unmount) await unmount(); }
});

test("a local title-only candidate cannot override a conflict-free global strong identifier", () => {
  const data = database("Strong before title");
  try {
    const other = data.db.createResearchProject({ name: "Global strong identity" }), source = data.db.listLibraries(other.id)[0], target = data.db.listLibraries(data.project.id)[0];
    const strong = data.db.addPaper(source.id, { title: "Global named paper", doi: "10.5555/strong-target", authors: [] });
    const weak = data.db.addPaper(target.id, { title: "Different local title", doi: "10.5555/temporary-local", authors: [] });
    data.db.repairLibraryPaperMetadata(weak.id, { title: strong.title, doi: "" });
    const incoming = { title: strong.title, doi: strong.doi, authors: [] };
    const known = [data.db.getPaper(weak.id), data.db.getPaper(strong.id)];
    assert.equal(scope.matchBibliographyPaper(incoming, known).id, strong.id);
    assert.equal(data.db.addPaper(target.id, incoming).id, strong.id);
  } finally { data.close(); }
});

test("discovery creates a library inline, saves provenance, and remounts without searching across data roots", async () => {
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
    await input(document.querySelector('[aria-label="Project selection reason: Evidence handoff fixture"]'), "Baseline for project A"); await click("Save");
    const library = data.db.listLibraries(data.project.id)[0], paper = data.db.listPapers(library.id)[0];
    const selection = data.db.getProjectPaperSelection(paper.id, data.project.id);
    assert.equal(selection.reason, "Baseline for project A"); assert.equal(selection.discovery.query, "handoff evidence");
    assert.equal(selection.discovery.degraded, true); assert.deepEqual(selection.discovery.providers, ["local fixture"]);
    assert.equal(JSON.parse(selection.discovery.criteria).range, "7d");
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
    data.db.close();
    const reopened = store.createWorkspaceStore(data.root);
    assert.equal(reopened.getProjectPaperSelection(paper.id, projectB.id).reason, "B changed purpose");
    assert.equal(reopened.getProjectPaperSelection(paper.id, data.project.id).discovery.query, "A query"); reopened.close();
  } finally { if (unmount) await unmount(); data.close(); }
});

test("BibTeX supports nested values, grouped authors, stable keys and explicit unsupported syntax", () => {
  const source = '@article{stable2026, title={{Nested} evidence & units}, author={{Research and Development} and Chen, Fei}, year=2026, doi={https://doi.org/10.5555/ROUNDTRIP}}';
  const parsed = scope.parseBibliography(source); assert.deepEqual(parsed.warnings, []); assert.equal(parsed.entries.length, 1);
  assert.deepEqual(parsed.entries[0].paper.authors, ["Research and Development", "Chen, Fei"]); assert.equal(parsed.entries[0].paper.doi, "10.5555/roundtrip");
  const paper = { ...parsed.entries[0].paper, id: "one", citekey: "stable2026", entry_type: "article" };
  const roundtrip = scope.parseBibliography(scope.exportBibliography([paper]));
  assert.deepEqual(roundtrip.entries[0], parsed.entries[0]);
  assert.equal(scope.parseBibliography('@article{bad,title=macro # {suffix}}').entries.length, 0);
  assert.ok(scope.parseBibliography('@article{bad,title={Unclosed}').warnings.length);
  assert.equal(scope.parseBibliography('% @article{ignored,title={Do not import}}\n' + source).entries.length, 1);
  assert.equal(scope.parseBibliography('@article{bad#key,title={Invalid key}}').entries.length, 0);
});

test("BibTeX preserves literal braces and backslashes across its own export while retaining grouped capitalization", () => {
  const paper = { ...fixture.paper, url: `https://doi.org/${fixture.paper.doi}`, id: "literal", citekey: "literal", entry_type: "article", title: "Sets {x, y} & C:\\data_2026", authors: ["Research {A} and Development"], venue: "100% evidence" };
  const exported = scope.exportBibliography([paper]);
  const parsed = scope.parseBibliography(exported);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.entries[0].paper.title, paper.title);
  assert.deepEqual(parsed.entries[0].paper.authors, paper.authors);
  assert.equal(parsed.entries[0].paper.venue, paper.venue);
  assert.deepEqual(scope.metadataDifferences(parsed.entries[0].paper, paper), {});
  assert.equal(scope.parseBibliography('@article{caps,title={{API} evidence}}').entries[0].paper.title, "API evidence");
});

test("BibTeX only identifies arXiv eprints and normalizes the same identifiers as the actual store", () => {
  const data = database("Identifier normalization");
  try {
    const hal = scope.parseBibliography('@article{hal,title={HAL evidence},archivePrefix={HAL},eprint={hal-04123456}}').entries[0].paper;
    assert.equal(hal.arxiv_id, ""); assert.equal(hal.url, ""); assert.equal(hal.external_id, "bibtex:hal");
    for (const value of ["arXiv: 2401.01234v2", "https://www.arxiv.org/pdf/2401.01234v2.pdf", "2401.01234v2", "hep-th/9901001v3"]) {
      const entry = scope.parseBibliography(`@article{arxiv,title={Same work},archivePrefix={arXiv},eprint={${value}}}`).entries[0];
      const library = data.db.listLibraries(data.project.id)[0];
      const existing = data.db.addPaper(library.id, { ...entry.paper, arxiv_id: value });
      assert.equal(entry.paper.arxiv_id, require("./library-records.cjs").identifier.arxiv_id(value));
      assert.equal(scope.matchBibliographyPaper(entry.paper, [existing]).id, existing.id);
      assert.equal(data.db.addPaper(library.id, entry.paper).id, existing.id, "the real store and preview must select the same paper");
    }
    assert.equal(scope.parseBibliography('@article{unspecified,title={Unknown archive},eprint={repository-123}}').entries[0].paper.arxiv_id, "");
  } finally { data.close(); }
});

test("citation keys are scoped to the target export, while paper identity still deduplicates across projects", async () => {
  const data = database("Citation A"); let unmount;
  try {
    const otherProject = data.db.createResearchProject({ name: "Citation B" });
    const libraryA = data.db.listLibraries(data.project.id)[0], libraryB = data.db.listLibraries(otherProject.id)[0];
    const first = data.db.addPaper(libraryA.id, { ...fixture.paper, doi: "10.5555/first", external_id: "doi:10.5555/first", title: "First unrelated paper" });
    data.db.setPaperBibliography(first.id, { citekey: "Smith2020", entryType: "article" });
    unmount = await mount(scope.BibliographyDialog, { bridge: data.bridge, library: libraryB, onClose() {}, onChanged: async () => {} });
    await input(document.querySelector('[aria-label="BibTeX source"]'), '@article{Smith2020,title={Second unrelated paper},doi={10.5555/second}}');
    assert.ok(!document.body.textContent.includes("Citation key conflict"), "another project's key cannot prevent this library's independent bibliography");
    await click("Import selected references");
    assert.equal(data.db.listPapers(libraryB.id).length, 1); assert.equal(data.db.listPapers(libraryB.id)[0].citekey, "Smith2020");
    await input(document.querySelector('[aria-label="BibTeX source"]'), '@article{Smith2020,title={Third unrelated paper},doi={10.5555/third}}');
    assert.ok(document.body.textContent.includes("Citation key conflict"), "an actual collision inside the target export stays blocked");
    await input(document.querySelector('[aria-label="BibTeX source"]'), '@article{OtherKey,title={First unrelated paper},doi={10.5555/first}}');
    assert.ok(document.body.textContent.includes("Existing paper")); await click("Import selected references");
    assert.equal(data.db.listPapers(libraryB.id).find((paper) => paper.doi === "10.5555/first").id, first.id);
  } finally { if (unmount) await unmount(); data.close(); }
});

test("real Library BibTeX preview preserves existing edits and notes; only selected metadata repair is applied", async () => {
  const data = database("Bibliography"); let unmount;
  try {
    const library = data.db.createLibrary({ projectId: data.project.id, name: "References" });
    const paper = data.db.addPaper(library.id, { ...fixture.paper, title: "User corrected title", pdf_url: "https://example.invalid/kept.pdf" });
    data.db.updatePaper(paper.id, { notes: "Keep personal notes", reading_status: "read" });
    data.db.setPaperBibliography(paper.id, { citekey: "userKey", entryType: "article" });
    unmount = await mount(scope.BibliographyDialog, { bridge: data.bridge, library, onClose() {}, onChanged: async () => {} });
    await input(document.querySelector('[aria-label="BibTeX source"]'), fixture.bibtex);
    assert.ok(document.body.textContent.includes("Existing paper with metadata differences"), document.body.textContent);
    await click("Import selected references");
    let current = data.db.listPapers(library.id); assert.equal(current.length, 1); assert.equal(current[0].title, "User corrected title");
    assert.equal(current[0].notes, "Keep personal notes"); assert.equal(current[0].pdf_url, "https://example.invalid/kept.pdf"); assert.equal(current[0].citekey, "userKey");
    await input(document.querySelector('[aria-label="BibTeX source"]'), fixture.bibtex + "\n");
    const titleRepair = [...document.querySelectorAll("label")].find((node) => node.textContent.startsWith("Repair selected metadata: title:"));
    assert.ok(titleRepair);
    await React.act(async () => { titleRepair.querySelector("input").click(); await tick(); });
    await click("Import selected references");
    current = data.db.listPapers(library.id); assert.equal(current.length, 1); assert.equal(current[0].title, fixture.paper.title);
    assert.equal(current[0].notes, "Keep personal notes"); assert.equal(current[0].citekey, "userKey"); assert.equal(current[0].reading_status, "read");
    await click("Preview BibTeX export"); assert.match(document.querySelector('[aria-label="BibTeX export preview"]').value, /@article\{userKey,/);
  } finally { if (unmount) await unmount(); data.close(); }
});

test("conference discovery restores the candidate page and saves official-source provenance without re-querying", async () => {
  const data = database("Conference"); let unmount, calls = 0;
  const library = data.db.listLibraries(data.project.id)[0];
  const paper = { ...fixture.paper, conference: { id: "icml", year: 2026, presentation: "oral", decision: "Accepted", track: "Main", source_url: "https://example.invalid/catalog", presentation_source_url: "", retrieved_at: "2026-11-16" } };
  data.bridge.searchConferencePapers = async (options) => { calls++; return { papers: [paper], total: 1, catalog_total: 1, presentation_counts: { oral: 1, poster: 0, spotlight: 0, unknown: 0 }, options, sources: ["https://example.invalid/catalog"], status: "partial", warnings: ["Fixture partial catalog"], fetched_at: "2026-11-16", cached: false, stale: true, has_more: false }; };
  const props = { storageKey: scope.discoveryStorageKey(data.root, data.project.id) + ":conference", bridge: data.bridge, projectId: data.project.id, targetLibraryId: library.id, topic: "all", onImported: async () => {} };
  try {
    unmount = await mount(scope.ConferenceDiscovery, props);
    await input(document.querySelector('[aria-label="Search conference papers"]'), "conference evidence"); await click("Search");
    await input(document.querySelector('[aria-label="Project selection reason: Evidence handoff fixture"]'), "Official baseline"); await click("Save");
    const imported = data.db.listPapers(library.id)[0], selection = data.db.getProjectPaperSelection(imported.id, data.project.id);
    assert.equal(selection.reason, "Official baseline"); assert.equal(selection.discovery.query, "conference evidence");
    assert.equal(JSON.parse(selection.discovery.criteria).conference, "icml"); assert.equal(selection.discovery.degraded, true);
    const before = calls; await unmount(); unmount = await mount(scope.ConferenceDiscovery, props);
    assert.equal(calls, before); assert.equal(document.querySelector('[aria-label="Search conference papers"]').value, "conference evidence");
    assert.ok(document.body.textContent.includes("Evidence handoff fixture"));
  } finally { if (unmount) await unmount(); data.close(); }
});

test("leaving a BibTeX import stops subsequent operations after an in-flight add returns", async () => {
  const data = database("Import scope"); let unmount;
  const library = data.db.listLibraries(data.project.id)[0];
  let release, additions = 0, bibliographyWrites = 0;
  data.bridge.addLibraryPaper = async (...args) => { additions++; await new Promise((resolve) => { release = resolve; }); return data.db.addPaper(...args); };
  data.bridge.setPaperBibliography = async () => { bibliographyWrites++; };
  try {
    unmount = await mount(scope.BibliographyDialog, { bridge: data.bridge, library, onClose() {}, onChanged: async () => {} });
    await input(document.querySelector('[aria-label="BibTeX source"]'), fixture.bibtex + '\n@article{second,title={Different candidate},year=2026}');
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent === "Import selected references");
    await React.act(async () => { button.click(); await tick(); }); assert.equal(additions, 1);
    await unmount(); unmount = null;
    await React.act(async () => { release(); await tick(); });
    assert.equal(additions, 1); assert.equal(bibliographyWrites, 0, "an unmounted owner must not start another IPC in the newly selected data root");
    assert.equal(data.db.listPapers(library.id).length, 1, "the already-issued add still completes in its original store");
  } finally { if (unmount) await unmount(); data.close(); }
});
