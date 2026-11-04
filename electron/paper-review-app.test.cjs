const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const paperReview = require("./paper-review.cjs");
const paperReviewStore = require("./paper-review-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-app-"));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Best-effort Windows cleanup.
  }
}

const run = {
  id: "run-1",
  paperTitle: "A careful paper",
  venueId: "iclr-2026-main",
  venueVersion: "2026.1",
  createdAt: "2026-11-04T10:00:00.000Z",
  finishedAt: "2026-11-04T10:02:00.000Z",
  model: { provider: "openai", model: "gpt-test" },
  result: {
    document: { title: "A careful paper" },
    gate: { status: "passed" },
    preflight: { pageCount: 8, pagesWithText: 8, injectionSignals: [], warnings: [] },
    paperCard: { summary: "Card" },
    reviewers: [
      { index: 0, targetScore: 3, targetLabel: "Reject", status: "complete", summary: "A skeptical reading.", weaknesses: [{ text: "Small evaluation", page: 6 }] },
      { index: 1, targetScore: 6, targetLabel: "Weak accept", status: "complete", summary: "A balanced reading.", weaknesses: [] },
    ],
    selection: { bestJustified: 1, optimistic: 1, critical: 0, rationale: "Balanced." },
    review: {
      summary: "A synthesized review.",
      strengths: [{ text: "Clear method", page: 3, quote: "method" }],
      weaknesses: [{ text: "Small evaluation", page: 6, quote: "" }],
      questions: [{ text: "Does it scale?", page: 6, quote: "" }],
      limitations: [{ text: "One benchmark", page: 6, quote: "" }],
      reviewerDisagreement: ["The optimistic reviewer weights the method more."],
      metaReview: "A useful study.",
      overallScore: 6,
      calibratedScore: 55.6,
      confidence: 3,
      decision: "Weak accept",
      deskRejectRisk: "low",
      expectedOutcome: "Weak accept · simulated",
      subdimensions: [{ id: "soundness", label: "Soundness", score: 3, reason: "Reasonable." }],
      consistencyNotes: ["Overall and subdimensions agree."],
    },
    localPool: { samples: 6, percentile: 60, note: "Local runs only." },
  },
};

test("arXiv references accept IDs, abs URLs and pdf URLs", () => {
  assert.equal(paperReview.parseArxivRef("2511.05421"), "2511.05421");
  assert.equal(paperReview.parseArxivRef("arXiv:2511.05421v2"), "2511.05421");
  assert.equal(paperReview.parseArxivRef("https://arxiv.org/abs/2511.05421"), "2511.05421");
  assert.equal(paperReview.parseArxivRef("https://arxiv.org/pdf/2511.05421v1.pdf"), "2511.05421");
  assert.equal(paperReview.parseArxivRef("not a paper"), "");
});

test("Markdown export includes scores, evidence and the simulation disclaimer", () => {
  const markdown = paperReview.markdownForRun(run);
  assert.match(markdown, /# Simulated review — A careful paper/);
  assert.match(markdown, /not an official decision/);
  assert.match(markdown, /## Strengths/);
  assert.match(markdown, /Clear method \(p\. 3\)/);
  assert.match(markdown, /\| Soundness \| 3 \| Reasonable\. \|/);
  assert.match(markdown, /## Score-conditioned reviews/);
  assert.match(markdown, /### Score 6 — Weak accept/);
  assert.match(markdown, /Local pool: 60th percentile/);
});

test("a gate result exports a readable reason without inventing a review", () => {
  const failed = {
    ...run,
    result: {
      gate: { status: "failed", reason: "The PDF contained no readable text." },
      preflight: { pageCount: 1, pagesWithText: 0, injectionSignals: [], warnings: [] },
      paperCard: null,
      reviewers: [],
      selection: null,
      review: null,
      trace: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      startedAt: run.createdAt,
      finishedAt: run.finishedAt,
      durationMs: 0,
      venue: {},
      model: "openai/gpt-test",
      simulated: true,
    },
  };
  const markdown = paperReview.markdownForRun(failed);
  assert.match(markdown, /## Gate result/);
  assert.match(markdown, /no readable text/);
  assert.doesNotMatch(markdown, /## Summary/);
});

test("the local score pool stays local and excludes the current run", () => {
  const dir = tempDir();
  try {
    paperReview.initialize(dir);
    const scores = [2, 3, 4, 5, 6];
    for (const score of scores) {
      const id = paperReviewStore.createRun({
        documentId: "doc",
        projectId: "",
        sourceKind: "pdf",
        sourceRef: "paper.pdf",
        paperTitle: "Paper",
        venueId: "acl-2026-main",
        venueVersion: "2026.1",
        modelProvider: "openai",
        modelBaseUrl: "https://api.openai.com/v1",
        modelId: "gpt-test",
      });
      paperReviewStore.finishRun(id, {
        status: "complete",
        result: { review: { overallScore: score, calibratedScore: score * 20, decision: "Accept", subdimensions: [], strengths: [], weaknesses: [], questions: [], limitations: [] } },
      });
    }
    const pool = paperReview._localPool("acl-2026-main", "current-run", 4);
    assert.equal(pool.samples, 6);
    assert.equal(pool.percentile, 50);
    assert.match(pool.note, /Local runs only/);
    assert.equal(paperReview._localPool("iclr-2026-main", "current-run", 4).percentile, null);
  } finally {
    paperReviewStore.close();
    cleanup(dir);
  }
});
