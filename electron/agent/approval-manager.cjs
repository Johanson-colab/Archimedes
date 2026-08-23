const pendingApprovals = new Map();
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

function waitForApproval(actionId, signal) {
  return new Promise((resolve, reject) => {
    const finish = (result, error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      pendingApprovals.delete(actionId);
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(null, new Error("Agent run interrupted while waiting for approval."));
    const timeout = setTimeout(() => finish({ approved: false, reason: "approval_timeout" }), APPROVAL_TIMEOUT_MS);
    pendingApprovals.set(actionId, (approved) => finish({ approved, reason: approved ? "approved" : "rejected" }));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveApproval(actionId, approved) {
  const resolve = pendingApprovals.get(actionId);
  if (!resolve) return false;
  resolve(Boolean(approved));
  return true;
}

module.exports = { resolveApproval, waitForApproval };
