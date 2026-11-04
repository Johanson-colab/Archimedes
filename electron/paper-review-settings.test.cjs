const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const settings = require("./paper-review-settings.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-settings-"));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Best-effort Windows cleanup.
  }
}

test("defaults to the main agent model and the first venue pack", () => {
  const dir = tempDir();
  try {
    const value = settings.initialize(dir);
    assert.equal(value.model.mode, "agent");
    assert.equal(value.model.apiKey, "");
    assert.ok(value.defaultVenueId);
    assert.ok(value.concurrency >= 1);
  } finally {
    cleanup(dir);
  }
});

test("custom provider settings persist without exposing the key", () => {
  const dir = tempDir();
  try {
    settings.initialize(dir);
    const saved = settings.saveSettings({
      defaultVenueId: "neurips-2026-main",
      concurrency: 6,
      model: {
        mode: "custom",
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        apiKey: "sk-secret",
      },
    });
    assert.equal(saved.defaultVenueId, "neurips-2026-main");
    assert.equal(saved.concurrency, 6);
    assert.equal(saved.model.mode, "custom");
    assert.equal(saved.model.apiKey, "");
    assert.equal(saved.model.configured, true);

    const kept = settings.saveSettings({ model: { apiKey: "" } });
    assert.equal(kept.model.configured, true);
    assert.equal(settings.getPrivateSettings().model.apiKey, "sk-secret");

    const cleared = settings.clearApiKey();
    assert.equal(cleared.model.configured, false);
    assert.equal(settings.getPrivateSettings().model.apiKey, "");
  } finally {
    cleanup(dir);
  }
});

test("normalisation clamps concurrency and falls back on unknown venues", () => {
  const value = settings.normalize({
    defaultVenueId: "not-a-venue",
    concurrency: 99,
    model: { mode: "custom", provider: "custom", baseUrl: "https://api.example.com", model: "x", apiKey: "k" },
  });
  assert.ok(value.defaultVenueId);
  assert.equal(value.concurrency, 8);
  assert.throws(() => settings.normalize({ model: { baseUrl: "http://example.com/v1" } }), /HTTPS/);
});
