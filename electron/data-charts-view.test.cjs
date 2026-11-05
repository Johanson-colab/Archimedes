const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, DataChartsView, requestCount = 0;
const originalFetch = global.fetch;
const translate = key => key;
const figure = (id, type, category = "data") => ({ fig_id: id, num: "1", caption: `${type} example`, thumb: `figs/${id}-thumb.jpg`, full: `figs/${id}.jpg`, vision: { category, chart_type: type } });
const papers = [
  { paper_key: "cvpr", meta: { title: "Older vision study", venue: "CVPR", year: "2024" }, figures: [figure("cvpr__bar", "bar")] },
  { paper_key: "chi", meta: { title: "Recent interaction study", venue: "CHI", year: "2026" }, figures: [figure("chi__heatmap", "heatmap")] },
  { paper_key: "icml", meta: { title: "Learning study", venue: "ICML", year: "2025" }, figures: [figure("icml__line", "line"), figure("icml__table", "", "table"), figure("icml__area", "area")] },
];
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle"]) global[key] = typeof dom.window[key] === "function" && /AnimationFrame|ComputedStyle/.test(key) ? dom.window[key].bind(dom.window) : dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class { observe() {} disconnect() {} };
  global.fetch = async url => { requestCount++; return { ok: true, json: async () => ({ papers: String(url).endsWith("index-0.json") ? papers : [] }) }; };
  React = require("react");
  ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const scope = { React, ...React, ...Object.fromEntries(["ArrowLeft", "ArrowRight", "Check", "ChevronDown", "ExternalLink", "ImageOff", "LoaderCircle", "Search", "SlidersHorizontal", "X"].map(name => [name, require("lucide-react")[name]])), createPortal: require("react-dom").createPortal, useUISettings: () => ({ t: translate }) };
  async function load(file, names) {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8")
      .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
      .replace(/export default function/g, "function").replace(/export (function|const)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const values = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, values);
    return values;
  }
  await load("useDialogFocus.ts", ["useDialogFocus"]);
  await load("DialogPortal.tsx", ["DialogPortal"]);
  await load("Dialog.tsx", ["Dialog"]);
  await load("Menu.tsx", ["MenuSurface"]);
  await load("StateView.tsx", ["StateView"]);
  await load("InlineNotice.tsx", ["InlineNotice"]);
  await load("DataChartGallery.tsx", ["DataChartGallery"]);
  ({ DataChartsView } = await load("DataChartsView.tsx", ["DataChartsView"]));
});
after(() => {
  dom.window.close();
  global.fetch = originalFetch;
  for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key];
});
const click = async node => { assert.ok(Boolean(node)); await React.act(async () => node.click()); };
const filter = () => document.querySelector('[title="Filter data charts"]');
const button = name => [...document.querySelectorAll("button")].find(node => node.textContent === name);
const titles = () => [...document.querySelectorAll(".image-creation-card-caption")].map(node => node.textContent);
async function mount() {
  const root = createRoot(document.getElementById("root"));
  const render = active => React.act(async () => root.render(React.createElement(DataChartsView, { active })));
  await render(true);
  return { render, unmount: () => React.act(async () => root.unmount()) };
}

test("standalone charts retains sorting, chart/table filters and the remote catalog", async () => {
  const { unmount } = await mount();
  try {
    assert.equal(document.querySelector("h2").textContent, "Data charts");
    assert.ok(!document.body.textContent.includes("FigureForge"));
    assert.ok(!document.body.textContent.includes("Paper diagrams"));
    assert.deepEqual(titles(), ["Learning study", "Older vision study", "Recent interaction study"]);
    const sort = document.querySelector('[aria-label="Sort data charts"]');
    await React.act(async () => { sort.value = "newest"; sort.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(titles()[0], "Recent interaction study");
    await click(filter()); await click(button("Line"));
    assert.deepEqual(titles(), ["Learning study"]);
    await click(button("Tables"));
    assert.equal(document.querySelectorAll(".chart-reference-card").length, 1);
    assert.equal(document.querySelector(".chart-reference-type").textContent, "Table");
    assert.equal(requestCount, 4, "only the existing four source shards are requested");
  } finally { await unmount(); }
});

test("switching apps retains sort/search and closes menus and preview scroll locks", async () => {
  const { render, unmount } = await mount();
  try {
    const sort = document.querySelector('[aria-label="Sort data charts"]');
    await React.act(async () => { sort.value = "newest"; sort.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    const search = document.querySelector('[aria-label="Search charts and tables"]');
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(search, "study");
      search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await click(filter());
    assert.ok(Boolean(document.querySelector('[aria-label="Filter data charts"]')));
    await render(false);
    assert.ok(!document.querySelector('[aria-label="Filter data charts"]'));
    await render(true);
    assert.equal(document.querySelector('[aria-label="Sort data charts"]').value, "newest");
    assert.equal(document.querySelector('[aria-label="Search charts and tables"]').value, "study");
    await click(document.querySelector(".chart-reference-preview"));
    assert.ok(Boolean(document.querySelector('[role="dialog"]')));
    assert.equal(document.body.style.overflow, "hidden");
    await render(false);
    assert.ok(!document.querySelector('[role="dialog"]'));
    assert.notEqual(document.body.style.overflow, "hidden");
    assert.equal(requestCount, 4, "switching back does not refetch the catalog");
  } finally { await unmount(); }
});
