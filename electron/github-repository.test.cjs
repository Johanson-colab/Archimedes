const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeGithubRepositoryUrl, pickRepositoryFiles } = require("./github-repository.cjs");

test("normalizes only public GitHub owner/repository URLs", () => {
  assert.deepEqual(normalizeGithubRepositoryUrl("https://github.com/OpenAI/openai-cookbook/tree/main"), {
    owner: "OpenAI", repo: "openai-cookbook", url: "https://github.com/OpenAI/openai-cookbook",
  });
  assert.throws(() => normalizeGithubRepositoryUrl("https://gitlab.com/group/project"), /GitHub/);
  assert.throws(() => normalizeGithubRepositoryUrl("https://github.com/OpenAI"), /owner and repository/);
});

test("keeps implementation, configuration, and small data manifests in the evidence snapshot", () => {
  const files = pickRepositoryFiles([
    { type: "blob", path: "README.md", size: 200 },
    { type: "blob", path: "pyproject.toml", size: 200 },
    { type: "blob", path: "src/train.py", size: 200 },
    { type: "blob", path: "configs/eval.yaml", size: 200 },
    { type: "blob", path: "datasets/manifest.json", size: 200 },
    { type: "blob", path: "datasets/train.parquet", size: 200 },
  ]).map((entry) => entry.path);
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("src/train.py"));
  assert.ok(files.includes("datasets/manifest.json"));
  assert.ok(!files.includes("datasets/train.parquet"));
});
