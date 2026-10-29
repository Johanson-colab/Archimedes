const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const tokens = fs.readFileSync(path.join(root, "src", "tokens.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");

const REQUIRED_TOKENS = [
  "bg", "fg", "comment", "keyword", "string", "number", "function",
  "operator", "punctuation", "line-number", "line-hover", "selection", "border",
];

function paletteFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tokens.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing ${selector} block`);
  return Object.fromEntries(
    [...match[1].matchAll(/--code-([\w-]+):\s*([^;]+);/g)].map((item) => [item[1], item[2].trim()]),
  );
}

test("defines a complete code palette for charcoal and paper", () => {
  for (const selector of [":root", ':root[data-theme="paper"]']) {
    const palette = paletteFor(selector);
    for (const token of REQUIRED_TOKENS) assert.ok(palette[token], `${selector} is missing --code-${token}`);
  }
  const dark = paletteFor(":root");
  const paper = paletteFor(':root[data-theme="paper"]');
  assert.notEqual(dark.bg, paper.bg, "paper and charcoal must use different code backgrounds");
  assert.notEqual(dark.fg, paper.fg, "paper and charcoal must use different code foregrounds");
});

test("maps Prism tokens to shared palette variables", () => {
  const mappings = {
    comment: "comment",
    keyword: "keyword",
    string: "string",
    number: "number",
    function: "function",
    operator: "operator",
    punctuation: "punctuation",
  };
  for (const [token, variable] of Object.entries(mappings)) {
    assert.match(
      css,
      new RegExp(`\\.token\\.${token}[^{}]*\\{[^}]*var\\(--code-${variable}\\)`),
      `token.${token} should use --code-${variable}`,
    );
  }
  assert.match(css, /:is\(\.message-code-block, \.code-preview, \.codebase-source\)/);
  assert.match(css, /--code-line-number/);
  assert.match(css, /--code-selection/);
});

test("uses theme variables instead of the inactive inline Prism theme", () => {
  for (const [name, source] of [["App.tsx", app], ["LibraryView.tsx", library]]) {
    assert.doesNotMatch(source, /coldarkDark|styles\/prism\/coldark-dark/, `${name} should not import the inactive theme`);
    assert.doesNotMatch(source, /#0c0e15|#0d0f17|#5f6475/, `${name} should not hardcode code colours`);
  }
  assert.doesNotMatch(css, /#39352f\s*!important|#f4f1ec\s*!important/, "paper tokens must not flatten the palette");
});
