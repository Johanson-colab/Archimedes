const pendingApprovals = new Map();
const claimedThreads = new Set();

// A claimed approval never waits longer than this, even when a surface is mounted.
const MAX_APPROVAL_MS = 5 * 60 * 1000;
// If no surface has claimed the thread by now, nobody can answer the prompt, so
// failing fast beats stranding the turn for minutes.
const NO_SURFACE_GRACE_MS = 5 * 1000;

/**
 * A surface declares that it can render approvals for a thread. Without a claim
 * the agent must not block: the prompt would be shown nowhere.
 */
function setApprovalSurface(threadId, active) {
  if (!threadId) return false;
  if (active) claimedThreads.add(threadId);
  else claimedThreads.delete(threadId);
  return claimedThreads.has(threadId);
}

function hasApprovalSurface(threadId) {
  return Boolean(threadId) && claimedThreads.has(threadId);
}

function waitForApproval(actionId, signal, threadId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timers = [];
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      signal?.removeEventListener("abort", onAbort);
      pendingApprovals.delete(actionId);
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(null, new Error("Agent run interrupted while waiting for approval."));
    signal?.addEventListener("abort", onAbort, { once: true });
    pendingApprovals.set(actionId, (approved) => finish({ approved, reason: approved ? "approved" : "rejected" }));
    timers.push(setTimeout(() => finish({ approved: false, reason: "approval_timeout" }), MAX_APPROVAL_MS));
    if (threadId) {
      timers.push(setTimeout(() => {
        if (!claimedThreads.has(threadId)) finish({ approved: false, reason: "no_surface" });
      }, NO_SURFACE_GRACE_MS));
    }
  });
}

function resolveApproval(actionId, approved) {
  const resolve = pendingApprovals.get(actionId);
  if (!resolve) return false;
  resolve(Boolean(approved));
  return true;
}

module.exports = { hasApprovalSurface, resolveApproval, setApprovalSurface, waitForApproval };
