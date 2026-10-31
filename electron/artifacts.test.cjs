const assert = require("node:assert/strict");
const test = require("node:test");

const { artifactKind, isArtifactPath } = require("./artifacts.cjs");

test("artifact kind detection covers images, documents, data, and web output", () => {
  assert.equal(artifactKind("figures/figure-3.png"), "image");
  assert.equal(artifactKind("figures/architecture.svg"), "svg");
  assert.equal(artifactKind("paper/main.pdf"), "pdf");
  assert.equal(artifactKind("data/results.csv"), "csv");
  assert.equal(artifactKind("data/metrics.json"), "json");
  assert.equal(artifactKind("notes/brief.md"), "markdown");
  assert.equal(artifactKind("site/demo.html"), "html");
  assert.equal(artifactKind("paper/main.tex"), "other");
  assert.equal(isArtifactPath("paper/main.tex"), false);
  assert.equal(isArtifactPath("notes/brief.md"), true);
  assert.equal(isArtifactPath(""), false);
});
