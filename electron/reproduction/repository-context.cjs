/**
 * Repository evidence for the reproduction planner.
 *
 * The planner runs as a normal agent turn, so it needs the same attachment
 * shape the paper chat uses: a checkout the repository tools can explore.
 */

const path = require("node:path");
const { normalizeGithubRepositoryUrl } = require("../github-repository.cjs");
const {
  cloneRepositoryCheckout,
  listRepositoryCheckoutDirectory,
  readRepositoryCheckoutFile,
} = require("../repository-checkout.cjs");

const README_LIMIT = 20_000;
const KEY_FILE = /^(readme(\.[a-z]+)?|requirements.*\.txt|environment\.ya?ml|pyproject\.toml|setup\.py|setup\.cfg|dockerfile|makefile|install\.sh|run\.sh|evaluate\.py|eval\.py|main\.py)$/i;

function repositoryId(target) {
  return `repo:${target.owner}-${target.repo}`;
}

async function readIfPresent(workspace, url, filePath, limit = 12_000) {
  try {
    const file = await readRepositoryCheckoutFile(workspace, url, filePath);
    return { path: filePath, content: String(file.content || "").slice(0, limit) };
  } catch {
    return null;
  }
}

/**
 * Clones (or reuses) the repository and returns an attachment item the agent
 * repository tools can read from. Returns null when the URL is not a GitHub
 * repository we can clone.
 */
function resolveTarget(repoUrl) {
  try { return normalizeGithubRepositoryUrl(repoUrl); } catch { return null; }
}

async function prepareRepositoryItem(workspace, repoUrl) {
  const target = resolveTarget(repoUrl);
  if (!target) return null;
  const checkout = await cloneRepositoryCheckout(workspace, target.url);
  const top = await listRepositoryCheckoutDirectory(workspace, target.url, "");
  const entries = top.entries || [];

  const readmeEntry = entries.find((entry) => entry.type === "file" && /^readme(\.[a-z]+)?$/i.test(entry.name));
  const readme = readmeEntry
    ? String((await readRepositoryCheckoutFile(workspace, target.url, readmeEntry.path)).content || "").slice(0, README_LIMIT)
    : "";

  // A small pre-read snapshot helps the model orient before it starts calling
  // tools, without pretending to be a complete file listing.
  const seedPaths = entries
    .filter((entry) => entry.type === "file" && KEY_FILE.test(entry.name))
    .slice(0, 8)
    .map((entry) => entry.path);
  const files = [];
  for (const filePath of seedPaths) {
    const file = await readIfPresent(workspace, target.url, filePath);
    if (file) files.push({ path: file.path, size: file.content.length, language: path.extname(file.path).slice(1) || "text", content: file.content });
  }

  return {
    id: repositoryId(target),
    type: "repository",
    name: `${target.owner}/${target.repo}`,
    detail: `${checkout.branch || "main"} @ ${String(checkout.commit || "").slice(0, 7)}`,
    repository: {
      url: target.url,
      branch: checkout.branch || "",
      description: "",
      language: "",
      stars: 0,
      data_paths: [],
      readme,
      files,
      audit: true,
      checkout: { branch: checkout.branch, commit: checkout.commit, file_count: checkout.file_count },
    },
  };
}

/** Confirms that every path-like token in a command exists in the checkout. */
async function verifyEntrypoint(workspace, repoUrl, entrypoint) {
  const target = resolveTarget(repoUrl);
  const command = String(entrypoint?.command || "");
  if (!target || !command) return { evidence: [], unverified: [] };
  const tokens = command
    .split(/\s+/)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter((token) => /[./]/.test(token) && !token.startsWith("-") && !/^https?:/i.test(token));
  const evidence = [];
  const unverified = [];
  for (const token of [...new Set(tokens)].slice(0, 12)) {
    try {
      const file = await readRepositoryCheckoutFile(workspace, target.url, token);
      evidence.push({ path: file.path, line_count: file.line_count });
    } catch {
      unverified.push(token);
    }
  }
  return { evidence, unverified };
}

module.exports = { prepareRepositoryItem, repositoryId, verifyEntrypoint };
