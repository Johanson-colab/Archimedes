const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const snapshots = require("./journey-snapshots.cjs");

test("journey snapshots persist per thread and can be cleared", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-journey-summary-"));
  try {
    snapshots.initialize(userData);
    const snapshot = {
      threadId: "thread-1",
      brief: "Brief",
      nextMove: "Continue",
      coversTo: 12,
      updatedAt: new Date().toISOString(),
      model: "test",
      source: "ai",
      chapters: [],
    };
    assert.equal(snapshots.get("thread-1"), null);
    snapshots.save(snapshot);
    assert.equal(snapshots.get("thread-1").brief, "Brief");
    assert.equal(snapshots.get("other"), null);
    snapshots.remove("thread-1");
    assert.equal(snapshots.get("thread-1"), null);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
