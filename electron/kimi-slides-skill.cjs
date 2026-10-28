const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runAgent } = require("./agent.cjs");

const KIMI_SLIDES_SKILL = Object.freeze({
  id: "paper-presentation",
  name: "Academic paper presentation",
  description: "Plans a source-grounded, editable academic presentation from the saved review without changing that review.",
  version: 3,
});

const PRESENTATION_SECTIONS = Object.freeze([
  { id: "background", label: "Background" },
  { id: "related_work", label: "Related work" },
  { id: "method", label: "Method" },
  { id: "experiments", label: "Experiments" },
  { id: "limitations", label: "Limitations" },
]);

const LAYOUTS = new Set(["outline", "editorial", "figure-led", "split", "process", "comparison", "metrics", "boundaries"]);
const VISUAL_KINDS = new Set(["source", "outline", "process", "comparison", "metrics", "boundaries"]);
const SOURCE_KINDS = new Set(["figure", "table", "diagram", "text", "page"]);
const SOURCE_FOCUS = new Set(["full", "top", "middle", "bottom", "left", "right"]);

const KIMI_SLIDES_FALLBACK = `Kimi Slides academic workflow:
- Plan the whole deck before writing individual slides. Reading only the titles should reveal the complete argument.
- Use a restrained academic page skeleton, high information density at readable sizes, and one evidence unit per slide.
- Prefer the paper's figures, tables, equations, and system diagrams over decorative imagery.
- Use asymmetric compositions, thin rules, fixed baselines, and compact citations. Do not use cards, dashboard grids, gradients, or marketing slogans.
- Keep figures self-contained and tightly cropped. Every quantitative claim must appear beside its supporting evidence.
- Start with an outline, then present background, related work, method, experiments, limitations, and conclusions in a stable order.
- Validate narrative continuity, evidence coverage, text fit, image crops, and visual rhythm before returning.`;

function candidateSkillRoots() {
  return [
    process.env.KIMI_SLIDES_SKILL_PATH,
    path.join(os.homedir(), "Downloads", "kimi-slides-docs"),
    path.join(__dirname, "..", "kimi-slides-docs"),
  ].filter(Boolean);
}

function loadKimiSlidesGuidance() {
  const names = [
    "SKILL.md",
    "reference/slides_categories.md",
    "reference/slides_categories/academic-research.md",
    "reference/design_system/academic/paper-white-courseware/design.md",
  ];
  for (const root of candidateSkillRoots()) {
    const sections = [];
    let complete = true;
    for (const name of names) {
      try {
        sections.push(`## ${name}\n${fs.readFileSync(path.join(root, name), "utf8")}`);
      } catch {
        complete = false;
        break;
      }
    }
    if (complete) return sections.join("\n\n").slice(0, 58_000);
  }
  return KIMI_SLIDES_FALLBACK;
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

const GENERIC_SOURCE_PANELS = /^(?:全[图表]|整[图表]|full(?:\s+(?:figure|table|page))?|all|entire|whole(?:\s+(?:figure|table))?)$/i;

function cleanSourcePanel(value) {
  const panel = clipped(value, 28);
  return GENERIC_SOURCE_PANELS.test(panel) ? "" : panel;
}

function cleanSourceLabel(value, page) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const section = raw.match(/§\s*[^·;|]+/)?.[0]?.trim() || "";
  const pages = [...raw.matchAll(/(?:PDF\s*)?pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi)];
  let first = Math.max(1, Number(page) || 1);
  let last = first;
  if (pages.length) {
    first = Math.max(1, Number(pages[0][1]) || first);
    const finalPage = pages.at(-1);
    last = Math.max(first, Number(finalPage[2] || finalPage[1]) || first);
  }
  return clipped([last > first ? `PDF pp. ${first}–${last}` : `PDF p. ${first}`, section].filter(Boolean).join(" · "), 120);
}

