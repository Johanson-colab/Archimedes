const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, Workspace, Notes, helpers;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  for (const key of ["window", "document", "HTMLElement", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const element = (tag, props, children) => React.createElement(tag, props, children);
  const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? name);
  const scope = {
    React, ...React, useUISettings: () => ({ t }), useConfirm: () => async () => true,
    Dialog: ({ open, children }) => open ? element("section", { role: "dialog" }, children) : null,
    InlineNotice: ({ children }) => element("p", { role: "alert" }, children),
    MenuSurface: ({ open, children }) => open ? element("div", { role: "menu" }, children) : null,
    MenuItem: ({ children, onClick }) => element("button", { onClick }, children),
    StateView: ({ title, description, action }) => element("section", null, [element("p", { key: "t" }, title), element("p", { key: "d" }, description), element("div", { key: "a" }, action)]),
  };
  for (const icon of ["BookOpen", "ChevronDown", "ChevronRight", "Cloud", "ExternalLink", "FilePenLine", "FileText", "Folder", "FolderOpen", "FolderPlus", "Library", "ListFilter", "LoaderCircle", "MoreHorizontal", "PanelLeftClose", "PanelLeftOpen", "Pencil", "Plus", "Save", "Search", "Star", "Trash2", "X"]) scope[icon] = require("lucide-react")[icon];
  async function load(file, names) {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8")
      .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
      .replace(/^import "[^"]+";\r?\n/gm, "")
      .replace(/export default function/g, "function").replace(/export (function|const)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const result = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, result); return result;
  }
  helpers = await load("library-workspace-state.ts", ["libraryDocumentKey", "matchLibraryPaper", "sortLibraryPapers", "uniqueLibraryPapers", "createLibraryRequestQueue"]);
  ({ LibraryPaperNotes: Notes } = await load("LibraryPaperNotes.tsx", ["LibraryPaperNotes"]));
  ({ LibraryWorkspace: Workspace } = await load("LibraryWorkspace.tsx", ["LibraryWorkspace"]));
});
after(() => {
  dom.window.close();
  for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key];
});

