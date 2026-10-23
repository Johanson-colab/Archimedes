const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("code blocks and previews expose a copy action", () => {
  const app = read("src/App.tsx");
  const copy = read("src/CopyButton.tsx");
  assert.match(app, /<CopyButton text=/);
  assert.match(copy, /writeClipboardText/);
  assert.match(copy, /navigator\.clipboard\.writeText/);
});

test("copy feedback and touch affordances are styled", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.code-copy-button \{[^}]*opacity: 0/);
  assert.match(css, /\.code-block-shell:hover \.code-copy-button/);
  assert.match(css, /@media \(hover: none\) \{ \.artifact-tab-close, \.code-copy-button/);
  assert.match(css, /\.provider-list \{ min-height: 0; padding: 10px 10px 18px;/);
});