function reviewDossier(review) {
  const reports = Array.isArray(review?.specialists) ? review.specialists : [];
  return [
    `## Evidence audit\n${String(review?.audit || "No separate audit note was saved.").slice(0, 8_000)}`,
    ...reports.map((report) => `## ${report.title || report.id}\n${String(report.response || "").slice(0, 12_000)}`),
    `## Research memorandum\n${String(review?.summary || "").slice(0, 14_000)}`,
  ].join("\n\n");
}

function hasUsableReview(review) {
  return Boolean(review?.summary && Array.isArray(review.specialists) && review.specialists.length);
}

function kimiSlidesPrompt(paper, review, pageCount, language = "zh") {
  const presentationLanguage = language === "en" ? "English" : "Simplified Chinese";
  const reviewAvailable = hasUsableReview(review);
  const planningSource = reviewAvailable
    ? "A saved review is available. Use it only as a map of claims, caveats, and disputed evidence; it is never a substitute for the original paper."
    : "No saved review is available. Build the evidence map directly from the original paper PDF. Do not infer an audit, critique, or result that the paper itself does not support.";
  const reviewContext = reviewAvailable
    ? `SAVED REVIEW (planning aid only; never alter it):\n${reviewDossier(review)}`
    : "SAVED REVIEW: none. The original paper PDF is the only source of evidence for this deck.";
  return `You are planning a ${presentationLanguage} academic lab-meeting deck that will be generated as an editable PowerPoint file. Read the ORIGINAL PAPER. ${planningSource} This presentation is an independent output: never alter the saved review. Write all titles, leads, bullets, takeaways, and speaker notes in ${presentationLanguage}.

Return a source-grounded CONTENT PLAN as JSON. This is an intermediate plan, not the visible slide format. A native renderer will apply the academic templates, crop original evidence, and build the editable deck. Preserve the source skill's planning, academic narrative, evidence selection, typography, density, and validation rules.

<kimi_slides_methodology>
${loadKimiSlidesGuidance()}
</kimi_slides_methodology>

Reference-quality target observed in the supplied Kimi deck:
- Target 15 slides total: one cover rendered by the UI plus exactly 14 content slides.
- Warm ivory paper, dark ink, restrained forest green structure, and sparse ochre accents. Use MiSans-like sans typography, never advertising-style display text.
- Fixed skeleton: small section marker, restrained claim title, thin rule, dense but readable evidence body, and page number. No cards, pills, shadows, decorative circles, or oversized slogans.
- The first content slide is an outline. Later pages alternate among dense editorial explanations, large paper figures with analysis, technical processes, equations, benchmark tables, and result charts.
- Match the supplied deck's information density: 2-5 meaningful modules per slide. A planned region must contain real content; do not leave a huge empty text or image area.

Evidence workflow:
1. Call read_attached_paper_pdf repeatedly in consecutive ranges of at most 24 pages until all ${pageCount || "available"} pages have been read.
2. Internally build a claim-to-source ledger. Every claim, value, baseline, and limitation must be bounded by a source page, figure, table, or section.
3. Call inspect_pdf_page on every page whose figure or table will appear. Give source.crop as a normalized rectangle tightly bounded to the evidence itself, excluding page margins, headers, footers, body prose, and page numbers.
4. Prefer original composite figures/tables that already communicate a complete result. Do not use a text-heavy full PDF page as an image.
5. Before returning, perform Kimi-style checks for title continuity, evidence coverage, crop quality, density, text fit, and repeated layouts.

Narrative and page plan:
- Keep this order: Background -> Related work -> Method -> Experiments -> Limitations.
- Return exactly 14 CONTENT slides. Slide 1 is an outline classified as background.
- Recommended distribution including the outline: Background 3, Related work 2, Method 4, Experiments 4, Limitations 1. Adjust by at most one slide only when the paper's evidence requires it.
- Each title states the page's actual subject or a source-supported finding. Reading the titles alone must tell the full paper story.
- Use the saved review's language. Avoid slogans, rhetorical questions, vague abstractions, and the pattern “not X, but Y.”
- title <= 72 characters; lead <= 240; 2-5 bullets <= 145 each; takeaway <= 150. Do not invent speaker notes.

Layout contract:
- outline: five-section reading route plus one concise core thread. visual.kind=outline with 5 items.
- editorial: dense conceptual or mathematical explanation without a decorative source image. Use visual items and bullets as unequal columns.
- figure-led: one decisive original figure/table occupies 55%-70% of the body, with short analysis beside it.
- split: a tightly cropped source and an interpretation column.
- process: ordered mechanism or training stages. visual.items are stages.
- comparison: prior work, baselines, or alternatives aligned by a real comparison axis.
- metrics: exact source-supported results. Pair values with dataset/setting and comparison meaning.
- boundaries: limitations, supported scope, failure modes, and next tests.
- Do not repeat one layout more than twice in succession. Do not default to equal thirds or 2x2 grids.
- source.label contains only a page/section reference. Never repeat the figure/table name there and never write 全图/全表.

Return ONLY valid JSON:
{"title":"paper title","subtitle":"one-line contribution","source_sufficiency":"full-paper|partial-paper|review-grounded","slides":[
{"section":"background|related_work|method|experiments|limitations","layout":"outline|editorial|figure-led|split|process|comparison|metrics|boundaries","title":"specific subject or bounded finding","lead":"short framing sentence","bullets":["..."],"takeaway":"one restrained conclusion","speaker_notes":"","source":{"page":1,"label":"PDF p. 1 · §1 Introduction","kind":"figure|table|diagram|text|page","figure":"Fig. 1","panel":"a-b","focus":"full","crop":{"x":0.05,"y":0.18,"width":0.9,"height":0.55}},"visual":{"kind":"source|outline|process|comparison|metrics|boundaries","items":[{"label":"...","value":"...","detail":"..."}]}}
]}

Paper: ${paper.title}
Authors: ${(paper.authors || []).join(", ") || "Unknown"}
Venue/year: ${paper.venue || "Unknown"} · ${paper.year || "n.d."}
Indexed PDF pages: ${pageCount || "unknown"}

${reviewContext}`;
}