function fixture(count = 3) {
  const paper = (id, title = id) => ({ id, title, authors: ["Author"], abstract: "Evidence", tags: [], venue: "ICLR", year: 2025, created_at: "2025-01-01", reading_status: "unread", starred: false, notes: "", url: "" });
  const libraries = Array.from({ length: count }, (_, i) => ({ id: `lib${i}`, name: `Folder ${i}`, description: "Research", paper_count: 1 }));
  const catalog = Object.fromEntries(libraries.map((lib, i) => [lib.id, [paper(`paper${i}`, `Paper ${i}`)]]));
  const calls = [];
  const bridge = {
    listLibraries: async () => libraries.map((lib) => ({ ...lib })),
    listLibraryPapers: async (id) => { calls.push(["list", id]); return catalog[id].map((p) => ({ ...p })); },
    updateLibraryPaper: async (id, patch) => { calls.push(["update", id, patch]); let updated; for (const papers of Object.values(catalog)) for (const p of papers) if (p.id === id) { Object.assign(p, patch); updated = { ...p }; } return updated; },
    removeLibraryPaper: async (lib, id) => { calls.push(["remove", lib, id]); catalog[lib] = catalog[lib].filter((p) => p.id !== id); },
    syncProjectLibraries: async (id) => { calls.push(["sync", id]); return { libraries, warnings: [] }; },
    syncProjectAnnotations: async (id) => { calls.push(["annotations", id]); return { warnings: [] }; },
  };
  return { paper, libraries, catalog, calls, bridge };
}
async function mount(bridge, overrides = {}) {
  const root = createRoot(document.getElementById("root"));
  const props = {
    bridge, projectId: "project1", active: true, refreshVersion: 0,
    renderReader: ({ paper, onActivityChange }) => React.createElement("div", { "data-reader": paper.id }, [React.createElement("button", { key: "start", onClick: () => onActivityChange(true) }, "Start task"), React.createElement("button", { key: "stop", onClick: () => onActivityChange(false) }, "Stop task")]),
    renderInspector: ({ paper, onUpdate, onRemove }) => React.createElement("aside", { "data-inspector": paper.id }, [React.createElement("button", { key: "star", onClick: () => onUpdate({ starred: !paper.starred }) }, "Toggle star"), React.createElement("button", { key: "remove", onClick: onRemove }, "Remove membership")]),
    renderEditor: () => null, renderImport: () => null, ...overrides,
  };
  const render = async (next = {}) => { Object.assign(props, next); await React.act(async () => { root.render(React.createElement(Workspace, props)); await tick(); }); };
  await render();
  return { root, render, unmount: async () => React.act(async () => root.unmount()) };
}
async function click(selector, label) {
  const node = label ? [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === label) : document.querySelector(selector);
  assert.ok(node, `Missing ${selector} ${label || ""}`);
  await React.act(async () => { node.click(); await tick(); });
}
async function input(node, text) {
  await React.act(async () => {
    const prototype = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, text);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

test("opening a project hydrates only the first folder; project-wide browsing deduplicates shared papers", async () => {
  const data = fixture(); data.catalog.lib1.push({ ...data.catalog.lib0[0] });
  const ui = await mount(data.bridge);
  assert.deepEqual(data.calls, [["list", "lib0"]]);
  await click(".library-tree-row", "All papers3");
  assert.equal(data.calls.filter(([kind]) => kind === "list").length, 3);
  assert.equal(document.querySelectorAll(".library-workspace-paper-row").length, 3);
  await ui.unmount();
});

test("document switching mounts one reader and protects a running paper conversation", async () => {
  const data = fixture(); const ui = await mount(data.bridge);
  await click(".library-tree-paper");
  assert.equal(document.querySelector("[data-reader]").dataset.reader, "paper0");
  await click("button", "Start task");
  await click(".library-tree-row", "All papers3");
  assert.equal(document.querySelector("[data-reader]").dataset.reader, "paper0");
  assert.match(document.querySelector('[role="alert"]').textContent, /Stop the running paper conversation/);
  await click("button", "Stop task");
  await click(".library-tree-row", "All papers3");
  await click(".library-paper-row-actions button");
  assert.equal(document.querySelectorAll("[data-reader]").length, 1);
  assert.equal(document.querySelectorAll(".library-document-tabs [role=tab]").length, 1);
  await ui.unmount();
});

test("more than eight papers remain open and keep their reading positions", async () => {
  const data = fixture(1);
  data.catalog.lib0 = Array.from({ length: 10 }, (_, i) => data.paper(`paper${i}`, `Paper ${i}`));
  data.libraries[0].paper_count = 10;
  function Reader({ paper, session, onSessionSave }) {
    const [page, setPage] = React.useState(session?.pageNumber || 1);
    const pageRef = React.useRef(page);
    pageRef.current = page;
    React.useEffect(() => () => onSessionSave({ pageNumber: pageRef.current, pdfZoom: 1, readerView: "paper", chatOpen: false, readerChromeOpen: true, sideTab: "chat" }), []);
    return React.createElement("div", { "data-reader": paper.id, "data-page": page }, React.createElement("button", { onClick: () => setPage(7) }, "Page seven"));
  }
  const ui = await mount(data.bridge, { renderReader: (props) => React.createElement(Reader, props) });
  await click(".library-tree-paper", "Paper 0");
  await click("button", "Page seven");
  for (let i = 1; i < 10; i++) await click(".library-tree-paper", `Paper ${i}`);
  assert.equal(document.querySelectorAll(".library-document-tabs [role=tab]").length, 10);
  assert.equal(document.querySelectorAll("[data-reader]").length, 1);
  assert.equal(document.querySelector(".library-workspace-notices"), null);
  await click('.library-document-tabs [role="tab"]', "Paper 0");
  assert.equal(document.querySelector("[data-reader]").dataset.page, "7");
  await click('.library-document-close[aria-label="Close Paper 0"]');
  await click(".library-tree-paper", "Paper 0");
  assert.equal(document.querySelector("[data-reader]").dataset.page, "1");
  await ui.unmount();
});

test("removing a paper removes only that folder membership; sync still includes annotations", async () => {
  const data = fixture(2); data.catalog.lib1 = [{ ...data.catalog.lib0[0] }];
  const ui = await mount(data.bridge);
  await click(".library-folder-card"); await click("button", "Remove membership");
  assert.equal(data.catalog.lib0.length, 0); assert.equal(data.catalog.lib1.length, 1);
  assert.deepEqual(data.calls.find(([kind]) => kind === "remove"), ["remove", "lib0", "paper0"]);
  await click('button[aria-label="Sync cloud"]');
  assert.ok(data.calls.some(([kind, id]) => kind === "sync" && id === "project1"));
  assert.ok(data.calls.some(([kind, id]) => kind === "annotations" && id === "project1"));
  await ui.unmount();
});

test("a late folder refresh cannot overwrite a completed paper-state update", async () => {
  const data = fixture(1); const ui = await mount(data.bridge);
  await click(".library-folder-card");
  let finish;
  const stale = { ...data.catalog.lib0[0] };
  data.bridge.listLibraryPapers = () => new Promise((resolve) => { finish = resolve; });
  await ui.render({ refreshVersion: 1 });
  await click("button", "Toggle star");
  await React.act(async () => finish([stale]));
  assert.ok(document.querySelector(".library-paper-row-actions .starred"));
  await ui.unmount();
});

test("notes survive unmounting and failed saves; editing during save keeps the newer draft", async () => {
  const data = fixture(); const paper = data.paper("notes"); const drafts = new Map();
  let root = createRoot(document.getElementById("root")); let save;
  const props = { paper, drafts, onSave: () => new Promise((resolve) => { save = resolve; }) };
  await React.act(async () => root.render(React.createElement(Notes, props)));
  await input(document.querySelector("textarea"), "first draft");
  await click("button", "Save notes");
  await input(document.querySelector("textarea"), "newer draft");
  await React.act(async () => save());
  assert.equal(drafts.get(paper.id), "newer draft");
  await React.act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(Notes, { ...props, onSave: async () => { throw new Error("Offline"); } })));
  assert.equal(document.querySelector("textarea").value, "newer draft");
  await click("button", "Save notes");
  assert.match(document.querySelector('[role="alert"]').textContent, /Offline/);
  assert.equal(drafts.get(paper.id), "newer draft");
  await React.act(async () => root.unmount());
});

