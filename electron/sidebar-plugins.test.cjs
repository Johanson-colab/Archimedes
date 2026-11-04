const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

const plugins = require("./sidebar-plugins.cjs");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function checksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function manifestContent(overrides = {}) {
  return `${JSON.stringify({
    id: "focus-timer",
    name: "Focus Timer",
    version: "1.0.0",
    section: "create",
    icon: "timer",
    entry: "main.mjs",
    engine: ">=0.1",
    ...overrides,
  }, null, 2)}\n`;
}

const entryContent = "export function activate() { return { view() { return null; } }; }\n";

function pluginItem(overrides = {}) {
  const manifest = manifestContent(overrides.manifest || {});
  const files = [
    { path: "manifest.json", content: manifest },
    { path: "main.mjs", content: entryContent },
  ];
  return {
    id: "archimedes/focus-timer",
    name: "Focus Timer",
    type: "ui-plugin",
    version: "1.0.0",
    sourceType: "archimedes",
    sourceId: "archimedes",
    engine: ">=0.1",
    checksums: Object.fromEntries(files.map((file) => [file.path, checksum(file.content)])),
    files,
    ...overrides.item,
  };
}

test("sidebar plugin installs verify checksums and land in the app plugin root", () => {
  const userData = tempDir("archimedes-plugins-");
  plugins.initialize(userData);
  const item = pluginItem();
  const result = plugins.installUiPlugin(item, { hostVersion: "0.1.0" });
  assert.equal(result.scope, "app");
  assert.ok(fs.existsSync(path.join(result.path, "manifest.json")));
  assert.ok(fs.existsSync(path.join(result.path, "main.mjs")));
  assert.ok(fs.existsSync(path.join(result.path, ".archimedes-plugin.json")));

  const listed = plugins.listPlugins();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "focus-timer");
  assert.equal(listed[0].section, "create");
  assert.equal(listed[0].enabled, true);
  assert.equal(listed[0].icon, "timer");
  assert.ok(plugins.installedIndex().has("archimedes/focus-timer"));
});

test("sidebar plugin installs reject checksum mismatches and missing coverage", () => {
  const userData = tempDir("archimedes-plugins-");
  plugins.initialize(userData);
  const item = pluginItem();
  item.checksums["main.mjs"] = "0".repeat(64);
  assert.throws(() => plugins.installUiPlugin(item, { hostVersion: "0.1.0" }), /does not match its checksum/);

  const uncovered = pluginItem();
  delete uncovered.checksums["main.mjs"];
  assert.throws(() => plugins.installUiPlugin(uncovered, { hostVersion: "0.1.0" }), /no declared checksum/);

  const noChecksums = pluginItem();
  noChecksums.checksums = null;
  assert.throws(() => plugins.installUiPlugin(noChecksums, { hostVersion: "0.1.0" }), /checksums/);
});

test("sidebar plugin installs gate on the official source and engine compatibility", () => {
  const userData = tempDir("archimedes-plugins-");
  plugins.initialize(userData);
  const community = pluginItem();
  community.sourceType = "github";
  assert.throws(() => plugins.installUiPlugin(community, { hostVersion: "0.1.0" }), /official Archimedes index/);

  const newer = pluginItem({ manifest: { engine: ">=9.0" } });
  newer.engine = ">=9.0";
  assert.throws(() => plugins.installUiPlugin(newer, { hostVersion: "0.1.0" }), /update the app first/);

  assert.equal(plugins.engineCompatible(">=0.1", "0.1.0"), true);
  assert.equal(plugins.engineCompatible(">=0.2", "0.1.9"), false);
  assert.equal(plugins.engineCompatible(">=1.0", "0.9.9"), false);
  assert.equal(plugins.engineCompatible("", "0.1.0"), true);
});

test("sidebar plugin manifests are validated before install", () => {
  const badSection = plugins.validateManifest({ id: "ok-id", name: "Ok", version: "1.0.0", section: "sidebar" });
  assert.match(badSection.error, /section/);
  const badEntry = plugins.validateManifest({ id: "ok-id", name: "Ok", version: "1.0.0", section: "knowledge", entry: "../escape.mjs" });
  assert.match(badEntry.error, /entry/);
  const badId = plugins.validateManifest({ id: "", name: "Ok", version: "1.0.0", section: "knowledge" });
  assert.match(badId.error, /id/);
  const ok = plugins.validateManifest({ id: "ok-id", name: "Ok", version: "1.0.0", section: "knowledge" });
  assert.equal(ok.manifest.entry, "main.mjs");
  assert.equal(ok.manifest.icon, "puzzle");
});

test("the plugin file resolver blocks traversal and missing files", () => {
  const userData = tempDir("archimedes-plugins-");
  plugins.initialize(userData);
  plugins.installUiPlugin(pluginItem(), { hostVersion: "0.1.0" });
  assert.ok(plugins.resolvePluginFile("focus-timer", "main.mjs"));
  assert.equal(plugins.resolvePluginFile("focus-timer", "../secret.txt"), null);
  assert.equal(plugins.resolvePluginFile("focus-timer", "..\\secret.txt"), null);
  assert.equal(plugins.resolvePluginFile("focus-timer", "a/../../secret.txt"), null);
  assert.equal(plugins.resolvePluginFile("focus-timer", "missing.mjs"), null);
  assert.equal(plugins.resolvePluginFile("", "main.mjs"), null);
});

test("sidebar plugins can be disabled and removed", () => {
  const userData = tempDir("archimedes-plugins-");
  plugins.initialize(userData);
  plugins.installUiPlugin(pluginItem(), { hostVersion: "0.1.0" });
  const disabled = plugins.setEnabled("focus-timer", false);
  assert.equal(disabled[0].enabled, false);
  assert.equal(plugins.listPlugins()[0].enabled, false);
  const enabled = plugins.setEnabled("focus-timer", true);
  assert.equal(enabled[0].enabled, true);
  const removed = plugins.removePlugin("focus-timer");
  assert.equal(removed.length, 0);
  assert.equal(fs.existsSync(path.join(userData, "plugins", "focus-timer", "manifest.json")), false);
});
