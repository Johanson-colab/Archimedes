const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const review = fs.readFileSync(path.join(root, "src", "PaperReviewWorkbench.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const presentation = fs.readFileSync(path.join(root, "src", "PaperPresentationDeck.tsx"), "utf8");
const orchestrator = fs.readFileSync(path.join(root, "electron", "paper-review-orchestrator.cjs"), "utf8");
const kimiSlidesSkill = fs.readFileSync(path.join(root, "electron", "kimi-slides-skill.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");

test("paper review reports individual specialist failures instead of leaving spinners active", () => {
  assert.match(review, /event\.stage === "specialist_failed"/);
  assert.match(review, /status: "error", response: "", error: event\.detail/);
  assert.match(review, /Review stopped before this reading completed/);
});

test("paper review streams completed notes and renders failure states in the process route", () => {
  assert.match(orchestrator, /stage: "specialist_complete"[\s\S]*?response: result\.response/);
  assert.match(review, /event\.stage === "specialist_complete" && event\.response/);
  assert.match(review, /paper-review-summary-error/);
  assert.match(review, /summary\.error/);
});

test("all-specialist failure preserves the original errors for the workbench", () => {
  assert.match(orchestrator, /if \(!usable\.length\) \{/);
  assert.match(orchestrator, /specialists: settled\.map/);
  assert.match(orchestrator, /summary: null,/);
  assert.match(orchestrator, /error,/);
  assert.match(review, /if \(result\.error \|\| !result\.summary\) \{/);
  assert.match(review, /error: report\.error/);
});

test("completed reviews are saved and restored when the review tab remounts", () => {
  assert.match(main, /store\.savePaperReview\(paper\.id, result\)/);
  assert.match(main, /ipcMain\.handle\("paper-review:get"/);
  assert.match(review, /bridge\.getPaperReview\(paper\.id, workspace\)/);
  assert.match(review, /Saved review restored/);
});

test("text review and generated presentation remain independent outputs", () => {
  assert.match(review, /ReactMarkdown/);
  assert.match(review, /Text review/);
  assert.match(review, /PaperPresentationDeck/);
  assert.match(main, /store\.getPaperReview\(input\.paper\.id\)/);
  assert.match(main, /store\.savePaperPresentation/);
  assert.match(main, /ipcMain\.handle\("paper-presentation:get"/);
  assert.match(kimiSlidesSkill, /never alter the saved review/);
  assert.match(kimiSlidesSkill, /claim-to-source ledger/);
  assert.match(kimiSlidesSkill, /Background -> Related work -> Method -> Experiments -> Limitations/);
  assert.match(main, /runKimiSlidesPlan/);
  assert.match(main, /generateKimiPptd/);
});

test("saved presentations render as a keyboard-navigable academic deck with PDF visuals", () => {
  assert.match(presentation, /function PresentationSourceVisual/);
  assert.match(presentation, /FOCUS_RECTS/);
  assert.match(presentation, /layout-figure-led/);
  assert.match(presentation, /layout-outline/);
  assert.match(presentation, /layout-editorial/);
  assert.match(presentation, /paper-presentation-structured/);
  assert.match(presentation, /Legacy presentation detected/);
  assert.match(presentation, /Generate PPTD presentation/);
  assert.match(presentation, /PptdRenderedPage/);
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

test("expanded evidence notes stay in the reading card column", () => {
  const readingRules = styles.match(/\.paper-review-reading \{[^}]*\}/g) ?? [];
  const activeRule = readingRules.find((rule) => /min-height: 154px;/.test(rule));
  assert.match(activeRule, /display: block;/);
  assert.doesNotMatch(activeRule, /display: grid;/);
  assert.match(activeRule, /padding: 22px;/);
  assert.match(styles, /\.paper-review-markdown \{ padding: 20px 0 0 36px;/);
});

test("research memorandum fills the width of its summary section", () => {
  const noteRules = styles.match(/\.paper-review-final-note \{[^}]*\}/g) ?? [];
  const activeRule = noteRules.find((rule) => /padding: 25px;/.test(rule));
  assert.match(activeRule, /max-width: none;/);

  const headingRules = styles.match(/\.paper-review-final-note h2 \{[^}]*\}/g) ?? [];
  const activeHeading = headingRules.find((rule) => /font-size: 13px;/.test(rule));
  assert.match(activeHeading, /max-width: none;/);
});
