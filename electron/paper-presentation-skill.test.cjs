const assert = require("node:assert/strict");
const test = require("node:test");

const { loadPaper2PptGuidance, normalizePaperPresentation, paperPresentationPrompt } = require("./paper-presentation-skill.cjs");

const paper = { title: "A careful paper", authors: ["A. Author"], venue: "TestConf", year: 2026 };
const review = {
  audit: "Claims were checked against source pages.",
  summary: "# Review memorandum\nThe central result is qualified.",
  specialists: [
    { id: "related", title: "Related work", response: "Closest prior work appears on PDF p. 3." },
    { id: "method", title: "Method", response: "The mechanism is shown on PDF p. 5." },
  ],
};

test("presentation skill reuses Paper2PPT while preserving the saved review", () => {
  const prompt = paperPresentationPrompt(paper, review, 12);
  assert.match(prompt, /built-in Paper2PPT adapter/);
  assert.match(prompt, /read_attached_paper_pdf repeatedly/);
  assert.match(prompt, /claim-to-source ledger/);
  assert.match(prompt, /Background -> Related work -> Method -> Experiments -> Limitations/);
  assert.match(prompt, /11-15 CONTENT slides/);
  assert.match(prompt, /default 12-16 slides total/);
  assert.match(prompt, /Closest prior work appears on PDF p\. 3/);
  assert.match(loadPaper2PptGuidance(), /# Paper2PPT/);
  assert.match(loadPaper2PptGuidance(), /claim-to-source/i);
});

test("presentation skill normalizes an adaptive evidence-led narrative", () => {
  const sections = ["background", "background", "related_work", "related_work", "method", "method", "method", "experiments", "experiments", "experiments", "limitations"];
  const presentation = normalizePaperPresentation({
    title: "A careful paper",
    subtitle: "A compact, evidence-grounded contribution.",
    source_sufficiency: "full-paper",
    slides: sections.map((section, index) => ({
      section,
      layout: section === "method" ? "process" : section === "experiments" ? "metrics" : "split",
      title: section,
      lead: `Framing for ${section}`,
      bullets: [`First point for ${section}`, `Second point for ${section}`],
      takeaway: `Takeaway for ${section}`,
      speaker_notes: `Evidence and qualifier for ${section}.`,
      source: { page: index === 10 ? 99 : index + 1, label: `PDF p. ${index + 1}`, kind: "figure", figure: `Fig. ${index + 1}`, panel: "a", focus: "top", crop: { x: .1, y: .2, width: .8, height: .5 } },
      visual: { kind: section === "method" ? "process" : "metrics", items: [{ label: "Result", value: "42", detail: "Verified value" }] },
    })),
  }, paper, 12);
  assert.deepEqual(presentation.slides.map((slide) => slide.section), sections);
  assert.equal(presentation.slides.at(-1).source.page, 12);
  assert.equal(presentation.slides[4].layout, "process");
  assert.equal(presentation.slides[7].visual.items[0].value, "42");
  assert.deepEqual(presentation.slides[7].source.crop, { x: .1, y: .2, width: .8, height: .5 });
  assert.equal(presentation.source_sufficiency, "full-paper");
  assert.equal(presentation.skill.id, "paper-presentation");
  assert.equal(presentation.skill.version, 3);
});

test("presentation skill refuses incomplete or out-of-order evidence arcs", () => {
  assert.throws(() => normalizePaperPresentation({
    slides: [{ section: "background", title: "Only one", bullets: ["a", "b"] }],
  }, paper, 12), /fewer than 11 content slides/);
  assert.throws(() => normalizePaperPresentation({
    slides: ["background", "background", "method", "method", "method", "related_work", "related_work", "experiments", "experiments", "experiments", "limitations"].map((section) => ({ section, title: section })),
  }, paper, 12), /outside the required evidence order/);
});
