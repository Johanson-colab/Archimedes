const fs = require("node:fs");
const path = require("node:path");

let snapshotDir = "";

function initialize(userDataPath) {
  snapshotDir = path.join(userDataPath, "journey-summaries");
}

function safeId(threadId) {
  return String(threadId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function snapshotPath(threadId) {
  return path.join(snapshotDir, `${safeId(threadId)}.json`);
}

function get(threadId) {
  if (!snapshotDir || !threadId) return null;
  try {
    const value = JSON.parse(fs.readFileSync(snapshotPath(threadId), "utf8"));
    return value && typeof value === "object" && value.threadId === threadId ? value : null;
  } catch {
    return null;
  }
}

function save(snapshot) {
  if (!snapshotDir || !snapshot?.threadId) return null;
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath(snapshot.threadId), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

function remove(threadId) {
  if (!snapshotDir || !threadId) return;
  try { fs.rmSync(snapshotPath(threadId), { force: true }); } catch { /* snapshot cleanup is best effort */ }
}

module.exports = { get, initialize, remove, save };
