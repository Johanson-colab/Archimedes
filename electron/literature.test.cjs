const assert = require("node:assert/strict");
const test = require("node:test");
const { fetchWithRetry, firstFigureSrc, normalizeDailyOptions, resetProviderCooldowns, resolveArxivFigure, searchAcademicPaperSources } = require("./literature.cjs");

test("retries a timed-out literature request", async () => {
  let attempts = 0;
  const response = await fetchWithRetry("https://example.test", {}, {
    attempts: 2,
    timeoutMs: 50,
    retryDelayMs: 0,
    provider: "Test provider",
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new DOMException("The operation timed out", "TimeoutError");
      return { ok: true, status: 200 };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});

test("names a rate limit in plain language and stops retrying it", async () => {
  resetProviderCooldowns();
  const limited = { ok: false, status: 429, headers: { get: () => null }, text: async () => "" };
  let calls = 0;
  await assert.rejects(
    searchAcademicPaperSources("agent evaluation", 8, async () => {
      calls += 1;
      return limited;
    }),
    /Semantic Scholar is rate-limiting anonymous requests/,
  );
  // Each provider retries before giving up.
  assert.ok(calls >= 6, `expected retries, saw ${calls} calls`);

  // A second query in the same deep search must not wait out the backoff again.
  const before = calls;
  await assert.rejects(searchAcademicPaperSources("agent evaluation", 8, async () => { calls += 1; return limited; }), /rate-limiting/);
  assert.equal(calls - before, 2, "only arXiv should be attempted while the other providers cool down");
  resetProviderCooldowns();
});

test("bounds daily discovery options", () => {
  const options = normalizeDailyOptions({
    mode: "latest",
    range: "7d",
    categories: ["cs.AI", "invalid", "cs.AI"],
    query: "agent memory",
    limit: 5_000,
  });
  assert.deepEqual(options.categories, ["cs.AI"]);
  assert.equal(options.limit, 100);
  assert.equal(options.query, "agent memory");
});

test("uses topic defaults and longer daily discovery ranges", () => {
  const options = normalizeDailyOptions({ topic: "coding_agents", range: "30d" });
  assert.equal(options.topic, "coding_agents");
  assert.equal(options.range, "30d");
  assert.deepEqual(options.categories, ["cs.AI", "cs.SE", "cs.LG"]);
});

test("maps focused research topics and discards retired filters", () => {
  assert.deepEqual(normalizeDailyOptions({ topic: "on_policy_distillation" }).categories, ["cs.AI", "cs.LG", "stat.ML"]);
  assert.deepEqual(normalizeDailyOptions({ topic: "robotics_vla" }).categories, ["cs.RO", "cs.AI", "cs.CV", "cs.LG"]);
  assert.equal(normalizeDailyOptions({ topic: "multi_agent" }).topic, "all");
});

test("accepts an unbounded daily discovery range", () => {
  assert.equal(normalizeDailyOptions({ range: "all" }).range, "all");
  assert.equal(normalizeDailyOptions({ range: "90d" }).range, "90d");
  assert.equal(normalizeDailyOptions({ range: "5y" }).range, "7d");
});

test("maps the added daily topics to their categories", () => {
  assert.deepEqual(normalizeDailyOptions({ topic: "efficient_inference" }).categories, ["cs.LG", "cs.AI", "cs.CL", "cs.PF"]);
  assert.deepEqual(normalizeDailyOptions({ topic: "generative_models" }).categories, ["cs.LG", "cs.CV", "cs.AI"]);
  assert.deepEqual(normalizeDailyOptions({ topic: "vision_3d" }).categories, ["cs.CV", "cs.GR"]);
  assert.deepEqual(normalizeDailyOptions({ topic: "speech_audio" }).categories, ["cs.SD", "eess.AS", "cs.CL", "cs.LG"]);
});

test("deep-search retrieval combines Semantic Scholar and OpenAlex", async () => {
  const requested = [];
  const result = await searchAcademicPaperSources("agent evaluation", 8, async (url) => {
    requested.push(url);
    if (url.includes("export.arxiv.org")) return { ok: true, status: 200, text: async () => `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/2601.00001v1</id><published>2026-01-01T00:00:00Z</published><title>arXiv result</title><summary>Agent evaluation</summary><author><name>Researcher</name></author><category term="cs.AI"/></entry></feed>` };
    if (url.includes("semanticscholar")) return { ok: true, json: async () => ({ data: [{ paperId: "s2-1", title: "Semantic result", authors: [], year: 2025, abstract: "Agent evaluation", externalIds: {} }] }) };
    return { ok: true, json: async () => ({ results: [{ id: "https://openalex.org/W1", display_name: "OpenAlex result", publication_year: 2024, authorships: [], abstract_inverted_index: { Agent: [0], evaluation: [1] } }] }) };
  });
  assert.equal(requested.length, 3);
  assert.deepEqual(result.providers, ["arXiv", "Semantic Scholar", "OpenAlex"]);
  assert.deepEqual(result.papers.map((paper) => paper.title), ["arXiv result", "Semantic result", "OpenAlex result"]);
});

test("reads the first real figure out of an arXiv HTML page", () => {
  const page = `<html><body><img src="site-logo.png"><figure id="S1.F1"><img src="2610.37668v1/hexel.png" alt=""></figure><figure><img src="b.png"></figure></body></html>`;
  assert.equal(firstFigureSrc(page), "2610.37668v1/hexel.png");
  assert.equal(firstFigureSrc(`<html><body><img src="x.png"></body></html>`), "");
  assert.equal(firstFigureSrc(`<figure><img src="https://arxiv.org/icons/licenses/by-4.0.png"></figure>`), "");
  assert.equal(firstFigureSrc(""), "");
});

test("resolves a paper figure and caches the miss", async () => {
  const html = `<html><body><figure><img src="2610.37668v1/hexel.png"></figure></body></html>`;
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, text: async () => html };
  };
  const url = await resolveArxivFigure("2610.37668", fetchImpl);
  assert.equal(url, "https://arxiv.org/html/2610.37668v1/hexel.png");
  assert.equal((await resolveArxivFigure("2610.37668", fetchImpl)), url);
  assert.equal(requested.length, 1, "the figure is cached");
  assert.equal(await resolveArxivFigure("not-an-id", fetchImpl), "");
});
