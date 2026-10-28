const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KIMI_SLIDES_SKILL,
  kimiSlidesPrompt,
  loadKimiSlidesGuidance,
  normalizeKimiSlidesPresentation,
} = require("./kimi-slides-skill.cjs");

const paper = { title: "A careful paper", authors: ["A. Author"], venue: "TestConf", year: 2026 };
const review = {
  audit: "Claims were checked against source pages.",
  summary: "# Review memorandum\nThe central result is qualified.",
  specialists: [
    { id: "related", title: "Related work", response: "Closest prior work appears on PDF p. 3." },
    { id: "method", title: "Method", response: "The mechanism is shown on PDF p. 5." },
  ],
};

test("presentation planner prepares source-grounded content for native PowerPoint authoring", () => {
  const prompt = kimiSlidesPrompt(paper, review, 24);
  assert.match(prompt, /editable PowerPoint file/);
  assert.match(prompt, /intermediate plan, not the visible slide format/);
  assert.match(prompt, /exactly 14 CONTENT slides/);
  assert.match(prompt, /Reading the titles alone must tell the full paper story/);
  assert.match(prompt, /inspect_pdf_page on every page/);
  assert.match(prompt, /Background -> Related work -> Method -> Experiments -> Limitations/);
  assert.match(loadKimiSlidesGuidance(), /Kimi Slides|Academic Research|academic workflow/i);
  assert.equal(KIMI_SLIDES_SKILL.id, "paper-presentation");
  assert.match(kimiSlidesPrompt(paper, review, 24, "en"), /English academic lab-meeting deck/);
  const directPrompt = kimiSlidesPrompt(paper, null, 24, "en");
  assert.match(directPrompt, /No saved review is available/);
  assert.match(directPrompt, /original paper PDF is the only source of evidence/);
});

test("Kimi Slides adapter normalizes a 15-page academic deck with an outline", () => {
  const sections = ["background", "background", "background", "related_work", "related_work", "method", "method", "method", "method", "experiments", "experiments", "experiments", "experiments", "limitations"];
  const presentation = normalizeKimiSlidesPresentation({
    title: paper.title,
    subtitle: "A bounded contribution.",
    source_sufficiency: "full-paper",
    slides: sections.map((section, index) => ({
      section,
      layout: index === 0 ? "outline" : section === "method" ? "editorial" : section === "experiments" ? "figure-led" : section === "limitations" ? "boundaries" : "split",
      title: index === 0 ? "汇报框架" : `${section} ${index}`,
      lead: `Framing for ${section}`,
      bullets: [`First point for ${section}`, `Second point for ${section}`],
      takeaway: `Takeaway for ${section}`,
      speaker_notes: "The source skill must not add notes.",
      source: { page: index + 1, label: `PDF p. ${index + 1} · Fig. ${index + 1}`, kind: "figure", figure: `Fig. ${index + 1}`, panel: "全图", focus: "top", crop: { x: .08, y: .12, width: .84, height: .62 } },
      visual: { kind: index === 0 ? "outline" : section === "method" ? "comparison" : "source", items: [{ label: "Result", value: "42", detail: "Verified value" }] },
    })),
  }, paper, 24);
  assert.equal(presentation.skill.id, "paper-presentation");
  assert.equal(presentation.skill.version, 3);
  assert.equal(presentation.slides.length, 14);
  assert.equal(presentation.slides[0].layout, "outline");
  assert.equal(presentation.slides[5].layout, "editorial");
  assert.equal(presentation.slides[0].visual.kind, "outline");
  assert.equal(presentation.slides[0].speaker_notes, "");
  assert.equal(presentation.slides[0].source.panel, "");
  assert.equal(presentation.slides[0].source.label, "PDF p. 1");
});

test("Kimi Slides adapter rejects decks without an outline or the complete evidence arc", () => {
  const sections = ["background", "background", "background", "related_work", "related_work", "method", "method", "method", "method", "experiments", "experiments", "limitations"];
  assert.throws(() => normalizeKimiSlidesPresentation({
    slides: sections.map((section) => ({ section, layout: "split", title: section })),
  }, paper, 12), /required presentation outline/);
});
