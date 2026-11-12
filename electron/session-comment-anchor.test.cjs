const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stripTypeScriptTypes } = require("node:module");
const compiled = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../src/session-comment-anchor.ts"), "utf8"));
const { captureSessionCommentAnchor, readSessionCommentAnchor, sessionCommentY } = new Function(compiled.replace(/export /g, "") + "\nreturn { captureSessionCommentAnchor, readSessionCommentAnchor, sessionCommentY };")();

test("anchors keep their document y and attach to the selected message", () => {
  const anchor = captureSessionCommentAnchor(250, [{ id: "a", top: 100, height: 200 }]);
  assert.equal(anchor.y, 250);
  assert.equal(anchor.messageId, "a");
  assert.equal(anchor.fraction, .75);
  assert.equal(sessionCommentY(anchor, [{ id: "a", top: 400, height: 400 }], 2000), 700);
});
test("whitespace anchors retain an offset after the nearest message", () => {
  const anchor = captureSessionCommentAnchor(500, [{ id: "a", top: 100, height: 200 }]);
  assert.equal(anchor.fraction, undefined);
  assert.equal(sessionCommentY(anchor, [{ id: "a", top: 300, height: 200 }], 2000), 700);
});
test("paginated message anchors wait for history rather than attaching to the wrong text", () => {
  assert.equal(sessionCommentY(captureSessionCommentAnchor(50, [{ id: "early", top: 0, height: 100 }]), [], 1000), null);
  assert.equal(sessionCommentY(captureSessionCommentAnchor(50, [{ id: "removed", top: 0, height: 100 }]), [], 1000, true), 50);
});
test("raw y anchors clamp to content and legacy or invalid anchors are rejected", () => {
  assert.equal(readSessionCommentAnchor({}), null);
  assert.equal(readSessionCommentAnchor(null), null);
  assert.equal(readSessionCommentAnchor("legacy"), null);
  for (const y of [NaN, Infinity, -1, "12"]) assert.equal(readSessionCommentAnchor({ type: "session-position", version: 1, y }), null);
  const anchor = captureSessionCommentAnchor(1000, []);
  assert.equal(sessionCommentY(anchor, [], 300), 276);
  assert.equal(captureSessionCommentAnchor(NaN, []).y, 0);
});
