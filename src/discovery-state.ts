export type DiscoverySnapshot = {
  mode: DailyDiscoveryMode | "conference";
  range: DailyDiscoveryRange;
  topic: DailyDiscoveryTopic;
  searchKind: "quick" | "deep";
  query: string;
  submittedQuery: string;
  targetLibraryId: string;
  response: DailyDiscoveryResponse | null;
  deepResponse: DeepPaperSearchResponse | null;
};

export function discoveryPaperKey(paper: AcademicSearchResult) {
  if (paper.doi) return `doi:${paper.doi.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "")}`;
  if (paper.arxiv_id) return `arxiv:${paper.arxiv_id.toLowerCase().replace(/v\d+$/, "")}`;
  if (paper.s2_id) return `s2:${paper.s2_id.toLowerCase()}`;
  return `title:${paper.title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
}

export function discoveryStorageKey(dataRoot: string, projectId?: string | null) {
  return `archimedes-discovery-v1:${JSON.stringify([dataRoot, projectId || "local"])}`;
}

// Persist research fields only: no bridge objects, credentials, local PDF data,
// image payloads or transient errors from the process environment.
export function discoveryPaperFields(paper: AcademicSearchResult) {
  const text = (value: unknown, max = 2000) => typeof value === "string" ? value.slice(0, max) : "";
  return {
    external_id: text(paper.external_id), s2_id: text(paper.s2_id), arxiv_id: text(paper.arxiv_id), doi: text(paper.doi),
    title: text(paper.title), authors: Array.isArray(paper.authors) ? paper.authors.slice(0, 100).map((author) => text(author)) : [],
    year: Number.isFinite(paper.year) ? paper.year : null, venue: text(paper.venue), abstract: text(paper.abstract, 20000),
    url: text(paper.url), pdf_url: text(paper.pdf_url), citation_count: Number(paper.citation_count) || 0, source: text(paper.source),
  };
}

export function writeDiscoverySnapshot(storage: Storage, key: string, snapshot: DiscoverySnapshot) {
  const response = snapshot.response && {
    papers: snapshot.response.papers.slice(0, 60).map((paper) => ({ ...discoveryPaperFields(paper), published_at: paper.published_at, discovered_at: paper.discovered_at, categories: paper.categories, upvotes: paper.upvotes, github_url: paper.github_url, github_stars: paper.github_stars })),
    providers: snapshot.response.providers, options: snapshot.response.options, fetched_at: snapshot.response.fetched_at,
    cached: snapshot.response.cached, stale: snapshot.response.stale, warning: snapshot.response.warning,
  };
  const deepResponse = snapshot.deepResponse && {
    plan: snapshot.deepResponse.plan, results: snapshot.deepResponse.results.slice(0, 60).map((result) => ({ relevance: result.relevance, reason: result.reason, matched_terms: result.matched_terms, paper: discoveryPaperFields(result.paper) })),
    providers: snapshot.deepResponse.providers, fetched_at: snapshot.deepResponse.fetched_at, warning: snapshot.deepResponse.warning,
  };
  storage.setItem(key, JSON.stringify({ ...snapshot, response, deepResponse }));
}

export function readDiscoverySnapshot(storage: Storage, key: string): DiscoverySnapshot | null {
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (!saved || !["latest", "trending", "conference"].includes(saved.mode) || !["quick", "deep"].includes(saved.searchKind) || typeof saved.query !== "string" || typeof saved.submittedQuery !== "string") return null;
    if (saved.response && (!Array.isArray(saved.response.papers) || !Array.isArray(saved.response.providers))) return null;
    if (saved.deepResponse && (!Array.isArray(saved.deepResponse.results) || !saved.deepResponse.plan || !Array.isArray(saved.deepResponse.providers))) return null;
    return { ...saved, targetLibraryId: saved.targetLibraryId || "" };
  } catch { return null; }
}

