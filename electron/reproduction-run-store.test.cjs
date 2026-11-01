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
