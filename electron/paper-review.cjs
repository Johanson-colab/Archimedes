const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const modelConfig = require("./model-config.cjs");
const model = require("./paper-review-model.cjs");
const pipeline = require("./paper-review-pipeline.cjs");
const settingsStore = require("./paper-review-settings.cjs");
const store = require("./paper-review-store.cjs");
const libraryStore = require("./store.cjs");
const venues = require("./paper-review-venues.cjs");
const { extractPdfPagesData } = require("./agent/pdf-reader.cjs");
const { fetchPublicPdf } = require("./agent/remote-content.cjs");
const { preparePaperReader } = require("./library-reader.cjs");

/**
 * Paper review micro app orchestration.
 *
 * The renderer only sees settings, venue metadata, run summaries and review
 * results. PDF text and API keys stay in the main process. Every run is stored
 * locally with its venue pack version, model, score distribution and trace.
 */

const PDF_DIR_NAME = "paper-review";
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const activeRuns = new Map();

let userDataPath = "";
let pdfDir = "";

function initialize(pathValue) {
  userDataPath = pathValue;
  pdfDir = path.join(userDataPath, PDF_DIR_NAME, "pdfs");
  fs.mkdirSync(pdfDir, { recursive: true });
  settingsStore.initialize(userDataPath);
  store.initialize(userDataPath);
  store.markInterrupted();
  // Load and validate every pack at startup so a bad pack is a visible error
  // rather than a surprise halfway through a review.
  venues.listVenues();
  return { initialized: true, venueCount: venues.publicVenues().length };
}

function getSettings() {
  return {
    ...settingsStore.getPublicSettings(),
    agentModel: modelConfig.getPublicModelConfig("agent"),
  };
}

function saveSettings(patch = {}) {
  return {
    ...settingsStore.saveSettings(patch),
    agentModel: modelConfig.getPublicModelConfig("agent"),
  };
}

function listVenues() {
  return venues.publicVenues();
}

function guessTitle(pages, fallback) {
  const first = String(pages?.[0]?.text || "").split("\n").map((line) => line.trim()).filter((line) => line.length > 8).slice(0, 4);
  if (!first.length) return fallback;
  const candidate = first.find((line) => !/^arxiv|^preprint|^under review|^published as/i.test(line)) || first[0];
  return candidate.slice(0, 240) || fallback;
}

function cachePdf(data) {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const outputPath = path.join(pdfDir, `${sha256}.pdf`);
  if (!fs.existsSync(outputPath)) fs.writeFileSync(outputPath, data);
  return { sha256, path: outputPath };
}

function verifyPdf(data) {
  if (!Buffer.isBuffer(data) || data.length < 5) throw new Error("The selected file is empty.");
  if (data.length > MAX_PDF_BYTES) throw new Error("The PDF is larger than the 100 MB library limit.");
  if (data.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("The selected source did not contain a PDF document.");
}

function parsedDocument({ id, sourceKind, sourceRef, title, index }) {
  const pages = (index.pages || []).map((page) => ({ page: Number(page.page_number) || 1, text: String(page.text || "") }));
  store.saveDocument({
    id,
    sourceKind,
    sourceRef,
    title: title || "Untitled paper",
    pageCount: Number(index.page_count) || pages.length,
    pages,
  });
  const saved = store.getDocument(id);
  return saved;
}

async function prepareLibraryDocument({ paperId, workspace, projectId, signal, emit = () => {} }) {
  if (typeof paperId !== "string" || !paperId) throw new Error("Choose a paper from the Library.");
  const paper = libraryStore.getPaper(paperId);
  if (!paper) throw new Error("The selected Library paper no longer exists.");
  let reader = libraryStore.getPaperReader(paperId, projectId);
  if (!reader?.asset || reader.asset.status !== "ready" || !reader.pages?.length) {
    if (!workspace) throw new Error("Open a project folder before preparing a Library paper for review.");
    emit({ type: "prepare", detail: "Indexing the Library PDF for review." });
    const asset = await preparePaperReader({ workspace, paper, signal });
    libraryStore.replacePaperReaderAsset(paperId, asset);
    reader = libraryStore.getPaperReader(paperId, projectId);
  }
  if (signal?.aborted) throw new Error("Paper review was cancelled.");
  if (!reader?.pages?.length) throw new Error("The Library paper has no readable pages. Attach a text-based PDF and try again.");
  const id = createHash("sha256").update(`library:${paper.id}:${reader.asset?.sha256 || reader.pages.length}`).digest("hex");
  const pages = reader.pages.map((page) => ({ page: Number(page.page_number) || 1, text: String(page.text || "") }));
  store.saveDocument({
    id,
    sourceKind: "library",
    sourceRef: paper.url || paper.arxiv_id || paper.id,
    title: paper.title || "Untitled paper",
    pageCount: Number(reader.asset?.page_count) || pages.length,
    pages,
  });
  return store.getDocument(id);
}

function parseArxivRef(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const match = source.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?\s*([0-9]{4}\.[0-9]{4,5})(?:v\d+)?/i);
  return match ? match[1] : "";
}

