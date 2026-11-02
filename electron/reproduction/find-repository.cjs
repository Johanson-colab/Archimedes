/**
 * Find the repository when the paper text does not name it.
 *
 * The model proposes candidates by searching the web; the network decides.
 * A candidate is only accepted when `git ls-remote` answers and the repository's
 * own README talks about this paper — a plausible-looking URL is not evidence.
 */

const { spawn } = require("node:child_process");
const https = require("node:https");
const { normalizeGithubRepositoryUrl } = require("../github-repository.cjs");

const MAX_PAGES = 3;
const MAX_PAGE_CHARS = 3_000;
const MAX_CANDIDATES = 4;
const GITHUB_SEARCH_LIMIT = 6;
const README_LIMIT = 40_000;
const STOP_WORDS = new Set(["with", "from", "that", "this", "using", "based", "toward", "towards", "learning", "large", "language", "model", "models", "paper", "code"]);

function promptFor({ paper, pages }) {
  const body = (Array.isArray(pages) ? pages : [])
    .slice(0, MAX_PAGES)
    .map((page) => String(page?.text || "").slice(0, MAX_PAGE_CHARS))
    .filter(Boolean)
    .join("\n\n");
  return [
    "Find the public code repository for this paper. Search the web, then answer.",
    "",
    `TITLE: ${paper?.title || ""}`,
    `AUTHORS: ${(paper?.authors || []).join(", ")}`,
    `URL: ${paper?.url || ""}`,
    "",
    "ABSTRACT:",
    String(paper?.abstract || "").slice(0, 2_000),
    body ? `\nFIRST PAGES:\n${body}` : "",
    "",
    "Reply with JSON only:",
    '{"candidates":[{"url":"https://github.com/owner/repo","why":"one sentence tying it to this paper","confidence":"high|low"}]}',
    "",
    "Rules: only GitHub repositories. Prefer the authors' own code over a benchmark",
    "or baseline implementation. Do not invent a URL - if you cannot find one,",
    'return {"candidates":[]}.',
  ].join("\n");
}

function extractJson(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

/** Distinctive words from a title, used to recognise the paper in a README. */
function titleTokens(title) {
  return String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word))
    .slice(0, 12);
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    let child;
    try { child = spawn(command, args, { windowsHide: true }); }
    catch { finish({ ok: false, output: "" }); return; }
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.once("error", () => finish({ ok: false, output: "" }));
    child.once("close", (code) => finish({ ok: code === 0, output: Buffer.concat(chunks).toString("utf8") }));
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ ok: false, output: "" }); }, timeoutMs);
    if (timer.unref) timer.unref();
  });
}

function fetchText(url, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const request = https.get(url, { headers: { "User-Agent": "Archimedes-ResearchDesk" }, timeout: timeoutMs }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) { response.destroy(); finish(""); return; }
      const chunks = [];
      let size = 0;
      let stopped = false;
      response.on("data", (chunk) => {
        if (stopped) return;
        chunks.push(chunk);
        size += chunk.length;
        // A big README is still evidence: keep what arrived and stop reading.
        if (size >= README_LIMIT) {
          stopped = true;
          finish(Buffer.concat(chunks).toString("utf8").slice(0, README_LIMIT));
          response.destroy();
        }
      });
      response.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
      response.on("error", () => finish(""));
    });
    request.on("timeout", () => { request.destroy(); finish(""); });
    request.on("error", () => finish(""));
  });
}

const networkVerifier = {
  async reachable(url) {
    const result = await run("git", ["ls-remote", "--heads", url], 20_000);
    return result.ok;
  },
  async readme(url) {
    const target = normalizeGithubRepositoryUrl(url);
    for (const branch of ["HEAD", "main", "master"]) {
      const text = await fetchText(`https://raw.githubusercontent.com/${target.owner}/${target.repo}/${branch}/README.md`);
      if (text) return text;
    }
    return "";
  },
};

/**
 * GitHub's own repository search needs no key and answers a title well enough to
 * produce candidates. Verification still decides whether any of them is the
 * paper's code.
 */
async function githubSearchCandidates(paper) {
  const tokens = titleTokens(paper?.title).slice(0, 6);
  if (!tokens.length) return [];
  const query = encodeURIComponent(`${tokens.join(" ")} in:name,description,readme`);
  const body = await fetchText(`https://api.github.com/search/repositories?q=${query}&per_page=${GITHUB_SEARCH_LIMIT}`);
  if (!body) return [];
  let parsed;
  try { parsed = JSON.parse(body); } catch { return []; }
  return (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    url: String(item.html_url || ""),
    why: String(item.description || "").slice(0, 200),
    stars: Number(item.stargazers_count) || 0,
  }));
}

