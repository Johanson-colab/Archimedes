const test = require("node:test");
const { before, after } = test;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, DailyDiscovery, ConferenceDiscovery;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const paper = title => ({ title, external_id: title, authors: ["Researcher"], abstract: "Evidence", categories: ["cs.AI"], source: "arxiv", url: "https://arxiv.org/abs/1706.03762", published_at: new Date().toISOString(), upvotes: 0 });
const feed = (title, stale = false) => ({ papers: [paper(title)], providers: ["arxiv"], fetched_at: stale ? "2020-01-01T00:00:00Z" : new Date().toISOString(), cached: stale, stale });
const catalog = (title, stale = false) => ({ ...feed(title, stale), papers: [{ ...paper(title), conference: { presentation: "poster", source_url: "https://icml.cc", track: "Main" } }], total: 1, catalog_total: 1, warnings: [], sources: ["https://icml.cc"], presentation_counts: { oral: 0, spotlight: 0, poster: 1, unknown: 0 }, status: "available" });
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  for (const key of ["window", "document", "HTMLElement", "Node"]) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const scope = { React, ...React, ...require("lucide-react"), Map, Set, useUISettings: () => ({ t: key => key }), conferenceCatalog: require("../shared/conferences.json"),
    ReactMarkdown: ({ children }) => React.createElement("span", null, children), remarkMath() {}, rehypeKatex() {},
    DailyThumbnail: () => null, DailyPaperPreview: () => null, formatPaperDate: () => "Today", formatFeedTime: () => "now", readableError: e => e.message };
  async function load(file, names, input) {
    const source = (input || fs.readFileSync(path.join(__dirname, "../src", file), "utf8"))
      .replace(/^import[^;]+;\r?\n/gm, "").replace(/export default function/g, "function").replace(/export (function|const)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const values = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, values); return values;
  }
  await load("Tabs.tsx", ["Tabs", "Tab", "FilterGroup", "FilterButton"]);
  await load("discovery-state.ts", ["readDiscoveryControls", "writeDiscoveryControls"]);
  await load("StateView.tsx", ["StateView"]); await load("InlineNotice.tsx", ["InlineNotice"]);
  scope.LoadingState = () => React.createElement(scope.StateView, { tone: "loading", title: "Loading research records…" });
  ({ ConferenceDiscovery } = await load("ConferenceDiscovery.tsx", ["ConferenceDiscovery"]));
  const source = fs.readFileSync(path.join(__dirname, "../src/LibraryView.tsx"), "utf8");
  const constants = source.slice(source.indexOf("const DAILY_TOPICS:"), source.indexOf("function publicPaperRecordUrl("));
  ({ DailyDiscovery } = await load("DailyDiscovery.tsx", ["DailyDiscovery"], constants + source.slice(source.indexOf("function DailyDiscovery("), source.indexOf("function DailyPaperPreview("))));
});
after(() => { dom.window.close(); for (const key of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key]; });
async function click(node) { await React.act(async () => { node.click(); await tick(); }); }
async function input(node, value) { await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); }
const dailyProps = bridge => ({ bridge, libraries: [{ id: "library", name: "Library" }], loadingLibraries: false, onImported: async () => {} });
const text = () => document.getElementById("root").textContent;

test("stale papers render during refresh, newer search wins, and feed/conference navigation stays available", async () => {
  const pending = [], saved = [];
  const bridge = { addLibraryPaper: async (libraryId, record) => saved.push({ libraryId, record }), getCachedDailyPapers: async options => options.query ? null : feed("Cached feed", true), discoverDailyPapers: options => new Promise(resolve => pending.push({ options, resolve })), searchConferencePapers: async () => catalog("Official paper") };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => { root.render(React.createElement(DailyDiscovery, dailyProps(bridge))); await tick(); });
  assert.match(text(), /Cached feed/); assert.match(text(), /Refreshing/);
  const box = document.querySelector(".daily-search-input-row input");
  await input(box, "first"); await click(document.querySelector(".daily-search-send"));
  await input(box, "second"); await click(document.querySelector(".daily-search-send"));
  await React.act(async () => pending.find(x => x.options.query === "second").resolve(feed("Second search")));
  await React.act(async () => pending.find(x => x.options.query === "first").resolve(feed("Wrong old reply")));
  assert.match(text(), /Second search/); assert.doesNotMatch(text(), /Wrong old reply/);
  await click(document.querySelector(".daily-paper-title button"));
  assert.equal(saved[0].libraryId, "library"); assert.equal(saved[0].record.title, "Second search"); assert.match(text(), /Saved/);
  assert.equal(document.querySelector(".conference-mode-button").disabled, false);
  await click(document.querySelector(".conference-mode-button")); assert.match(text(), /Official paper/);
  await click(document.querySelector('[data-value="latest"]')); assert.equal(box.value, ""); assert.match(text(), /Cached feed/);
  await React.act(async () => { pending.forEach(x => x.resolve(feed("Fresh feed"))); await tick(); });
  await React.act(async () => root.unmount());
});