async function prepareArxivDocument({ value, signal, emit = () => {} }) {
  const arxivId = parseArxivRef(value);
  if (!arxivId) throw new Error("Enter a valid arXiv ID or URL, for example 2511.05421.");
  emit({ type: "prepare", detail: `Downloading arXiv:${arxivId}.` });
  const result = await fetchPublicPdf(`https://arxiv.org/pdf/${arxivId}`, signal);
  verifyPdf(result.data);
  const cached = cachePdf(result.data);
  emit({ type: "prepare", detail: "Extracting page text from the arXiv PDF." });
  const index = await extractPdfPagesData(result.data, `${arxivId}.pdf`, { signal });
  const title = guessTitle(index.pages, `arXiv:${arxivId}`);
  return parsedDocument({
    id: `arxiv:${cached.sha256}`,
    sourceKind: "arxiv",
    sourceRef: `https://arxiv.org/abs/${arxivId}`,
    title,
    index,
  });
}

async function preparePdfDocument({ filePath, signal, emit = () => {} }) {
  if (typeof filePath !== "string" || !filePath) throw new Error("Choose a PDF file.");
  const data = fs.readFileSync(filePath);
  verifyPdf(data);
  const cached = cachePdf(data);
  emit({ type: "prepare", detail: "Extracting page text from the PDF." });
  const index = await extractPdfPagesData(data, path.basename(filePath), { signal });
  return parsedDocument({
    id: `pdf:${cached.sha256}`,
    sourceKind: "pdf",
    sourceRef: path.basename(filePath),
    title: guessTitle(index.pages, path.basename(filePath, path.extname(filePath)) || "Untitled paper"),
    index,
  });
}

async function prepareDocument(source = {}, context = {}) {
  const kind = source.kind || "library";
  if (kind === "library") return prepareLibraryDocument({ ...source, ...context });
  if (kind === "arxiv") return prepareArxivDocument({ ...source, ...context });
  if (kind === "pdf") return preparePdfDocument({ ...source, ...context });
  throw new Error(`Unknown paper source: ${kind}`);
}

function publicDocument(document) {
  if (!document) return null;
  return {
    id: document.id,
    title: document.title,
    sourceKind: document.sourceKind,
    sourceRef: document.sourceRef,
    pageCount: document.pageCount,
    textChars: document.textChars,
  };
}

function localPool(venueId, runId, overallScore) {
  const pool = store.scorePool(venueId, runId).map((entry) => entry.overallScore).filter((value) => Number.isFinite(value));
  if (pool.length < 5 || !Number.isFinite(Number(overallScore))) {
    return { samples: pool.length + 1, percentile: null, note: "At least five completed runs in this venue are needed for a local percentile." };
  }
  const value = Number(overallScore);
  const below = pool.filter((entry) => entry < value).length;
  const equal = pool.filter((entry) => entry === value).length;
  return {
    samples: pool.length + 1,
    percentile: Math.round(((below + equal * 0.5) / pool.length) * 100),
    note: "Local runs only; this is not an acceptance probability.",
  };
}

