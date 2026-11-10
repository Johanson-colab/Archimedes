const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const review = fs.readFileSync(path.join(root, "src", "PaperReviewWorkbench.tsx"), "utf8");
const presentation = fs.readFileSync(path.join(root, "src", "PaperPresentationDeck.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
// Reading lifecycle coverage now lives in paper-deep-reading-ui.test.cjs.
// Preserve the independent presentation checks here.
test("saved presentations render as a keyboard-navigable academic deck with PDF visuals", () => {
  assert.match(presentation, /function PresentationSourceVisual/);
  assert.match(presentation, /FOCUS_RECTS/);
  assert.match(presentation, /layout-figure-led/);
  assert.match(presentation, /layout-outline/);
  assert.match(presentation, /layout-editorial/);
  assert.match(presentation, /paper-presentation-structured/);
  assert.match(presentation, /PAPER_PRESENTATION_VERSION/);
  assert.match(presentation, /Use saved reading/);
  assert.match(presentation, /Read original paper/);
  assert.match(presentation, /sourceMode/);
  assert.match(presentation, /RenderedPresentationPage/);
  assert.match(presentation, /Editable PowerPoint/);
  assert.match(presentation, /paper-presentation-stage/);
  assert.match(presentation, /requestFullscreen/);
  assert.match(presentation, /ArrowRight/);
  assert.match(presentation, /SECTION_LABELS/);
  assert.match(review, /pdfUrl\s*=/);
});

test("presentation slides keep source captions concise and structured grids contained", () => {
  assert.match(presentation, /function sourceReference/);
  assert.match(presentation, /function tightenToInk/);
  assert.match(presentation, /pdfPage\.getTextContent/);
  assert.doesNotMatch(presentation, /<figcaption/);
  assert.match(presentation, /--structured-columns/);
  assert.match(presentation, /paper-presentation-structured-body\$\{showSource/);
  assert.match(styles, /\.paper-presentation-structured\.comparison[\s\S]*?grid-template-columns: repeat\(var\(--structured-columns/);
  assert.match(styles, /\.paper-presentation-structured-body\.no-source/);
  assert.match(styles, /\.paper-presentation-split\.no-source/);
  assert.match(styles, /-webkit-line-clamp: 3/);
  assert.doesNotMatch(styles, /\.paper-presentation-source figcaption/);
});
