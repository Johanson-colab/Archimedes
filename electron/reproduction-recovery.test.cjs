const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-recovery-"));
}

test("a run left running by a killed app is reconciled on the next open", () => {
  const root = workspace();
  const other = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "Evo-Harness" });
    const run = store.createReproductionRun({ reproductionId: reproduction.id });
    store.updateReproduction(reproduction.id, { status: "provisioning" });

    // Reopening is what the app does after a restart.
    store.openWorkspace(other);
    store.openWorkspace(root);

    const after = store.getReproduction(reproduction.id);
    assert.equal(after.status, "blocked");
    assert.match(after.error, /app stopped while this was running/i);
    assert.equal(store.getReproductionRun(run.id).status, "interrupted");
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("a verified reproduction is left alone", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "Done" });
    store.updateReproduction(reproduction.id, { status: "checks-passed" });
    store.openWorkspace(root);
    assert.equal(store.getReproduction(reproduction.id).status, "checks-passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
