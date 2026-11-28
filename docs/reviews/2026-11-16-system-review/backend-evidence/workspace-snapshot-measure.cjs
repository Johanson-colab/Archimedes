const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const repository = path.resolve(__dirname, "../../../..");
const filename = path.join(repository, "electron/workspace-files.cjs");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-snapshot-measure-")));
function measure(source) {
  let readBytes = 0, readCalls = 0;
  const measuredFs = { ...fs, readFileSync(file, ...args) {
    const value = fs.readFileSync(file, ...args);
    if (String(file).startsWith(`${root}${path.sep}`)) { readBytes += Buffer.byteLength(value); readCalls++; }
    return value;
  } };
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireOriginal = loaded.require.bind(loaded);
  loaded.require = name => name === "node:fs" ? measuredFs : requireOriginal(name);
  // The production function is intact; only fs counters are injected.
  loaded._compile(source, filename);
  const start = performance.now(), snapshot = loaded.exports.snapshotWorkspace(root), elapsedMs = performance.now() - start;
  return { readBytes, readCalls, entries: snapshot.size, elapsedMs: Math.round(elapsedMs * 100) / 100, coverage: snapshot.coverage || null };
}
try {
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(root, `${String(i).padStart(2, "0")}.txt`), "a".repeat(900_000));
  fs.mkdirSync(path.join(root, ".venv", "site-packages"), { recursive: true });
  for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(root, ".venv", "site-packages", `${i}.py`), "x".repeat(100_000));
  const original = execFileSync("git", ["show", "1f4b37581c446770d576440f9ebb9bca5c55bfb7:electron/workspace-files.cjs"], { cwd: repository, encoding: "utf8" });
  const before = measure(original), after = measure(fs.readFileSync(filename, "utf8"));
  assert.equal(before.readBytes, 39_000_000); assert.ok(after.readBytes <= 8_000_000);
  assert.equal(after.entries, 30); assert.equal(after.coverage.ignoredDirectories, 1);
  process.stdout.write(JSON.stringify({ fixture: "30x900k user text + .venv 120x100k generated Python", before, after, interpretation: "single local warm-cache observation; read-byte budget is deterministic, timing is not a UI/RSS benchmark" }) + "\n");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
