const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const paperReview = require("./paper-review.cjs");
const paperReviewStore = require("./paper-review-store.cjs");
const modelConfig = require("./model-config.cjs");

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
  for (const [input, expected] of [
    ["2501.01234", "2501.01234"],
    ["2501.01234v1", "2501.01234v1"],
    ["arXiv:2501.01234v2", "2501.01234v2"],
    ["https://arxiv.org/abs/2501.01234", "2501.01234"],
    ["https://arxiv.org/abs/2501.01234v2", "2501.01234v2"],
    ["https://arxiv.org/pdf/2501.01234v1.pdf", "2501.01234v1"],
    ["not a paper", ""],
  ]) assert.equal(paperReview.parseArxivRef(input), expected, input);
});

function arxivFixture(t, missingPath) {
  const dir = tempDir();
  t.after(() => { paperReviewStore.close(); cleanup(dir); });
  modelConfig.initializeModelConfig(dir);
  paperReview.initialize(dir);
  paperReview.saveSettings({ model: { mode: "custom", provider: "openai", model: "fixture", apiKey: "synthetic" } });
  const lines = Array(24).fill("(A paper about research methods.) Tj");
  const content = `BT /F1 12 Tf 40 280 Td ${lines.join("\n0 -11 Td\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = String(data.length).padStart(10, "0");
    data += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return `${offset} 00000 n \n`;
  });
  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size 6 /Root 1 0 R >>`;
  const pdf = Buffer.from(`${data}${xref}\nstartxref\n${data.length}\n%%EOF\n`);
  const calls = { downloads: [], model: 0 };
  t.mock.method(https, "request", (url, _options, receive) => {
    calls.downloads.push(url.pathname);
    const request = new EventEmitter();
    request.end = () => {
      const missing = url.pathname === missingPath;
      receive(Object.assign(Readable.from(missing ? [] : [pdf]), { statusCode: missing ? 404 : 200, headers: {} }));
    };
    return request;
  });
  t.mock.method(globalThis, "fetch", async () => {
    calls.model++;
    const content = JSON.stringify({ isResearchPaper: false, isResearchPaperConfidence: 1 });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });
  });
  return { dir, calls };
}

async function startArxivReview(value) {
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const { runId } = await paperReview.createRun({ source: { kind: "arxiv", value } }, {
    emit: event => { if (event.type === "complete" || event.type === "error") finish(); },
  });
  await finished;
  return runId;
}

test("same PDF bytes retain distinct versioned and unversioned review sources after reopen", async t => {
  const { dir, calls } = arxivFixture(t);
  const ids = [await startArxivReview("2501.01234"), await startArxivReview("2501.01234v1")];
  paperReviewStore.close();
  paperReview.initialize(dir);
  const runs = ids.map(id => paperReview.getRun(id));
  assert.deepEqual(calls.downloads, ["/pdf/2501.01234", "/pdf/2501.01234v1"]);
  for (const run of runs) assert.equal(run.status, "complete", run.error);
  assert.equal(calls.model, 2);
  assert.notEqual(runs[0].documentId, runs[1].documentId);
  const sources = ["https://arxiv.org/abs/2501.01234", "https://arxiv.org/abs/2501.01234v1"];
  assert.deepEqual(runs.map(run => run.sourceRef), sources);
  assert.deepEqual(runs.map(run => run.result.document.sourceRef), sources);
  assert.deepEqual(runs.map(run => paperReviewStore.getDocument(run.documentId).sourceRef), sources);
});

test("unavailable arXiv version reports its identifier without downloading the unversioned PDF or calling the model", async t => {
  const { calls } = arxivFixture(t, "/pdf/2501.01234v1");
  const saved = paperReview.getRun(await startArxivReview("2501.01234v1"));
  assert.deepEqual(calls, { downloads: ["/pdf/2501.01234v1"], model: 0 });
  assert.equal(saved.status, "error");
  assert.match(saved.error, /2501\.01234v1.*404/);
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
