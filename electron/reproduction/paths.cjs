/**
 * Repository-relative path resolution.
 *
 * A plan is written by reading a README, and READMEs say
 * `git clone … && cd repo`, then refer to `repo/pyproject.toml`. The checkout we
 * hold is the repository itself, so that leading directory is not part of any
 * path inside it.
 *
 * Rather than silently rewriting the plan, callers try each candidate and report
 * which one matched: a fallback is visible in the result, never assumed.
 */

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "");
}

/**
 * The paths worth trying for one repository-relative reference, most specific
 * first. The written path always comes first so a real match is never displaced
 * by a guess.
 */
function candidatePaths(requested, repoName = "") {
  const clean = normalizePath(requested);
  if (!clean) return [];
  const candidates = [clean];
  const [first, ...rest] = clean.split("/");
  const name = String(repoName || "").toLowerCase();
  // Only strip when the prefix is the repository's own name: stripping an
  // unrelated first segment would turn a genuine miss into a wrong match.
  if (name && rest.length > 0 && first.toLowerCase() === name) candidates.push(rest.join("/"));
  return [...new Set(candidates)];
}

/** The repository name from a GitHub URL, or "" when it cannot be read. */
function repoNameFromUrl(value) {
  const match = String(value || "").match(/^https?:\/\/github\.com\/[^/]+\/([^/#?]+)/i);
  return match ? match[1].replace(/\.git$/i, "") : "";
}

module.exports = { candidatePaths, normalizePath, repoNameFromUrl };
