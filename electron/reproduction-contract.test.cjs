const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeContract, normalizeTolerance } = require("./reproduction/contract.cjs");
const { pageDigest, planReproduction } = require("./reproduction/planner.cjs");
const { verifyEntrypoint } = require("./reproduction/repository-context.cjs");

test("a contract without a verifiable claim is rejected", () => {
  assert.throws(() => normalizeContract({ claims: [] }), /no verifiable claim/);
  assert.throws(() => normalizeContract({ claims: [{ statement: "   " }] }), /no verifiable claim/);
});

test("claims keep their evidence and clamp the tolerance", () => {
  const contract = normalizeContract({
    summary: "Table 2 is reproducible",
    claims: [{
      id: "table2-vgg16",
      statement: "VGG16 matches with 2.43x fewer generations",
      dataset: "KernelBench",
      metric: "generations",
      expected: "2.43x",
      unit: "x",
      tolerance: 9,
      evidence: { page: "7", table: "Table 2", row: "VGG16", column: "speedup", quote: "2.43x fewer" },
    }],
  });
  assert.equal(contract.version, 2);
  assert.equal(contract.claims.length, 1);
  assert.equal(contract.claims[0].expected, 2.43);
  assert.equal(contract.claims[0].tolerance, 0.5, "tolerance is capped");
  assert.equal(contract.claims[0].evidence.page, 7);
  assert.equal(contract.claims[0].evidence.table, "Table 2");
  assert.equal(contract.frozen_at, null);
});

test("a claim without a reported number stays unverifiable", () => {
  const contract = normalizeContract({
    claims: [{ statement: "Training converges in under a day", expected: "", evidence: { page: 3 } }],
  });
  assert.equal(contract.claims[0].expected, null);
  assert.equal(contract.claims[0].tolerance, 0.02);
  assert.equal(normalizeTolerance(undefined), 0.02);
  assert.equal(normalizeTolerance(-1), 0.02);
});

test("entries, environment and budget are normalised", () => {
  const contract = normalizeContract({
    claims: [{ statement: "Result holds" }],
    entrypoint: { command: "python -m eval", outputs: ["results/", "", 5] },
    environment: { python: "3.10", cuda: "12.1", install: ["pip install -r requirements.txt"], source: "repo Dockerfile" },
    repo: { url: "https://github.com/example/repo", commit: "abc1234" },
    notes: ["Needs two GPUs"],
  });
  assert.deepEqual(contract.entrypoint.outputs, ["results/"]);
  assert.equal(contract.entrypoint.cwd, ".");
  assert.equal(contract.environment.python, "3.10");
  assert.deepEqual(contract.environment.install, ["pip install -r requirements.txt"]);
  assert.equal(contract.repo.commit, "abc1234");
  assert.deepEqual(contract.notes, ["Needs two GPUs"]);
});

test("the page digest prefers result pages and keeps page markers", () => {
  const pages = Array.from({ length: 10 }, (_, index) => ({
    page_number: index + 1,
    text: index === 7 ? "Table 2 reports 2.43x on VGG16." : `Body text for page ${index + 1}.`,
  }));
  const digest = pageDigest(pages);
  assert.match(digest, /\[page 8\]/);
  assert.match(digest, /Table 2 reports/);
  assert.match(digest, /\[page 1\]/);
});

test("planning runs the agent and normalises its contract", async () => {
  const reply = JSON.stringify({
    summary: "Reproduce Table 2",
    claims: [{ id: "c1", statement: "VGG16 reaches parity", expected: 2.43, evidence: { page: 8, table: "Table 2" } }],
    entrypoint: { command: "python -m eval" },
  });
  const seen = {};
  const contract = await planReproduction({
    paper: { id: "p1", title: "Dream-RSI", abstract: "A paper." },
    pages: [{ page_number: 8, text: "Table 2 ..." }],
    repoUrl: "https://github.com/example/repo",
    workspace: "/tmp/workspace",
    runAgent: async (input) => {
      Object.assign(seen, input);
      return { response: `Here you go:\n${reply}\n` };
    },
  });
  assert.equal(contract.claims[0].expected, 2.43);
  assert.equal(contract.entrypoint.command, "python -m eval");
  assert.equal(seen.transient, true, "planning must not create a visible thread");
  assert.equal(seen.contextItems[0].id, "paper:p1");
  assert.match(seen.prompt, /reproduction contract/i);
});

test("planning fails loudly when the agent returns no contract", async () => {
  await assert.rejects(planReproduction({
    paper: { id: "p1", title: "Dream-RSI" },
    pages: [],
    workspace: "/tmp/workspace",
    runAgent: async () => ({ response: "I could not find any tables." }),
  }), /did not return a contract/);
});

test("entrypoint evidence survives normalisation", () => {
  const contract = normalizeContract({
    claims: [{ statement: "Result holds" }],
    entrypoint: {
      command: "python scripts/eval.py",
      evidence: [{ path: "scripts/eval.py", line_count: 120 }, { nope: true }],
      unverified: ["weights/ckpt.pt", 7],
    },
  });
  assert.deepEqual(contract.entrypoint.evidence, [{ path: "scripts/eval.py", line_count: 120 }]);
  assert.deepEqual(contract.entrypoint.unverified, ["weights/ckpt.pt"]);
});

test("entrypoint verification is a no-op without a repository", async () => {
  assert.deepEqual(await verifyEntrypoint("/tmp/workspace", "", { command: "python a.py" }), { evidence: [], unverified: [] });
  assert.deepEqual(await verifyEntrypoint("/tmp/workspace", "https://example.com/not-github", { command: "python a.py" }), { evidence: [], unverified: [] });
});

test("a runbook is kept in order and synthesised when missing", () => {
  const withSteps = normalizeContract({
    claims: [{ statement: "Result holds" }],
    steps: [
      { id: "clone", title: "Clone the repository", command: "git clone x", checkpoint: "pyproject.toml exists", source: "README.md" },
      { title: "Install", command: "pip install -e .", blocked: "No requirements file in the repository" },
      { title: "   " },
    ],
  });
  assert.equal(withSteps.steps.length, 2);
  assert.equal(withSteps.steps[0].id, "clone");
  assert.equal(withSteps.steps[0].checkpoint, "pyproject.toml exists");
  assert.equal(withSteps.steps[1].blocked, "No requirements file in the repository");
  assert.equal(withSteps.steps[1].id, "step-2", "a missing id falls back to its position");

  const legacy = normalizeContract({
    claims: [{ statement: "Result holds" }],
    entrypoint: { command: "python eval.py" },
    environment: { python: "3.10", install: ["pip install -r requirements.txt"], source: "requirements.txt" },
  });
  assert.equal(legacy.steps.length, 3, "old contracts still get a runbook");
  assert.equal(legacy.steps[2].command, "python eval.py");

  const blocked = normalizeContract({ claims: [{ statement: "Result holds" }] });
  assert.equal(blocked.steps.at(-1).blocked.length > 0, true, "a missing entrypoint blocks the run step");
});
