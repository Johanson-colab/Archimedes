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

test("the welcome replication card opens the reproduce module", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "..", "src", "App.tsx"), "utf8");
  const welcome = fs.readFileSync(path.resolve(__dirname, "..", "src", "ResearchWelcome.tsx"), "utf8");
  assert.match(welcome, /id: "replication"/);
  assert.match(welcome, /title: "Reproduce a paper"/);
  assert.match(app, /action === "replication"\)\s*\{\s*setMainSection\("reproduce"\)/);
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
