const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getPublicWebSearchConfig, initializeWebSearch, normalizeSearchResults, saveWebSearchConfig, searchWeb } = require("./web-search.cjs");

test("searches general web results through Brave and returns links", async () => {
  let requested;
  const result = await searchWeb({ query: "agent memory", type: "web", limit: 2 }, {
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requested = { url: url.toString(), options };
      return { ok: true, json: async () => ({ web: { results: [{ title: "A paper", url: "https://example.org/paper", description: "Research" }] } }) };
    },
  });
  assert.match(requested.url, /\/web\/search\?q=agent\+memory/);
  assert.equal(requested.options.headers["X-Subscription-Token"], "test-key");
  assert.deepEqual(result.results, [{ title: "A paper", url: "https://example.org/paper", snippet: "Research", published_at: "", source: "web" }]);
});

test("uses the news endpoint and freshness filter", async () => {
  let requested;
  const result = await searchWeb({ query: "AI policy", type: "news", freshness: "pd" }, {
    apiKey: "test-key",
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, json: async () => ({ results: [{ title: "Update", url: "https://news.example.org/update", page_age: "today" }] }) };
    },
  });
  assert.equal(requested.pathname, "/res/v1/news/search");
  assert.equal(requested.searchParams.get("freshness"), "pd");
  assert.equal(result.results[0].source, "news");
  assert.equal(result.results[0].published_at, "today");
});

test("rejects missing keys and malformed result rows", async () => {
  assert.deepEqual(normalizeSearchResults({ web: { results: [{ title: "No URL" }] } }, "web"), []);
  await assert.rejects(searchWeb({ query: "test" }, { apiKey: "", fetchImpl: async () => {} }), /Brave Search API key/);
});

test("runs several filtered web queries and merges duplicate URLs", async () => {
  const requests = [];
  const result = await searchWeb({ queries: ["agent memory", "memory benchmark"], domains: ["arxiv.org"], freshness: "2026-09-01to2026-10-01" }, {
    apiKey: "test-key",
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ web: { results: [
        { title: "Paper", url: "https://arxiv.org/abs/1234.5678", description: "Methods" },
        { title: "Unrelated", url: "https://example.org/page" },
      ] } }) };
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("freshness"), "2026-09-01to2026-10-01");
  assert.match(requests[0].searchParams.get("q"), /site:arxiv\.org/);
  assert.equal(result.searches.length, 2);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, "https://arxiv.org/abs/1234.5678");
  await assert.rejects(searchWeb({ query: "test", domains: ["https://example.org/path"] }, { apiKey: "test-key" }), /hostnames/);
});

test("migrates a saved Brave key and keeps provider keys separate", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-search-"));
  try {
    fs.writeFileSync(path.join(directory, "web-search-config.json"), JSON.stringify({ apiKey: "brave-key" }));
    initializeWebSearch(directory);
    assert.deepEqual(getPublicWebSearchConfig(), { provider: "brave", hasApiKey: true, configuredProviders: ["brave"] });
    saveWebSearchConfig({ provider: "tavily", apiKey: "tavily-key" });
    assert.deepEqual(getPublicWebSearchConfig(), { provider: "tavily", hasApiKey: true, configuredProviders: ["brave", "tavily"] });
    assert.throws(() => saveWebSearchConfig({ provider: "exa", apiKey: "" }), /exa API key/);
    saveWebSearchConfig({ provider: "brave", apiKey: "" });
    assert.equal(getPublicWebSearchConfig().provider, "brave");
  } finally {
    initializeWebSearch("");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("routes Tavily, Exa, and Firecrawl through their own API and normalizes results", async () => {
  const cases = [
    { provider: "tavily", url: "api.tavily.com/search", response: { results: [{ title: "T", url: "https://example.org/t", content: "Tavily extract" }] }, header: "Authorization", value: "Bearer test-key" },
    { provider: "exa", url: "api.exa.ai/search", response: { results: [{ title: "E", url: "https://example.org/e", highlights: ["Exa highlight"] }] }, header: "x-api-key", value: "test-key" },
    { provider: "firecrawl", url: "api.firecrawl.dev/v2/search", response: { data: { web: [{ title: "F", url: "https://example.org/f", description: "Firecrawl snippet" }] } }, header: "Authorization", value: "Bearer test-key" },
  ];
  for (const item of cases) {
    let called;
    const result = await searchWeb({ query: "research", type: "web" }, {
      provider: item.provider, apiKey: "test-key", fetchImpl: async (url, request) => { called = { url, request }; return { ok: true, json: async () => item.response }; },
    });
    assert.match(called.url, new RegExp(item.url.replaceAll(".", "\\.")));
    assert.equal(called.request.headers[item.header], item.value);
    assert.equal(result.results.length, 1);
    assert.ok(result.results[0].snippet);
  }
});

test("Firecrawl news results use the news response group", async () => {
  const result = await searchWeb({ query: "AI regulation", type: "news" }, {
    provider: "firecrawl", apiKey: "test-key",
    fetchImpl: async (_url, request) => {
      assert.deepEqual(JSON.parse(request.body).sources, ["news"]);
      return { ok: true, json: async () => ({ data: { news: [{ title: "Update", url: "https://example.org/news", description: "Announcement" }] } }) };
    },
  });
  assert.equal(result.results[0].source, "news");
});
