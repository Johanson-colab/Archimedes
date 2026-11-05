const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");
let dom, React, createRoot, helpers, DailyThumbnail, DailyPaperPreview;
const observers = [];
const thumb = 'data:image/jpeg;base64,/9j/fixture/9k=';
const paper = { arxiv_id: "2611.99901", title: "Example paper", authors: ["Author"], categories: ["cs.AI"], source: "arxiv", year: 2026, published_at: "2026-11-05", url: "https://arxiv.org/abs/2611.99901", abstract: "Example abstract" };
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  for (const key of ["window", "document", "HTMLElement", "Node", "requestAnimationFrame", "cancelAnimationFrame"]) global[key] = /AnimationFrame/.test(key) ? dom.window[key].bind(dom.window) : dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.nodes = new Set(); observers.push(this); }
    observe(node) { this.nodes.add(node); }
    disconnect() { this.nodes.clear(); }
  };
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const scope = { React, ...React, createPortal: require("react-dom").createPortal, useUISettings: () => ({ t: key => key }), formatPaperDate: () => "Nov 5", ...Object.fromEntries(["X", "Flame", "ExternalLink", "Check", "LoaderCircle", "Plus", "Code2"].map(name => [name, require("lucide-react")[name]])) };
  async function load(file, names, input) {
    const source = (input || fs.readFileSync(path.join(__dirname, "../src", file), "utf8")).replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/export default function/g, "function").replace(/export (function|const)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const values = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, values); return values;
  }
  helpers = await load("daily-figures.ts", ["peekDailyFigure", "subscribeDailyFigure", "forgetDailyFigure"]);
  await load("useDialogFocus.ts", ["useDialogFocus"]); await load("DialogPortal.tsx", ["DialogPortal"]); await load("Dialog.tsx", ["Dialog"]);
  const library = fs.readFileSync(path.join(__dirname, "../src/LibraryView.tsx"), "utf8");
  ({ DailyThumbnail } = await load("DailyThumbnail.tsx", ["DailyThumbnail"], library.slice(library.indexOf("function DailyThumbnail("), library.indexOf("function DailyDiscovery("))));
  const preview = library.slice(library.indexOf("function DailyPaperPreview("));
  const end = preview.indexOf("\nfunction ", 10);
  ({ DailyPaperPreview } = await load("DailyPaperPreview.tsx", ["DailyPaperPreview"], end < 0 ? preview : preview.slice(0, end)));
});
after(() => {
  dom.window.close();
  for (const key of ["window", "document", "HTMLElement", "Node", "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver", "IS_REACT_ACT_ENVIRONMENT"]) delete global[key];
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function warm(bridge, id, thumbnail = true) {
  await new Promise(resolve => { helpers.subscribeDailyFigure(bridge, id, thumbnail, 0, resolve); }); await tick();
}

test("only visible thumbnails request IPC; reopening renders immediately from the bounded cache", async () => {
  let calls = 0;
  const bridge = { getDailyFigure: async (id, options) => { calls++; assert.equal(options.thumbnail, true); return thumb; } };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(DailyThumbnail, { paper, bridge })));
  assert.equal(calls, 0);
  await React.act(async () => {
    for (const observer of observers) for (const node of observer.nodes) observer.callback([{ target: node, isIntersecting: true, boundingClientRect: { top: 100, bottom: 260 } }]);
  });
  assert.equal(calls, 1); assert.equal(document.querySelector("img").getAttribute("src"), thumb);
  await React.act(async () => root.unmount());
  const reopened = createRoot(document.getElementById("root"));
  await React.act(async () => reopened.render(React.createElement(DailyThumbnail, { paper, bridge })));
  assert.equal(document.querySelector("img").getAttribute("src"), thumb); assert.equal(calls, 1);
  await React.act(async () => reopened.unmount());
});

test("visible requests precede prefetches, duplicates coalesce, and abandoned queued work is removed", async () => {
  const calls = [], pending = [], received = [];
  const bridge = { getDailyFigure: id => { calls.push(id); return new Promise(resolve => pending.push(resolve)); } };
  const cleanups = [
    helpers.subscribeDailyFigure(bridge, "near", true, 1, () => {}),
    helpers.subscribeDailyFigure(bridge, "visible", true, 0, url => received.push(url)),
    helpers.subscribeDailyFigure(bridge, "visible", true, 0, url => received.push(url)),
    helpers.subscribeDailyFigure(bridge, "second", true, 0, () => {}),
    helpers.subscribeDailyFigure(bridge, "abandoned", true, 1, () => { throw Error("unsubscribed callback"); }),
  ];
  cleanups.at(-1)(); await tick();
  assert.deepEqual(calls, ["visible", "second", "near"]);
  cleanups[1](); pending.forEach(resolve => resolve(thumb)); await tick(); await tick();
  assert.deepEqual(received, [thumb]); assert.equal(helpers.peekDailyFigure(bridge, "visible"), thumb);
  cleanups.forEach(cleanup => cleanup());
});

test("thumbnail memory cache evicts old entries and refuses unbounded payloads", async () => {
  const bridge = { getDailyFigure: async id => id === "oversized" ? "data:" + "x".repeat(9 * 1024 * 1024) : `https://arxiv.org/${id}.png` };
  for (let i = 0; i < 130; i++) await warm(bridge, String(i));
  assert.equal(helpers.peekDailyFigure(bridge, "0"), ""); assert.equal(helpers.peekDailyFigure(bridge, "129"), "https://arxiv.org/129.png");
  await warm(bridge, "oversized"); assert.ok(!helpers.peekDailyFigure(bridge, "oversized"));
  const manyLarge = { getDailyFigure: async () => "data:" + "x".repeat(1024 * 1024) };
  for (let i = 0; i < 10; i++) await warm(manyLarge, String(i));
  assert.ok(!helpers.peekDailyFigure(manyLarge, "0"), "the total string budget evicts large entries before the count limit");
  assert.ok(Boolean(helpers.peekDailyFigure(manyLarge, "9")));
});

test("large preview displays the cached thumbnail while the original loads and falls back safely", async () => {
  let finish;
  const original = "https://arxiv.org/html/2611.99901v1/original.png";
  const bridge = { getDailyFigure: async (_id, options) => options.thumbnail ? thumb : new Promise(resolve => { finish = resolve; }) };
  await warm(bridge, paper.arxiv_id);
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(DailyPaperPreview, { paper, bridge, canSave: true, isAdded: false, isAdding: false, onAdd() {}, onClose() {} })));
  assert.equal(document.querySelector("img").getAttribute("src"), thumb);
  await React.act(async () => finish(original));
  assert.equal(document.querySelector("img").getAttribute("src"), original);
  await React.act(async () => document.querySelector("img").dispatchEvent(new dom.window.Event("error")));
  assert.equal(document.querySelector("img").getAttribute("src"), thumb);
  await React.act(async () => root.unmount()); assert.notEqual(document.body.style.overflow, "hidden");
});

test("an observer callback delivered after unmount cannot start a stale request", async () => {
  let calls = 0;
  const bridge = { getDailyFigure: async () => { calls++; return thumb; } };
  const root = createRoot(document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(DailyThumbnail, { paper, bridge })));
  const observer = observers.at(-1), node = [...observer.nodes][0];
  await React.act(async () => root.unmount());
  await React.act(async () => observer.callback([{ target: node, isIntersecting: true, boundingClientRect: { top: 10, bottom: 100 } }]));
  assert.equal(calls, 0);
});
