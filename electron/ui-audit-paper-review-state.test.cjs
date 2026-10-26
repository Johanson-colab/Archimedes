const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const review = fs.readFileSync(path.join(root, "src", "PaperReviewWorkbench.tsx"), "utf8");
const presentation = fs.readFileSync(path.join(root, "src", "PaperPresentationDeck.tsx"), "utf8");
const orchestrator = fs.readFileSync(path.join(root, "electron", "paper-review-orchestrator.cjs"), "utf8");
const presentationSkill = fs.readFileSync(path.join(root, "electron", "paper-presentation-skill.cjs"), "utf8");
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
  assert.match(presentationSkill, /SAVED, COMPLETED evidence review/);
  assert.match(presentationSkill, /Background -> Related work -> Method -> Experiments -> Limitations/);
});

test("saved presentations render as a keyboard-navigable academic deck with PDF visuals", () => {
  assert.match(presentation, /function PresentationPageVisual/);
  assert.match(presentation, /paper-presentation-stage/);
  assert.match(presentation, /requestFullscreen/);
  assert.match(presentation, /ArrowRight/);
  assert.match(presentation, /SECTION_LABELS/);
  assert.match(review, /pdfUrl\s*=/);
});
