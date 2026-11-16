const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { captureManuscriptSources, readManuscriptSnapshot, pruneManuscriptPreviews } = require("./manuscript-snapshot.cjs");
const { compileLatexDocument } = require("./latex-workspace.cjs");
const { createManagedCompiler } = require("./managed-latex-engine.cjs");
const hash = data => createHash("sha256").update(data).digest("hex");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-manuscript-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "paper/figures"), { recursive: true });
  fs.writeFileSync(path.join(root, "paper/main.tex"), "\\input{section}\n");
  fs.writeFileSync(path.join(root, "paper/section.tex"), "Section one");
  fs.writeFileSync(path.join(root, "paper/refs.bib"), "Bibliography one");
  fs.writeFileSync(path.join(root, "paper/figures/plot.png"), Buffer.from([1, 2, 3]));
  return root;
}

function compilerFixture(onStart = () => {}, delay = 0) {
  return (_command, args, options) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    const text = fs.readFileSync(path.join(options.cwd, "section.tex"), "utf8");
    const out = args[args.indexOf("--outdir") + 1];
    onStart(options.cwd, text);
    setTimeout(() => {
      fs.writeFileSync(path.join(out, "main.pdf"), `%PDF-controlled-fixture ${text}`);
      child.stdout.emit("data", `Controlled compiler: ${text}\n`);
      child.emit("close", 0, null);
    }, delay);
    return child;
  };
}

test("manuscript version covers sections, bibliography and images while excluding generated/environment caches", t => {
  const root = fixture(t), first = captureManuscriptSources(root, "paper/main.tex");
  assert.equal(first.files.length, 4);
  for (const name of [".archimedes", ".git", ".venv", "node_modules"]) { fs.mkdirSync(path.join(root, "paper", name)); fs.writeFileSync(path.join(root, "paper", name, "cache"), "generated"); }
  assert.equal(captureManuscriptSources(root, "paper/main.tex").source_version, first.source_version);
  let previous = first.source_version;
  for (const name of ["section.tex", "refs.bib", "figures/plot.png"]) {
    fs.appendFileSync(path.join(root, "paper", name), "changed");
    const next = captureManuscriptSources(root, "paper/main.tex").source_version;
    assert.notEqual(next, previous, name); previous = next;
  }
});

test("successive builds retain immutable PDF/log bytes and a fresh source/PDF handoff check", async t => {
  const root = fixture(t), spawnImpl = compilerFixture();
  const first = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl });
  const firstBytes = fs.readFileSync(path.join(root, first.pdf_path));
  const firstLog = fs.readFileSync(path.join(root, first.source_snapshot.log.path));
  assert.equal(first.ok, true); assert.equal(readManuscriptSnapshot(root, first.source_snapshot.manifest_path).current, true);
  assert.equal(first.source_snapshot.pdf.sha256, hash(firstBytes));
  assert.equal(first.source_snapshot.log.sha256, hash(firstLog));
  fs.writeFileSync(path.join(root, "paper/section.tex"), "Section two");
  const second = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl });
  assert.notEqual(first.pdf_path, second.pdf_path);
  assert.deepEqual(fs.readFileSync(path.join(root, first.pdf_path)), firstBytes);
  assert.deepEqual(fs.readFileSync(path.join(root, first.source_snapshot.log.path)), firstLog);
  const old = readManuscriptSnapshot(root, first.source_snapshot.manifest_path);
  assert.equal(old.current, false); assert.equal(old.source_matches, false); assert.equal(old.pdf_matches, true);
  assert.equal(readManuscriptSnapshot(root, second.source_snapshot.manifest_path).current, true);
  fs.appendFileSync(path.join(root, second.pdf_path), "external PDF change");
  assert.equal(readManuscriptSnapshot(root, second.source_snapshot.manifest_path).pdf_matches, false);
});

test("changes during compilation produce a stale receipt instead of a current PDF", async t => {
  const root = fixture(t);
  const result = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl: compilerFixture(() => { fs.writeFileSync(path.join(root, "paper/refs.bib"), "Changed while running"); }) });
  assert.equal(result.ok, false); assert.equal(result.pdf_path, "");
  assert.equal(result.source_snapshot.status, "stale");
  assert.match(result.diagnostics[0].message, /sources changed during/);
  assert.ok(result.source_snapshot.pdf.sha256);
});

test("removing a source while compiling retains an inspectable stale build", async t => {
  const root = fixture(t);
  const result = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl: compilerFixture(() => fs.unlinkSync(path.join(root, "paper/main.tex"))) });
  assert.equal(result.ok, false);
  assert.equal(result.source_snapshot.status, "stale");
  assert.equal(readManuscriptSnapshot(root, result.source_snapshot.manifest_path).current, false);
});

