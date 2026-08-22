const { XMLParser } = require("fast-xml-parser");

const S2_BASE_URL = "https://api.semanticscholar.org/graph/v1";
const OPENALEX_BASE_URL = "https://api.openalex.org";
const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const HF_DAILY_PAPERS_URLS = [
  "https://hf-mirror.com/api/daily_papers",
  "https://huggingface.co/api/daily_papers",
];
const DAILY_CATEGORIES = new Set(["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.RO", "cs.SE"]);
const DAILY_RANGES = new Set(["1d", "3d", "7d"]);

function sanitizeLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(20, Math.max(1, Math.trunc(parsed))) : 12;
}

function detectPaperId(query) {
  const value = query.trim();
  const arxivMatch = value.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)?([0-9]{4}\.[0-9]{4,5})(?:v\d+)?/i);
  if (arxivMatch) return `ARXIV:${arxivMatch[1]}`;
  const doiMatch = value.match(/(?:doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/i);
  if (doiMatch) return `DOI:${doiMatch[1]}`;
  return null;
}

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeArxivEntry(entry, requestedId) {
  const published = normalizeWhitespace(entry.published);
  const primaryCategory = entry["arxiv:primary_category"]?.term || "";
  const arxivId = normalizeWhitespace(entry.id).match(/\/abs\/(.+?)(?:v\d+)?$/)?.[1] || requestedId;
  const categories = asArray(entry.category).map((category) => category.term).filter(Boolean);

  return {
    external_id: `arxiv:${arxivId}`,
    s2_id: "",
    arxiv_id: arxivId,
    doi: normalizeWhitespace(entry["arxiv:doi"]),
    title: normalizeWhitespace(entry.title) || "Untitled paper",
    authors: asArray(entry.author).map((author) => normalizeWhitespace(author.name)).filter(Boolean),
    year: published ? Number(published.slice(0, 4)) || null : null,
    venue: primaryCategory ? `arXiv:${primaryCategory}` : "arXiv",
    abstract: normalizeWhitespace(entry.summary),
    url: `https://arxiv.org/abs/${arxivId}`,
    pdf_url: `https://arxiv.org/pdf/${arxivId}`,
    citation_count: 0,
    source: "arxiv",
    published_at: published,
    discovered_at: published,
    categories,
    upvotes: 0,
    github_url: "",
    github_stars: 0,
  };
}

async function searchArxiv(arxivId) {
  const response = await fetch(`${ARXIV_API_URL}?id_list=${encodeURIComponent(arxivId)}&max_results=1`, {
    headers: { Accept: "application/atom+xml", "User-Agent": "Axiom-Research/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`arXiv returned ${response.status}.`);

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const payload = parser.parse(await response.text());
  const entry = asArray(payload.feed?.entry)[0];
  if (!entry) throw new Error(`arXiv paper ${arxivId} was not found.`);
  return [normalizeArxivEntry(entry, arxivId)];
}

function normalizeDailyOptions(input = {}) {
  const mode = input.mode === "trending" ? "trending" : "latest";
  const range = DAILY_RANGES.has(input.range) ? input.range : "3d";
  const requestedCategories = Array.isArray(input.categories) ? input.categories : [];
  const categories = [...new Set(requestedCategories.filter((category) => DAILY_CATEGORIES.has(category)))];
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 160) : "";
  const parsedLimit = Number(input.limit);
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.trunc(parsedLimit))) : 40;
  return { mode, range, categories: categories.length ? categories : ["cs.AI", "cs.LG", "cs.CL"], query, limit };
}

