const assert = require("node:assert/strict");
const test = require("node:test");
const { hasApprovalSurface, resolveApproval, setApprovalSurface, waitForApproval } = require("./agent/approval-manager.cjs");

test("a claimed thread keeps waiting for a human decision", async () => {
  setApprovalSurface("thread-claimed", true);
  assert.equal(hasApprovalSurface("thread-claimed"), true);
  const pending = waitForApproval("action-claimed", undefined, "thread-claimed");
  setTimeout(() => resolveApproval("action-claimed", true), 20);
  const decision = await pending;
  assert.deepEqual(decision, { approved: true, reason: "approved" });
  setApprovalSurface("thread-claimed", false);
  assert.equal(hasApprovalSurface("thread-claimed"), false);
});

test("an unclaimed thread fails fast instead of stranding the turn", async () => {
  const started = Date.now();
  const decision = await waitForApproval("action-unclaimed", undefined, "thread-never-mounted");
  assert.deepEqual(decision, { approved: false, reason: "no_surface" });
  // The grace window is seconds, not the old ten-minute ceiling.
  assert.ok(Date.now() - started < 10_000);
});

test("interrupting a run rejects a pending approval", async () => {
  setApprovalSurface("thread-abort", true);
  const controller = new AbortController();
  const pending = waitForApproval("action-abort", controller.signal, "thread-abort");
  controller.abort();
  await assert.rejects(pending, /interrupted while waiting for approval/);
  setApprovalSurface("thread-abort", false);
});
