const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const library = read("src", "LibraryView.tsx");
const writing = read("src", "PaperWritingView.tsx");
const i18n = read("src", "i18n.tsx");
const css = read("src", "styles.css");

test("paper reading has a header with venue, title, authors and status chips", () => {
  assert.match(library, /className="paper-reader-hero"/);
  assert.match(library, /className="paper-reader-kicker"/);
  assert.match(library, /paper\.title/);
  assert.match(library, /paper\.authors/);
  assert.match(library, /className={`paper-reading-pill \$\{paper\.reading_status\}`}/);
  assert.match(library, /className="paper-reader-chip"/);
});

test("paper reading empty state pairs the abstract with reader setup", () => {
  assert.match(library, /className="reader-empty-grid"/);
  assert.match(library, /className="reader-abstract-card"/);
  assert.match(library, /className="reader-abstract-kicker"/);
  assert.match(library, /paper\.abstract/);
  assert.match(library, /className="reader-empty-card"/);
  assert.match(library, /className="reader-empty-kicker"/);
  assert.match(library, /className="reader-empty-actions"/);
});

test("paper writing has a manuscript ribbon with structure and compile stats", () => {
  assert.match(writing, /className="paper-writing-ribbon"/);
  assert.match(writing, /className="paper-ribbon-kicker"/);
  assert.match(writing, /className="paper-ribbon-stats"/);
  assert.match(writing, /sectionOutline\.length/);
  assert.match(writing, /figureCount/);
  assert.match(writing, /citationCount/);
  assert.match(writing, /className={`paper-compile-state \$\{compileState\}`}/);
});

test("paper writing exposes a clickable section outline", () => {
  assert.match(writing, /className="paper-outline"/);
  assert.match(writing, /function jumpToSection\(section: \{ level: string; title: string \}\)/);
  assert.match(writing, /const command = `\\\\\$\{section\.level\}\{\$\{section\.title\}\}`/);
  assert.match(writing, /setSelectionRange\(offset, offset \+ \(rows\[index\]\?\.length \?\? 0\)\)/);
});

test("paper writing preview has a styled empty card", () => {
  assert.match(writing, /className="paper-preview-empty"/);
  assert.match(writing, /className="paper-preview-card"/);
  assert.match(writing, /className="paper-preview-icon"/);
  assert.match(writing, /className="paper-preview-meta"/);
  assert.match(writing, /className="paper-preview-button"/);
});

test("paper visual styles cover the reader hero and cards", () => {
  assert.match(css, /\.paper-reader-hero \{/);
  assert.match(css, /\.paper-reader-kicker \{/);
  assert.match(css, /\.paper-reader-chip \{/);
  assert.match(css, /\.reader-abstract-card \{/);
  assert.match(css, /\.reader-empty-card \{/);
  assert.match(css, /\.original-paper-reader > \.paper-reader-empty \{ grid-row: 2 \/ -1; \}/);
});

test("paper visual styles cover the writing ribbon, outline and preview", () => {
  assert.match(css, /\.paper-writing-ribbon \{/);
  assert.match(css, /\.paper-ribbon-stat \{/);
  assert.match(css, /\.paper-outline-list button:hover \{/);
  assert.match(css, /\.paper-preview-card \{/);
  assert.match(css, /\.paper-preview-button:disabled \{ opacity: \.45; \}/);
});

test("paper theme restyles both reading and writing surfaces", () => {
  assert.match(css, /html\[data-theme="paper"\] \.paper-reader-hero \{/);
  assert.match(css, /html\[data-theme="paper"\] \.reader-abstract-card \{/);
  assert.match(css, /html\[data-theme="paper"\] \.reader-empty-card \{/);
  assert.match(css, /html\[data-theme="paper"\] \.paper-writing-ribbon \{/);
  assert.match(css, /html\[data-theme="paper"\] \.paper-preview-card \{/);
});

test("paper visual copy is translated", () => {
  for (const key of [
    "Paper overview",
    "Research paper",
    "Year unknown",
    "Authors unavailable",
    "PDF available",
    "No PDF",
    "Unread",
    "Reading",
    "Abstract",
    "No abstract available for this paper.",
    "Reader setup",
    "Public PDF available",
    "Attach a local PDF to read and annotate here.",
  ]) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`));
  }
});
