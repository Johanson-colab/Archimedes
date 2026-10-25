const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { defaults, initialize, journeySettings, normalize, resetJourneySettings, saveJourneySettings } = require("./journey-settings.cjs");

test("journey settings expose the documented defaults", () => {
  const value = defaults();
  assert.equal(value.defaultView, "story");
  assert.equal(value.mapMode, "auto");
  assert.equal(value.mapChapters, 8);
  assert.equal(value.mapSteps, 150);
  assert.equal(value.maxChapters, 10);
  assert.equal(value.targetEpisodes, 4);
  assert.equal(value.episodeCadence, 12);
  assert.equal(value.idleDelay, 60);
  assert.equal(value.briefInterval, 5);
  assert.equal(value.summaryModel, "current");
  assert.equal(value.maxPinned, 5);
  assert.equal(value.summaryTokenBudget, 500);
});

test("journey settings clamp ranges and reject unknown options", () => {
  const value = normalize({
    defaultView: "nope",
    mapMode: "nope",
    mapChapters: 2,
    mapSteps: 9999,
    maxChapters: 99,
    targetEpisodes: 1,
    episodeCadence: 99,
    idleDelay: 1,
    briefInterval: 0,
    maxPinned: 99,
    summaryTokenBudget: 9999,
    summaryLength: "nope",
    summaryModel: "nope",
    chapterDetection: "nope",
    sinceYouLeft: "yes",
  });
  assert.equal(value.defaultView, "story");
  assert.equal(value.mapMode, "auto");
  assert.equal(value.mapChapters, 4);
  assert.equal(value.mapSteps, 500);
  assert.equal(value.maxChapters, 16);
  assert.equal(value.targetEpisodes, 3);
  assert.equal(value.episodeCadence, 24);
  assert.equal(value.idleDelay, 20);
  assert.equal(value.briefInterval, 1);
  assert.equal(value.maxPinned, 10);
  assert.equal(value.summaryTokenBudget, 800);
  assert.equal(value.summaryLength, "standard");
  assert.equal(value.summaryModel, "current");
  assert.equal(value.chapterDetection, "ai");
  assert.equal(value.sinceYouLeft, true);
});

test("journey settings persist, merge, and reset", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-journey-"));
  try {
    initialize(userData);
    const saved = saveJourneySettings({ mapMode: "always", maxChapters: 12 });
    assert.equal(saved.mapMode, "always");
    assert.equal(saved.maxChapters, 12);
    assert.equal(saved.mapChapters, 8);
    assert.equal(journeySettings().mapMode, "always");
    assert.notEqual(journeySettings(), journeySettings());
    const reset = resetJourneySettings();
    assert.equal(reset.mapMode, "auto");
    assert.equal(reset.maxChapters, 10);
    const onDisk = JSON.parse(fs.readFileSync(path.join(userData, "journey-settings.json"), "utf8"));
    assert.equal(onDisk.mapMode, "auto");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
