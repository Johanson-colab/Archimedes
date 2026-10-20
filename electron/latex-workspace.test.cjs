const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compileLatexDocument,
  compilerKind,
  createLatexDirectory,
  createLatexFile,
  createLatexProject,
  importLatexProject,
  listLatexProjects,
  normalizePaperPath,
  parseLatexDiagnostics,
} = require("./latex-workspace.cjs");

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

test("creates LaTeX files and folders without overwriting workspace entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-entries-"));
  try {
    const directory = createLatexDirectory(root, "paper/sections");
    const file = createLatexFile(root, "paper/sections/related-work");
    assert.equal(directory.path, "paper/sections");
    assert.equal(file.path, "paper/sections/related-work.tex");
    assert.match(fs.readFileSync(path.join(root, file.path), "utf8"), /New LaTeX source/);
    assert.throws(() => createLatexFile(root, file.path), /already exists/);
    assert.throws(() => createLatexDirectory(root, "../outside"), /workspace-relative/);
    assert.throws(() => createLatexFile(root, "paper/data.csv"), /LaTeX workspace files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("creates projects from built-in templates with a bibliography", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-templates-"));
  try {
    const fallback = createLatexProject(root, "paper");
    assert.equal(fallback.path, "paper/main.tex");
    assert.match(fs.readFileSync(path.join(root, fallback.path), "utf8"), /\\bibliography\{references\}/);
    assert.equal(fs.existsSync(path.join(root, "paper", "references.bib")), true);

    const conference = createLatexProject(root, "cvpr", "conference-two-column");
    const source = fs.readFileSync(path.join(root, conference.path), "utf8");
    assert.match(source, /\\documentclass\[10pt,twocolumn\]\{article\}/);
    assert.match(source, /\\twocolumn\[/);

    assert.throws(() => createLatexProject(root, "unknown", "does-not-exist"), /Unknown LaTeX template/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to tectonic and passes its CLI arguments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-tectonic-"));
  const spawnCalls = [];
  try {
    createLatexProject(root, "paper");
    const result = await compileLatexDocument(root, "paper/main.tex", {
      executable: "/opt/homebrew/bin/tectonic",
      spawnImpl: (command, args) => {
        spawnCalls.push({ command, args });
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        process.nextTick(() => {
          const outdir = args[args.indexOf("--outdir") + 1];
          fs.writeFileSync(path.join(outdir, "main.pdf"), "%PDF-1.4\n");
          fs.writeFileSync(path.join(outdir, "main.log"), "This is XeTeX\n");
          child.emit("close", 0, null);
        });
        return child;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.engine, "tectonic");
    assert.match(result.pdf_path, /main\.pdf$/);
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].command, "/opt/homebrew/bin/tectonic");
    assert.deepEqual(spawnCalls[0].args.slice(0, 5), ["--outdir", spawnCalls[0].args[1], "--keep-logs", "--chatter", "minimal"]);
    assert.equal(spawnCalls[0].args.includes("main.tex"), true);
    assert.equal(spawnCalls[0].args.includes("-interaction=nonstopmode"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("classifies known LaTeX compilers", () => {
  assert.equal(compilerKind("/opt/homebrew/bin/tectonic"), "tectonic");
  assert.equal(compilerKind("/Library/TeX/texbin/latexmk"), "latexmk");
  assert.equal(compilerKind("pdflatex.exe"), "pdflatex");
});

test("imports a complete LaTeX folder and selects its main document", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-workspace-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "conference-paper-"));
  try {
    fs.mkdirSync(path.join(source, "fig"));
    fs.mkdirSync(path.join(source, ".git"));
    fs.writeFileSync(path.join(source, "main.tex"), "\\documentclass{article}\n\\title{Imported paper}\n\\begin{document}Ready\\end{document}\n");
    fs.writeFileSync(path.join(source, "references.bib"), "@article{test, title={Test}}\n");
    fs.writeFileSync(path.join(source, "fig", "plot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(source, ".git", "config"), "ignored");
    const imported = importLatexProject(root, source);
    assert.equal(imported.file_count, 3);
    assert.equal(imported.main_path, `${imported.directory}/main.tex`);
    assert.equal(fs.existsSync(path.join(root, imported.directory, "fig", "plot.png")), true);
    assert.equal(fs.existsSync(path.join(root, imported.directory, ".git")), false);
    const second = importLatexProject(root, source);
    assert.notEqual(second.directory, imported.directory);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("finds the imported main document even when the workspace discovery cap is exhausted", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-large-workspace-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "conference-paper-"));
  try {
    for (let index = 0; index < 4_100; index += 1) fs.writeFileSync(path.join(root, `old-${index}.tex`), "% archived\n");
    fs.writeFileSync(path.join(source, "main.tex"), "\\documentclass{article}\n\\begin{document}Ready\\end{document}\n");
    const imported = importLatexProject(root, source);
    assert.equal(imported.main_path, `${imported.directory}/main.tex`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("extracts line-oriented LaTeX diagnostics", () => {
  const diagnostics = parseLatexDiagnostics("main.tex:17: Undefined control sequence.\n! Missing $ inserted.\nl.23 bad input");
  assert.deepEqual(diagnostics, [
    { line: 17, message: "Undefined control sequence." },
    { line: 23, message: "Missing $ inserted." },
  ]);
});
