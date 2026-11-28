const approvalStates = new WeakMap();

function approvalState({ store }) {
  let state = approvalStates.get(store);
  if (!state) {
    state = { pendingApprovals: new Map(), claimedThreads: new Set() };
    approvalStates.set(store, state);
  }
  return state;
}

function scopeKey({ ownerId }, id) {
  return JSON.stringify([ownerId, id]);
}

// A claimed approval never waits longer than this, even when a surface is mounted.
const MAX_APPROVAL_MS = 5 * 60 * 1000;
// If no surface has claimed the thread by now, nobody can answer the prompt, so
// failing fast beats stranding the turn for minutes.
const NO_SURFACE_GRACE_MS = 5 * 1000;

/**
 * A surface declares that it can render approvals for a thread. Without a claim
 * the agent must not block: the prompt would be shown nowhere.
 */
function setApprovalSurface(scope, threadId, active) {
  if (!threadId) return false;
  const { claimedThreads } = approvalState(scope);
  const key = scopeKey(scope, threadId);
  if (active) claimedThreads.add(key);
  else claimedThreads.delete(key);
  return claimedThreads.has(key);
}

function hasApprovalSurface(scope, threadId) {
  return Boolean(threadId) && approvalState(scope).claimedThreads.has(scopeKey(scope, threadId));
}

function hasPendingApproval(scope, actionId) {
  return approvalState(scope).pendingApprovals.has(scopeKey(scope, actionId));
}

function waitForApproval(scope, actionId, signal, threadId) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Agent run interrupted while waiting for approval.")); return; }
    const { pendingApprovals } = approvalState(scope);
    const key = scopeKey(scope, actionId);
    if (pendingApprovals.has(key)) { reject(new Error("This approval is already pending.")); return; }
    let settled = false;
    const timers = [];
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      signal?.removeEventListener("abort", onAbort);
      pendingApprovals.delete(key);
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(null, new Error("Agent run interrupted while waiting for approval."));
    signal?.addEventListener("abort", onAbort, { once: true });
    pendingApprovals.set(key, (approved, reason) => finish({ approved, reason: reason || (approved ? "approved" : "rejected") }));
    timers.push(setTimeout(() => finish({ approved: false, reason: "approval_timeout" }), MAX_APPROVAL_MS));
    if (threadId) {
      timers.push(setTimeout(() => {
        if (!hasApprovalSurface(scope, threadId)) finish({ approved: false, reason: "no_surface" });
      }, NO_SURFACE_GRACE_MS));
    }
  });
}

function resolveApproval(scope, actionId, approved, reason) {
  const resolve = approvalState(scope).pendingApprovals.get(scopeKey(scope, actionId));
  if (!resolve) return false;
  resolve(Boolean(approved), reason);
  return true;
}

module.exports = { hasApprovalSurface, hasPendingApproval, resolveApproval, setApprovalSurface, waitForApproval };