test("metadata queue bounds concurrency, continues after errors and cancels queued work", async () => {
  const queue = helpers.createLibraryRequestQueue(2);
  const release = []; let count = 0, peak = 0;
  const jobs = Array.from({ length: 5 }, (_, i) => queue.run(() => { peak = Math.max(peak, ++count); return new Promise((resolve, reject) => release.push(() => { count--; if (i === 0) reject(Error("Failed")); else resolve(i); })); }));
  const results = Promise.allSettled(jobs);
  await tick(); assert.equal(release.length, 2);
  release.shift()(); await tick(); assert.equal(release.length, 2);
  queue.clearPending();
  for (const done of release.splice(0)) done();
  assert.equal(peak, 2);
  const settled = await results;
  assert.equal(settled.filter((result) => result.status === "rejected").length, 3);
});

test("search keeps a pasted title together, includes tags, and sorting leaves cache order intact", () => {
  const data = fixture();
  const a = { ...data.paper("a", "A memory-native agent"), tags: ["RAG"], year: 2024 };
  const b = { ...data.paper("b", "Native memory"), year: 2025 };
  assert.equal(helpers.matchLibraryPaper(a, "a memory-native agent"), true);
  assert.equal(helpers.matchLibraryPaper(b, "a memory-native agent"), false);
  assert.equal(helpers.matchLibraryPaper(a, "rag"), true);
  const cache = [a, b];
  assert.deepEqual(helpers.sortLibraryPapers(cache, "year").map((p) => p.id), ["b", "a"]);
  assert.equal(cache[0], a);
});
