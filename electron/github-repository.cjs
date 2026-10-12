const https = require("node:https");

const MAX_API_BYTES = 6 * 1024 * 1024;
const MAX_FILE_BYTES = 48 * 1024;
const MAX_REPOSITORY_FILES = 10;
const repositoryCache = new Map();

function normalizeGithubRepositoryUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); }
  catch { throw new Error("Enter a valid GitHub repository URL."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only public GitHub https://github.com/owner/repository URLs can be opened here.");
  }
  const [owner, repository] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repository || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("The GitHub URL must identify an owner and repository.");
  }
  const repo = repository.replace(/\.git$/i, "");
  if (!repo) throw new Error("The GitHub repository name is missing.");
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

function githubRequest(pathname) {
  return new Promise((resolve, reject) => {
    const request = https.request(`https://api.github.com${pathname}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Archimedes-ResearchDesk",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      timeout: 25_000,
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const detail = Buffer.concat(chunks).toString("utf8").slice(0, 280);
          reject(new Error(`GitHub request failed (${response.statusCode}): ${detail || "repository is unavailable"}`));
        });
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_API_BYTES) response.destroy(new Error("GitHub response is too large."));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("GitHub returned an invalid response.")); }
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("GitHub request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

function decodeBase64(content) {
  return Buffer.from(String(content || "").replace(/\s/g, ""), "base64").toString("utf8");
}

function isReadableSource(entry) {
  if (entry.type !== "blob" || Number(entry.size || 0) > MAX_FILE_BYTES) return false;
  const name = entry.path.toLowerCase();
  if (/(^|\/)(node_modules|\.git|dist|build|\.next|vendor|third_party|assets|images|figures)(\/|$)/.test(name)) return false;
  const insideData = /(^|\/)(data|dataset|datasets|benchmark|benchmarks)(\/|$)/.test(name);
  if (insideData && !/(^|\/)(readme[^/]*|metadata[^/]*|manifest[^/]*|config[^/]*|dataset[^/]*|splits?[^/]*|[^/]+\.(json|ya?ml|toml|md|txt))$/.test(name)) return false;
  return /(^|\/)(readme[^/]*|pyproject\.toml|package\.json|requirements[^/]*\.txt|environment[^/]*\.ya?ml|setup\.cfg|setup\.py|makefile|dockerfile|compose[^/]*\.ya?ml)$/.test(name)
    || /\.(py|ts|tsx|js|jsx|json|ya?ml|toml|md|sh)$/.test(name);
}

function scoreRepositoryFile(entry) {
  const name = entry.path.toLowerCase();
  const depth = entry.path.split("/").length - 1;
  const rootBonus = Math.max(0, 18 - depth * 3);
  if (/(^|\/)readme[^/]*$/.test(name)) return 120;
  if (/(pyproject\.toml|package\.json|requirements|environment|setup\.py|setup\.cfg|makefile|dockerfile)/.test(name)) return 105;
  if (/(train|eval|evaluate|benchmark|experiment|config|dataset|data|model|agent|runner|main)/.test(name)) return 85;
  if (/\.(py|ts|tsx|js|jsx)$/.test(name)) return 55 + rootBonus;
  return 20 + rootBonus;
}

function pickRepositoryFiles(tree) {
  const sorted = tree.filter(isReadableSource)
    .sort((left, right) => scoreRepositoryFile(right) - scoreRepositoryFile(left) || left.path.localeCompare(right.path));
  const selected = [];
  const add = (predicate, limit) => {
    for (const entry of sorted) {
      if (selected.length >= MAX_REPOSITORY_FILES || selected.filter(predicate).length >= limit || !predicate(entry) || selected.includes(entry)) continue;
      selected.push(entry);
    }
  };
  add((entry) => /(^|\/)readme[^/]*$/i.test(entry.path) && entry.path.split("/").length <= 2, 1);
  add((entry) => /(^|\/)(pyproject\.toml|package\.json|requirements[^/]*\.txt|environment[^/]*\.ya?ml|setup\.cfg|setup\.py|makefile|dockerfile)$/i.test(entry.path), 3);
  add((entry) => /(^|\/)(data|dataset|datasets|benchmark|benchmarks)(\/|_|-|\.)/i.test(entry.path), 2);
  add((entry) => /\.(py|ts|tsx|js|jsx)$/i.test(entry.path), 5);
  for (const entry of sorted) {
    if (selected.length >= MAX_REPOSITORY_FILES) break;
    if (!selected.includes(entry)) selected.push(entry);
  }
  return selected;
}

function languageForPath(filePath) {
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  return ({ py: "Python", ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", md: "Markdown", json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", sh: "Shell" })[extension] || "Text";
}

async function readRepositoryFile(owner, repo, branch, entry) {
  const response = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${entry.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`);
  if (response.encoding !== "base64") throw new Error(`GitHub could not provide ${entry.path} as text.`);
  return { path: entry.path, size: Number(entry.size || 0), language: languageForPath(entry.path), content: decodeBase64(response.content).slice(0, MAX_FILE_BYTES) };
}

function dataPaths(tree) {
  return tree.filter((entry) => entry.type === "blob" && /(^|\/)(data|dataset|datasets|benchmark|benchmarks|eval|evaluation)(\/|_|-|\.)/i.test(entry.path))
    .map((entry) => entry.path)
    .slice(0, 80);
}

async function loadGithubRepository(value) {
  const target = normalizeGithubRepositoryUrl(value);
  const cached = repositoryCache.get(target.url);
  if (cached && Date.now() - cached.cachedAt < 15 * 60 * 1000) return cached.snapshot;

  const metadata = await githubRequest(`/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`);
  if (metadata.private) throw new Error("This GitHub repository is private. Open it in GitHub after signing in, then attach a local checkout for analysis.");
  const branch = String(metadata.default_branch || "main");
  const treeResponse = await githubRequest(`/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const tree = Array.isArray(treeResponse.tree) ? treeResponse.tree : [];
  const files = [];
  for (const entry of pickRepositoryFiles(tree)) {
    try { files.push(await readRepositoryFile(target.owner, target.repo, branch, entry)); }
    catch { /* A single unavailable file should not hide the repository. */ }
  }
  const readme = files.find((file) => /(^|\/)readme[^/]*$/i.test(file.path))?.content || "";
  const snapshot = {
    url: target.url,
    owner: target.owner,
    repo: target.repo,
    branch,
    description: String(metadata.description || ""),
    homepage: String(metadata.homepage || ""),
    language: String(metadata.language || ""),
    stars: Number(metadata.stargazers_count || 0),
    license: String(metadata.license?.spdx_id || metadata.license?.name || ""),
    updated_at: String(metadata.updated_at || ""),
    retrieved_at: new Date().toISOString(),
    tree: tree.filter((entry) => entry.type === "blob").map((entry) => ({ path: entry.path, size: Number(entry.size || 0) })).slice(0, 4_000),
    data_paths: dataPaths(tree),
    readme,
    files,
  };
  repositoryCache.set(target.url, { cachedAt: Date.now(), snapshot });
  return snapshot;
}

module.exports = { dataPaths, loadGithubRepository, normalizeGithubRepositoryUrl, pickRepositoryFiles };
