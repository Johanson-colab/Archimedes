const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const BROWSER_WIDTH = "archimedes-paper-browser-width";
const PREVIEW_SPLIT = "archimedes-paper-split";

async function mountWriting(t, configureStorage) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://archimedes.test" });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  Object.assign(global, {
    window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  const React = require("react");
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "ResizeObserver"]) delete global[key];
  });
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const read = name => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");
  const settings = read("i18n.tsx");
  const preferences = settings.slice(settings.indexOf("export const displayPreferenceStorage"), settings.indexOf("function readLanguage()")).replace("export const", "const");
  const { code: preferenceCode } = await transformWithOxc(preferences, "preferences.ts");
  const displayPreferenceStorage = new Function(preferenceCode + "\nreturn displayPreferenceStorage;")();
  configureStorage(window);

  const source = read("PaperWritingView.tsx");
  const icons = require("lucide-react");
  const iconNames = source.match(/\{([^}]+)\} from "lucide-react"/)[1].split(",").map(name => name.trim());
  const toExecute = source.replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(toExecute, "PaperWritingView.tsx", { jsx: { runtime: "classic" } });
  const scope = {
    React, ...React, ...Object.fromEntries(iconNames.map(name => [name, icons[name]])),
    displayPreferenceStorage, useUISettings: () => ({ t: text => text }),
    Dialog: () => null, StateView: props => React.createElement("div", null, props.title), PaperTemplateLibrary: () => null,
    paperTemplates: [{ id: "article" }], sourceMarksByLine: () => new Map(),
  };
  const Writing = new Function(...Object.keys(scope), code.replace(/^export \{\};?$/gm, "") + "\nreturn PaperWritingView;")(...Object.values(scope));
  root = createRoot(document.querySelector("#root"));
  const bridge = { listLatexProjects: async () => [] };
  await React.act(async () => root.render(React.createElement(Writing, { bridge, workspace: "/synthetic", active: true })));
  const workspace = document.querySelector(".paper-writing-workspace");
  assert.ok(workspace);
  Object.defineProperty(workspace, "clientWidth", { value: 1200 });
  return { act: React.act, window };
}

test("paper layout falls back to defaults and stays interactive when a preference write exceeds quota", async t => {
  const { window, act } = await mountWriting(t, window => {
    window.localStorage.setItem(BROWSER_WIDTH, "{malformed");
    const getItem = window.Storage.prototype.getItem;
    t.mock.method(window.Storage.prototype, "getItem", function (key) {
      if (key === PREVIEW_SPLIT) throw new window.DOMException("Blocked preference", "SecurityError");
      return getItem.call(this, key);
    });
    t.mock.method(window.Storage.prototype, "setItem", () => {
      throw new window.DOMException("Storage full", "QuotaExceededError");
    });
  });
  const browser = document.querySelector('[aria-label="Resize file browser"]');
  assert.equal(browser.getAttribute("aria-valuenow"), "220");
  assert.equal(document.querySelector('[aria-label="Resize PDF preview"]').getAttribute("aria-valuenow"), "62");
  await act(async () => browser.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.equal(browser.getAttribute("aria-valuenow"), "228");
  await new Promise(resolve => setTimeout(resolve, 240));
  assert.ok(document.querySelector(".paper-writing-workspace"));
});
test("20 continuous pane changes write each last size once using the existing keys", async t => {
  const writes = [];
  const { window, act } = await mountWriting(t, window => {
    const setItem = window.Storage.prototype.setItem;
    t.mock.method(window.Storage.prototype, "setItem", function (key, value) {
      if (key === BROWSER_WIDTH || key === PREVIEW_SPLIT) writes.push([key, value]);
      setItem.call(this, key, value);
    });
  });
  const browser = document.querySelector('[aria-label="Resize file browser"]');
  const pdf = document.querySelector('[aria-label="Resize PDF preview"]');
  const event = key => new window.KeyboardEvent("keydown", { key, bubbles: true });
  assert.deepEqual(writes, []);
  for (let index = 0; index < 20; index++) {
    await act(async () => {
      browser.dispatchEvent(event(index % 2 === 0 ? "ArrowLeft" : "ArrowRight"));
      pdf.dispatchEvent(event(index % 2 === 0 ? "ArrowRight" : "ArrowLeft"));
    });
  }
  assert.deepEqual(writes, []);
  await new Promise(resolve => setTimeout(resolve, 240));
  assert.deepEqual(writes.map(([key]) => key).sort(), [BROWSER_WIDTH, PREVIEW_SPLIT]);
  assert.equal(Number(window.localStorage.getItem(BROWSER_WIDTH)), Number(browser.getAttribute("aria-valuenow")));
  assert.equal(Math.round(Number(window.localStorage.getItem(PREVIEW_SPLIT)) * 100), Number(pdf.getAttribute("aria-valuenow")));
});
