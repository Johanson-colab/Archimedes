const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const news = require("./news.cjs");
const newsSources = require("./news-sources.cjs");
const store = require("./news-store.cjs");
const webSearch = require("./web-search.cjs");

const apiKey = String(process.env.TAVILY_API_KEY || "").trim();
const skip = apiKey ? false : "Set TAVILY_API_KEY to run the live Tavily X search.";
const QUERIES = ["AI agents evaluation", "machine learning research", "OpenAI"];
const disabledSources = { hn: false, github: false, arxiv: false, lobsters: false, reddit: false, rss: false, x: false, "x-tavily": false };

test("live Tavily search returns public X posts with valid links", { skip }, async () => {
  const items = [];
  const failures = [];
  for (const query of QUERIES) {
    try {
      const result = await newsSources.fetchXWithTavily({ query, apiKey });
      items.push(...result.items);
      if (items.length) break;
    } catch (error) {
      failures.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.ok(items.length, `Tavily returned no public X posts. ${failures.join(" | ")}`);
  for (const item of items) {
    assert.match(item.url, /^https:\/\/x\.com\/(?:i\/web|[a-z0-9_]{1,15})\/status\/\d+$/i);
    assert.ok(item.title, "a real X post should keep its title");
    if (item.publishedAt) assert.ok(Number.isFinite(Date.parse(item.publishedAt)), item.publishedAt);
  }
});

test("live manual refresh stores Tavily X posts in the News cache", { skip }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-live-"));
  t.after(() => {
    store.close();
    webSearch.initializeWebSearch("");
    news.initialize(directory);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  webSearch.initializeWebSearch(directory);
  webSearch.saveWebSearchConfig({ provider: "tavily", apiKey });
  news.initialize(directory);
  news.setSettings({ sources: disabledSources, tavilyQuery: QUERIES[0] });
  news.setSettings({ sources: { ...disabledSources, "x-tavily": true } });
  let items = [];
  for (const query of QUERIES) {
    news.setSettings({ tavilyQuery: query });
    const result = await news.refresh({ force: true });
    assert.equal(result.results.find((entry) => entry.source === "x-tavily")?.status, "ok");
    items = news.list({ source: "x-tavily", sinceHours: 168 }).items;
    if (items.length) break;
  }
  assert.ok(items.length, "a manual refresh should store at least one real X post");
  for (const item of items) {
    assert.match(item.url, /^https:\/\/x\.com\//i);
    assert.ok(item.title);
  }
});
