const { XMLParser } = require("fast-xml-parser");

const S2_BASE_URL = "https://api.semanticscholar.org/graph/v1";
// An API key moves Semantic Scholar onto a dedicated quota; without one the
// shared anonymous pool returns 429 as soon as a deep search fans out.
const SEMANTIC_SCHOLAR_API_KEY = (process.env.SEMANTIC_SCHOLAR_API_KEY || "").trim();
const OPENALEX_BASE_URL = "https://api.openalex.org";
const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const HF_DAILY_PAPERS_URLS = [
  "https://hf-mirror.com/api/daily_papers",
  "https://huggingface.co/api/daily_papers",
];
// Hugging Face renders a social preview per paper; the mirror is listed first
// for the same reason the API mirror is.
const HF_THUMBNAIL_HOSTS = [
  "https://cdn-thumbnails.hf-mirror.com",
  "https://cdn-thumbnails.huggingface.co",
];
const DEFAULT_DAILY_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"];
const DAILY_CATEGORIES = new Set([...DEFAULT_DAILY_CATEGORIES, "cs.CV", "cs.RO", "cs.SE", "cs.IR", "cs.HC", "cs.MA", "cs.NE", "cs.CY", "cs.PF", "cs.GR", "cs.SD", "eess.AS", "stat.ML"]);
const DAILY_RANGES = new Set(["7d", "30d", "90d", "all"]);
const DAILY_TOPICS = {
  all: { categories: DEFAULT_DAILY_CATEGORIES, terms: [] },
  ai4ai_rsi: { categories: ["cs.AI", "cs.LG", "cs.SE"], terms: ["AI4AI", "AI for AI", "recursive self-improvement", "self-improving agent", "self-evolving agent", "automated AI research"] },
  gui_compute_use: { categories: ["cs.AI", "cs.HC", "cs.SE"], terms: ["computer use", "computer-use", "GUI agent", "desktop agent", "web agent", "graphical user interface"] },
  coding_agents: { categories: ["cs.AI", "cs.SE", "cs.LG"], terms: ["coding agent", "code agent", "software engineering agent", "SWE-agent", "agentic coding", "repository-level agent"] },
  reinforcement_learning: { categories: ["cs.AI", "cs.LG", "cs.RO"], terms: ["reinforcement learning", "policy optimization", "actor-critic", "offline RL"] },
  on_policy_distillation: { categories: ["cs.AI", "cs.LG", "stat.ML"], terms: ["on-policy distillation", "on policy distillation", "online policy distillation", "policy distillation"] },
  robotics_vla: { categories: ["cs.RO", "cs.AI", "cs.CV", "cs.LG"], terms: ["robotics", "robotic manipulation", "vision-language-action", "VLA", "embodied agent"] },
  world_models: { categories: ["cs.AI", "cs.LG", "cs.CV", "cs.RO"], terms: ["world model", "world-model", "world simulation", "latent dynamics"] },
  reasoning_test_time: { categories: ["cs.AI", "cs.LG", "cs.CL"], terms: ["reasoning", "chain of thought", "test-time scaling", "test-time compute", "inference-time compute"] },
  interpretability: { categories: ["cs.AI", "cs.LG", "cs.CL", "stat.ML"], terms: ["interpretability", "interpretable", "explainable AI", "mechanistic interpretability", "feature attribution"] },
  rag: { categories: ["cs.IR", "cs.CL", "cs.AI", "cs.LG"], terms: ["retrieval", "RAG", "long context"] },
  multimodal: { categories: ["cs.CV", "cs.CL", "cs.AI"], terms: ["multimodal", "vision-language", "VLM"] },
  safety: { categories: ["cs.AI", "cs.LG", "cs.CY"], terms: ["safety", "alignment", "red teaming", "jailbreak"] },
  science: { categories: ["cs.AI", "cs.LG", "stat.ML"], terms: ["AI for science", "scientific discovery", "scientific research"] },
  efficient_inference: { categories: ["cs.LG", "cs.AI", "cs.CL", "cs.PF"], terms: ["efficient inference", "inference efficiency", "inference latency", "KV cache", "speculative decoding", "quantization", "model compression", "pruning"] },
  generative_models: { categories: ["cs.LG", "cs.CV", "cs.AI"], terms: ["generative model", "diffusion model", "flow matching", "variational autoencoder", "image generation", "video generation", "text-to-image"] },
  vision_3d: { categories: ["cs.CV", "cs.GR"], terms: ["3D reconstruction", "NeRF", "Gaussian splatting", "point cloud", "novel view synthesis", "depth estimation", "3D generation", "scene reconstruction"] },
  speech_audio: { categories: ["cs.SD", "eess.AS", "cs.CL", "cs.LG"], terms: ["speech recognition", "speech synthesis", "text-to-speech", "speech-to-text", "speech enhancement", "speech separation", "speaker verification", "audio generation", "audio-language model", "voice conversion"] },
};
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url, init = {}, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 2);
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 20_000);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 400));
  const provider = options.provider || "The literature provider";
  const fetchImpl = options.fetchImpl || fetch;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === attempts - 1) return response;
      lastError = new Error(`${provider} returned ${response.status}.`);
      // Rate limits ask for a specific pause; ignoring it just earns another 429.
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        await delay(Math.min(retryAfter * 1000, 8_000));
        continue;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await delay(retryDelayMs * (attempt + 1));
  }

  const timedOut = lastError?.name === "TimeoutError" || /timeout|aborted/i.test(lastError?.message || "");
  if (timedOut) throw new Error(`${provider} took too long to respond after ${attempts} attempts. Please retry in a moment.`);
  throw new Error(`${provider} is temporarily unavailable. ${lastError?.message || "Please retry in a moment."}`);
}

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

