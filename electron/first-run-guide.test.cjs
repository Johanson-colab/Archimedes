const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const React = require("react");
const { createRoot } = require("react-dom/client");

test("the guide opens once per profile and offers each part of the workspace in order", async () => {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame, cancelAnimationFrame: dom.window.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(document.getElementById("root"));
  try {
    const { default: FirstRunGuide, readFirstRunGuide, writeFirstRunGuide } = await vite.ssrLoadModule("/src/FirstRunGuide.tsx");
    const { UISettingsProvider } = await vite.ssrLoadModule("/src/i18n.tsx");
    function GuideFixture() {
      const [step, setStep] = React.useState(() => readFirstRunGuide() ? null : "intro");
      return React.createElement(UISettingsProvider, null, step && React.createElement(FirstRunGuide, {
        step, onStep: setStep, onExit: (result) => { writeFirstRunGuide(result); setStep(null); },
      }));
    }
    const render = (key) => React.act(() => root.render(React.createElement(GuideFixture, { key })));
    const button = (name) => [...document.querySelectorAll('[role="dialog"] button')].find((element) => element.textContent === name);
    const click = (name) => React.act(() => button(name).click());
    const heading = () => document.querySelector('[role="dialog"] h2')?.textContent;

    await render("fresh");
    assert.equal(heading(), "Quick guide to Archimedes");
    for (const [action, title] of [
      ["Start guide", "Main chat"],
      ["Continue guide", "Research Apps and Projects"],
      ["Continue guide", "Open the Workbench"],
      ["Show workbench", "Workbench"],
      ["Continue guide", "Research aids"],
    ]) {
      await click(action);
      assert.equal(heading(), title);
    }
    await click("Finish guide");
    assert.equal(readFirstRunGuide(), "completed");
    await render("reopen-completed");
    assert.equal(heading(), undefined);

    window.localStorage.clear();
    window.localStorage.setItem("archimedes-language", "zh");
    await render("fresh-chinese");
    assert.equal(heading(), "Archimedes 快速指南");
    await click("跳过指南");
    assert.equal(readFirstRunGuide(), "skipped");
    await render("reopen-skipped");
    assert.equal(heading(), undefined);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
    await vite.close();
  }
});
