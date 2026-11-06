const assert = require("node:assert/strict");
const test = require("node:test");

const { MAX_HINTS, hintsFor } = require("./reproduction/hints.cjs");

test("a resolver conflict points at the pins, not at the network", () => {
  const hints = hintsFor("ERROR: ResolutionImpossible: Cannot install torch==2.1 and torchvision==0.16 because these package versions have conflicting dependencies.");
  assert.equal(hints.length, 1);
  assert.match(hints[0], /Two pins disagree/);
  assert.match(hints[0], /--dry-run/);
});

test("an ABI error is not reported as a missing package", () => {
  const hints = hintsFor("ImportError: /opt/lib/libtorch.so: undefined symbol: _ZN3c1010TensorImpl");
  assert.equal(hints.length, 1);
  assert.match(hints[0], /ABI mismatch/);
});

test("no matching distribution separates index, python and platform", () => {
  const [hint] = hintsFor("ERROR: Could not find a version that satisfies the requirement vllm (from versions: none)");
  assert.match(hint, /No candidate for `vllm`/);
  assert.match(hint, /Python version/);
});

test("a build failure mentions the toolchain", () => {
  const [hint] = hintsFor("error: command 'gcc' failed with exit status 1");
  assert.match(hint, /build dependency/);
});

test("hints are capped and empty output yields none", () => {
  assert.equal(hintsFor("").length, 0);
  const many = hintsFor("python: command not found\nResolutionImpossible\nBUILD FAILED: Failed building wheel for x\nundefined symbol: y");
  assert.equal(many.length, MAX_HINTS);
});