test("hiding and returning preserves search controls and fresh results without refetching", async () => {
  let calls = 0; const bridge = { discoverDailyPapers: async options => { calls++; return feed(options.query || "Latest"); } };
  const root = createRoot(document.getElementById("root")); const props = dailyProps(bridge);
  await React.act(async () => root.render(React.createElement(DailyDiscovery, props)));
  await input(document.querySelector(".daily-search-input-row input"), "agent memory"); await click(document.querySelector(".daily-search-send"));
  const before = calls;
  await React.act(async () => root.render(React.createElement(DailyDiscovery, { ...props, active: false })));
  await React.act(async () => root.render(React.createElement(DailyDiscovery, { ...props, active: true })));
  assert.equal(document.querySelector(".daily-search-input-row input").value, "agent memory"); assert.match(text(), /agent memory/); assert.equal(calls, before);
  await React.act(async () => root.unmount());
});

test("conference cached rows stay visible during refresh and old years cannot replace a newer selection", async () => {
  const pending = []; const bridge = { getCachedConferencePapers: async options => options.year === 2026 ? catalog("Cached official paper", true) : null,
    searchConferencePapers: options => new Promise(resolve => pending.push({ options, resolve })) };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => { root.render(React.createElement(ConferenceDiscovery, { bridge, targetLibraryId: "library", topic: "all", onImported: async () => {} })); await tick(); });
  assert.match(text(), /Cached official paper/); assert.equal(document.querySelector(".library-loading"), null);
  const select = document.querySelector('[aria-label="Conference year"]');
  await React.act(async () => { select.value = "2025"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await tick(); });
  await React.act(async () => pending.find(x => x.options.year === 2025).resolve(catalog("Selected 2025")));
  await React.act(async () => pending.find(x => x.options.year === 2026).resolve(catalog("Late 2026")));
  assert.match(text(), /Selected 2025/); assert.doesNotMatch(text(), /Late 2026|Cached official paper/);
  await React.act(async () => root.unmount());
});


test("clicking the already-selected feed and topic does not strand an initial request", async () => {
  let finish; const bridge = { discoverDailyPapers: () => new Promise(resolve => { finish = resolve; }) };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(DailyDiscovery, dailyProps(bridge))));
  await click(document.querySelector('[data-value="latest"]'));
  await click(document.querySelector('.daily-topic-filter button'));
  await React.act(async () => finish(feed("Initial feed arrived")));
  assert.match(text(), /Initial feed arrived/);
  await React.act(async () => root.unmount());
});

test("conference connection failures do not expose raw Electron RPC and AbortError text", async () => {
  const bridge = { searchConferencePapers: async () => { throw Error("Error invoking remote method 'library:search-conferences': AbortError: The operation was aborted"); } };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(ConferenceDiscovery, { bridge, targetLibraryId: "library", topic: "all", onImported: async () => {} })));
  assert.match(text(), /connection to the official catalog was interrupted/);
  assert.doesNotMatch(text(), /AbortError|invoking remote method/);
  await React.act(async () => root.unmount());
});

test("title rows appear while abstracts are pending and late progress cannot replace completed abstracts", async () => {
  let finish, lateProgress;
  let cachedReads = 0;
  const titles = { ...catalog("Available title"), abstracts_pending: true, warnings: ["Abstracts are loading; titles and official links are ready."] };
  const complete = catalog("Available title"); complete.papers[0].abstract = "Recovered full abstract";
  const bridge = { getCachedConferencePapers: async () => {
    cachedReads++;
    if (cachedReads === 1) return null;
    if (cachedReads === 2) return titles;
    return new Promise(resolve => { lateProgress = resolve; });
  }, searchConferencePapers: () => new Promise(resolve => { finish = resolve; }) };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(ConferenceDiscovery, { bridge, targetLibraryId: "library", topic: "all", onImported: async () => {} })));
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 1100)));
  assert.match(text(), /Available title/); assert.match(text(), /Abstracts are loading/);
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 1000)));
  assert.ok(lateProgress);
  await React.act(async () => finish(complete));
  await React.act(async () => lateProgress(titles));
  assert.match(text(), /Recovered full abstract/); assert.doesNotMatch(text(), /Abstracts are loading/);
  const before = cachedReads;
  await React.act(async () => root.unmount());
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(cachedReads, before, "progress polling stops on completion and unmount");
});
