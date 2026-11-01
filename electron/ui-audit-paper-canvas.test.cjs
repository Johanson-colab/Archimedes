const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const library = read("src/LibraryView.tsx");
const canvas = read("src/PaperCanvas.tsx");
const styles = read("src/styles.css");
const tokens = read("src/tokens.css");

test("the paper reader exposes Canvas beside the original paper and review", () => {
  assert.match(library, /<Tab value="canvas" icon=\{<Frame size=\{14\} \/>\}>\{t\("Canvas"\)\}<\/Tab>/);
  assert.match(library, /readerView !== "canvas"/);
  assert.match(library, /className=\{readerView === "canvas" \? "paper-canvas-reader" : "paper-canvas-reader paper-canvas-reader-inactive"\}/);
  assert.match(library, /<PaperCanvas[\s\S]*?paperId=\{paper\.id\}/);
});

test("PDF selection, figure capture, and highlights can seed the canvas", () => {
  assert.match(library, /function addSelectionToCanvas\(\)/);
  assert.match(library, /setCanvasInsert\(\{ nonce: Date\.now\(\), type: "quote", page: pageNumber, quote: selection/);
  assert.match(library, /className="add-to-canvas-action"/);
  assert.match(library, /function addFigureToCanvas\(\)/);
  assert.match(library, /type: "figure", page: figureCapture\.pageNumber/);
  assert.match(library, /function addHighlightToCanvas\(highlight: PaperHighlight\)/);
  assert.match(library, /onOpenSource=\{openCanvasSource\}/);
  assert.match(library, /function openCanvasSource\(source: PaperCanvasSource\)/);
});

test("canvas documents default to private and persist locally per paper", () => {
  assert.match(canvas, /visibility: "private"/);
  assert.match(canvas, /archimedes\.paper-canvas\.v1:/);
  assert.match(canvas, /window\.localStorage\.setItem\(localKey/);
  assert.match(canvas, /projectDocumentKey\(paperId\)/);
  assert.match(canvas, /canvas:paper:/);
  assert.match(canvas, /applySharedDocumentUpdate/);
});

test("canvas keeps the compact floating chrome from the mockup", () => {
  assert.match(canvas, /className="paper-canvas-pills paper-canvas-overlay"/);
  assert.match(canvas, /paper-canvas-visibility/);
  assert.match(canvas, /paper-canvas-toolrail paper-canvas-overlay/);
  assert.match(canvas, /paper-canvas-empty paper-canvas-overlay/);
  assert.match(canvas, /paper-canvas-templates/);
  assert.equal((canvas.match(/id: "(select|hand|pen|text|sticky|shape|arrow)"/g) || []).length, 7);
  assert.match(styles, /\.paper-canvas-pills \{ top: 14px; right: 16px;/);
  assert.match(styles, /\.paper-canvas-toolrail \{/);
  assert.match(styles, /\.paper-canvas-surface \{/);
  assert.match(tokens, /--canvas-paper:/);
  assert.match(tokens, /--canvas-grid:/);
});
