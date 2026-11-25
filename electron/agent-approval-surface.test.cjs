const assert = require("node:assert/strict");
const test = require("node:test");
const { hasApprovalSurface, hasPendingApproval, resolveApproval, setApprovalSurface, waitForApproval } = require("./agent/approval-manager.cjs");

const scope = { store: {}, ownerId: "researcher" };

test("a claimed thread keeps waiting for a human decision", async () => {
  setApprovalSurface(scope, "thread-claimed", true);
  assert.equal(hasApprovalSurface(scope, "thread-claimed"), true);
  const pending = waitForApproval(scope, "action-claimed", undefined, "thread-claimed");
  setTimeout(() => resolveApproval(scope, "action-claimed", true), 20);
  const decision = await pending;
  assert.deepEqual(decision, { approved: true, reason: "approved" });
  setApprovalSurface(scope, "thread-claimed", false);
  assert.equal(hasApprovalSurface(scope, "thread-claimed"), false);
});

test("an unclaimed thread fails fast instead of stranding the turn", async () => {
  const started = Date.now();
  const decision = await waitForApproval(scope, "action-unclaimed", undefined, "thread-never-mounted");
  assert.deepEqual(decision, { approved: false, reason: "no_surface" });
  // The grace window is seconds, not the old ten-minute ceiling.
  assert.ok(Date.now() - started < 10_000);
});

test("interrupting a run rejects a pending approval", async () => {
  setApprovalSurface(scope, "thread-abort", true);
  const controller = new AbortController();
  const pending = waitForApproval(scope, "action-abort", controller.signal, "thread-abort");
  controller.abort();
  await assert.rejects(pending, /interrupted while waiting for approval/);
  setApprovalSurface(scope, "thread-abort", false);
});


test("claims and decisions stay with their data store generation and owner", async () => {
  const a = { store: {}, ownerId: "original" };
  const copy = { store: {}, ownerId: "original" };
  const viewer = { store: a.store, ownerId: "viewer" };
  assert.equal(setApprovalSurface(a, "same-thread", true), true);
  assert.equal(hasApprovalSurface(copy, "same-thread"), false);
  assert.equal(hasApprovalSurface(viewer, "same-thread"), false);
  const original = waitForApproval(a, "same-action", undefined, "same-thread");
  const copied = waitForApproval(copy, "same-action");
  try {
    assert.equal(resolveApproval(viewer, "same-action", true), false);
    assert.equal(resolveApproval(copy, "same-action", false), true);
    assert.deepEqual(await copied, { approved: false, reason: "rejected" });
    assert.equal(hasPendingApproval(a, "same-action"), true);
    assert.equal(resolveApproval(a, "same-action", true), true);
    assert.deepEqual(await original, { approved: true, reason: "approved" });
    assert.equal(resolveApproval(a, "same-action", true), false);
  } finally {
    resolveApproval(a, "same-action", false);
    resolveApproval(copy, "same-action", false);
  }
});