function normalizeThumbnailUrl(value) {
  const text = normalizeWhitespace(value);
  return /^https:\/\/[^\s]+$/i.test(text) ? text : "";
}

function arxivThumbnailUrl(arxivId) {
  const id = normalizeWhitespace(arxivId);
  if (!/^\d{4}\.\d{4,5}$/.test(id)) return "";
  return `${HF_THUMBNAIL_HOSTS[0]}/social-thumbnails/papers/${id}.png`;
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
    thumbnail: arxivThumbnailUrl(arxivId),
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
    headers: { Accept: "application/atom+xml", "User-Agent": "Archimedes-Research/0.1" },
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
  const range = DAILY_RANGES.has(input.range) ? input.range : "7d";
  const topic = typeof input.topic === "string" && DAILY_TOPICS[input.topic] ? input.topic : "all";
  const requestedCategories = Array.isArray(input.categories) ? input.categories : [];
  const requested = [...new Set(requestedCategories.filter((category) => DAILY_CATEGORIES.has(category)))];
  const categories = topic === "all" && requested.length ? requested : DAILY_TOPICS[topic].categories;
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 160) : "";
  const parsedLimit = Number(input.limit);
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.trunc(parsedLimit))) : 40;
  return { mode, range, topic, categories, query, limit };
}

function rangeStart(range) {
  // "all" means no lower bound: search the whole archive instead of a window.
  if (range === "all") return new Date(0);
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

function buildTopicQuery(topic) {
  const terms = DAILY_TOPICS[topic]?.terms || [];
  return terms.map((term) => `all:"${term}"`).join(" OR ");
}

async function discoverArxivPapers(options) {
  const categoryQuery = options.categories.map((category) => `cat:${category}`).join(" OR ");
  const submittedRange = options.range === "all"
    ? ""
    : `submittedDate:[${formatArxivDate(rangeStart(options.range))} TO ${formatArxivDate(new Date())}]`;
  const topicQuery = buildTopicQuery(options.topic);
  const keywordQuery = buildArxivKeywordQuery(options.query);
  const searchQuery = [`(${categoryQuery})`, submittedRange, topicQuery ? `(${topicQuery})` : "", keywordQuery ? `(${keywordQuery})` : ""].filter(Boolean).join(" AND ");
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(Math.min(100, Math.max(options.limit, 50))),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });
  const response = await fetchWithRetry(`${ARXIV_API_URL}?${params}`, {
    headers: { Accept: "application/atom+xml", "User-Agent": "Archimedes-Research/0.1" },
  }, { provider: "arXiv", attempts: 2, timeoutMs: 25_000 });
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
    thumbnail: normalizeThumbnailUrl(item.thumbnail || paper.thumbnail) || arxivThumbnailUrl(arxivId),
    published_at: publishedAt,
    discovered_at: discoveredAt,
    categories,
    upvotes: Number(paper.upvotes ?? item.upvotes) || 0,
    github_url: normalizeWhitespace(paper.githubRepo),
    github_stars: Number(paper.githubStars) || 0,
  };
}

function matchesDailyTopic(paper, topic) {
  const terms = DAILY_TOPICS[topic]?.terms || [];
  if (!terms.length) return true;
  const haystack = `${paper.title} ${paper.abstract} ${paper.authors.join(" ")} ${paper.categories.join(" ")}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

async function discoverHuggingFacePapers(options) {
  const params = new URLSearchParams({ sort: "trending", limit: "100" });
  let response;
  const errors = [];
  for (const baseUrl of HF_DAILY_PAPERS_URLS) {
    try {
      const candidate = await fetch(`${baseUrl}?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "Archimedes-Research/0.1" },
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
    .filter((paper) => matchesDailyTopic(paper, options.topic))
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

// A 429 usually holds for a while. Remembering it stops the other expanded
// queries in the same deep search from waiting out the same backoff.
const PROVIDER_COOLDOWN_MS = 60_000;
const providerCooldowns = new Map();

