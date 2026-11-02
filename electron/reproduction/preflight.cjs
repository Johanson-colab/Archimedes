/**
 * Read-only preflight.
 *
 * Runs the checks that can be answered from the checkout alone (a file is
 * present, a file matches a pattern). Everything that needs execution is
 * reported as "needs-run" instead of being guessed, so the summary never
 * claims more than it verified.
 */

const { cloneRepositoryCheckout, getRepositoryCheckout, readRepositoryCheckoutFile } = require("../repository-checkout.cjs");
const { candidatePaths, repoNameFromUrl } = require("./paths.cjs");

function safeRegex(pattern) {
  try { return new RegExp(String(pattern), "m"); } catch { return null; }
}

/**
 * Reads the first candidate that exists. Returns the content and the path that
 * actually answered, so a plan that writes "repo/file" is resolved visibly
 * rather than silently.
 */
async function readFirstMatch(readFile, written, repoName) {
  const candidates = candidatePaths(written, repoName);
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate);
      return { path: candidate, content, tried: candidates };
    } catch {
      // Try the next candidate; the caller reports the miss.
    }
  }
  return { path: null, content: null, tried: candidates };
}

async function evaluateSteps({ steps, readFile, repoName = "" }) {
  const results = [];
  for (const step of Array.isArray(steps) ? steps : []) {
    const id = String(step?.id || "");
    if (step?.blocked) {
      results.push({ id, status: "blocked", detail: String(step.blocked) });
      continue;
    }
    const check = step?.check && typeof step.check === "object" ? step.check : { kind: "manual" };
    if (check.kind === "manual") {
      results.push({ id, status: "manual", detail: String(check.reason || "") });
      continue;
    }
    if (check.kind === "command" || check.kind === "http") {
      results.push({ id, status: "needs-run", detail: "" });
      continue;
    }
    const found = await readFirstMatch(readFile, check.path, repoName);
    if (found.content === null) {
      results.push({ id, status: "failed", detail: `${check.path} does not exist`, written: check.path });
      continue;
    }
    if (check.kind === "file_contains") {
      const pattern = safeRegex(check.pattern);
      if (!pattern) {
        results.push({ id, status: "failed", detail: `Invalid pattern: ${check.pattern}`, written: check.path });
        continue;
      }
      results.push(pattern.test(found.content)
        ? { id, status: "passed", detail: "", resolved: found.path, written: check.path }
        : { id, status: "failed", detail: `"${check.pattern}" not found in ${found.path}`, resolved: found.path, written: check.path });
      continue;
    }
    results.push({ id, status: "passed", detail: "", resolved: found.path, written: check.path });
  }
  return results;
}

async function runPreflight({ workspace, repoUrl, steps, branch = "", branchCandidates = [] }) {
  if (!repoUrl) throw new Error("This reproduction has no repository to check.");
  const options = { branch, branchCandidates };
  const existing = await getRepositoryCheckout(workspace, repoUrl, options).catch(() => null);
  const checkout = existing || await cloneRepositoryCheckout(workspace, repoUrl, options);
  const results = await evaluateSteps({
    steps,
    repoName: repoNameFromUrl(repoUrl),
    readFile: async (filePath) => String((await readRepositoryCheckoutFile(workspace, repoUrl, filePath, branch)).content || ""),
  });
  return {
    commit: String(checkout?.commit || ""),
    branch: String(checkout?.branch || ""),
    expected_branch: branch || "",
    branch_mismatch: Boolean(branch && checkout?.branch && checkout.branch !== branch),
    results,
  };
}

module.exports = { candidatePaths, evaluateSteps, readFirstMatch, runPreflight };
