const fs = require("node:fs");
const path = require("node:path");
const { runAgent } = require("./agent.cjs");

const PAPER_PRESENTATION_SKILL = Object.freeze({
  id: "paper-presentation",
  name: "Paper2PPT presentation",
  description: "Applies Paper2PPT's evidence-first workflow to a saved review and the original paper without changing the review itself.",
  version: 2,
});

const PRESENTATION_SECTIONS = Object.freeze([
  { id: "background", label: "Background" },
  { id: "related_work", label: "Related work" },
  { id: "method", label: "Method" },
  { id: "experiments", label: "Experiments" },
  { id: "limitations", label: "Limitations" },
]);

const LAYOUTS = new Set(["figure-led", "split", "process", "comparison", "metrics", "boundaries"]);
const VISUAL_KINDS = new Set(["source", "process", "comparison", "metrics", "boundaries"]);
const SOURCE_KINDS = new Set(["figure", "table", "diagram", "text", "page"]);
const SOURCE_FOCUS = new Set(["full", "top", "middle", "bottom", "left", "right"]);

const PAPER2PPT_FALLBACK = `Paper2PPT evidence-first rules:
- Establish source sufficiency before drafting.
- Build a claim-to-source map and reject or narrow unsupported claims.
- Use one bounded claim per slide and a conclusion-style title.
- Treat figures and tables as evidence, not decoration.
- Preserve uncertainty, labels, scales, statistics, and qualifiers.
- Choose geometry from the evidence: figure-led, asymmetric split, process, comparison, metrics, or boundaries.
- Keep source labels legible and put explanatory depth in speaker notes.
- Avoid decorative stock imagery, dashboard styling, ornamental containers, and rigid repeated 50/50 layouts.`;

function loadPaper2PptGuidance() {
  const root = path.join(__dirname, "..", "paper2ppt");
  const names = ["SKILL.md", "references/workflow.md", "references/paper-types.md", "references/slide-design.md", "references/quality-gates.md"];
  const sections = [];
  for (const name of names) {
    try {
      sections.push(`## ${name}\n${fs.readFileSync(path.join(root, name), "utf8")}`);
    } catch {
      return PAPER2PPT_FALLBACK;
    }
  }
  return sections.join("\n\n").slice(0, 42_000);
}

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
  return `You are Archimedes' built-in Paper2PPT adapter. Build an evidence-led academic lab-meeting presentation from the ORIGINAL PAPER, using the saved review as a map of claims and caveats. This is a separate output: never alter the saved review.

Follow the Paper2PPT methodology below for evidence reasoning, source integrity, narrative design, and adaptive slide geometry. Its file-output contract is overridden here: return the JSON contract at the end instead of creating files.

<paper2ppt_methodology>
${loadPaper2PptGuidance()}
</paper2ppt_methodology>

Required evidence workflow:
1. Call read_attached_paper_pdf repeatedly in consecutive ranges of at most 24 pages until all ${pageCount || "available"} pages have been read. The saved review is a lead, not a substitute for the original paper.
2. Internally build a claim-to-source ledger. Every slide claim must be bounded by a PDF page, figure, table, or section.
3. When a decisive figure or table matters and a public PDF URL is available, call inspect_pdf_page on that page before selecting its focus region.
4. Preserve uncertainty and distinguish measured evidence from author interpretation and reader synthesis.
5. Before returning, audit every slide against its source anchor and remove unsupported values, causal wording, or decorative visuals.

Narrative contract:
- Keep this section order: Background -> Related work -> Method -> Experiments -> Limitations.
- Produce 7-11 CONTENT slides in that order; the UI adds the cover separately.
- Every section appears at least once. Use 2-4 Experiments slides when evidence warrants it.
- One main claim per slide. Use conclusion-style titles, not section labels.
- Prefer a source figure/table over prose. Do not select a text-heavy PDF page merely because it contains the cited sentence.
- Use the language already used by the saved review.
- title <= 88 characters; lead <= 210; 1-4 bullets <= 125 each; takeaway <= 170; speaker_notes <= 520.

Adaptive layout contract:
- figure-led: one decisive figure/table dominates the slide.
- split: source evidence plus a short interpretation.
- process: ordered method stages; visual.items are the stages.
- comparison: aligned alternatives/baselines; visual.items are the compared entries.
- metrics: quantitative result; visual.items contain exact source-supported values.
- boundaries: supported / not established / next validation; visual.items contain those groups.
- Do not repeat one layout more than twice in succession.
- source.focus is a coarse fallback: full, top, middle, bottom, left, or right.
- After inspecting a decisive page, source.crop may give a normalized figure/table rectangle {x,y,width,height}, each from 0 to 1. Never guess a precise crop without visual inspection.

Return ONLY valid JSON:
{"title":"paper title","subtitle":"one-line contribution","source_sufficiency":"full-paper|partial-paper|review-grounded","slides":[
{"section":"background|related_work|method|experiments|limitations","layout":"figure-led|split|process|comparison|metrics|boundaries","title":"bounded conclusion","lead":"short framing sentence","bullets":["..."],"takeaway":"...","speaker_notes":"Evidence, qualifier, limitation, and transition.","source":{"page":1,"label":"PDF p. 1 · §1 Introduction","kind":"figure|table|diagram|text|page","figure":"Fig. 1","panel":"a-b","focus":"full","crop":{"x":0.05,"y":0.18,"width":0.9,"height":0.55}},"visual":{"kind":"source|process|comparison|metrics|boundaries","items":[{"label":"...","value":"...","detail":"..."}]}}
]}

Paper: ${paper.title}
Authors: ${(paper.authors || []).join(", ") || "Unknown"}
Venue/year: ${paper.venue || "Unknown"} · ${paper.year || "n.d."}
Indexed PDF pages: ${pageCount || "unknown"}

SAVED REVIEW:
${reviewDossier(review)}`;
}

