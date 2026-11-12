const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stripTypeScriptTypes } = require("node:module");
const compiled = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../src/session-comment-presentation.ts"), "utf8"));
const { sessionCommentSummaryWidth, sessionCommentSummary, sessionCommentPopoverPoint } = new Function(compiled.replace(/export /g, "") + "\nreturn { sessionCommentSummaryWidth, sessionCommentSummary, sessionCommentPopoverPoint };")();

test("summary widths follow the conversation pane and have readable bounds", () => {
  assert.equal(sessionCommentSummaryWidth(1560), 220);
  assert.equal(sessionCommentSummaryWidth(550), 121);
  assert.equal(sessionCommentSummaryWidth(320), 70);
  assert.equal(sessionCommentSummaryWidth(100), 64);
});
test("summaries show the opening text without destroying Unicode or multiline content", () => {
  assert.equal(sessionCommentSummary("  检查样本数量\n  然后验证结论 👩‍🔬  "), "检查样本数量 然后验证结论 👩‍🔬");
});
test("composer stays near the clicked point rather than jumping to the right edge", () => {
  assert.deepEqual(sessionCommentPopoverPoint({ x: 450, y: 240 }, { left: 280, right: 1400, top: 48, bottom: 800 }, 300), { x: 458, y: 248 });
});
test("composer shifts and flips at the conversation viewport edges", () => {
  const point = sessionCommentPopoverPoint({ x: 1320, y: 770 }, { left: 280, right: 1400, top: 48, bottom: 800 }, 300);
  assert.equal(point.x, 1092);
  assert.equal(point.y, 578);
  assert.ok(point.x + 300 <= 1400);
  assert.ok(point.y + 184 <= 800);
});

test("hover previews do not cover the summary button, even when flipped above it", () => {
  const bounds = { left: 0, right: 1560, top: 48, bottom: 900 };
  assert.equal(sessionCommentPopoverPoint({ x: 1300, y: 180 }, bounds, 300, 184, 24).y, 212);
  const above = sessionCommentPopoverPoint({ x: 1300, y: 850 }, bounds, 300, 184, 24);
  assert.ok(above.y + 184 < 850);
});
