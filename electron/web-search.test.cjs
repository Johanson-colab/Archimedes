const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSearchResults, searchWeb } = require("./web-search.cjs");

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
