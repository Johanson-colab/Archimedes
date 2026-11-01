const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateSteps } = require("./reproduction/preflight.cjs");

function step(id, check, extra = {}) {
  return { id, title: id, detail: "", command: "", checkpoint: "", check, source: "", blocked: "", ...extra };
}

function reader(files) {
  return async (filePath) => {
    if (!(filePath in files)) throw new Error("ENOENT");
    return files[filePath];
  };
}

test("file checks pass or fail against the checkout", async () => {
  const results = await evaluateSteps({
    steps: [
      step("exists", { kind: "file_exists", path: "inference/pyproject.toml" }),
      step("missing", { kind: "file_exists", path: "eval/table2.py" }),
      step("matches", { kind: "file_contains", path: "README.md", pattern: "uv pip install" }),
      step("no-match", { kind: "file_contains", path: "README.md", pattern: "conda env create" }),
    ],
    readFile: reader({
      "inference/pyproject.toml": "[project]",
      "README.md": "# MemT\n\nuv pip install '.[server]'\n",
    }),
  });
  assert.deepEqual(results.map((entry) => entry.status), ["passed", "failed", "passed", "failed"]);
  assert.match(results[1].detail, /does not exist/);
  assert.match(results[3].detail, /not found/);
});

test("anything that needs execution is reported, never assumed", async () => {
  const results = await evaluateSteps({
    steps: [
      step("command", { kind: "command", command: "python -c 'import x'", expect: "exit_zero" }),
      step("http", { kind: "http", url: "http://127.0.0.1:30000/health", status: 200 }),
      step("manual", { kind: "manual", reason: "A person must compare the harness." }),
      step("blocked", { kind: "manual", reason: "x" }, { blocked: "No evaluation code in the repository." }),
      step("legacy", undefined),
    ],
    readFile: reader({}),
  });
  assert.deepEqual(results.map((entry) => entry.status), ["needs-run", "needs-run", "manual", "blocked", "manual"]);
  assert.equal(results[3].detail, "No evaluation code in the repository.");
});

test("an invalid pattern fails loudly instead of throwing", async () => {
  const results = await evaluateSteps({
    steps: [step("bad", { kind: "file_contains", path: "README.md", pattern: "[unclosed" })],
    readFile: reader({ "README.md": "content" }),
  });
  assert.equal(results[0].status, "failed");
  assert.match(results[0].detail, /Invalid pattern/);
});

test("a read error never takes down the whole preflight", async () => {
  const results = await evaluateSteps({
    steps: [
      step("boom", { kind: "file_exists", path: "x" }),
      step("ok", { kind: "file_exists", path: "y" }),
    ],
    readFile: async (filePath) => {
      if (filePath === "x") throw new Error("permission denied");
      return "";
    },
  });
  assert.deepEqual(results.map((entry) => entry.status), ["failed", "passed"]);
});
