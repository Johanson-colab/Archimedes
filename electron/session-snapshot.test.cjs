const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stripTypeScriptTypes } = require("node:module");
const code = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../src/session-snapshot.ts"), "utf8"));
const { snapshotTurns, selectSnapshot, snapshotMarkdown, snapshotFileStem, canShareSessionLink } = new Function(code.replace(/export /g, "") + "\nreturn { snapshotTurns, selectSnapshot, snapshotMarkdown, snapshotFileStem, canShareSessionLink };")();
const snapshot = { id: "snapshot", sequence: 3, created_at: "2026-11-12", manifest: { thread: { title: "Study", owner_id: "private-id" }, turns: [{ id: "a", user_message: "Question A", assistant_message: "Answer A", workspace_path: "secret-path" }, { id: "b", user_message: "Question B", assistant_message: "Answer B" }], events: [{ turn_id: "a", payload: { url: "https://a.example", title: "A" } }, { turn_id: "b", payload: { url: "https://b.example", title: "B" } }, { payload: { url: "https://global.example" } }], references: [{ url: "https://all.example" }] } };

test("partial exports include only selected turns, sources, and opted-in diagnostics", () => {
  const exported = selectSnapshot(snapshot, "Study", ["b"], true, false);
  assert.deepEqual(exported.turns.map((turn) => turn.id), ["b"]);
  assert.deepEqual(exported.references.map((source) => source.url), ["https://b.example"]);
  assert.equal(exported.events, undefined);
  assert.doesNotMatch(JSON.stringify(exported), /secret-path|private-id|Question A|https:\/\/global/);
  assert.match(snapshotMarkdown(exported), /Question B/);
  assert.equal(selectSnapshot(snapshot, "Study", ["b"], false, true).events.length, 1);
});
test("scope selection does not mutate the immutable snapshot", () => {
  const before = JSON.stringify(snapshot);
  selectSnapshot(snapshot, "Study", ["a", "b"], true, true);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(selectSnapshot(snapshot, "Study", [], false, false).turns.length, 0);
  assert.equal(snapshotTurns({ turns: [null] })[0].user_message, "");
});
test("guest links cannot widen a partial or private selection or run signed out", () => {
  assert.equal(canShareSessionLink(false, false, ["a", "b"], ["a", "b"]), false);
  assert.equal(canShareSessionLink(true, false, ["a", "b"], ["b"]), false);
  assert.equal(canShareSessionLink(true, true, ["a"], ["a"]), false);
  assert.equal(canShareSessionLink(true, false, ["a", "b"], ["b", "a"]), true);
});
test("filenames preserve readable Unicode while removing unsafe filename characters", () => {
  assert.equal(snapshotFileStem('论文/实验: "A"'), "论文-实验- -A--snapshot");
  assert.equal(snapshotFileStem(""), "session-snapshot");
});
