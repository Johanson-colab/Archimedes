const { runAgent } = require("./agent.cjs");

const PAPER_PRESENTATION_SKILL = Object.freeze({
  id: "paper-presentation",
  name: "Paper presentation",
  description: "Turns a saved evidence review into a compact lab-meeting slide narrative without changing the review itself.",
  version: 1,
});

const PRESENTATION_SECTIONS = Object.freeze([
  { id: "background", label: "Background" },
  { id: "related_work", label: "Related work" },
  { id: "method", label: "Method" },
  { id: "experiments", label: "Experiments" },
  { id: "limitations", label: "Limitations" },
]);

function clipped(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit + 1).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function clampPage(value, pageCount) {
  const page = Number.parseInt(value, 10);
  return Math.min(Math.max(1, Number.isFinite(page) ? page : 1), Math.max(1, Number(pageCount) || 1));
}

function reviewDossier(review) {
  const reports = Array.isArray(review?.specialists) ? review.specialists : [];
  return [
    `## Evidence audit\n${String(review?.audit || "No separate audit note was saved.").slice(0, 8_000)}`,
    ...reports.map((report) => `## ${report.title || report.id}\n${String(report.response || "").slice(0, 12_000)}`),
    `## Research memorandum\n${String(review?.summary || "").slice(0, 14_000)}`,
  ].join("\n\n");
}

function paperPresentationPrompt(paper, review, pageCount) {
  return `You are Archimedes' built-in Paper Presentation skill. Convert the SAVED, COMPLETED evidence review below into a restrained academic lab-meeting presentation. This is a second-stage transformation: do not review the paper again, do not alter the source review, and do not add unsupported claims.

The presentation has one cover followed by EXACTLY five content slides in this order:
Background -> Related work -> Method -> Experiments -> Limitations.

Editorial rules:
- Write compact slide copy, not paragraphs and not marketing language.
- Each slide needs one precise takeaway, two to four concise bullets, and one PDF page to show as visual evidence.
- Prefer pages explicitly cited in the saved review. Keep uncertainty and caveats.
- Title <= 78 characters; summary <= 260 characters; each bullet <= 150 characters; takeaway <= 180 characters.
- Use the language already used by the saved review.

Return ONLY valid JSON with this exact shape:
{"title":"paper title","subtitle":"one-line contribution","slides":[
{"section":"background","title":"...","summary":"...","bullets":["..."],"takeaway":"...","page":1},
{"section":"related_work","title":"...","summary":"...","bullets":["..."],"takeaway":"...","page":1},
{"section":"method","title":"...","summary":"...","bullets":["..."],"takeaway":"...","page":1},
{"section":"experiments","title":"...","summary":"...","bullets":["..."],"takeaway":"...","page":1},
{"section":"limitations","title":"...","summary":"...","bullets":["..."],"takeaway":"...","page":1}
]}

Paper: ${paper.title}
Authors: ${(paper.authors || []).join(", ") || "Unknown"}
Venue/year: ${paper.venue || "Unknown"} · ${paper.year || "n.d."}
Indexed PDF pages: ${pageCount || "unknown"}

SAVED REVIEW (the only analytical source):
${reviewDossier(review)}`;
}

function parseJsonObject(response) {
  const text = String(response || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The presentation skill did not return a JSON presentation.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The presentation skill returned invalid JSON. Run the presentation again.");
  }
}

function normalizePaperPresentation(value, paper, pageCount) {
  if (!value || typeof value !== "object") throw new Error("A presentation object is required.");
  const inputSlides = Array.isArray(value.slides) ? value.slides : [];
  const slides = PRESENTATION_SECTIONS.map((section) => {
    const input = inputSlides.find((slide) => slide?.section === section.id);
    if (!input) throw new Error(`The presentation is missing its ${section.label} slide.`);
    const bullets = Array.isArray(input.bullets)
      ? input.bullets.map((bullet) => clipped(bullet, 150)).filter(Boolean).slice(0, 4)
      : [];
    if (bullets.length < 2) throw new Error(`The ${section.label} slide needs at least two concise points.`);
    return {
      section: section.id,
      title: clipped(input.title || section.label, 78),
      summary: clipped(input.summary, 260),
      bullets,
      takeaway: clipped(input.takeaway, 180),
      page: clampPage(input.page, pageCount),
    };
  });
  return {
    skill: { ...PAPER_PRESENTATION_SKILL },
    title: clipped(value.title || paper.title, 180),
    subtitle: clipped(value.subtitle, 220),
    slides,
  };
}

function parsePaperPresentation(response, paper, pageCount) {
  return normalizePaperPresentation(parseJsonObject(response), paper, pageCount);
}

async function runPaperPresentation({ paper, review, pageCount, workspace, projectId, contextItems, reasoningEffort, contextLength, browser }) {
  if (!review?.summary || !Array.isArray(review.specialists) || !review.specialists.length) {
    throw new Error("Finish and save the evidence review before generating a presentation.");
  }
  const run = await runAgent({
    prompt: paperPresentationPrompt(paper, review, pageCount),
    workspace,
    projectId,
    mode: "paper-review",
    reasoningEffort,
    contextLength,
    contextItems,
    browser,
    transient: true,
    emit: () => {},
  });
  if (run.status !== "completed") throw new Error(run.response || "The presentation skill did not complete.");
  return { presentation: parsePaperPresentation(run.response, paper, pageCount), run };
}

module.exports = {
  PAPER_PRESENTATION_SKILL,
  PRESENTATION_SECTIONS,
  normalizePaperPresentation,
  paperPresentationPrompt,
  parsePaperPresentation,
  runPaperPresentation,
};
