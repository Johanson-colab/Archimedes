const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const store = require("./paper-review-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-"));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Windows may keep SQLite WAL handles open briefly; the OS cleans temp dirs.
  }
}

const pages = [
  { page: 1, text: "Title: A careful paper\nAbstract: We test a claim." },
  { page: 2, text: "Method: We run an experiment with a baseline." },
];

const result = {
  gate: { status: "passed", reason: "" },
  preflight: { pageCount: 2 },
  paperCard: { title: "A careful paper" },
  reviewers: [],
  selection: null,
  review: {
    summary: "A careful paper.",
    strengths: [{ text: "Clear method", page: 2, quote: "We run an experiment" }],
    weaknesses: [{ text: "Small evaluation", page: 2, quote: "" }],
    questions: [{ text: "Does it scale?", page: 2, quote: "" }],
    limitations: [{ text: "One dataset", page: 2, quote: "" }],
    overallScore: 6,
    calibratedScore: 55.6,
    confidence: 3,
    decision: "Weak accept",
    deskRejectRisk: "low",
    expectedOutcome: "Weak accept · simulated",
    subdimensions: [{ id: "soundness", label: "Soundness", score: 3, reason: "Reasonable." }],
  },
  usage: { inputTokens: 100, outputTokens: 200 },
};

test("store keeps documents, runs, findings, scores and local score pools", () => {
  const dir = tempDir();
  store.initialize(dir);
  try {
    const document = store.saveDocument({
      id: "doc-1",
      sourceKind: "pdf",
      sourceRef: "paper.pdf",
      title: "A careful paper",
      pageCount: 2,
      pages,
    });
    assert.equal(document.textChars > 20, true);
    assert.equal(store.getDocument("doc-1").pages.length, 2);

    const runId = store.createRun({
      documentId: "doc-1",
      projectId: "project-1",
      sourceKind: "pdf",
      sourceRef: "paper.pdf",
      paperTitle: "A careful paper",
      venueId: "iclr-2026-main",
      venueVersion: "2026.1",
      modelProvider: "openai",
      modelBaseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4.1",
    });
    assert.equal(store.getRun(runId).status, "running");
    store.updateRun(runId, { stage: "reviewers", progress: 45 });
    const running = store.getRun(runId);
    assert.equal(running.stage, "reviewers");
    assert.equal(running.progress, 45);

    const completed = store.finishRun(runId, { status: "complete", result, durationMs: 1234, costTokens: 300 });
    assert.equal(completed.status, "complete");
    assert.equal(completed.overallScore, 6);
    assert.equal(completed.calibratedScore, 55.6);
    assert.equal(completed.result.review.summary, "A careful paper.");
    assert.equal(completed.result.usage.outputTokens, 200);

    const findings = store._getRunRow(runId);
    assert.ok(findings);
    const db = require("node:sqlite");
    const database = new db.DatabaseSync(path.join(dir, "paper-review.sqlite"));
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM paper_review_findings WHERE run_id = ?").get(runId).count, 4);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM paper_review_scores WHERE run_id = ?").get(runId).count, 1);
    database.close();

    const summaries = store.listRuns({ projectId: "project-1" });
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].result, undefined);
    assert.equal(summaries[0].paperTitle, "A careful paper");
    assert.equal(store.listRuns({ projectId: "other" }).length, 0);

    const pool = store.scorePool("iclr-2026-main", "another-run");
    assert.deepEqual(pool, [{ overallScore: 6, calibratedScore: 55.6 }]);
  } finally {
    store.close();
    cleanup(dir);
  }
});

test("interrupted runs are marked when the app reopens", () => {
  const dir = tempDir();
  store.initialize(dir);
  try {
    const runId = store.createRun({
      documentId: "doc-1",
      projectId: "",
      sourceKind: "arxiv",
      sourceRef: "2511.05421",
      paperTitle: "Interrupted",
      venueId: "iclr-2026-main",
      venueVersion: "2026.1",
      modelProvider: "openai",
      modelBaseUrl: "https://api.openai.com/v1",
      modelId: "gpt-4.1",
    });
    assert.equal(store.markInterrupted().updated, 1);
    const run = store.getRun(runId);
    assert.equal(run.status, "error");
    assert.equal(run.stage, "interrupted");
    assert.match(run.error, /interrupted/);
    assert.equal(store.deleteRun(runId).deleted, true);
    assert.equal(store.getRun(runId), null);
  } finally {
    store.close();
    cleanup(dir);
  }
});