function parseJsonObject(response) {
  const text = String(response || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Kimi Slides did not return a JSON presentation.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Kimi Slides returned invalid JSON. Generate the presentation again.");
  }
}

function normalizeVisualItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 6).map((item) => ({
    label: clipped(item?.label, 58),
    value: clipped(item?.value, 48),
    detail: clipped(item?.detail, 145),
  })).filter((item) => item.label || item.value || item.detail);
}

function normalizeCrop(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || width < .12 || height < .12) return null;
  const left = Math.min(.88, Math.max(0, x));
  const top = Math.min(.88, Math.max(0, y));
  return {
    x: left,
    y: top,
    width: Math.min(1 - left, Math.max(.12, width)),
    height: Math.min(1 - top, Math.max(.12, height)),
  };
}

function normalizeSlide(input, pageCount, index) {
  const section = PRESENTATION_SECTIONS.find((candidate) => candidate.id === input?.section)?.id;
  if (!section) throw new Error(`Slide ${index + 1} has an unsupported section.`);
  const bullets = Array.isArray(input.bullets)
    ? input.bullets.map((bullet) => clipped(bullet, 145)).filter(Boolean).slice(0, 5)
    : [];
  const source = input.source && typeof input.source === "object" ? input.source : {};
  const visual = input.visual && typeof input.visual === "object" ? input.visual : {};
  const page = clampPage(source.page ?? input.page, pageCount);
  const layout = LAYOUTS.has(input.layout) ? input.layout : section === "method" ? "editorial" : section === "experiments" ? "figure-led" : section === "limitations" ? "boundaries" : "split";
  const kind = VISUAL_KINDS.has(visual.kind) ? visual.kind : layout === "outline" ? "outline" : layout === "figure-led" || layout === "split" ? "source" : layout === "editorial" ? "comparison" : layout;
  return {
    id: clipped(input.id || `${section}-${index + 1}`, 64),
    section,
    layout,
    title: clipped(input.title || PRESENTATION_SECTIONS.find((candidate) => candidate.id === section)?.label, 72),
    lead: clipped(input.lead ?? input.summary, 240),
    bullets,
    takeaway: clipped(input.takeaway, 150),
    speaker_notes: "",
    source: {
      page,
      label: cleanSourceLabel(source.label, page),
      kind: SOURCE_KINDS.has(source.kind) ? source.kind : "page",
      figure: clipped(source.figure, 42),
      panel: cleanSourcePanel(source.panel),
      focus: SOURCE_FOCUS.has(source.focus) ? source.focus : "full",
      crop: normalizeCrop(source.crop),
    },
    visual: { kind, items: normalizeVisualItems(visual.items) },
    page,
  };
}

