const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("PDF stage reserves the scrollbar gutter and owns the scroll", () => {
  assert.match(css, /\.arch-pdf-stage \{[^}]*scrollbar-gutter: stable/);
  assert.match(css, /\.knowledge-main:has\(> \.library-view-cache:not\(\.hidden\) \.paper-workbench-page\) \{ overflow: hidden; \}/);
});

test("a cached paper reader locks the shared scroll area only while visible", () => {
  const rule = css.match(/([^{}\n]*paper-workbench-page[^{}\n]*)\s*\{\s*overflow:\s*hidden;\s*\}/);
  assert.ok(rule, "the reader scroll-lock rule exists");
  const document = new JSDOM('<main class="knowledge-main"><div class="library-view-cache"><div class="paper-workbench-page"></div></div></main>').window.document;
  const main = document.querySelector(".knowledge-main");
  const cache = document.querySelector(".library-view-cache");
  assert.equal(main.matches(rule[1].trim()), true, "the foreground reader owns its scroll");
  cache.classList.add("hidden");
  assert.equal(main.matches(rule[1].trim()), false, "a cached reader must not lock another page");
  cache.classList.remove("hidden");
  assert.equal(main.matches(rule[1].trim()), true, "returning to the reader restores its scroll lock");
});

test("fit-to-width observes the stage instead of the scrollbar-sensitive surface", () => {
  assert.match(library, /const stageRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(library, /const stage = stageRef\.current/);
  assert.match(library, /observer\.observe\(stage\)/);
  assert.doesNotMatch(library, /observer\.observe\(host\)/);
  assert.match(library, /className="arch-pdf-stage" ref=\{stageRef\}/);
});

test("width updates only on meaningful changes and use the stage content box", () => {
  assert.match(library, /Math\.abs\(current - next\) < 1 \? current : next/);
  assert.match(library, /\(width - 4\) \/ baseViewport\.width/);
  assert.doesNotMatch(library, /\(width - 72\) \/ baseViewport\.width/);
  assert.match(library, /window\.setTimeout\(updateWidth, 80\)/);
});

test("the PDF stage keeps its flexible row before and after the first page", () => {
  assert.match(css, /\.paper-reader-layout \{ grid-template-rows: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.original-paper-reader > \.arch-pdf-stage \{ grid-row: 3; \}/);
  assert.match(css, /\.knowledge-main \.paper-workbench-page \{ grid-template-rows: 44px minmax\(0, 1fr\); \}/);
});
