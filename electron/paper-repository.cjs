/**
 * Which repository does this paper actually point at?
 *
 * A reproduction record starts from a paper, and a paper's URL is usually
 * arXiv, not GitHub. The planner cannot attach a checkout it was never given,
 * and it must not invent one — but the paper usually names its own code. This
 * reads that name, including the branch when the link carries one.
 */

const GITHUB_URL = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[^\s)"'<>]+)?/gi;
const MAX_SCAN_PAGES = 3;
const MAX_PAGE_CHARS = 4_000;

function isGithubUrl(value) {
  return /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(String(value || "").trim());
}

function cleanUrl(value) {
  // Trailing punctuation is part of the sentence, not of the URL.
  return String(value || "").trim().replace(/[.,;:)\]}]+$/, "");
}

/** The first GitHub link in the given texts, preferring one that names a branch. */
function findRepositoryUrl({ recordUrl = "", paper = null, pages = [] } = {}) {
  const direct = cleanUrl(recordUrl);
  if (isGithubUrl(direct)) return { url: direct, source: "record" };

  const texts = [paper?.url, paper?.abstract, paper?.title].filter((value) => typeof value === "string");
  for (const page of (Array.isArray(pages) ? pages : []).slice(0, MAX_SCAN_PAGES)) {
    const text = typeof page?.text === "string" ? page.text.slice(0, MAX_PAGE_CHARS) : "";
    if (text) texts.push(text);
  }

  let fallback = "";
  for (const text of texts) {
    // Every link in the text, not just the first: the branch link usually comes
    // after the repository link.
    for (const match of String(text).matchAll(GITHUB_URL)) {
      const url = cleanUrl(match[0]);
      // A /tree/<branch> link is more useful than the repository root: it names
      // the branch the code actually lives on.
      if (/\/tree\//i.test(url)) return { url, source: "paper" };
      if (!fallback) fallback = url;
    }
  }
  return fallback ? { url: fallback, source: "paper" } : { url: "", source: "" };
}

module.exports = { findRepositoryUrl, isGithubUrl };
