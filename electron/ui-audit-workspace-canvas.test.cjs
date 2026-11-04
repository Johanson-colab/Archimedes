const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("knowledge and create pages inherit one shell canvas", () => {
  assert.match(
    css,
    /\.main-view\.knowledge-main :is\(\.library-page, \.skills-page, \.benchmark-radar-page, \.image-creation-page, \.reproduce-page, \.paper-writing-page, \.artifacts-page, \.gallery-page\) \{\s*background: transparent;/,
  );
  // Page-level canvases must not reintroduce a second opaque background later.
  assert.doesNotMatch(css, /\.theme-paper \.knowledge-main \.library-page \{[^}]*background:/);
});
