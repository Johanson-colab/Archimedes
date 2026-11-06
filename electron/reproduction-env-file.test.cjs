const assert = require("node:assert/strict");
const test = require("node:test");

const { envFileContent, envPrelude, shellAssignment } = require("./reproduction/env-file.cjs");

test("a value is single-quoted and an embedded quote survives", () => {
  assert.equal(shellAssignment("HF_TOKEN", "abc"), "HF_TOKEN='abc'");
  assert.equal(shellAssignment("HF_TOKEN", "a'b"), "HF_TOKEN='a'\\''b'");
  assert.equal(shellAssignment("HF_TOKEN", "line1\nline2"), "HF_TOKEN='line1\nline2'");
});

test("the file ends with a newline and skips invalid names", () => {
  const content = envFileContent({ HF_TOKEN: "x", "not a name": "y" });
  assert.equal(content, "HF_TOKEN='x'\n");
});

test("the prelude sources the file with export-all around it", () => {
  assert.equal(envPrelude("/tmp/archimedes/abc/env"), "set -a; . '/tmp/archimedes/abc/env'; set +a; ");
  assert.equal(envPrelude(""), "");
});
