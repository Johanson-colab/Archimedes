const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const marketplace = require("./extensions-marketplace.cjs");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("extension marketplace lists the bundled index and installs a skill package", async () => {
  const userData = tempDir("archimedes-extensions-");
  const workspace = tempDir("archimedes-workspace-");
  marketplace.initialize(userData);
  marketplace.saveSources([{ id: "archimedes", name: "Archimedes index", type: "archimedes", url: "", enabled: true, builtin: true }]);

  const feed = await marketplace.listExtensions({ workspace, limit: 24 });
  assert.ok(feed.items.length >= 8);
  assert.equal(feed.total, feed.items.length);
  assert.ok(feed.items.some((item) => item.type === "skill"));
  assert.ok(feed.items.some((item) => item.type === "mcp"));

  const skill = feed.items.find((item) => item.id === "archimedes/paper-review");
  assert.ok(skill);
  const preview = await marketplace.previewExtension({ id: skill.id, workspace });
  assert.equal(preview.filename, "SKILL.md");
  assert.match(preview.content, /Paper Review/);

  const installed = await marketplace.installExtension({ id: skill.id, workspace, scope: "workspace" });
  assert.ok(installed.path.startsWith(path.join(workspace, ".agents", "skills")));
  assert.ok(fs.existsSync(path.join(installed.path, "SKILL.md")));
  assert.ok(fs.existsSync(path.join(installed.path, ".archimedes-extension.json")));

  const refreshed = await marketplace.listExtensions({ workspace, limit: 24 });
  const installedItem = refreshed.items.find((item) => item.id === skill.id);
  assert.equal(installedItem.installed, true);
  assert.equal(installedItem.installedScope, "workspace");
  assert.equal(installedItem.updateAvailable, false);
});

test("extension marketplace normalizes custom sources and keeps the bundled index", () => {
  const userData = tempDir("archimedes-extensions-");
  marketplace.initialize(userData);
  const sources = marketplace.saveSources([
    { id: "lab", name: "Lab index", type: "json", url: "https://example.org/extensions.json", enabled: true },
  ]);
  assert.equal(sources[0].id, "archimedes");
  assert.ok(sources.some((source) => source.id === "lab"));
  marketplace.resetSources();
  assert.ok(marketplace.listSources().some((source) => source.id === "archimedes"));
});

test("source credentials migrate privately and stay bound to the configured destination", async t => {
  const dir = tempDir("archimedes-source-token-");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "extension-sources.json");
  const secret = "synthetic-source-credential";
  const source = { id: "lab", type: "json", name: "Lab", url: "https://lab.example/feed", enabled: true };
  const original = JSON.stringify({ sources: [{ ...source, token: secret }] });
  fs.writeFileSync(file, original);
  const storage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() };
  marketplace.initialize(dir, { ...storage, getSelectedStorageBackend: () => "basic_text" });
  assert.throws(() => marketplace.listSources(), /encryption is unavailable/);
  assert.equal(fs.readFileSync(file, "utf8"), original);
  marketplace.initialize(dir, storage);
  const rename = t.mock.method(fs, "renameSync", () => { throw new Error("fixture write interrupted"); });
  assert.throws(() => marketplace.listSources(), /interrupted/);
  assert.equal(fs.readFileSync(file, "utf8"), original);
  rename.mock.restore();

  const listed = marketplace.listSources();
  const saved = marketplace.saveSources(listed);
  const persisted = fs.readFileSync(file, "utf8");
  assert.ok(!persisted.includes(secret));
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const requests = [];
  let echo = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([url, options.headers.Authorization, options.redirect]);
    return Response.json(echo ? [{ id: "echo", name: secret }] : []);
  });
  const feed = await marketplace.listExtensions({ workspace: dir, refresh: true });
  assert.deepEqual(requests[0], [source.url, "Bearer " + secret, "error"]);
  echo = true;
  const rejected = await marketplace.listExtensions({ workspace: dir, refresh: true });
  assert.match(rejected.sources.find(row => row.id === "lab").error, /returned its credential/);
  assert.ok(listed.find(row => row.id === "lab").hasToken);
  marketplace.saveSources([{ ...source, url: "https://another.example/feed" }]);
  await marketplace.listExtensions({ workspace: dir, refresh: true });
  assert.equal(requests.at(-1)[1], undefined);
  assert.equal(marketplace.saveSources([{ ...source, token: "replacement-fixture" }]).at(-1).hasToken, true);
  assert.equal(marketplace.saveSources([{ ...source, token: "" }]).at(-1).hasToken, false);
  for (const result of [listed, saved, feed, rejected, marketplace.resetSources()]) {
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(!JSON.stringify(result).includes("encryptedToken"));
  }
});
