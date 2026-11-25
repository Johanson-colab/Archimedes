const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const { saveCollision, warning } = require("./test-support/native-session-collision-fixture.cjs");

test("a native collision is distinguishable from identical conversation text after reopening its owner", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-native-collision-")));
  t.after(() => {
    store.closeAllWorkspaces();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const { copy, threadId, failure } = await saveCollision(root);
  assert.equal(failure.status, "failed");
  store.closeAllWorkspaces();
  const restored = store.createWorkspaceStore(copy).getResearchThread(threadId);
  assert.equal(restored.messages[0].text, warning);
  assert.equal(restored.messages[1].text, warning);
  assert.match(restored.messages.at(-1).text, /Archimedes could not complete this task/);
  const errors = restored.events.filter(event => event.type === "native_session_busy");
  assert.deepEqual(errors.map(({ turn_id, payload }) => [turn_id, payload]), [[failure.turnId, { backend: "codex" }]]);
});
