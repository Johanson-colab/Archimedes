const assert = require("node:assert/strict");
const test = require("node:test");
const { buildArxivKeywordQuery, fetchWithRetry, firstFigureSrc, matchesDailyQuery, normalizeDailyOptions, resetProviderCooldowns, resolveArxivFigure, searchAcademicPaperSources } = require("./literature.cjs");

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
    limit: 5_000,
  });
  assert.deepEqual(options.categories, ["cs.AI"]);
  assert.equal(options.limit, 100);
  assert.equal(options.query, "");
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

test("reads vector figures published as <object> instead of <img>", () => {
  const page = `<figure id="S1.F1"><object type="image/svg+xml" data="2610.37642v1/teaser.svg"></object><figcaption>Figure 1</figcaption></figure>`;
  assert.equal(firstFigureSrc(page), "2610.37642v1/teaser.svg");
  const mixed = `<figure><object data="a.svg"></object></figure><figure><img src="b.png"></figure>`;
  assert.equal(firstFigureSrc(mixed), "a.svg");
  const noFigure = `<picture><source srcset="hero.webp"></picture>`;
  assert.equal(firstFigureSrc(noFigure), "");
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

test("figure discovery stops streaming once the first figure URL is found", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('<html><figure><img src="2611.90001v1/first.png">')); },
    cancel() { cancelled = true; },
  });
  const result = await resolveArxivFigure("2611.90001", async () => new Response(body));
  assert.equal(result, "https://arxiv.org/html/2611.90001v1/first.png");
  assert.equal(cancelled, true, "the rest of a potentially large paper is not downloaded");
});

test("a stalled primary host falls back once without a retry loop", async () => {
  const requests = [];
  const result = await resolveArxivFigure("2611.90002", async (url, input) => {
    assert.ok(input.signal instanceof AbortSignal);
    requests.push(url);
    if (url.startsWith("https://arxiv.org/")) throw new DOMException("timeout", "TimeoutError");
    return new Response('<figure><img src="2611.90002v1/first.png"></figure>');
  });
  assert.equal(requests.length, 2);
  assert.equal(result, "https://ar5iv.labs.arxiv.org/html/2611.90002v1/first.png");
});

test("duplicate lookups share a request and the figure resolver never exceeds three slots", async () => {
  let active = 0, peak = 0, calls = 0;
  const fetchImpl = async () => {
    active++; calls++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return new Response('<figure><img src="first.png"></figure>');
  };
  const results = await Promise.all([...Array.from({ length: 7 }, (_, i) => resolveArxivFigure(`2611.9010${i}`, fetchImpl)), resolveArxivFigure("2611.90100", fetchImpl)]);
  assert.equal(calls, 7); assert.equal(peak, 3); assert.equal(results[0], results.at(-1));
});

test("an oversized stream chunk still yields a figure inside the bounded prefix", async () => {
  const body = '<figure><img src="2611.90003v1/first.png"></figure>' + ' '.repeat(5 * 1024 * 1024);
  assert.equal(await resolveArxivFigure("2611.90003", async () => new Response(body)), "https://arxiv.org/html/2611.90003v1/first.png");
});

test("a full title becomes one arXiv phrase, not an AND of every word", () => {
  const title = "One Reflection Is Not Enough: Self-Correcting Autonomous Research via Multi-Hypothesis Failure Attribution";
  assert.equal(buildArxivKeywordQuery(title), `all:"${title}"`);
  assert.equal(buildArxivKeywordQuery("agent memory"), 'all:"agent" AND all:"memory"');
});

test("explicit title and short keyword searches both use the full archive", () => {
  const title = "One Reflection Is Not Enough: Self-Correcting Autonomous Research via Multi-Hypothesis Failure Attribution";
  const titled = normalizeDailyOptions({ topic: "gui_compute_use", query: title });
  assert.equal(titled.topic, "all");
  assert.ok(titled.categories.includes("cs.CV"), "a title may be cross-listed outside the feed's default categories");
  const short = normalizeDailyOptions({ topic: "gui_compute_use", query: "computer use" });
  assert.equal(short.topic, "all");
  assert.equal(short.range, "all");
});

test("punctuation and hyphens do not break the local match", () => {
  const paper = {
    title: "One Reflection Is Not Enough: Self-Correcting Autonomous Research",
    abstract: "", authors: [], categories: ["cs.AI"],
  };
  assert.equal(matchesDailyQuery(paper, "self correcting autonomous research"), true);
  assert.equal(matchesDailyQuery(paper, "Self-Correcting Autonomous Research"), true);
  assert.equal(matchesDailyQuery(paper, "unrelated topic"), false);
});

