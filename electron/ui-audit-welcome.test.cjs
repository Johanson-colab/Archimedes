const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");
const tokens = fs.readFileSync(path.resolve(__dirname, "..", "src", "tokens.css"), "utf8");

test("welcome reuses warm paper tokens and the shared accent", () => {
  assert.match(tokens, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-ground: #fbfaf8;/);
  assert.match(tokens, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-muted: #6f6a63;/);
  assert.match(tokens, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-bronze: #8a5a24;/);
});

test("welcome board and composer are docked instead of clipped", () => {
  assert.match(css, /\.research-workflow-board \{[^}]*height: clamp\(300px, 37vh, 380px\)/);
  assert.match(css, /\.research-workflow \{[^}]*border-radius: 6px/);
  assert.match(css, /\.has-welcome \.conversation-composer-wrap \{[^}]*padding-top: 38px[^}]*linear-gradient/);
  assert.match(css, /\.has-welcome \.conversation-composer,[\s\S]*?border-radius: 8px/);
});

test("welcome entrance motion is shortened and no longer loops", () => {
  assert.match(css, /\.research-welcome-hero > img[^}]*animation: welcome-shutter \.55s/);
  assert.doesNotMatch(css, /welcome-drift/);
  assert.doesNotMatch(css, /18s 1\.05s ease-in-out infinite/);
});

test("the welcome writing card opens the paper writing module", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "..", "src", "App.tsx"), "utf8");
  const welcome = fs.readFileSync(path.resolve(__dirname, "..", "src", "ResearchWelcome.tsx"), "utf8");
  assert.match(welcome, /id: "writing"/);
  assert.match(welcome, /title: "Create a paper"/);
  assert.match(app, /action === "writing"\)\s*\{\s*setMainSection\("writing"\)/);
});

test("all welcome images resolve inside the app for file and web deployments", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { pathToFileURL, fileURLToPath } = require("node:url");
  const { transformWithOxc } = await import("vite");
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src/ResearchWelcome.tsx"), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export (?:default |type )/g, "");
  for (const [base, page] of [
    ["./", pathToFileURL(path.join(root, "dist/index.html")).href],
    ["/archimedes/", "https://example.org/archimedes/index.html"],
  ]) {
    const { code } = await transformWithOxc(source.replaceAll("import.meta.env.BASE_URL", JSON.stringify(base)), "ResearchWelcome.tsx", { jsx: { runtime: "classic" } });
    const Component = new Function("React", "ArrowUpRight", "useUISettings", `${code}\nreturn ResearchWelcome;`)(React, () => null, () => ({ t: key => key }));
    const html = renderToStaticMarkup(React.createElement(Component, { onSelect() {} }));
    const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    assert.equal(images.length, 5, "the hero and four workflow images must be present");
    for (const src of images) {
      const resolved = new URL(src, page);
      const expected = new URL(`welcome/${path.posix.basename(src)}`, page);
      assert.equal(resolved.href, expected.href, `Image escaped the deployment directory: ${src}`);
      const asset = page.startsWith("file:")
        ? fileURLToPath(resolved).replace(`${path.sep}dist${path.sep}`, `${path.sep}public${path.sep}`)
        : path.join(root, "public/welcome", path.posix.basename(src));
      assert.ok(fs.statSync(asset).size > 0, `Missing welcome asset: ${src}`);
    }
  }
});

test("clicking the writing card opens the same section as Paper writing in both languages", async () => {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const rootPath = path.resolve(__dirname, "..");
  const welcome = fs.readFileSync(path.join(rootPath, "src/ResearchWelcome.tsx"), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/export (?:default |type )/g, "")
    .replaceAll("import.meta.env.BASE_URL", JSON.stringify("./"));
  const { code } = await transformWithOxc(welcome, "ResearchWelcome.tsx", { jsx: { runtime: "classic" } });
  const app = fs.readFileSync(path.join(rootPath, "src/App.tsx"), "utf8");
  const start = app.indexOf("  function openWelcomeWorkflow(");
  const end = app.indexOf("\n  async function runProactiveSuggestion", start);
  const handler = await transformWithOxc(app.slice(start, end), "handler.ts");
  assert.ok(start >= 0 && end > start);
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    for (const language of ["en", "zh"]) {
      let destination = "";
      const onSelect = new Function("setResearchMode", "setMainSection", "setDailyOpened", "setDailyStartMode", "setImageCreationOpened", `${handler.code}\nreturn openWelcomeWorkflow;`)(() => {}, value => { destination = value; }, () => {}, () => {}, () => {});
      const translations = { "Create a paper": "创建论文", "Draft and refine your manuscript.": "撰写与完善你的论文。" };
      const Component = new Function("React", "ArrowUpRight", "useUISettings", `${code}\nreturn ResearchWelcome;`)(React, () => null, () => ({ t: key => language === "zh" ? translations[key] || key : key }));
      const mount = createRoot(document.getElementById("root"));
      await React.act(async () => mount.render(React.createElement(Component, { onSelect })));
      const button = document.querySelector(".research-workflow-writing");
      assert.ok(button); assert.match(button.textContent, language === "zh" ? /创建论文/ : /Create a paper/);
      await React.act(async () => button.click());
      assert.equal(destination, "writing");
      await React.act(async () => mount.unmount());
    }
  } finally {
    dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
