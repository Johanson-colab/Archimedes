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
