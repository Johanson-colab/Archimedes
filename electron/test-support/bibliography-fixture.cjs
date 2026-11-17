// No network or model required. The desktop audit wrapper may substitute only
// library:discover-daily / library:deep-search with these response objects.
const paper = {
  external_id: "doi:10.5555/archimedes-literature-fixture", s2_id: "", arxiv_id: "", doi: "10.5555/archimedes-literature-fixture",
  title: "Evidence handoff fixture", authors: ["Research Fixture"], year: 2026, venue: "Local fixture",
  abstract: "A deterministic candidate for selecting papers and preserving project context.",
  url: "", pdf_url: "", citation_count: 0, source: "local-fixture", published_at: "2026-11-16T00:00:00.000Z", discovered_at: "2026-11-16T00:00:00.000Z",
  categories: ["cs.AI"], upvotes: 0, github_url: "", github_stars: 0,
};
function feed(input = {}) {
  return { papers: [paper], providers: ["local fixture"], options: { mode: "latest", range: "7d", topic: "all", categories: [], query: "", limit: 60, ...input }, fetched_at: "2026-11-16T00:00:00.000Z", cached: false, stale: true, warning: "Fixture fallback; no model was used." };
}
module.exports = { paper, feed, bibtex: "@article{handoff2026,\n title={Evidence handoff fixture},\n author={Research Fixture},\n year={2026},\n doi={10.5555/archimedes-literature-fixture}\n}" };
