const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const panel = read("src/ResearchPathPanel.tsx");
const app = read("src/App.tsx");

test("research path checkpoints offer only actions that change state", () => {
  assert.match(panel, /onAccept/);
  assert.match(panel, /onRequestChanges/);
  assert.match(panel, /onReturn/);
  // Branching was a local counter that announced a new branch without
  // creating one. It stays out until a real thread fork exists.
  assert.doesNotMatch(panel, /onBranch/);
  assert.doesNotMatch(panel, /t\("Branch"\)/);
  assert.doesNotMatch(app, /branchFromCheckpoint/);
  assert.doesNotMatch(app, /setBranchCount/);
});