const { discoverDailyPapers } = require("./literature.cjs");
const atomPaper = '<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/1706.03762v1</id><published>2017-06-12T00:00:00Z</published><title>Attention Is All You Need</title><summary>Transformer</summary><author><name>Vaswani</name></author><category term="cs.CL"/></entry></feed>';
test("Daily keyword searches escape feed dates and categories, and IDs use id_list", async () => {
  for (const query of ["attention", "Attention Is All You Need", "1706.03762"]) {
    const result = await discoverDailyPapers({ query, topic: "robotics_vla", range: "7d", mode: "trending" }, { fetchImpl: async (url) => {
      const params = new URL(url).searchParams;
      if (query !== "1706.03762") assert.equal(params.get("sortBy"), "relevance");
      assert.doesNotMatch(params.get("search_query") || "", /submittedDate|cat:|robotics/);
      if (query === "1706.03762") { assert.equal(params.get("id_list"), query); assert.equal(params.has("search_query"), false); }
      return new Response(atomPaper);
    } });
    assert.equal(result.papers[0].title, "Attention Is All You Need"); assert.deepEqual(result.providers, ["arxiv"]);
  }
});

test("Latest uses a stable topic query, then applies the date window to returned papers", async () => {
  const recent = atomPaper.replace("2017-06-12T00:00:00Z", new Date().toISOString());
  const result = await discoverDailyPapers({ topic: "robotics_vla", range: "30d" }, { fetchImpl: async url => {
    const params = new URL(url).searchParams;
    assert.doesNotMatch(params.get("search_query"), /submittedDate:/); assert.match(params.get("search_query"), /cat:cs.RO/);
    assert.equal(params.get("sortBy"), "submittedDate"); return new Response(recent);
  } });
  assert.equal(result.papers.length, 1);
  const old = await discoverDailyPapers({ range: "7d" }, { fetchImpl: async () => new Response(atomPaper) });
  assert.equal(old.papers.length, 0);
});

test("Daily distinguishes empty Atom results from broken, truncated and API-error feeds", async () => {
  const result = await discoverDailyPapers({}, { fetchImpl: async () => new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv</title></feed>') });
  assert.deepEqual(result.papers, []);
  for (const text of ['<html>proxy failed</html>', '<feed><entry>', '<feed><entry><id>https://arxiv.org/api/errors#bad_query</id></entry></feed>']) {
    await assert.rejects(discoverDailyPapers({}, { fetchImpl: async () => new Response(text) }), /unreadable|rejected/);
  }
});

test("Daily reports rate limiting after one bounded attempt rather than retrying for a minute", async () => {
  let calls = 0;
  await assert.rejects(discoverDailyPapers({ query: "1706.03762" }, { fetchImpl: async (_url, init) => {
    calls++; assert.ok(init.signal instanceof AbortSignal); return new Response("", { status: 429 });
  } }), /rate-limiting/);
  assert.equal(calls, 1);
});

test("official RSS keeps browsing available during an API outage with scope disclosed", async () => {
  const rss = atomPaper.replace('https://arxiv.org/abs/1706.03762v1', 'oai:arXiv.org:1706.03762v1')
    .replace('2017-06-12T00:00:00Z', new Date().toISOString()).replace('<author><name>Vaswani</name></author>', '<dc:creator>Vaswani, Researcher</dc:creator>');
  let calls = 0;
  const result = await discoverDailyPapers({}, { fetchImpl: async url => {
    calls++; if (!url.startsWith("https://rss.arxiv.org/")) return new Response("", { status: 429 }); return new Response(rss);
  } });
  assert.equal(calls, 2); assert.equal(result.papers[0].arxiv_id, "1706.03762"); assert.deepEqual(result.papers[0].authors, ["Vaswani", "Researcher"]);
  assert.deepEqual(result.providers, ["arxiv-rss"]); assert.match(result.warning, /date range may be incomplete/);
  await assert.rejects(discoverDailyPapers({}, { fetchImpl: async url => url.startsWith("https://rss.arxiv.org/") ? new Response('<feed><title>empty announcements</title></feed>') : new Response("", { status: 429 }) }), /rate-limiting/);
});

test("keyword search uses a disclosed OpenAlex fallback and preserves actual paper identities", async () => {
  const calls = [];
  const result = await discoverDailyPapers({ query: "agent memory" }, { fetchImpl: async url => {
    calls.push(url);
    if (url.includes("arxiv.org")) return new Response("", { status: 429 });
    return Response.json({ results: [{ id: "https://openalex.org/W123", display_name: "A memory study", publication_year: 2025, authorships: [{ author: { display_name: "Researcher" } }], abstract_inverted_index: { Agent: [0], memory: [1] }, doi: "https://doi.org/10.1234/example" }] });
  } });
  assert.equal(calls.length, 2); assert.deepEqual(result.providers, ["openalex"]);
  assert.equal(result.papers[0].source, "openalex"); assert.equal(result.papers[0].doi, "10.1234/example"); assert.deepEqual(result.papers[0].categories, []);
  assert.match(result.warning, /OpenAlex/);
  await assert.rejects(discoverDailyPapers({ query: "no evidence" }, { fetchImpl: async url => url.includes("arxiv.org") ? new Response("", { status: 429 }) : Response.json({ results: [] }) }), /rate-limiting/);
});
