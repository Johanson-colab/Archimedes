/**
 * Read-only preflight.
 *
 * Runs the checks that can be answered from the checkout alone (a file is
 * present, a file matches a pattern). Everything that needs execution is
 * reported as "needs-run" instead of being guessed, so the summary never
 * claims more than it verified.
 */

const { cloneRepositoryCheckout, getRepositoryCheckout, readRepositoryCheckoutFile } = require("../repository-checkout.cjs");

function safeRegex(pattern) {
  try { return new RegExp(String(pattern), "m"); } catch { return null; }
}

async function evaluateSteps({ steps, readFile }) {
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
    try {
      const content = await readFile(check.path);
      if (check.kind === "file_contains") {
        const pattern = safeRegex(check.pattern);
        if (!pattern) {
          results.push({ id, status: "failed", detail: `Invalid pattern: ${check.pattern}` });
          continue;
        }
        results.push(pattern.test(content)
          ? { id, status: "passed", detail: "" }
          : { id, status: "failed", detail: `"${check.pattern}" not found in ${check.path}` });
        continue;
      }
      results.push({ id, status: "passed", detail: "" });
    } catch {
      results.push({ id, status: "failed", detail: `${check.path} does not exist` });
    }
  }
  return results;
}

async function runPreflight({ workspace, repoUrl, steps }) {
  if (!repoUrl) throw new Error("This reproduction has no repository to check.");
  const existing = await getRepositoryCheckout(workspace, repoUrl).catch(() => null);
  const checkout = existing || await cloneRepositoryCheckout(workspace, repoUrl);
  const results = await evaluateSteps({
    steps,
    readFile: async (filePath) => String((await readRepositoryCheckoutFile(workspace, repoUrl, filePath)).content || ""),
  });
  return { commit: String(checkout?.commit || ""), results };
}

module.exports = { evaluateSteps, runPreflight };
