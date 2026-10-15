const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function withWorkspace(run) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-contracts-"));
  try {
    store.openWorkspace(workspace);
    run(workspace);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-contracts-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test("persists experiment contracts for the selected project and supports partial updates", () => {
  withWorkspace((workspace) => {
    const project = store.createResearchProject({ name: "Polaris" });
    const contract = store.createExperimentContract({
      project_id: project.id,
      title: "Validate adaptive retrieval",
      status: "ready",
      hypothesis: "Adaptive retrieval improves answer quality.",
      alternative_hypothesis: "The effect comes from more retrieved tokens.",
      dataset_plan: "Use the held-out benchmark split.",
      baseline_plan: "Compare fixed-k retrieval.",
      metrics_plan: "Report exact match and groundedness.",
      ablation_plan: "Remove the confidence gate.",
      decision_rule: "Advance only if both metrics improve.",
      failure_criteria: "Stop if latency doubles without quality gain.",
      evidence_notes: "Pre-registered before running.",
    });
    assert.equal(contract.project_id, project.id);
    assert.equal(contract.status, "ready");
    assert.equal(store.listExperimentContracts(project.id).length, 1);

    const updated = store.updateExperimentContract(contract.id, {
      status: "running",
      evidence_notes: "Seed 1 completed.",
    });
    assert.equal(updated.status, "running");
    assert.equal(updated.evidence_notes, "Seed 1 completed.");
    assert.equal(updated.hypothesis, "Adaptive retrieval improves answer quality.");

    const otherProject = store.createResearchProject({ name: "Other" });
    assert.deepEqual(store.listExperimentContracts(otherProject.id), []);

    const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-contracts-reopen-"));
    try {
      store.openWorkspace(otherWorkspace);
      store.openWorkspace(workspace);
      assert.equal(store.listExperimentContracts(project.id)[0].evidence_notes, "Seed 1 completed.");
    } finally {
      fs.rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });
});

test("rejects experiment contracts with invalid projects, fields, statuses, or lengths", () => {
  withWorkspace(() => {
    const project = store.createResearchProject({ name: "Validation" });
    assert.throws(
      () => store.createExperimentContract({ project_id: "missing", title: "A valid title" }),
      /Research project not found/,
    );
    assert.throws(
      () => store.createExperimentContract({ project_id: project.id, title: "", status: "draft" }),
      /title/,
    );
    assert.throws(
      () => store.createExperimentContract({ project_id: project.id, title: "Valid", status: "paused" }),
      /status/,
    );
    assert.throws(
      () => store.createExperimentContract({ project_id: project.id, title: "Valid", hypothesis: "x".repeat(12_001) }),
      /hypothesis/,
    );

    const contract = store.createExperimentContract({ project_id: project.id, title: "Valid" });
    assert.equal(contract.status, "draft");
    assert.throws(() => store.updateExperimentContract(contract.id, {}), /at least one/);
    assert.throws(() => store.updateExperimentContract(contract.id, { untrusted: "value" }), /Unsupported/);
    assert.throws(() => store.listExperimentContracts("missing"), /Research project not found/);
  });
});
