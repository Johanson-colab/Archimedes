const assert = require("node:assert/strict");
const test = require("node:test");

const { candidatePaths, normalizePath, repoNameFromUrl } = require("./reproduction/paths.cjs");

test("a path written the way a README writes it also resolves at the checkout root", () => {
  // README: git clone … && cd a-evolve, then "a-evolve/pyproject.toml".
  assert.deepEqual(candidatePaths("a-evolve/pyproject.toml", "a-evolve"), ["a-evolve/pyproject.toml", "pyproject.toml"]);
  assert.deepEqual(candidatePaths("a-evolve/data/bench.jsonl", "a-evolve"), ["a-evolve/data/bench.jsonl", "data/bench.jsonl"]);
});

test("the written path is always tried first", () => {
  const candidates = candidatePaths("repo/x", "repo");
  assert.equal(candidates[0], "repo/x", "a real match must not be displaced by the guess");
});

test("a first segment that is not the repository name is never stripped", () => {
  assert.deepEqual(candidatePaths("inference/pyproject.toml", "a-evolve"), ["inference/pyproject.toml"]);
  assert.deepEqual(candidatePaths("src/app.py", ""), ["src/app.py"]);
});

test("a path equal to the repository name is left alone", () => {
  assert.deepEqual(candidatePaths("a-evolve", "a-evolve"), ["a-evolve"], "stripping would leave nothing to look up");
});

test("case differences between the README and the checkout do not break the match", () => {
  assert.deepEqual(candidatePaths("A-Evolve/pyproject.toml", "a-evolve"), ["A-Evolve/pyproject.toml", "pyproject.toml"]);
});

test("paths are normalised before they are looked up", () => {
  assert.equal(normalizePath("./a//b/"), "a/b/");
  assert.equal(normalizePath("a\\b\\c"), "a/b/c");
  assert.equal(normalizePath("/leading"), "leading");
  assert.deepEqual(candidatePaths("./a-evolve/pyproject.toml", "a-evolve"), ["a-evolve/pyproject.toml", "pyproject.toml"]);
});

test("the repository name comes from the URL, not from a guess", () => {
  assert.equal(repoNameFromUrl("https://github.com/A-EVO-Lab/a-evolve"), "a-evolve");
  assert.equal(repoNameFromUrl("https://github.com/A-EVO-Lab/a-evolve.git"), "a-evolve");
  assert.equal(repoNameFromUrl("https://github.com/A-EVO-Lab/a-evolve/tree/main"), "a-evolve");
  assert.equal(repoNameFromUrl("not a url"), "");
});

test("only the reproduction output directory is writable", () => {
  const { isOutputPath, outputPathFor } = require("./reproduction/paths.cjs");
  const path = outputPathFor("abc123", 7);
  assert.equal(path, "/tmp/archimedes/abc123/7.log");
  assert.equal(isOutputPath(path), true);
  assert.equal(isOutputPath("/tmp/archimedes/abc/../../etc/passwd"), false);
  assert.equal(isOutputPath("/etc/passwd"), false);
  assert.equal(isOutputPath("/tmp/archimedes/abc/7.txt"), false);
  assert.equal(isOutputPath("/tmp/archimedes/abc/env"), true, "the run's key file lives beside its logs");
});
