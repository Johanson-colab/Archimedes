const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("PDF stage reserves the scrollbar gutter and owns the scroll", () => {
  assert.match(css, /\.arch-pdf-stage \{[^}]*scrollbar-gutter: stable/);
  assert.match(css, /\.knowledge-main:has\(\.paper-workbench-page\) \{ overflow: hidden; \}/);
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
