const assert = require("node:assert/strict");
const test = require("node:test");

const { activityLabel, observationInterval, scoreActivity, scoreToLevel, shouldObserve, smoothActivity } = require("../src/activityPulse.ts");

const now = 1_000_000;

test("maps pointer, typing, and scroll rates to a bounded score", () => {
  assert.equal(scoreActivity({ pointer: 0, keys: 0, scroll: 0, lastInputAt: 0 }, now), 0);
  const busy = scoreActivity({ pointer: 600, keys: 180, scroll: 120, lastInputAt: now }, now);
  assert.ok(busy > 0.95, `expected busy score, got ${busy}`);
  const typing = scoreActivity({ pointer: 0, keys: 180, scroll: 0, lastInputAt: now }, now);
  assert.ok(typing > 0.4, `expected typing to cross the active threshold, got ${typing}`);
});

test("smoothing reacts without jumping to the new maximum", () => {
  assert.equal(smoothActivity(0, 1), 0.45);
  assert.ok(Math.abs(smoothActivity(0.45, 0) - 0.2475) < 1e-9);
});

test("activity levels drive the observation cadence", () => {
  assert.equal(scoreToLevel(0.9), "intense");
  assert.equal(scoreToLevel(0.5), "active");
  assert.equal(scoreToLevel(0.2), "calm");
  assert.equal(scoreToLevel(0.05), "idle");
  assert.equal(observationInterval("intense"), 4_000);
  assert.equal(observationInterval("active"), 7_000);
  assert.equal(observationInterval("calm"), 15_000);
  assert.equal(observationInterval("idle"), 45_000);
  assert.equal(activityLabel("active"), "Active");
});

test("does not observe an idle or stale window", () => {
  assert.equal(shouldObserve({ level: "idle", score: 0, pointerRate: 0, keyRate: 0, scrollRate: 0, lastInputAt: 0, sampledAt: now }, now), false);
  assert.equal(shouldObserve({ level: "active", score: 0.5, pointerRate: 300, keyRate: 80, scrollRate: 0, lastInputAt: now, sampledAt: now }, now), true);
  assert.equal(shouldObserve({ level: "active", score: 0.5, pointerRate: 300, keyRate: 80, scrollRate: 0, lastInputAt: now - 31_000, sampledAt: now }, now), false);
});