function parseJsonObject(response) {
  const text = String(response || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Paper2PPT did not return a JSON presentation.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Paper2PPT returned invalid JSON. Generate the presentation again.");
  }
}

function normalizeVisualItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 6).map((item) => ({
    label: clipped(item?.label, 54),
    value: clipped(item?.value, 42),
    detail: clipped(item?.detail, 115),
  })).filter((item) => item.label || item.value || item.detail);
}

function normalizeCrop(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || width < .18 || height < .18) return null;
  const left = Math.min(.82, Math.max(0, x));
  const top = Math.min(.82, Math.max(0, y));
  return {
    x: left,
    y: top,
    width: Math.min(1 - left, Math.max(.18, width)),
    height: Math.min(1 - top, Math.max(.18, height)),
  };
}

function normalizeSlide(input, pageCount, index) {
  const section = PRESENTATION_SECTIONS.find((candidate) => candidate.id === input?.section)?.id;
  if (!section) throw new Error(`Slide ${index + 1} has an unsupported section.`);
  const bullets = Array.isArray(input.bullets)
    ? input.bullets.map((bullet) => clipped(bullet, 125)).filter(Boolean).slice(0, 4)
    : [];
  const source = input.source && typeof input.source === "object" ? input.source : {};
  const visual = input.visual && typeof input.visual === "object" ? input.visual : {};
  const page = clampPage(source.page ?? input.page, pageCount);
  const layout = LAYOUTS.has(input.layout) ? input.layout : section === "method" ? "process" : section === "experiments" ? "figure-led" : section === "limitations" ? "boundaries" : "split";
  const kind = VISUAL_KINDS.has(visual.kind) ? visual.kind : layout === "figure-led" || layout === "split" ? "source" : layout;
  return {
    id: clipped(input.id || `${section}-${index + 1}`, 64),
    section,
    layout,
    title: clipped(input.title || PRESENTATION_SECTIONS.find((candidate) => candidate.id === section)?.label, 88),
    lead: clipped(input.lead ?? input.summary, 210),
    bullets,
    takeaway: clipped(input.takeaway, 170),
    speaker_notes: clipped(input.speaker_notes, 520),
    source: {
      page,
      label: clipped(source.label || `PDF p. ${page}`, 120),
      kind: SOURCE_KINDS.has(source.kind) ? source.kind : "page",
      figure: clipped(source.figure, 42),
      panel: clipped(source.panel, 28),
      focus: SOURCE_FOCUS.has(source.focus) ? source.focus : "full",
      crop: normalizeCrop(source.crop),
    },
    visual: { kind, items: normalizeVisualItems(visual.items) },
    page,
  };
}

function normalizePaperPresentation(value, paper, pageCount) {
  if (!value || typeof value !== "object") throw new Error("A presentation object is required.");
  const inputSlides = Array.isArray(value.slides) ? value.slides.slice(0, 12) : [];
  if (inputSlides.length < 7) throw new Error("Paper2PPT returned too few slides to cover the evidence arc.");
  const slides = inputSlides.map((slide, index) => normalizeSlide(slide, pageCount, index));
  const order = new Map(PRESENTATION_SECTIONS.map((section, index) => [section.id, index]));
  let previous = -1;
  for (const slide of slides) {
    const current = order.get(slide.section);
    if (current < previous) throw new Error("Paper2PPT returned slides outside the required evidence order.");
    previous = current;
  }
  for (const section of PRESENTATION_SECTIONS) {
    if (!slides.some((slide) => slide.section === section.id)) throw new Error(`Paper2PPT is missing its ${section.label} section.`);
  }
  return {
    skill: { ...PAPER_PRESENTATION_SKILL },
    title: clipped(value.title || paper.title, 180),
    subtitle: clipped(value.subtitle, 220),
    source_sufficiency: ["full-paper", "partial-paper", "review-grounded"].includes(value.source_sufficiency) ? value.source_sufficiency : "review-grounded",
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
  if (run.status !== "completed") throw new Error(run.response || "Paper2PPT did not complete.");
  return { presentation: parsePaperPresentation(run.response, paper, pageCount), run };
}

module.exports = {
  PAPER_PRESENTATION_SKILL,
  PRESENTATION_SECTIONS,
  loadPaper2PptGuidance,
  normalizePaperPresentation,
  paperPresentationPrompt,
  parsePaperPresentation,
  runPaperPresentation,
};