/**
 * @param {object} input
 * @param {Function} input.runAgent the agent turn that proposes candidates
 * @param {{reachable: Function, readme: Function}} [input.verifier]
 */
async function findRepository({ paper, pages, runAgent, workspace, emit = () => {}, verifier = networkVerifier, searcher = null, candidates: provided = [] }) {
  let proposed = Array.isArray(provided) ? provided : [];
  // A keyless search first: it is cheap, reproducible and needs no provider.
  if (!proposed.length && searcher) {
    proposed = await searcher(paper).catch(() => []);
  }
  if (!proposed.length && runAgent) {
    const result = await runAgent({
      prompt: promptFor({ paper, pages }),
      workspace,
      transient: true,
      mode: "experiment-setup",
    });
    const parsed = extractJson(result?.response) || {};
    proposed = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  }

  const urls = [];
  for (const item of proposed.slice(0, MAX_CANDIDATES * 2)) {
    const candidate = typeof item === "string" ? item : item?.url;
    try {
      const target = normalizeGithubRepositoryUrl(candidate);
      if (!urls.some((entry) => entry.url === target.url)) urls.push({ url: target.url, why: String(item?.why || "").slice(0, 300), stars: Number(item?.stars) || 0 });
    } catch {
      // Not a GitHub repository URL; nothing to verify.
    }
    if (urls.length >= MAX_CANDIDATES) break;
  }
  if (!urls.length) return { url: "", confidence: "", evidence: "", candidates: [] };

  emit({ type: "planning", detail: `Checking ${urls.length} candidate ${urls.length === 1 ? "repository" : "repositories"}…` });
  const tokens = titleTokens(paper?.title);
  const arxivId = String(paper?.url || "").match(/arxiv\.org\/(?:abs|pdf)\/([0-9.]+)/i)?.[1] || "";
  const checked = [];
  for (const entry of urls) {
    if (!(await verifier.reachable(entry.url).catch(() => false))) continue;
    const readme = await verifier.readme(entry.url).catch(() => "");
    const haystack = String(readme || "").toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    let name = "";
    try { name = normalizeGithubRepositoryUrl(entry.url).repo.toLowerCase(); } catch { name = ""; }
    // Citing the arXiv id is not ownership: every awesome list cites every
    // paper. The repository's own name is the signal that survives that noise -
    // an official repo is normally named after a word in the title.
    const citesPaper = Boolean(arxivId) && haystack.includes(arxivId.toLowerCase());
    const segments = name.split(/[-_.]+/);
    const words = String(paper?.title || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
    const exact = words.some((word) => segments.includes(word));
    const long = words.some((word) => word.length >= 6 && name.includes(word));
    const matched = (exact || long) && hits >= 2;
    checked.push({ ...entry, hits, matched, citesPaper, exact, long });
  }

  // Several repositories can carry the paper's name: an official one, a
  // reimplementation, and a list. Prefer a citation of the paper, then the one
  // more people point at, and say when the choice was not unique.
  const matched = checked
    .filter((entry) => entry.matched)
    .sort((left, right) => Number(right.citesPaper) - Number(left.citesPaper) || right.stars - left.stars || right.hits - left.hits);
  const best = matched[0] || null;
  if (best) {
    const others = matched.length - 1;
    const reason = best.citesPaper
      ? `the repository is named after the paper and its README cites arXiv ${arxivId}`
      : `the repository is named after the paper and mentions ${best.hits} of its title words`;
    return {
      url: best.url,
      confidence: others > 0 ? "low" : "high",
      evidence: others > 0 ? `${reason} (${others} other ${others === 1 ? "repository" : "repositories"} also match)` : reason,
      candidates: checked,
    };
  }
  // Reachable but unconfirmed: report it, but do not treat it as the answer.
  return {
    url: "",
    confidence: checked.length ? "low" : "",
    evidence: checked.length ? "A repository answered, but its README does not mention this paper." : "No candidate repository answered.",
    candidates: checked,
  };
}

module.exports = { fetchText, findRepository, githubSearchCandidates, networkVerifier, promptFor, titleTokens };
