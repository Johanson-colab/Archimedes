const assert = require("node:assert/strict");
const test = require("node:test");
const { collapseWarnings, deepSearchPapers, deduplicatePapers, normalizeDeepSearchInput, sanitizeSearchPlan } = require("./deep-paper-search.cjs");

test("normalizes deep-search input and bounds generated plans", () => {
  assert.deepEqual(normalizeDeepSearchInput({ prompt: "  Find nonlinear multi-agent control papers  ", topic: "Robotics/VLA", limit: 999 }), {
    prompt: "Find nonlinear multi-agent control papers",
    topic: "Robotics/VLA",
    limit: 24,
  });
  const plan = sanitizeSearchPlan({
    research_problem: "Formation control",
    domains: ["robotics", "robotics"],
    methods: ["distributed control"],
    year_range: { start: 2020, end: 2026 },
    queries: ["query one", "query two", "query three", "query four", "query five", "query six"],
  }, "Find formation-control papers", "Robotics/VLA");
  assert.deepEqual(plan.domains, ["robotics"]);
  assert.equal(plan.queries.length, 5);
  assert.deepEqual(plan.year_range, { start: 2020, end: 2026 });
});

test("deduplicates cross-provider papers and preserves richer metadata", () => {
  const papers = deduplicatePapers([
    { doi: "10.1/example", title: "Paper", abstract: "short", source: "semantic-scholar", citation_count: 2, pdf_url: "" },
    { doi: "10.1/EXAMPLE", title: "Paper", abstract: "a much longer abstract", source: "openalex", citation_count: 8, pdf_url: "https://example.test/paper.pdf" },
  ]);
  assert.equal(papers.length, 1);
  assert.equal(papers[0].abstract, "a much longer abstract");
  assert.equal(papers[0].citation_count, 8);
  assert.equal(papers[0].pdf_url, "https://example.test/paper.pdf");
  assert.equal(papers[0].source, "semantic-scholar,openalex");
});

test("falls back transparently when no model is configured", async () => {
  const response = await deepSearchPapers({ prompt: "Find papers about nonlinear multi-agent formation control", topic: "robotics", limit: 5 }, {
    modelConfig: {},
    searchSources: async () => ({
      providers: ["Test index"], warnings: [], papers: [
        { s2_id: "one", title: "Nonlinear formation control for multi-agent systems", abstract: "Distributed control for robot teams.", authors: [], year: 2025, citation_count: 4, source: "test" },
        { s2_id: "two", title: "Unrelated vision paper", abstract: "Image classification.", authors: [], year: 2024, citation_count: 100, source: "test" },
      ],
    }),
  });
  assert.equal(response.results[0].paper.s2_id, "one");
  assert.match(response.warning, /Query expansion unavailable/);
  assert.match(response.warning, /Semantic reranking unavailable/);
  assert.deepEqual(response.providers, ["Test index"]);
});

test("collapses repeated provider warnings into one counted line", () => {
  assert.equal(collapseWarnings([]), "");
  assert.equal(
    collapseWarnings([
      "Semantic Scholar is rate-limiting anonymous requests; retry in a moment.",
      "Semantic Scholar is rate-limiting anonymous requests; retry in a moment.",
      "OpenAlex is rate-limiting anonymous requests; retry in a moment.",
    ]),
    "Semantic Scholar is rate-limiting anonymous requests; retry in a moment. (\u00d72) OpenAlex is rate-limiting anonymous requests; retry in a moment.",
  );
});