function providerCoolingDown(provider) {
  return (providerCooldowns.get(provider) || 0) > Date.now();
}

function noteProviderRateLimit(provider) {
  providerCooldowns.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}

function resetProviderCooldowns() {
  providerCooldowns.clear();
}

function providerResponseError(provider, response) {
  // A bare "returned 429" tells the user nothing. Say what happened and what
  // it means for their results.
  if (response?.status === 429) {
    return new Error(`${provider} is rate-limiting anonymous requests; retry in a moment.`);
  }
  return new Error(`${provider} search returned ${response?.status}.`);
}

async function searchSemanticScholar(query, limit, fetchImpl = fetch) {
  const fields = "title,authors,year,venue,abstract,url,externalIds,openAccessPdf,citationCount";
  const detectedId = detectPaperId(query);
  const url = detectedId
    ? `${S2_BASE_URL}/paper/${encodeURIComponent(detectedId)}?fields=${fields}`
    : `${S2_BASE_URL}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  if (providerCoolingDown("Semantic Scholar")) {
    throw providerResponseError("Semantic Scholar", { status: 429 });
  }
  // The unauthenticated pool is shared and rate-limits aggressively, so retry
  // with a real backoff instead of surfacing the first 429 to the user.
  const response = await fetchWithRetry(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Archimedes-Research/0.1",
      ...(SEMANTIC_SCHOLAR_API_KEY ? { "x-api-key": SEMANTIC_SCHOLAR_API_KEY } : {}),
    },
  }, { provider: "Semantic Scholar", attempts: SEMANTIC_SCHOLAR_API_KEY ? 3 : 2, retryDelayMs: 1_500, timeoutMs: 15_000, fetchImpl });
  if (!response.ok) {
    if (response.status === 429) noteProviderRateLimit("Semantic Scholar");
    throw providerResponseError("Semantic Scholar", response);
  }
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

async function searchOpenAlex(query, limit, fetchImpl = fetch) {
  const detectedId = detectPaperId(query);
  const searchQuery = detectedId?.startsWith("ARXIV:") ? detectedId.slice(6) : query;
  if (providerCoolingDown("OpenAlex")) {
    throw providerResponseError("OpenAlex", { status: 429 });
  }
  const url = `${OPENALEX_BASE_URL}/works?search=${encodeURIComponent(searchQuery)}&per-page=${limit}`;
  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": "Archimedes-Research/0.1" },
  }, { provider: "OpenAlex", attempts: 3, retryDelayMs: 1_200, timeoutMs: 15_000, fetchImpl });
  if (!response.ok) {
    if (response.status === 429) noteProviderRateLimit("OpenAlex");
    throw providerResponseError("OpenAlex", response);
  }
  const payload = await response.json();
  return (payload.results || []).map(normalizeOpenAlexWork);
}

async function searchArxivKeywords(query, limit, fetchImpl = fetch) {
  const searchQuery = buildArxivKeywordQuery(query);
  if (!searchQuery) return [];
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(limit),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const response = await fetchWithRetry(`${ARXIV_API_URL}?${params}`, {
    headers: { Accept: "application/atom+xml", "User-Agent": "Archimedes-Research/0.1" },
  }, { provider: "arXiv", attempts: 2, timeoutMs: 25_000, fetchImpl });
  if (!response.ok) throw providerResponseError("arXiv", response);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const payload = parser.parse(await response.text());
  return asArray(payload.feed?.entry).map((entry) => normalizeArxivEntry(entry, "")).slice(0, limit);
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

async function searchAcademicPaperSources(query, requestedLimit, fetchImpl = fetch) {
  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  if (!trimmedQuery || trimmedQuery.length > 300) throw new Error("Enter a research query of at most 300 characters.");
  const limit = sanitizeLimit(requestedLimit);
  const providers = [
    ["arXiv", () => searchArxivKeywords(trimmedQuery, limit, fetchImpl)],
    ["Semantic Scholar", () => searchSemanticScholar(trimmedQuery, limit, fetchImpl)],
    ["OpenAlex", () => searchOpenAlex(trimmedQuery, limit, fetchImpl)],
  ];
  const settled = await Promise.allSettled(providers.map(([, search]) => search()));
  const papers = [];
  const usedProviders = [];
  const warnings = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const provider = providers[index][0];
    if (result.status === "fulfilled") {
      if (result.value.length) usedProviders.push(provider);
      papers.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : "search failed";
      warnings.push(message.startsWith(provider) ? message : `${provider}: ${message}`);
    }
  }
  if (!papers.length) throw new Error(`No paper metadata could be retrieved. ${warnings.join(" ")}`);
  return { papers, providers: usedProviders, warnings };
}

module.exports = { discoverDailyPapers, normalizeDailyOptions, searchAcademicPapers, searchAcademicPaperSources, fetchWithRetry, matchesDailyTopic, resetProviderCooldowns };