function runCost(result) {
  return Number(result?.usage?.inputTokens || 0) + Number(result?.usage?.outputTokens || 0);
}

function initialRunTitle(input = {}) {
  if (typeof input.title === "string" && input.title.trim()) return input.title.trim();
  const source = input.source || {};
  try {
    if (source.kind === "library" && source.paperId) return libraryStore.getPaper(String(source.paperId))?.title || "";
    if (source.kind === "pdf" && source.filePath) return path.basename(String(source.filePath), path.extname(String(source.filePath)));
    if (source.kind === "arxiv") {
      const id = parseArxivRef(source.value);
      if (id) return `arXiv:${id}`;
    }
  } catch {
    // The Library database may not be open yet; the prepared document will
    // supply the title once ingestion completes.
  }
  return "";
}

async function createRun(input = {}, { emit = () => {}, workspace = "" } = {}) {
  const settings = settingsStore.getPrivateSettings();
  const venue = venues.getVenue(input.venueId || settings.defaultVenueId);
  if (!venue) throw new Error("Choose a valid venue pack.");
  // Resolve the model before creating the run so misconfiguration fails
  // immediately instead of after a long ingest.
  const reviewModel = model.resolveReviewModel(settings);

  const startedAt = Date.now();
  // The run row exists before ingestion so the History panel can show it and
  // the Cancel button can abort a slow PDF download or index.
  const runId = store.createRun({
    documentId: "",
    projectId: input.projectId || "",
    sourceKind: input.source?.kind || "library",
    sourceRef: "",
    paperTitle: initialRunTitle(input) || "Untitled paper",
    venueId: venue.id,
    venueVersion: venue.version,
    modelProvider: reviewModel.provider,
    modelBaseUrl: reviewModel.baseUrl,
    modelId: reviewModel.model,
  });
  const controller = new AbortController();
  const emitForRun = (payload) => {
    try { emit({ runId, ...payload }); } catch { /* the window may have closed */ }
  };
  activeRuns.set(runId, { controller, emit: emitForRun });
  emitForRun({ type: "progress", stage: "started", progress: 1, detail: `${venue.displayName} review started.` });

  const progress = (payload) => {
    if (payload?.type === "prepare") {
      store.updateRun(runId, { stage: "preparing", progress: 2 });
    } else if (payload?.type === "progress" || payload?.progress !== undefined) {
      const patch = {};
      if (payload.stage) patch.stage = payload.stage;
      if (payload.progress !== undefined) patch.progress = payload.progress;
      if (payload.detail) patch.error = "";
      store.updateRun(runId, patch);
    }
    emitForRun(payload);
  };

  void (async () => {
    let document = null;
    try {
      document = await prepareDocument(input.source || {}, {
        workspace,
        projectId: input.projectId,
        signal: controller.signal,
        emit: progress,
      });
      store.attachDocument(runId, {
        documentId: document.id,
        sourceKind: document.sourceKind,
        sourceRef: document.sourceRef,
        paperTitle: input.title || document.title,
      });
      emitForRun({ type: "prepared", stage: "prepared", progress: 4, detail: `Prepared ${document.title}.`, document: publicDocument(document) });

      const result = await pipeline.runPipeline({
        document,
        venue,
        model: reviewModel,
        concurrency: settings.concurrency,
        signal: controller.signal,
        emit: progress,
        startedAt,
      });
      result.localPool = localPool(venue.id, runId, result.review?.overallScore);
      result.document = publicDocument(document);
      store.finishRun(runId, {
        status: "complete",
        result,
        durationMs: Date.now() - startedAt,
        costTokens: runCost(result),
      });
      emitForRun({ type: "complete", stage: "complete", progress: 100, detail: "Review completed." });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled ? "Paper review was cancelled." : error instanceof Error ? error.message : String(error);
      store.finishRun(runId, {
        status: cancelled ? "cancelled" : "error",
        error: message,
        durationMs: Date.now() - startedAt,
        costTokens: 0,
      });
      emitForRun({ type: cancelled ? "cancelled" : "error", stage: cancelled ? "cancelled" : "error", progress: 100, detail: message });
    } finally {
      activeRuns.delete(runId);
    }
  })();

  return {
    runId,
    document: null,
    venue: { id: venue.id, displayName: venue.displayName, version: venue.version },
    model: model.buildModelLabel(reviewModel),
  };
}

