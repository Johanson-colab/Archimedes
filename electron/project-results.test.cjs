const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { savePackage, readPackage, readPackageFile, MAX_SOURCE_BYTES } = require("./project-results.cjs");

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-results-")));
  const input = { executionRoot: root, id: "result-1", projectId: "project-a", workspaceId: "workspace-a", threadId: "thread-a", kind: "analysis", title: "Full CSV analysis", manifest: { version: 1, source: { file: "source.csv", inputId: "file-1" }, config: { type: "scatter", x: 0, y: 1 } }, files: [
    { name: "source.csv", role: "source", encoding: "utf8", content: "x,y\r\n1,2\r\n3,4\r\n" },
    { name: "plot.svg", role: "output", encoding: "utf8", content: '<svg xmlns="http://www.w3.org/2000/svg"><text>2 rows</text></svg>' },
  ] };
  return { root, input, close() { fs.rmSync(root, { recursive: true, force: true }); } };
}

test("saved analysis has real complete source/output files and metadata-only reopen with controlled per-file reads", () => {
  const data = fixture();
  try {
    const saved = savePackage(data.input), reopened = readPackage(saved);
    assert.equal(saved.fileState, "ready"); assert.deepEqual(reopened, saved);
    assert.deepEqual(reopened.manifest.config, data.input.manifest.config);
    assert.ok(reopened.files.every((file) => !("content" in file)), "metadata IPC does not copy all dataset/image payloads");
    for (const file of data.input.files) {
      const receipt = readPackageFile(saved, file.name);
      assert.equal(receipt.content, file.content); assert.equal(receipt.fileState, "ready");
      assert.equal(fs.readFileSync(path.join(data.root, saved.files.find((item) => item.name === file.name).path), "utf8"), file.content);
    }
    assert.throws(() => readPackageFile(saved, "unregistered.csv"), /not registered/);
    fs.writeFileSync(path.join(data.root, saved.files[0].path), "external edit");
    assert.equal(readPackage(saved).fileState, "changed");
    assert.equal(readPackageFile(saved, "source.csv").content, "external edit");
    assert.equal(readPackageFile(saved, "source.csv").fileState, "changed");
    assert.throws(() => savePackage(data.input), /changed or are missing/);
    assert.equal(fs.readFileSync(path.join(data.root, saved.files[0].path), "utf8"), "external edit", "saving an older loaded analysis must not overwrite an externally edited source");
    fs.unlinkSync(path.join(data.root, saved.files[1].path));
    assert.deepEqual(readPackage(saved).missingFiles, ["plot.svg"]);
  } finally { data.close(); }
});

test("figure binary references reopen byte-for-byte without a fabricated session or model credentials", () => {
  const data = fixture();
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 0, 255]);
    const saved = savePackage({ ...data.input, kind: "figure", threadId: null, manifest: { version: 1, model: { provider: "openai", baseUrl: "https://example.invalid", imageModel: "image" }, references: [{ file: "reference.png", origin: "upload" }] }, files: [{ name: "reference.png", role: "reference", encoding: "base64", content: bytes.toString("base64") }] });
    assert.equal(saved.threadId, null);
    assert.deepEqual(Buffer.from(readPackageFile(saved, "reference.png").content, "base64"), bytes);
    assert.throws(() => savePackage({ ...data.input, manifest: { model: { apiKey: "DO_NOT_SAVE_THIS" } } }), /without credentials/);
    assert.ok(!fs.readFileSync(path.join(data.root, saved.manifestPath), "utf8").includes("DO_NOT_SAVE_THIS"));
  } finally { data.close(); }
});

test("the registered owner and fixed manifest path cannot be transplanted to another project or result", () => {
  const data = fixture();
  try {
    const saved = savePackage(data.input);
    assert.throws(() => readPackage({ ...saved, projectId: "project-b" }), /registered owner/);
    assert.throws(() => savePackage({ ...data.input, workspaceId: "workspace-b" }), /registered owner/);
    assert.throws(() => readPackage({ ...saved, manifestPath: "../outside.json" }), /registered path/);
    const manifestFile = path.join(data.root, saved.manifestPath), manifest = JSON.parse(fs.readFileSync(manifestFile));
    manifest.files[0].path = "../outside.csv"; fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.throws(() => readPackage(saved), /file path/);
  } finally { data.close(); }
});

test("result writes and reads reject symbolic-link parents and leaves rather than touching external files", () => {
  const data = fixture(), outside = fixture();
  try {
    fs.symlinkSync(outside.root, path.join(data.root, "research-results"), "dir");
    assert.throws(() => savePackage(data.input), /symbolic link/);
    assert.deepEqual(fs.readdirSync(outside.root), []);
    fs.unlinkSync(path.join(data.root, "research-results"));
    const saved = savePackage(data.input), target = path.join(data.root, saved.files[0].path);
    const external = path.join(outside.root, "kept.csv"); fs.writeFileSync(external, "keep me");
    fs.unlinkSync(target); fs.symlinkSync(external, target);
    assert.throws(() => readPackageFile(saved, "source.csv"), /symbolic link/);
    assert.throws(() => savePackage(data.input), /symbolic link/);
    assert.equal(fs.readFileSync(external, "utf8"), "keep me");
  } finally { data.close(); outside.close(); }
});

test("all package input is checked before writes and updating retains its owner and creation time", () => {
  const data = fixture();
  try {
    assert.throws(() => savePackage({ ...data.input, files: [...data.input.files, { name: "../escape", role: "output", encoding: "utf8", content: "x" }] }), /filename/);
    assert.deepEqual(fs.readdirSync(data.root), []);
    assert.throws(() => savePackage({ ...data.input, files: [{ ...data.input.files[0], content: "x".repeat(MAX_SOURCE_BYTES + 1) }] }), /10 MB limit/);
    const saved = savePackage(data.input);
    const updated = savePackage({ ...data.input, title: "Updated axes", manifest: { ...data.input.manifest, config: { type: "bar", x: 0, y: 1 } } });
    assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.title, "Updated axes");
    assert.equal(readPackage(updated).manifest.config.type, "bar"); assert.equal(updated.fileState, "ready");
    const unlinked = savePackage({ ...data.input, threadId: null });
    const linked = savePackage({ ...data.input, threadId: "actual-analysis-session" });
    assert.equal(linked.id, unlinked.id); assert.equal(readPackage(linked).threadId, "actual-analysis-session");
    assert.equal(readPackage({ ...linked, threadId: null }).threadId, null, "deleting the optional session does not orphan the result files");
  } finally { data.close(); }
});