test("untracked symbolic-link inputs cannot be handed off as a verified current build", async t => {
  const root = fixture(t);
  fs.symlinkSync(path.join(root, "paper/figures"), path.join(root, "paper/linked-figures"), process.platform === "win32" ? "junction" : "dir");
  const result = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl: compilerFixture() });
  assert.equal(result.ok, true, "preview remains available");
  assert.equal(result.source_snapshot.status, "unverified");
  assert.equal(result.source_snapshot.requested_source.untracked_inputs[0].path, "paper/linked-figures");
  const checked = readManuscriptSnapshot(root, result.source_snapshot.manifest_path);
  assert.equal(checked.source_matches, true);
  assert.equal(checked.pdf_matches, true);
  assert.equal(checked.current, false, "unknown input coverage is not certified by matching hashes");
  const other = fixture(t);
  fs.mkdirSync(path.dirname(path.join(other, result.source_snapshot.manifest_path)), { recursive: true });
  fs.copyFileSync(path.join(root, result.source_snapshot.manifest_path), path.join(other, result.source_snapshot.manifest_path));
  assert.throws(() => readManuscriptSnapshot(other, result.source_snapshot.manifest_path), /does not belong/);
});

test("the actual preload and snapshot handler recheck disk bytes at handoff time", async t => {
  const vm = require("node:vm");
  const root = fixture(t), result = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl: compilerFixture() });
  const handlers = new Map(); let api;
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const begin = main.indexOf('  ipcMain.handle("paper:build-snapshot",');
  const end = main.indexOf('  ipcMain.handle("paper:compile",', begin);
  assert.ok(begin >= 0 && end > begin, "keep the actual handler in this boundary probe");
  vm.runInNewContext(main.slice(begin, end), {
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    resolveWorkspace: value => { assert.equal(value, root); return root; },
    require: name => { assert.equal(name, "./manuscript-snapshot.cjs"); return require(name); },
  });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), {
    process: { platform: process.platform },
    require: name => {
      assert.equal(name, "electron");
      return { contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: { invoke: (name, input) => handlers.get(name)({}, input) }, webUtils: {} };
    },
  });
  assert.equal((await api.readManuscriptSnapshot(root, result.source_snapshot.manifest_path)).current, true);
  fs.appendFileSync(path.join(root, "paper/refs.bib"), "Changed after preview");
  const checked = await api.readManuscriptSnapshot(root, result.source_snapshot.manifest_path);
  assert.equal(checked.current, false); assert.equal(checked.source_matches, false); assert.equal(checked.pdf_matches, true);
});

test("queued builds coalesce unchanged inputs, distinguish changed section/bib, and preserve root ownership", async t => {
  const a = fixture(t), b = fixture(t), runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-compiler-cache-"));
  t.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  const platform = process.platform, arch = process.arch, binary = Buffer.from("controlled compiler, never executed");
  const file = path.join(runtimeRoot, "engines/test", `${platform}-${arch}`, platform === "win32" ? "tectonic.exe" : "tectonic");
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, binary);
  let active = 0, maximum = 0;
  const base = compilerFixture(() => { active++; maximum = Math.max(maximum, active); }, 25);
  const spawnImpl = (...args) => { const child = base(...args); child.once("close", () => active--); return child; };
  const compile = createManagedCompiler({ runtimeRoot, platform, arch, engineManifest: { version: "test", platforms: { [`${platform}-${arch}`]: { executableSha256: hash(binary) } } }, spawnImpl });
  const first = compile(a, "paper/main.tex");
  const queuedOld = compile(b, "paper/main.tex");
  assert.equal(queuedOld, compile(b, "paper/main.tex"));
  fs.writeFileSync(path.join(b, "paper/section.tex"), "B updated section"); fs.writeFileSync(path.join(b, "paper/refs.bib"), "B updated bibliography");
  const queuedNew = compile(b, "paper/main.tex");
  assert.notEqual(queuedOld, queuedNew);
  const [ra, old, rb] = await Promise.all([first, queuedOld, queuedNew]);
  assert.equal(maximum, 1);
  assert.equal(ra.ok, true); assert.equal(ra.source_snapshot.workspace, a);
  assert.equal(old.ok, false); assert.equal(old.source_snapshot.status, "stale");
  assert.match(old.log, /changed while this build was queued/);
  assert.equal(rb.ok, true); assert.equal(rb.source_snapshot.workspace, b);
  assert.match(rb.log, /B updated section/);
  assert.notEqual(old.source_snapshot.requested_source.source_version, rb.source_snapshot.requested_source.source_version);
});

test("only five completed previews remain while active builds survive", async t => {
  const root = fixture(t), spawnImpl = compilerFixture();
  const first = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl });
  const parent = path.dirname(path.dirname(path.join(root, first.source_snapshot.manifest_path)));
  const active = path.join(parent, "00000000-0000-0000-0000-000000000000");
  fs.mkdirSync(active); fs.writeFileSync(path.join(active, "partial.pdf"), "active compiler output");
  let latest;
  for (let index = 0; index < 7; index++) {
    fs.writeFileSync(path.join(root, "paper/section.tex"), `Preview ${index}`);
    latest = await compileLatexDocument(root, "paper/main.tex", { executable: "tectonic", spawnImpl });
    assert.deepEqual(latest.preview_cleanup.errors, []);
  }
  assert.equal(fs.existsSync(active), true);
  const completed = fs.readdirSync(parent).filter(name => fs.existsSync(path.join(parent, name, "source-snapshot.json")));
  assert.equal(completed.length, 5);
  assert.equal(fs.existsSync(path.join(root, first.pdf_path)), false);
  assert.equal(readManuscriptSnapshot(root, latest.source_snapshot.manifest_path).current, true);
});
