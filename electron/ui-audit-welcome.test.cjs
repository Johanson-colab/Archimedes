const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

test("welcome reuses warm paper tokens and the shared accent", () => {
  assert.match(css, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-ground: #fbfaf8;/);
  assert.match(css, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-muted: #6f6a63;/);
  assert.match(css, /html\[data-theme="paper"\] \.conversation-layout\.has-welcome \{[\s\S]*?--welcome-bronze: #8a5a24;/);
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