function cancelRun(runId) {
  const active = activeRuns.get(String(runId));
  if (!active) return { cancelled: false };
  active.controller.abort(new Error("Paper review was cancelled."));
  active.emit({ type: "cancelled", stage: "cancelled", progress: 100, detail: "Paper review was cancelled." });
  return { cancelled: true };
}

function getRun(runId) {
  return store.getRun(String(runId));
}

function listRuns({ projectId = "", limit = 50 } = {}) {
  return store.listRuns({ projectId, limit });
}

function deleteRun(runId) {
  const active = activeRuns.get(String(runId));
  if (active) active.controller.abort(new Error("Paper review was deleted."));
  return store.deleteRun(String(runId));
}

function listPapers({ projectId = "" } = {}) {
  const projects = projectId
    ? [{ project_id: projectId, name: "" }]
    : libraryStore.listLibraryProjects();
  const papers = [];
  const seen = new Set();
  for (const project of projects) {
    let libraries = [];
    try { libraries = libraryStore.listLibraries(project.project_id); } catch { continue; }
    for (const library of libraries) {
      let rows = [];
      try { rows = libraryStore.listPapers(library.id); } catch { continue; }
      for (const paper of rows) {
        if (seen.has(paper.id)) continue;
        seen.add(paper.id);
        papers.push({
          id: paper.id,
          title: paper.title,
          authors: Array.isArray(paper.authors) ? paper.authors : [],
          year: paper.year,
          venue: paper.venue,
          url: paper.url,
          arxiv_id: paper.arxiv_id,
          pdf_url: paper.pdf_url,
          libraryId: library.id,
          libraryName: library.name,
          projectId: library.project_id,
        });
      }
    }
  }
  return papers.sort((left, right) => String(left.title).localeCompare(String(right.title))).slice(0, 1_000);
}

function findingLines(findings, fallback = "None recorded.") {
  const entries = Array.isArray(findings) ? findings : [];
  if (!entries.length) return [`- ${fallback}`];
  return entries.map((entry) => {
    const text = typeof entry === "string" ? entry : entry.text;
    const page = typeof entry === "object" && entry.page ? ` (p. ${entry.page})` : "";
    return `- ${text}${page}`;
  });
}

