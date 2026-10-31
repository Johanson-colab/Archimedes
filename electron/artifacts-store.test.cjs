const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-artifacts-"));
  store.openWorkspace(root);
  const thread = store.createResearchThread({ prompt: "collect artifacts", mode: "free-chat" });
  return { root, thread };
}

test("artifacts are per thread, versioned by path, and keep the newest metadata", () => {
  const { root, thread } = workspace();
  try {
    const first = store.upsertArtifact({ threadId: thread.id, turnId: "turn-1", path: "figures/plot.png", kind: "image", sizeBytes: 120, modifiedAt: "2026-10-31T10:00:00.000Z", source: "agent" });
    assert.equal(first.version, 1);
    assert.equal(first.seen, false);
    const second = store.upsertArtifact({ threadId: thread.id, turnId: "turn-2", path: "figures/plot.png", kind: "image", sizeBytes: 240, modifiedAt: "2026-10-31T11:00:00.000Z", source: "agent" });
    assert.equal(second.id, first.id);
    assert.equal(second.version, 2);
    assert.equal(second.size_bytes, 240);
    assert.equal(second.turn_id, "turn-2");
    assert.equal(store.listArtifacts(thread.id).length, 1);

    const other = store.createResearchThread({ prompt: "other", mode: "free-chat" });
    assert.equal(store.listArtifacts(other.id).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("artifacts track unseen state and reject path traversal", () => {
  const { root, thread } = workspace();
  try {
    store.upsertArtifact({ threadId: thread.id, path: "notes/research-brief.md", kind: "markdown", source: "agent" });
    store.upsertArtifact({ threadId: thread.id, path: "data/results.csv", kind: "csv", source: "agent" });
    assert.equal(store.countUnseenArtifacts(thread.id), 2);
    assert.equal(store.markArtifactsSeen(thread.id).marked, 2);
    assert.equal(store.countUnseenArtifacts(thread.id), 0);
    store.upsertArtifact({ threadId: thread.id, path: "notes/research-brief.md", kind: "markdown", source: "agent" });
    assert.equal(store.countUnseenArtifacts(thread.id), 1);
    assert.throws(() => store.upsertArtifact({ threadId: thread.id, path: "../escape.md", kind: "markdown" }), /inside the workspace/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