function rangeStart(range) {
  const days = Number(range.slice(0, -1));
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function formatArxivDate(date) {
  return date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
}

function matchesDailyQuery(paper, query) {
  if (!query) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${paper.title} ${paper.abstract} ${paper.authors.join(" ")} ${paper.categories.join(" ")}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function buildArxivKeywordQuery(query) {
  const terms = query
    .match(/"[^"]+"|\S+/g)
    ?.map((term) => term.replace(/^"|"$/g, "").replace(/[^\p{L}\p{N}_-]+/gu, " ").trim())
    .filter(Boolean) || [];
  return terms.map((term) => `all:"${term}"`).join(" AND ");
}

async function discoverArxivPapers(options) {
  const categoryQuery = options.categories.map((category) => `cat:${category}`).join(" OR ");
  const submittedRange = `submittedDate:[${formatArxivDate(rangeStart(options.range))} TO ${formatArxivDate(new Date())}]`;
  const keywordQuery = buildArxivKeywordQuery(options.query);
  const searchQuery = [`(${categoryQuery})`, submittedRange, keywordQuery ? `(${keywordQuery})` : ""].filter(Boolean).join(" AND ");
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(Math.min(100, Math.max(options.limit, 50))),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });
  const response = await fetch(`${ARXIV_API_URL}?${params}`, {
    headers: { Accept: "application/atom+xml", "User-Agent": "Axiom-Research/0.1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`arXiv daily feed returned ${response.status}.`);

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const payload = parser.parse(await response.text());
  return asArray(payload.feed?.entry)
    .map((entry) => normalizeArxivEntry(entry, ""))
    .slice(0, options.limit);
}

function normalizeHuggingFacePaper(item) {
  const paper = item.paper || item;
  const arxivId = normalizeWhitespace(paper.id);
  const publishedAt = paper.publishedAt || item.publishedAt || paper.submittedOnDailyAt || "";
  const discoveredAt = paper.submittedOnDailyAt || item.publishedAt || publishedAt;
  const categories = asArray(paper.ai_keywords).map((keyword) => normalizeWhitespace(keyword)).filter(Boolean);
  const authors = asArray(paper.authors).map((author) => normalizeWhitespace(typeof author === "string" ? author : author.name)).filter(Boolean);
  return {
    external_id: arxivId ? `arxiv:${arxivId}` : `hf:${normalizeWhitespace(paper.title).toLowerCase()}`,
    s2_id: "",
    arxiv_id: arxivId,
    doi: "",
    title: normalizeWhitespace(paper.title) || "Untitled paper",
    authors,
    year: publishedAt ? Number(publishedAt.slice(0, 4)) || null : null,
    venue: "Hugging Face Daily Papers",
    abstract: normalizeWhitespace(paper.ai_summary || paper.summary),
    url: arxivId ? `https://arxiv.org/abs/${arxivId}` : "",
    pdf_url: arxivId ? `https://arxiv.org/pdf/${arxivId}` : "",
    citation_count: 0,
    source: "hugging-face",
    published_at: publishedAt,
    discovered_at: discoveredAt,
    categories,
    upvotes: Number(paper.upvotes ?? item.upvotes) || 0,
    github_url: normalizeWhitespace(paper.githubRepo),
    github_stars: Number(paper.githubStars) || 0,
  };
}

async function discoverHuggingFacePapers(options) {
  const params = new URLSearchParams({ sort: "trending", limit: "100" });
  let response;
  const errors = [];
  for (const baseUrl of HF_DAILY_PAPERS_URLS) {
    try {
      const candidate = await fetch(`${baseUrl}?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "Axiom-Research/0.1" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!candidate.ok) throw new Error(`returned ${candidate.status}`);
      response = candidate;
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "connection failed");
    }
  }
  if (!response) throw new Error(`Hugging Face Daily Papers is unavailable. ${errors.join(" ")}`);

  const cutoff = rangeStart(options.range).getTime();
  const payload = await response.json();
  return asArray(payload)
    .map(normalizeHuggingFacePaper)
    .filter((paper) => !paper.discovered_at || new Date(paper.discovered_at).getTime() >= cutoff)
    .filter((paper) => matchesDailyQuery(paper, options.query))
    .sort((left, right) => right.upvotes - left.upvotes || right.github_stars - left.github_stars)
    .slice(0, options.limit);
}

async function discoverDailyPapers(input) {
  const options = normalizeDailyOptions(input);
  const papers = options.mode === "trending"
    ? await discoverHuggingFacePapers(options)
    : await discoverArxivPapers(options);
  return { papers, providers: options.mode === "trending" ? ["hugging-face"] : ["arxiv"] };
}

function normalizeS2Paper(paper) {
  return {
    external_id: paper.paperId,
    s2_id: paper.paperId,
    arxiv_id: paper.externalIds?.ArXiv || "",
    doi: paper.externalIds?.DOI || "",
    title: paper.title || "Untitled paper",
    authors: (paper.authors || []).map((author) => author.name).filter(Boolean),
    year: paper.year || null,
    venue: paper.venue || "",
    abstract: paper.abstract || "",
    url: paper.url || (paper.externalIds?.ArXiv ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}` : ""),
    pdf_url: paper.openAccessPdf?.url || (paper.externalIds?.ArXiv ? `https://arxiv.org/pdf/${paper.externalIds.ArXiv}.pdf` : ""),
    citation_count: paper.citationCount || 0,
    source: "semantic-scholar",
  };
}

async function searchSemanticScholar(query, limit) {
  const fields = "title,authors,year,venue,abstract,url,externalIds,openAccessPdf,citationCount";
  const detectedId = detectPaperId(query);
  const url = detectedId
    ? `${S2_BASE_URL}/paper/${encodeURIComponent(detectedId)}?fields=${fields}`
    : `${S2_BASE_URL}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Axiom-Research/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Semantic Scholar search returned ${response.status}.`);
  const payload = await response.json();
  const papers = detectedId ? [payload] : payload.data || [];
  return papers.map(normalizeS2Paper);
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return "";
  const tokens = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) tokens[position] = word;
  }
  return tokens.filter(Boolean).join(" ");
}

function normalizeOpenAlexWork(work) {
  const arxivId = work.ids?.arxiv?.split("/").pop() || "";
  return {
    external_id: work.id || "",
    s2_id: "",
    arxiv_id: arxivId,
    doi: work.doi?.replace("https://doi.org/", "") || "",
    title: work.display_name || work.title || "Untitled paper",
    authors: (work.authorships || []).map((entry) => entry.author?.display_name).filter(Boolean),
    year: work.publication_year || null,
    venue: work.primary_location?.source?.display_name || "",
    abstract: reconstructAbstract(work.abstract_inverted_index),
    url: work.primary_location?.landing_page_url || work.doi || work.id || "",
    pdf_url: work.best_oa_location?.pdf_url || "",
    citation_count: work.cited_by_count || 0,
    source: "openalex",
  };
}

async function searchOpenAlex(query, limit) {
  const detectedId = detectPaperId(query);
  const searchQuery = detectedId?.startsWith("ARXIV:") ? detectedId.slice(6) : query;
  const url = `${OPENALEX_BASE_URL}/works?search=${encodeURIComponent(searchQuery)}&per-page=${limit}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Axiom-Research/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenAlex search returned ${response.status}.`);
  const payload = await response.json();
  return (payload.results || []).map(normalizeOpenAlexWork);
}

async function searchAcademicPapers(query, requestedLimit) {
  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  if (!trimmedQuery || trimmedQuery.length > 300) throw new Error("Enter a paper title, DOI, arXiv ID, or research query.");
  const limit = sanitizeLimit(requestedLimit);
  const detectedId = detectPaperId(trimmedQuery);
  const providers = [];
  if (detectedId?.startsWith("ARXIV:")) {
    providers.push(["arXiv", () => searchArxiv(detectedId.slice(6))]);
  }
  providers.push(
    ["Semantic Scholar", () => searchSemanticScholar(trimmedQuery, limit)],
    ["OpenAlex", () => searchOpenAlex(trimmedQuery, limit)],
  );

  const errors = [];
  for (const [name, search] of providers) {
    try {
      const papers = await search();
      if (papers.length) return papers;
      errors.push(`${name} returned no results.`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${name} search failed.`);
    }
  }

  throw new Error(`No paper metadata could be retrieved. ${errors.join(" ")}`);
}

module.exports = { discoverDailyPapers, normalizeDailyOptions, searchAcademicPapers };
