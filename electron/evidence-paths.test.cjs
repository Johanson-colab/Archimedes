const assert = require("node:assert/strict");
const test = require("node:test");

const { artifactPaths, collectTouchedPaths, normalizeEvidencePath, patchTargets, shellWriteTargets } = require("../src/evidencePaths.ts");

test("normalizes workspace paths and ignores system or unsafe targets", () => {
  assert.equal(normalizeEvidencePath("./src/main.c"), "src/main.c");
  assert.equal(normalizeEvidencePath("/workspace/src/main.c"), "src/main.c");
  assert.equal(normalizeEvidencePath("`workspace/notes/a.md`"), "notes/a.md");
  assert.equal(normalizeEvidencePath("/dev/null"), "");
  assert.equal(normalizeEvidencePath("/tmp/build/out"), "");
  assert.equal(normalizeEvidencePath("src/*.c"), "");
  assert.equal(normalizeEvidencePath("2>&1"), "");
});

test("extracts write targets from shell commands", () => {
  assert.deepEqual(shellWriteTargets("echo hi > notes/a.md"), ["notes/a.md"]);
  assert.deepEqual(shellWriteTargets("cat > src/main.c <<'EOF'\nint main() { if (x > 3) return 1; }\nEOF"), ["src/main.c"]);
  assert.deepEqual(shellWriteTargets("echo more >> /workspace/log.txt"), ["log.txt"]);
  assert.deepEqual(shellWriteTargets("sed -i 's/a/b/' src/x.py src/y.py"), ["src/x.py", "src/y.py"]);
  assert.deepEqual(shellWriteTargets("cp -r build /workspace/out"), ["out"]);
  assert.deepEqual(shellWriteTargets("tee -a reports/run.log"), ["reports/run.log"]);
  assert.deepEqual(shellWriteTargets("make 2>&1 | tee build.log"), ["build.log"]);
  assert.deepEqual(shellWriteTargets("ls -la /workspace && git status"), []);
});

test("reads paths from patch payloads", () => {
  const patch = "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** Add File: src/b.ts\n+new\n*** End Patch";
  assert.deepEqual(patchTargets(patch), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(patchTargets("--- a/src/c.ts\n+++ b/src/c.ts\n@@\n"), ["src/c.ts"]);
  assert.deepEqual(patchTargets("not a patch"), []);
});

test("counts artifacts only for write-like tools", () => {
  assert.deepEqual(artifactPaths("write_file", { path: "notes/a.md", content: "hello" }), ["notes/a.md"]);
  assert.deepEqual(artifactPaths("bash", { command: "cat > src/main.c <<'EOF'\nint x;\nEOF" }), ["src/main.c"]);
  assert.deepEqual(artifactPaths("apply_patch", { patch: "*** Begin Patch\n*** Add File: src/b.ts\n+x\n*** End Patch" }), ["src/b.ts"]);
  assert.deepEqual(artifactPaths("str_replace_editor", { path: "src/c.ts" }), ["src/c.ts"]);
  assert.deepEqual(artifactPaths("file_change", { changes: [{ path: "src/d.ts", kind: "update" }] }), ["src/d.ts"]);
  assert.deepEqual(artifactPaths("read_workspace_file", { path: "src/main.c" }), []);
  assert.deepEqual(artifactPaths("search_academic_papers", { query: "diffusion" }), []);
});

test("collects every touched path from tool payloads", () => {
  const paths = collectTouchedPaths({
    call_id: "call-1",
    name: "bash",
    arguments: { command: "sed -i 's/a/b/' src/x.py && echo ok > reports/out.txt" },
  });
  assert.deepEqual([...paths].sort(), ["reports/out.txt", "src/x.py"]);

  const changed = collectTouchedPaths({ changes: [{ path: "./a.ts" }, { path: "/workspace/src/b.ts" }] });
  assert.deepEqual([...changed].sort(), ["a.ts", "src/b.ts"]);

  assert.equal(collectTouchedPaths({ content: "just output" }).size, 0);
});
