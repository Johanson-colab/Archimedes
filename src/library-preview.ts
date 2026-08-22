import seedData from "../shared/library-seeds.json";

const now = new Date().toISOString();
const previewLibraries: ResearchLibrary[] = seedData.libraries.map((library) => ({
  id: library.id,
  name: library.name,
  description: library.description,
  color: library.color,
  paper_count: library.papers.length,
  created_at: now,
  updated_at: now,
}));

const previewPapers = new Map<string, LibraryPaper>();
const previewLinks = new Map<string, Set<string>>();

for (const library of seedData.libraries) {
  previewLinks.set(library.id, new Set(library.papers.map((paper) => paper.id)));
  for (const paper of library.papers) {
    previewPapers.set(paper.id, {
      ...paper,
      external_id: paper.id,
      s2_id: "",
      doi: "doi" in paper ? paper.doi ?? "" : "",
      citation_count: 0,
      canonical_key: `arxiv:${paper.arxiv_id}`,
      reading_status: "unread",
      starred: false,
      notes: "",
      tags: [],
      created_at: now,
      updated_at: now,
    });
  }
}

function refreshCount(libraryId: string) {
  const library = previewLibraries.find((candidate) => candidate.id === libraryId);
  if (library) {
    library.paper_count = previewLinks.get(libraryId)?.size ?? 0;
    library.updated_at = new Date().toISOString();
  }
}

export const previewLibraryBridge = {
  listLibraries: async () => previewLibraries.map((library) => ({ ...library })),
  createLibrary: async ({ name, description = "", color = "#3973c8" }: { name: string; description?: string; color?: string }) => {
    const library: ResearchLibrary = { id: crypto.randomUUID(), name, description, color, paper_count: 0, created_at: now, updated_at: now };
    previewLibraries.unshift(library);
    previewLinks.set(library.id, new Set());
    return { ...library };
  },
  updateLibrary: async (id: string, patch: Partial<ResearchLibrary>) => {
    const library = previewLibraries.find((candidate) => candidate.id === id);
    if (!library) throw new Error("Library not found.");
    Object.assign(library, patch, { updated_at: new Date().toISOString() });
    return { ...library };
  },
  deleteLibrary: async (id: string) => {
    const index = previewLibraries.findIndex((candidate) => candidate.id === id);
    if (index < 0) return { deleted: false };
    previewLibraries.splice(index, 1);
    previewLinks.delete(id);
    return { deleted: true };
  },
  listLibraryPapers: async (libraryId: string, query = "") => {
    const normalizedQuery = query.trim().toLowerCase();
    const ids = previewLinks.get(libraryId) ?? new Set();
    return [...ids]
      .map((id) => previewPapers.get(id))
      .filter((paper): paper is LibraryPaper => Boolean(paper))
      .filter((paper) => !normalizedQuery || `${paper.title} ${paper.abstract} ${paper.authors.join(" ")}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => Number(b.starred) - Number(a.starred) || (b.year ?? 0) - (a.year ?? 0))
      .map((paper) => ({ ...paper, authors: [...paper.authors], tags: [...paper.tags] }));
  },
  searchAcademicPapers: async (query: string, limit = 12) => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const catalog = [...previewPapers.values()];
    const matches = catalog.filter((paper) => !terms.length || terms.some((term) => `${paper.title} ${paper.abstract}`.toLowerCase().includes(term)));
    return (matches.length ? matches : catalog).slice(0, limit).map(({ canonical_key: _canonicalKey, reading_status: _readingStatus, starred: _starred, notes: _notes, tags: _tags, created_at: _createdAt, updated_at: _updatedAt, id, ...paper }) => ({ ...paper, external_id: paper.external_id || id }));
  },
  discoverDailyPapers: async (input: DailyDiscoveryOptions = {}) => {
    const mode = input.mode === "trending" ? "trending" : "latest";
    const range = input.range ?? "3d";
    const categories = input.categories?.length ? input.categories : ["cs.AI", "cs.LG", "cs.CL"];
    const query = input.query?.trim().toLowerCase() ?? "";
    const limit = input.limit ?? 40;
    const papers = [...previewPapers.values()]
      .filter((paper) => !query || `${paper.title} ${paper.abstract}`.toLowerCase().includes(query))
      .slice(0, limit)
      .map(({ canonical_key: _canonicalKey, reading_status: _readingStatus, starred: _starred, notes: _notes, tags: _tags, created_at: _createdAt, updated_at: _updatedAt, id, ...paper }, index): DailyPaper => ({
        ...paper,
        external_id: paper.external_id || id,
        published_at: new Date(Date.now() - index * 3_600_000).toISOString(),
        discovered_at: new Date(Date.now() - index * 3_600_000).toISOString(),
        categories: [categories[index % categories.length]],
        upvotes: mode === "trending" ? Math.max(1, 18 - index) : 0,
        github_url: "",
        github_stars: 0,
      }));
    return {
      papers,
      providers: ["browser-preview"],
      options: { mode, range, categories, query: input.query?.trim() ?? "", limit },
      fetched_at: new Date().toISOString(),
      cached: false,
      stale: false,
    };
  },
  addLibraryPaper: async (libraryId: string, paper: AcademicSearchResult) => {
    const existing = [...previewPapers.values()].find((candidate) => candidate.arxiv_id && candidate.arxiv_id === paper.arxiv_id)
      ?? [...previewPapers.values()].find((candidate) => candidate.title === paper.title);
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      previewPapers.set(id, {
        ...paper,
        id,
        canonical_key: paper.arxiv_id ? `arxiv:${paper.arxiv_id}` : `title:${paper.title.toLowerCase()}`,
        reading_status: "unread",
        starred: false,
        notes: "",
        tags: [],
        created_at: now,
        updated_at: now,
      });
    }
    const links = previewLinks.get(libraryId);
    if (!links) throw new Error("Library not found.");
    links.add(id);
    refreshCount(libraryId);
    return { ...(previewPapers.get(id) as LibraryPaper) };
  },
  updateLibraryPaper: async (paperId: string, patch: Partial<LibraryPaper>) => {
    const paper = previewPapers.get(paperId);
    if (!paper) throw new Error("Paper not found.");
    Object.assign(paper, patch, { updated_at: new Date().toISOString() });
    return { ...paper };
  },
  removeLibraryPaper: async (libraryId: string, paperId: string) => {
    const removed = previewLinks.get(libraryId)?.delete(paperId) ?? false;
    refreshCount(libraryId);
    return { removed };
  },
};
