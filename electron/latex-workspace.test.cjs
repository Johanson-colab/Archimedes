const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { spawn, spawnSync } = require("node:child_process");
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
  findExecutable,
  findLocalLatexCompiler,
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

test("creates a collision-safe paper template and discovers main documents", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-"));
  try {
    const first = createLatexProject(root, "paper");
    const second = createLatexProject(root, "paper");
    assert.equal(first.path, "paper/main.tex");
    assert.equal(second.path, "paper-2/main.tex");
    const projects = await listLatexProjects(root);
    assert.equal(projects.length, 2);
    assert.ok(projects.every((project) => project.main));
    assert.deepEqual(projects.map(project => project.path), ["paper-2/main.tex", "paper/main.tex"].sort((a, b) => a.localeCompare(b)));
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
    const existing = fs.readFileSync(path.join(root, fallback.path), "utf8");
    assert.match(existing, /\\bibliography\{references\}/);
    assert.equal(fs.existsSync(path.join(root, "paper", "references.bib")), true);

    const minimal = createLatexProject(root, "paper", "minimal-article");
    assert.equal(minimal.path, "paper-2/main.tex");
    const minimalSource = fs.readFileSync(path.join(root, minimal.path), "utf8");
    assert.match(minimalSource, /^\\documentclass\{article\}/);
    assert.doesNotMatch(minimalSource, /\\usepackage/);
    assert.deepEqual(fs.readdirSync(path.join(root, "paper-2")), ["main.tex"]);
    assert.equal(fs.readFileSync(path.join(root, fallback.path), "utf8"), existing);

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

test("imports a complete LaTeX folder and selects its main document", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-workspace-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "conference-paper-"));
  try {
    fs.mkdirSync(path.join(source, "fig"));
    fs.mkdirSync(path.join(source, ".git"));
    fs.writeFileSync(path.join(source, "main.tex"), "\\documentclass{article}\n\\title{Imported paper}\n\\begin{document}Ready\\end{document}\n");
    fs.writeFileSync(path.join(source, "references.bib"), "@article{test, title={Test}}\n");
    fs.writeFileSync(path.join(source, "fig", "plot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(source, ".git", "config"), "ignored");
    const imported = await importLatexProject(root, source);
    assert.equal(imported.file_count, 3);
    assert.equal(imported.main_path, `${imported.directory}/main.tex`);
    assert.equal(fs.existsSync(path.join(root, imported.directory, "fig", "plot.png")), true);
    assert.equal(fs.existsSync(path.join(root, imported.directory, ".git")), false);
    const second = await importLatexProject(root, source);
    assert.notEqual(second.directory, imported.directory);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("finds the imported main document even when the workspace discovery cap is exhausted", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-large-workspace-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "conference-paper-"));
  try {
    for (let index = 0; index < 4_100; index += 1) fs.writeFileSync(path.join(root, `old-${index}.tex`), "% archived\n");
    fs.writeFileSync(path.join(source, "main.tex"), "\\documentclass{article}\n\\begin{document}Ready\\end{document}\n");
    const imported = await importLatexProject(root, source);
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

test("built-in templates compile before and after adding a citation", { skip: spawnSync("latexmk", ["-v"]).error ? "latexmk is not installed" : false }, async () => {
  const templates = require("../shared/latex-templates.json");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-compile-"));
  try {
    for (const template of templates) {
      const file = createLatexProject(root, template.id, template.id);
      const first = await compileLatexDocument(root, file.path);
      assert.equal(first.ok, true, `${template.id}: ${first.log}`);
      const sourcePath = path.join(root, file.path);
      const source = fs.readFileSync(sourcePath, "utf8")
        .replace("% \\bibliographystyle{plain}", "\\bibliographystyle{plain}")
        .replace("% \\bibliography{references}", "\\bibliography{references}")
        .replace("\\end{document}", "Example citation \\cite{example}.\n\\end{document}");
      fs.writeFileSync(sourcePath, source);
      fs.writeFileSync(path.join(root, template.id, "references.bib"), "@article{example, author={Jane Doe}, title={Example}, journal={Journal}, year={2026}}\n");
      const cited = await compileLatexDocument(root, file.path);
      assert.equal(cited.ok, true, `${template.id} with citation: ${cited.log}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a missing TeX font reports an installation fix instead of a source line", () => {
  const diagnostics = parseLatexDiagnostics("! I can't find file `phvb'.\n! Emergency stop.\nl.32 Coauthor\nmain.tex:32: ==> Fatal error occurred, no output PDF file produced!");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].line, null);
  assert.match(diagnostics[0].message, /phvb/);
  assert.match(diagnostics[0].help, /tlmgr install collection-fontsrecommended/);
  const tfm = parseLatexDiagnostics("./iclr2027_conference.sty:32: Font \\iclrtenhv=phvb at 8.0pt not loadable: Metri\nc (TFM) file not found.");
  assert.equal(tfm[0].line, null);
  assert.match(tfm[0].message, /phvb/);
});

test("a failed recompile does not expose the PDF left by a previous successful build", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-latex-stale-"));
  let fail = false;
  const spawnImpl = (_command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    process.nextTick(() => {
      const directory = args.find((arg) => arg.startsWith('-outdir=')).slice('-outdir='.length);
      if (!fail) fs.writeFileSync(path.join(directory, 'main.pdf'), '%PDF-1.4\n');
      else child.stderr.emit('data', "! I can't find file `phvb'.\n! Emergency stop.\n");
      child.emit('close', fail ? 1 : 0, null);
    });
    return child;
  };
  try {
    createLatexProject(root, "paper");
    const good = await compileLatexDocument(root, 'paper/main.tex', { executable: '/test/latexmk', spawnImpl });
    assert.equal(good.ok, true); assert.match(good.pdf_path, /main.pdf$/);
    fail = true;
    const failed = await compileLatexDocument(root, 'paper/main.tex', { executable: '/test/latexmk', spawnImpl });
    assert.equal(failed.ok, false); assert.equal(failed.pdf_path, '');
    assert.equal(fs.existsSync(path.join(root, good.pdf_path)), true);
    assert.match(failed.diagnostics[0].help, /collection-fontsrecommended/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a stalled compiler returns its partial log and a dependency timeout diagnostic", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-timeout-'));
  let child, killed = false;
  try {
    createLatexProject(root, 'paper');
    const pending = compileLatexDocument(root, 'paper/main.tex', {
      executable: '/test/tectonic', managed: true, timeoutMs: 600_000, idleTimeoutMs: 120_000,
      spawnImpl: () => { child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { killed = true; child.emit('close', null, 'SIGKILL'); }; return child; },
    });
    child.stderr.emit('data', 'note: downloading phvb.tfm\n');
    t.mock.timers.tick(119_000); assert.equal(killed, false);
    child.stderr.emit('data', 'note: downloading article.cls\n');
    t.mock.timers.tick(119_000); assert.equal(killed, false);
    t.mock.timers.tick(1000);
    const result = await pending;
    assert.equal(killed, true); assert.equal(result.ok, false); assert.equal(result.timed_out, true);
    assert.match(result.log, /downloading phvb.tfm/); assert.match(result.log, /no compiler output/);
    assert.equal(result.pdf_path, ''); assert.match(result.diagnostics[0].help, /system HTTP proxy/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("an active first build keeps its longer budget but still reaches the total deadline", async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { runCompiler } = require('./latex-workspace.cjs');
  let child, killed = false;
  const pending = runCompiler('/test/tectonic', [], { managed: true, timeoutMs: 600_000,
    spawnImpl: () => { child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { killed = true; child.emit('close', null, 'SIGKILL'); }; return child; },
  });
  t.mock.timers.tick(180_000); assert.equal(killed, false);
  child.stderr.emit('data', 'note: downloading more dependencies\n');
  t.mock.timers.tick(420_000);
  const result = await pending;
  assert.equal(killed, true); assert.equal(result.timeoutReason, 'total'); assert.match(result.output, /more dependencies/);
});

test("compiler logs preserve UTF-8 symbols split across stdout and stderr chunks", async () => {
  const { runCompiler } = require('./latex-workspace.cjs');
  let child; const streamed = [];
  const pending = runCompiler('/test/tectonic', [], { onOutput: (text) => streamed.push(text), spawnImpl: () => {
    child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {}; return child;
  } });
  const stdout = Buffer.from('† — ’ – 中文\n'), stderr = Buffer.from('warning: main.tex:156: Missing character: There is no † ("2020) in font ptmr8t!\n');
  // Interleave streams and split inside multibyte code points.
  for (let i = 0; i < Math.max(stdout.length, stderr.length); i++) {
    if (i < stdout.length) child.stdout.emit('data', stdout.subarray(i, i + 1));
    if (i < stderr.length) child.stderr.emit('data', stderr.subarray(i, i + 1));
  }
  child.emit('close', 0, null);
  const result = await pending;
  assert.equal(result.code, 0); assert.equal(result.output.includes('\uFFFD'), false);
  assert.equal(streamed.join(''), result.output);
  assert.ok(result.output.includes('†'));
  assert.ok(result.output.includes('中'));
});

test("missing-glyph diagnostics recover the symbol from XeTeX's code point and deduplicate damaged text", () => {
  const diagnostics = parseLatexDiagnostics('warning: main.tex:156: Missing character: There is no ��� ("2020) in font ptmr8t!\nwarning: main.tex:156: Missing character: There is no † ("2020) in font ptmr8t!\nwarning: main.tex:680: Missing character: There is no ��� ("2013) in font ptmr8t!');
  assert.deepEqual(diagnostics, [
    { line: 156, message: 'Missing character: There is no † ("2020) in font ptmr8t!' },
    { line: 680, message: 'Missing character: There is no – ("2013) in font ptmr8t!' },
  ]);
  assert.doesNotThrow(() => parseLatexDiagnostics('warning: main.tex:1: Missing character: There is no ? ("FFFFFF) in font test!'));
});

test("aborting an active compilation terminates its entire process group", { skip: process.platform === "win32" }, async () => {
  const controller = new AbortController();
  const { runCompiler } = require("./latex-workspace.cjs");
  let descendant;
  const code = `
    const child = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    process.stdout.write(String(child.pid) + "\\n");
    setInterval(() => {}, 1000);
  `;
  const result = await runCompiler(process.execPath, ["-e", code], {
    signal: controller.signal,
    idleTimeoutMs: 3_000,
    onOutput(chunk) {
      const pid = Number(chunk.trim());
      if (Number.isInteger(pid) && pid > 0) {
        descendant = pid;
        controller.abort();
      }
    },
  });
  assert.ok(descendant);
  assert.equal(result.cancelled, true);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /compilation cancelled/);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = spawnSync("ps", ["-o", "state=", "-p", String(descendant)], { encoding: "utf8" }).stdout.trim();
    if (!status || status.startsWith("Z")) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail("the compiler descendant was still running");
});

test("selects explicit local pdfLaTeX and runs BibTeX for a referenced bibliography", { skip: process.platform === "win32" }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-local-latex-"));
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-local-latex-tools-"));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(tools, { recursive: true, force: true }); });
  createLatexProject(root, "paper");
  const script = path.join(tools, "pdflatex");
  for (const command of ["pdflatex", "bibtex"]) fs.writeFileSync(path.join(tools, command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const commands = [];
  const result = await compileLatexDocument(root, "paper/main.tex", {
    localOnly: true,
    env: { PATH: tools },
    spawnImpl(command, args, options) {
      commands.push(path.basename(command));
      if (command === script) {
        assert.ok(args.includes("-no-shell-escape"));
        const target = args.find(arg => arg.startsWith("-output-directory=")).slice("-output-directory=".length);
        fs.writeFileSync(path.join(target, "main.aux"), "\\bibdata{references}");
        fs.writeFileSync(path.join(target, "main.pdf"), "%PDF fixture");
      } else {
        assert.equal(options.env.BIBINPUTS.split(path.delimiter)[0], fs.realpathSync(path.join(root, "paper")));
        assert.deepEqual(args, ["main"]);
      }
      return spawn(command, args, options);
    },
  });
  assert.equal(result.ok, true, result.log);
  assert.equal(result.engine, "pdflatex");
  assert.deepEqual(commands, ["pdflatex", "bibtex", "pdflatex", "pdflatex"]);
});

test("finds local compilers through a case-insensitive Path variable", () => {
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-compiler-"));
  try {
    const executable = path.join(tools, "latexmk.exe");
    fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    assert.equal(findExecutable(["latexmk.exe"], { Path: tools }), executable);
    assert.equal(findLocalLatexCompiler({ Path: tools }), executable);
  } finally {
    fs.rmSync(tools, { recursive: true, force: true });
  }
});