function normalizeKimiSlidesPresentation(value, paper, pageCount) {
  if (!value || typeof value !== "object") throw new Error("A presentation object is required.");
  const inputSlides = Array.isArray(value.slides) ? value.slides.slice(0, 15) : [];
  if (inputSlides.length < 12) throw new Error("Kimi Slides returned fewer than 12 content slides.");
  const slides = inputSlides.map((slide, index) => normalizeSlide(slide, pageCount, index));
  if (slides[0]?.layout !== "outline") throw new Error("Kimi Slides did not start with the required presentation outline.");
  const order = new Map(PRESENTATION_SECTIONS.map((section, index) => [section.id, index]));
  let previous = -1;
  for (const slide of slides) {
    const current = order.get(slide.section);
    if (current < previous) throw new Error("Kimi Slides returned slides outside the required evidence order.");
    previous = current;
  }
  for (const section of PRESENTATION_SECTIONS) {
    if (!slides.some((slide) => slide.section === section.id)) throw new Error(`Kimi Slides is missing its ${section.label} section.`);
  }
  return {
    skill: { ...KIMI_SLIDES_SKILL },
    title: clipped(value.title || paper.title, 180),
    subtitle: clipped(value.subtitle, 220),
    source_sufficiency: ["full-paper", "partial-paper", "review-grounded"].includes(value.source_sufficiency) ? value.source_sufficiency : "review-grounded",
    slides,
  };
}

function parseKimiSlidesPresentation(response, paper, pageCount) {
  return normalizeKimiSlidesPresentation(parseJsonObject(response), paper, pageCount);
}

async function runPaperPresentationPlan({ paper, review = null, pageCount, workspace, projectId, contextItems, reasoningEffort, contextLength, browser, language = "zh" }) {
  const run = await runAgent({
    prompt: kimiSlidesPrompt(paper, review, pageCount, language),
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
  if (run.status !== "completed") throw new Error(run.response || "Kimi Slides did not complete.");
  return { presentation: parseKimiSlidesPresentation(run.response, paper, pageCount), run, sourceMode: hasUsableReview(review) ? "review" : "paper" };
}

async function runKimiSlidesPlan(args) {
  if (!hasUsableReview(args?.review)) {
    throw new Error("Finish and save the evidence review before using the review-grounded presentation path.");
  }
  return runPaperPresentationPlan(args);
}

module.exports = {
  KIMI_SLIDES_SKILL,
  PRESENTATION_SECTIONS,
  kimiSlidesPrompt,
  loadKimiSlidesGuidance,
  normalizeKimiSlidesPresentation,
  parseKimiSlidesPresentation,
  runPaperPresentationPlan,
  runKimiSlidesPlan,
  // Kept for extension code that still imports the older function name.
  runKimiSlidesPresentation: runKimiSlidesPlan,
};
