const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createLatexProject, listLatexProjects, normalizePaperPath, parseLatexDiagnostics } = require("./latex-workspace.cjs");

test("normalizes only workspace-relative TeX compile targets", () => {
  assert.equal(normalizePaperPath("papers/main.tex"), "papers/main.tex");
  assert.throws(() => normalizePaperPath("notes.md"), /\.tex/);
  assert.throws(() => normalizePaperPath("../outside.tex"), /workspace-relative/);
});

test("creates a collision-safe paper template and discovers main documents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-"));
  try {
    const first = createLatexProject(root, "paper");
    const second = createLatexProject(root, "paper");
    assert.equal(first.path, "paper/main.tex");
    assert.equal(second.path, "paper-2/main.tex");
    const projects = listLatexProjects(root);
    assert.equal(projects.length, 2);
    assert.ok(projects.every((project) => project.main));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracts line-oriented LaTeX diagnostics", () => {
  const diagnostics = parseLatexDiagnostics("main.tex:17: Undefined control sequence.\n! Missing $ inserted.\nl.23 bad input");
  assert.deepEqual(diagnostics, [
    { line: 17, message: "Undefined control sequence." },
    { line: 23, message: "Missing $ inserted." },
  ]);
});
