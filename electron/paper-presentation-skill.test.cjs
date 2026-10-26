const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizePaperPresentation, paperPresentationPrompt } = require("./paper-presentation-skill.cjs");

const paper = { title: "A careful paper", authors: ["A. Author"], venue: "TestConf", year: 2026 };
const review = {
  audit: "Claims were checked against source pages.",
  summary: "# Review memorandum\nThe central result is qualified.",
  specialists: [
    { id: "related", title: "Related work", response: "Closest prior work appears on PDF p. 3." },
    { id: "method", title: "Method", response: "The mechanism is shown on PDF p. 5." },
  ],
};

test("presentation skill is explicitly downstream of the saved review", () => {
  const prompt = paperPresentationPrompt(paper, review, 12);
  assert.match(prompt, /second-stage transformation/);
  assert.match(prompt, /do not review the paper again/);
  assert.match(prompt, /Background -> Related work -> Method -> Experiments -> Limitations/);
  assert.match(prompt, /Closest prior work appears on PDF p\. 3/);
});

test("presentation skill normalizes exactly the fixed five-slide narrative", () => {
  const sections = ["background", "related_work", "method", "experiments", "limitations"];
  const presentation = normalizePaperPresentation({
    title: "A careful paper",
    subtitle: "A compact, evidence-grounded contribution.",
    slides: sections.map((section, index) => ({
      section,
      title: section,
      summary: `Summary for ${section}`,
      bullets: [`First point for ${section}`, `Second point for ${section}`],
      takeaway: `Takeaway for ${section}`,
      page: index === 4 ? 99 : index + 1,
    })),
  }, paper, 12);
  assert.deepEqual(presentation.slides.map((slide) => slide.section), sections);
  assert.equal(presentation.slides.at(-1).page, 12);
  assert.equal(presentation.skill.id, "paper-presentation");
});

test("presentation skill refuses incomplete slide sequences", () => {
  assert.throws(() => normalizePaperPresentation({
    slides: [{ section: "background", title: "Only one", bullets: ["a", "b"] }],
  }, paper, 12), /missing its Related work slide/);
});
