const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const news = require("./news.cjs");
const store = require("./news-store.cjs");
const webSearch = require("./web-search.cjs");

const disabledSources = { hn: false, github: false, arxiv: false, lobsters: false, reddit: false, rss: false, x: false, "x-tavily": false };

function profile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-refresh-"));
  t.after(() => {
    store.close();
    webSearch.initializeWebSearch("");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  webSearch.initializeWebSearch(directory);
  news.initialize(directory);
  return directory;
}

test("a successful RSS subscription keeps its cache and validators when its neighbor fails in either order", async (t) => {
  const directory = profile(t);
  const valid = { id: "same-id", label: "Lab blog", url: "https://lab.example/rss" };
  const broken = { id: "same-id", label: "Another lab", url: "https://other.example/rss" };
  assert.ok(news.getSettings().rssFeeds.some((feed) => feed.label === "Google DeepMind"));
  news.setSettings({ sources: { ...disabledSources, rss: true }, rssFeeds: [valid, broken] });
  for (const last of [valid, broken]) {
    const finished = [];
    const fetchImpl = async (url, { headers }) => {
      if (url === last.url) await new Promise((resolve) => setImmediate(resolve));
      finished.push(url);
      if (url === broken.url) {
        assert.equal(headers["If-None-Match"], undefined);
        return new Response("Unavailable", { status: 503 });
      }
      if (last === broken) {
        assert.equal(headers["If-None-Match"], '"lab-feed"');
        return new Response(null, { status: 304 });
      }
      return new Response('<rss><channel><item><title>Lab result</title><link>https://lab.example/result</link></item></channel></rss>', { headers: { etag: '"lab-feed"' } });
    };
    const refresh = await news.refresh({ force: true, fetchImpl });
    assert.deepEqual(finished, [last === valid ? broken.url : valid.url, last.url]);
    assert.deepEqual(refresh.results.map(({ status }) => status), ["ok", "error"]);
    const { items, sources } = news.list();
    assert.equal(items[0].url, "https://lab.example/result");
    assert.deepEqual(sources[0].subscriptions.map(({ label, status }) => [label, status]), [[valid.label, "ok"], [broken.label, "error"]]);
  }
  store.close();
  news.initialize(directory);
  await news.refresh({ force: true, fetchImpl: async () => { throw new Error("Offline"); } });
  assert.deepEqual(news.getSettings().rssFeeds, [valid, broken]);
  const offline = news.list();
  assert.equal(offline.items[0].title, "Lab result");
  assert.deepEqual(offline.sources[0].subscriptions.map(({ status }) => status), ["error", "error"]);
  assert.ok(offline.sources[0].subscriptions[0].lastSuccessAt);
});

test("changing mute filters invalidates validators so hidden or restored stories are fetched again", async (t) => {
  profile(t);
  const feed = { id: "lab-mute", label: "Lab mute", url: "https://lab.example/mute-rss" };
  const etag = '"lab-mute-version"';
  const xml = (titles) => `<rss><channel>${titles.map((title) => `<item><title>${title}</title><link>https://lab.example/${encodeURIComponent(title)}</link></item>`).join("")}</channel></rss>`;
  let validator;
  const fetchImpl = async (_url, { headers }) => {
    validator = headers["If-None-Match"];
    return new Response(xml(["Visible story", "Hidden story"]), { headers: { etag } });
  };
  news.setSettings({ sources: { ...disabledSources, rss: true }, rssFeeds: [feed], mute: ["hidden"] });
  await news.refresh({ force: true, fetchImpl });
  assert.equal(validator, undefined);
  assert.deepEqual(news.list().items.map((item) => item.title), ["Visible story"]);
  news.setSettings({ mute: [] });
  await news.refresh({ force: true, fetchImpl });
  assert.equal(validator, undefined);
  assert.deepEqual(news.list().items.map((item) => item.title).sort(), ["Hidden story", "Visible story"]);
});

test("a date-less X refresh keeps the cached publication date", async (t) => {
  profile(t);
  webSearch.saveWebSearchConfig({ provider: "tavily", apiKey: "test-news-key" });
  const published = new Date(Date.now() - 48 * 3600000).toISOString();
  let includeDate = true;
  const fetchImpl = async () => Response.json({
    results: [{ title: "An older public post", url: "https://x.com/Lab/status/9876", ...(includeDate ? { published_date: published } : {}) }],
  });
  news.setSettings({ sources: { ...disabledSources, "x-tavily": true }, tavilyQuery: "older post" });
  await news.refresh({ force: true, fetchImpl });
  assert.equal(news.list({ source: "x-tavily", sinceHours: 168 }).items[0].publishedAt, published);
  includeDate = false;
  await news.refresh({ force: true, fetchImpl });
  assert.equal(news.list({ source: "x-tavily", sinceHours: 168 }).items[0].publishedAt, published);
  assert.equal(news.list({ source: "x-tavily", sinceHours: 24 }).items.length, 0);
});

test("X posts join cross-source clusters on the same refresh", async (t) => {
  profile(t);
  const feed = { id: "lab-cluster", label: "Lab cluster", url: "https://lab.example/cluster-rss" };
  webSearch.saveWebSearchConfig({ provider: "tavily", apiKey: "test-news-key" });
  const fetchImpl = async (url) => {
    if (url === feed.url) return new Response('<rss><channel><item><title>A shared research story</title><link>https://lab.example/shared</link></item></channel></rss>');
    if (url === "https://api.tavily.com/search") return Response.json({
      results: [{ title: "A shared research story", url: "https://x.com/Lab/status/4321", published_date: new Date().toISOString() }],
    });
    throw new Error(`Unexpected request: ${url}`);
  };
  news.setSettings({ sources: { ...disabledSources, rss: true, "x-tavily": true }, rssFeeds: [feed], tavilyQuery: "shared story" });
  await news.refresh({ force: true, fetchImpl });
  const rss = news.list().items.find((item) => item.source === "rss");
  const post = news.list().items.find((item) => item.source === "x-tavily");
  assert.ok(rss && post);
  assert.ok(rss.clusterId);
  assert.equal(rss.clusterId, post.clusterId);
});

test("Tavily is opt-in and manual, and duplicate results and failed requests preserve saved X posts", async (t) => {
  profile(t);
  const query = "AI evaluation";
  let calls = 0;
  const fetchImpl = async (endpoint, request) => {
    calls++;
    assert.equal(endpoint, "https://api.tavily.com/search");
    assert.deepEqual(JSON.parse(request.body).include_domains, ["x.com", "twitter.com"]);
    assert.equal(JSON.parse(request.body).query, query);
    assert.equal(JSON.parse(request.body).search_depth, "basic");
    assert.equal(request.headers.Authorization, "Bearer test-news-key");
    const published = new Date(Date.now() - 60_000).toISOString();
    return Response.json({ results: [
      { title: "A public post", url: "https://twitter.com/i/web/status/1234?s=20" },
      { title: "Same post", url: "https://x.com/Lab/status/1234/photo/1", published_date: published },
      { title: "Unknown time", url: "https://x.com/Lab/status/2345" },
      { title: "A profile", url: "https://x.com/Lab" },
      { title: "An unrelated link", url: "https://example.org/Lab/status/1234" },
    ] });
  };
  news.setSettings({ sources: disabledSources, tavilyQuery: query });
  await news.refresh({ force: true, fetchImpl });
  news.setSettings({ sources: { "x-tavily": true } });
  assert.equal((await news.refresh({ force: true, fetchImpl })).results[0].status, "error");
  webSearch.saveWebSearchConfig({ provider: "tavily", apiKey: "test-news-key" });
  news.setSettings({ sources: { "x-tavily": false } });
  await news.refresh({ force: true, fetchImpl });
  news.setSettings({ sources: { "x-tavily": true } });
  await news.refresh({ fetchImpl });
  assert.equal(calls, 0);
  const successful = await news.refresh({ force: true, fetchImpl });
  assert.equal(successful.results[0].updated, 2);
  assert.equal(calls, 1);
  const { items, settings } = news.list({ source: "x-tavily" });
  const post = items.find((item) => item.id === "x-tavily:1234");
  assert.equal(post.url, "https://x.com/lab/status/1234");
  assert.ok(Date.parse(post.publishedAt) < Date.parse(post.fetchedAt));
  assert.equal(items.find((item) => item.id === "x-tavily:2345").publishedAt, "");
  assert.ok(!JSON.stringify(settings).includes("test-news-key"));
  news.setSaved(post.id, true);
  for (const failure of [async () => new Response(null, { status: 429 }), async () => { throw new DOMException("Timed out", "TimeoutError"); }]) {
    const refresh = await news.refresh({ force: true, fetchImpl: failure });
    assert.equal(refresh.results[0].status, "error");
    assert.equal(news.list({ source: "x-tavily" }).items.length, 2);
    assert.equal(news.list({ source: "x-tavily", savedOnly: true }).items[0].url, post.url);
  }
  await news.refresh({ force: true, fetchImpl });
  assert.equal(news.list({ source: "x-tavily", savedOnly: true }).items[0].id, post.id);
});