function markdownForRun(run) {
  const result = run?.result;
  if (!result) throw new Error("This run has no saved review yet.");
  const venue = venues.getVenue(run.venueId);
  const review = result.review;
  const lines = [];
  lines.push(`# Simulated review — ${run.paperTitle || result.document?.title || "Untitled paper"}`);
  lines.push("");
  lines.push(`> Generated by Archimedes Paper review. This is a simulated conference review, not an official decision and not an acceptance prediction.`);
  lines.push("");
  lines.push(`- Venue: ${venue?.displayName || run.venueId} (pack ${run.venueVersion})`);
  lines.push(`- Model: ${run.model.provider}/${run.model.model}`);
  lines.push(`- Generated: ${run.finishedAt || run.createdAt}`);
  if (review) {
    lines.push(`- Overall: ${review.overallScore}/${venue?.overall.max ?? "?"} (${review.decision})`);
    lines.push(`- Confidence: ${review.confidence}`);
    lines.push(`- Expected outcome: ${review.expectedOutcome || "Not recorded"}`);
    lines.push(`- Desk-reject risk: ${review.deskRejectRisk || "Not recorded"}`);
  }
  lines.push("");
  if (!review) {
    lines.push("## Gate result");
    lines.push("");
    lines.push(result.gate?.reason || "The paper did not pass the preflight gate.");
    return lines.join("\n");
  }
  lines.push("## Summary");
  lines.push("");
  lines.push(review.summary || "No summary recorded.");
  lines.push("");
  lines.push("## Strengths");
  lines.push("");
  lines.push(...findingLines(review.strengths));
  lines.push("");
  lines.push("## Weaknesses");
  lines.push("");
  lines.push(...findingLines(review.weaknesses));
  lines.push("");
  lines.push("## Questions");
  lines.push("");
  lines.push(...findingLines(review.questions));
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  lines.push(...findingLines(review.limitations));
  lines.push("");
  lines.push("## Scores");
  lines.push("");
  lines.push(`| Dimension | Score | Rationale |`);
  lines.push(`|---|---:|---|`);
  for (const dimension of review.subdimensions || []) {
    lines.push(`| ${dimension.label} | ${dimension.score} | ${String(dimension.reason || "").replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  if (review.metaReview) {
    lines.push("## Meta-review");
    lines.push("");
    lines.push(review.metaReview);
    lines.push("");
  }
  if (review.reviewerDisagreement?.length) {
    lines.push("## Reviewer disagreement");
    lines.push("");
    lines.push(...review.reviewerDisagreement.map((entry) => `- ${entry}`));
    lines.push("");
  }
  if (review.consistencyNotes?.length) {
    lines.push("## Calibration notes");
    lines.push("");
    lines.push(...review.consistencyNotes.map((entry) => `- ${entry}`));
    lines.push("");
  }
  if (result.localPool?.percentile !== null && result.localPool?.percentile !== undefined) {
    lines.push(`Local pool: ${result.localPool.percentile}th percentile across ${result.localPool.samples} completed runs in this venue. ${result.localPool.note}`);
    lines.push("");
  }
  lines.push("## Score-conditioned reviews");
  lines.push("");
  for (const reviewer of result.reviewers || []) {
    if (reviewer.status !== "complete") continue;
    lines.push(`### Score ${reviewer.targetScore} — ${reviewer.targetLabel}`);
    lines.push("");
    lines.push(reviewer.summary || "");
    lines.push("");
    if (reviewer.weaknesses?.length) {
      lines.push("Weaknesses:");
      lines.push(...findingLines(reviewer.weaknesses));
      lines.push("");
    }
  }
  lines.push("## Evidence audit");
  lines.push("");
  lines.push(`- Parsed pages: ${result.preflight?.pageCount ?? "?"} (${result.preflight?.pagesWithText ?? "?"} with usable text)`);
  lines.push(`- Prompt-injection signals: ${result.preflight?.injectionSignals?.length ?? 0}`);
  if (result.preflight?.warnings?.length) lines.push(...result.preflight.warnings.map((warning) => `- Warning: ${warning}`));
  return lines.join("\n");
}

function exportRun(runId) {
  const run = store.getRun(String(runId));
  if (!run) throw new Error("The review run was not found.");
  const markdown = markdownForRun(run);
  const safeTitle = String(run.paperTitle || "paper-review").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  return { filename: `${safeTitle} — ${run.venueId}.md`, markdown };
}

function isInitialized() {
  return Boolean(userDataPath);
}

module.exports = {
  initialize,
  getSettings,
  saveSettings,
  listVenues,
  listPapers,
  createRun,
  cancelRun,
  getRun,
  listRuns,
  deleteRun,
  exportRun,
  markdownForRun,
  parseArxivRef,
  isInitialized,
  // exposed for tests
  _localPool: localPool,
  _guessTitle: guessTitle,
};
