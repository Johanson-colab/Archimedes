const S2_BASE_URL = "https://api.semanticscholar.org/graph/v1";
const OPENALEX_BASE_URL = "https://api.openalex.org";

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
  if (!invertewdIndex) return "";
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
  const url = `${OPENALEX_BASE_URL}/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
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
  try {
    return await searchSemanticScholar(trimmedQuery, limit);
  } catch (semanticScholarError) {
    try {
      return await searchOpenAlex(trimmedQuery, limit);
    } catch (openAlexError) {
      throw new Error(`${semanticScholarError.message} ${openAlexError.message}`);
    }
  }
}

module.exports = { searchAcademicPapers };
