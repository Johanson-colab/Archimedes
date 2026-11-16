const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { JSDOM } = require("jsdom");
const store = require("./store.cjs");
const fixture = require("./test-support/bibliography-fixture.cjs");
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
  await load("bibliography.ts", ["parseBibliography", "exportBibliography", "matchBibliographyPaper", "metadataDifferences", "citationKeyIdentity"]);
  await load("Tabs.tsx", ["Tabs", "Tab", "FilterGroup", "FilterButton"]);
  scope.conferenceCatalog = require("../shared/conferences.json");
  scope.ReactMarkdown = ({ children }) => React.createElement("span", null, children); scope.remarkMath = () => {}; scope.rehypeKatex = () => {};
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-bibliography-")), idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-bibliography-idle-"));
  store.openWorkspace(root); const db = store, project = db.createResearchProject({ name });
  const bridge = { listLibraries: async id => db.listLibraries(id), listLibraryProjects: async () => db.listLibraryProjects(), listLibraryPapers: async id => db.listPapers(id), addLibraryPaper: async (...args) => db.addPaper(...args), setPaperBibliography: async (...args) => db.setPaperBibliography(...args), repairLibraryPaperMetadata: async (...args) => db.repairLibraryPaperMetadata(...args) };
  return { root, db, project, bridge, close() { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); } };
}
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


test("BibTeX export retains explicit keys and disambiguates every generated key after normalization", () => {
  const exported = scope.exportBibliography([
    { ...fixture.paper, id: "paper-1", title: "Generated first", citekey: "", entry_type: "article" },
    { ...fixture.paper, id: "paper1", title: "Generated second", citekey: "", entry_type: "article" },
    { ...fixture.paper, id: "explicit", title: "Explicit target", citekey: "PAPER_PAPER1", entry_type: "article" },
  ]);
  const entries = scope.parseBibliography(exported).entries, keys = entries.map((entry) => entry.citekey);
  assert.equal(new Set(keys.map((key) => key.toLowerCase())).size, keys.length);
  assert.equal(entries.find((entry) => entry.paper.title === "Explicit target").citekey, "PAPER_PAPER1", "an existing citation key keeps its paper");
  assert.equal(entries.find((entry) => entry.paper.title === "Generated first").citekey, "paper_paper1_2");
  assert.equal(entries.find((entry) => entry.paper.title === "Generated second").citekey, "paper_paper1_3");
});


test("BibTeX export uses booktitle for proceedings and round-trips TeX character escapes", () => {
  const paper = { ...fixture.paper, id: "proceedings", citekey: "proceedings", entry_type: "inproceedings", title: "Costs $5 & 100% of #refs_name {x}", authors: ["A & B"], venue: "Proceedings #1" };
  const exported = scope.exportBibliography([paper]);
  assert.match(exported, /booktitle = \{Proceedings \\#1\}/);
  assert.doesNotMatch(exported, /journal =/);
  const parsed = scope.parseBibliography(exported);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.entries[0].entryType, "inproceedings");
  assert.equal(parsed.entries[0].paper.title, paper.title);
  assert.deepEqual(parsed.entries[0].paper.authors, paper.authors);
  assert.equal(parsed.entries[0].paper.venue, paper.venue);
});


test("BibTeX ignores commented-out entries with nested braces and tolerates whitespace after the opener", () => {
  const parsed = scope.parseBibliography('@comment{outer {nested} @article{ignored, title={Commented}}}\n@comment(@article{paren, title={A ) B}})\n@article { realKey,\n title = {Kept}\n}');
  assert.deepEqual(parsed.entries.map((entry) => entry.citekey), ["realKey"]);
  assert.equal(parsed.entries[0].paper.title, "Kept");
});


test("BibTeX preview rejects citation keys that collide only by case", async () => {
  const data = database("Key case"); let unmount;
  try {
    const library = data.db.listLibraries(data.project.id)[0];
    const existing = data.db.addPaper(library.id, { ...fixture.paper, title: "Existing target", doi: "10.5555/existing-key" });
    data.db.setPaperBibliography(existing.id, { citekey: "Smith2020", entryType: "article" });
    unmount = await mount(scope.BibliographyDialog, { bridge: data.bridge, library, onClose() {}, onChanged: async () => {} });
    await input(document.querySelector('[aria-label="BibTeX source"]'), '@article{smith2020,title={Different target},doi={10.5555/different}}');
    assert.ok(document.body.textContent.includes("Citation key conflict"), "target collection keys collide case-insensitively");
    await input(document.querySelector('[aria-label="BibTeX source"]'), '@article{Batch2020,title={First batch},doi={10.5555/batch-one}}\n@article{batch2020,title={Second batch},doi={10.5555/batch-two}}');
    assert.ok(document.body.textContent.includes("Citation key conflict"), "batch entries collide case-insensitively");
  } finally { if (unmount) await unmount(); data.close(); }
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
      assert.equal(entry.paper.arxiv_id, require("./bibliography-records.cjs").identifier.arxiv_id(value));
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
