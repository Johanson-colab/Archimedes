const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const React = require("react");
const { createRoot } = require("react-dom/client");

test("workbench panels release browser and resize listeners when their owners unmount", async t => {
  const dom = new JSDOM("<main></main>", { url: "http://localhost" });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  Object.assign(global, { window, document: window.document, AbortController: window.AbortController, IS_REACT_ACT_ENVIRONMENT: true });
  const { createServer } = await import("vite");
  const server = await createServer({ ssr: { noExternal: ["@xterm/xterm", "@xterm/addon-fit"], resolve: { mainFields: ["module", "main"] } }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: "silent" });
  t.after(async () => { await server.close(); window.close(); });
  const { default: Browser } = await server.ssrLoadModule("/src/BrowserView.tsx");
  const { default: Terminal } = await server.ssrLoadModule("/src/TerminalPanel.tsx");
  const { UISettingsProvider, useUISettings } = await server.ssrLoadModule("/src/i18n.tsx");
  let setLanguage;
  function Panel() {
    setLanguage = useUISettings().setLanguage;
    return React.createElement(Browser, { onOpenExternal() {} });
  }
  const root = createRoot(document.querySelector("main"));
  window.localStorage.setItem("archimedes-workbench-browser-url", "https://example.test/");
  await React.act(() => root.render(React.createElement(UISettingsProvider, null, React.createElement(Panel))));
  const view = document.querySelector("webview");
  const fail = () => view.dispatchEvent(Object.assign(new window.Event("did-fail-load"), { errorCode: -102, isMainFrame: true }));
  await React.act(fail);
  assert.match(document.body.textContent, /The site refused the connection/);
  await React.act(() => setLanguage("zh"));
  assert.equal(document.querySelector("webview"), view);
  assert.match(document.body.textContent, /网站拒绝了连接/);
  let ready = 0;
  view.setAudioMuted = () => { ready++; };
  await React.act(() => { view.dispatchEvent(new window.Event("dom-ready")); });
  assert.equal(ready, 1);
  let updates = 0;
  await React.act(() => root.render(React.createElement(Terminal, {
    open: false, bridge: {}, height: 320, onHeightChange() { updates++; },
  })));
  assert.equal(view.isConnected, false);
  view.dispatchEvent(new window.Event("dom-ready"));
  assert.equal(ready, 1);
  const move = () => window.dispatchEvent(new window.MouseEvent("pointermove", { clientY: 100 }));
  document.querySelector(".terminal-resize-handle").dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientY: 200 }));
  move();
  assert.equal(updates, 1);
  assert.ok(document.body.classList.contains("terminal-resizing"));
  await React.act(() => root.unmount());
  move();
  assert.equal(updates, 1);
  assert.equal(document.body.classList.contains("terminal-resizing"), false);
});
