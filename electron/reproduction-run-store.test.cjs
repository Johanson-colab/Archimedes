const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-reproduction-run-"));
}

test("a run keeps the verdicts each step reached, newest first", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "MemT", repoUrl: "https://github.com/MemTensor/MemT-1.0" });
    const run = store.createReproductionRun({ reproductionId: reproduction.id, backend: "docker" });

    store.updateReproductionRun(run.id, {
      status: "failed",
      backend: "Docker · python:3.11-slim",
      image: "python:3.11-slim",
      steps: [
        { id: "clone", title: "Clone", status: "passed", detail: "", exit_code: 0, duration_ms: 12 },
        { id: "install", title: "Install", status: "failed", detail: "exited with status 1", exit_code: 1, duration_ms: 900 },
      ],
      log: "$ pip install\nERROR: no matching distribution\n",
      finishedAt: new Date().toISOString(),
    });

    const stored = store.getReproductionRun(run.id);
    assert.equal(stored.status, "failed");
    assert.equal(stored.image, "python:3.11-slim");
    assert.deepEqual(stored.steps.map((step) => step.status), ["passed", "failed"]);
    assert.match(stored.log, /no matching distribution/);

    const latest = store.getLatestReproductionRun(reproduction.id);
    assert.equal(latest.id, run.id);
    assert.equal(store.listReproductionRuns(reproduction.id).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deleting a reproduction takes its runs with it", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "MemT" });
    const run = store.createReproductionRun({ reproductionId: reproduction.id });
    store.deleteReproduction(reproduction.id);
    assert.equal(store.getReproductionRun(run.id), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a run cannot be attached to a reproduction that does not exist", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    assert.throws(() => store.createReproductionRun({ reproductionId: "missing" }), /does not exist/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("diagnosis attempts keep their order and their verdict", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "MemT" });
    const run = store.createReproductionRun({ reproductionId: reproduction.id });

    const first = store.createReproductionAttempt({
      reproductionId: reproduction.id,
      runId: run.id,
      stepId: "install",
      class: "dependency_missing",
      confidence: "high",
      evidence: "No module named 'sglang'",
      cause: "sglang is in the server extra",
      fix: { target: "install", command: "pip install -e .[all,server]" },
      status: "proposed",
    });
    assert.equal(first.attempt_no, 1);

    const second = store.createReproductionAttempt({
      reproductionId: reproduction.id,
      runId: run.id,
      stepId: "run",
      class: "unknown",
      cause: "still failing",
      status: "proposed",
    });
    assert.equal(second.attempt_no, 2);

    const applied = store.updateReproductionAttempt(first.id, { status: "applied" });
    assert.equal(applied.status, "applied");

    const attempts = store.listReproductionAttempts(run.id);
    assert.deepEqual(attempts.map((attempt) => attempt.attempt_no), [1, 2]);
    assert.deepEqual(attempts[0].fix, { target: "install", command: "pip install -e .[all,server]" });
    assert.equal(attempts[1].fix, null);

    // A run that is deleted takes its attempts with it.
    store.deleteReproduction(reproduction.id);
    assert.deepEqual(store.listReproductionAttempts(run.id), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
