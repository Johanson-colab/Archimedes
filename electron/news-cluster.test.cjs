const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const news = require("./news.cjs");
const newsStore = require("./news-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-cluster-"));
}

function item(overrides = {}) {
  return {
    id: overrides.id,
    source: overrides.source || "hn",
    sourceLabel: overrides.sourceLabel || "Hacker News",
    title: overrides.title,
    url: overrides.url || `https://example.com/${overrides.id}`,
    author: "",
    publishedAt: overrides.publishedAt || new Date().toISOString(),
    score: overrides.score || 1,
    comments: 0,
    summary: "",
    tags: [],
    media: [],
    native: {},
  };
}

test("clustering groups the same story across sources and splits unrelated stories", () => {
  const dir = tempDir();
  news.initialize(dir);
  try {
    newsStore.upsertItems([
      item({ id: "hn:1", title: "Postman silently installs AI plugins" }),
      item({ id: "lb:1", source: "lobsters", sourceLabel: "Lobste.rs", title: "Postman silently installs AI plugins, researcher says" }),
      item({ id: "gh:1", source: "github", sourceLabel: "GitHub", title: "deepseek-ai/dsh-superagent-prototype" }),
    ]);
    news._computeClusters();
    const rows = newsStore.listItems({ sinceHours: 24 });
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.equal(byId.get("hn:1").clusterId, byId.get("lb:1").clusterId);
    assert.notEqual(byId.get("gh:1").clusterId, byId.get("hn:1").clusterId);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings normalisation clamps values and drops invalid feeds", () => {
  const settings = news._normalizeSettings({
    view: "board",
    sources: { hn: false, unknown: true },
    rssFeeds: [{ url: "https://example.com/feed.xml", label: "Example" }, { url: "not-a-url" }, { url: "https://example.com/feed.xml" }],
    reddit: { subreddits: ["r/LocalLLaMA", "LocalLLaMA", "bad name!"] },
    watch: "agents, RAG, agents,  ",
    cadenceMinutes: 999,
    sinceHours: 999,
  });
  assert.equal(settings.view, "board");
  assert.equal(settings.sources.hn, false);
  assert.equal(settings.sources.github, true);
  assert.equal(settings.sources.unknown, undefined);
  assert.equal(settings.rssFeeds.length, 1);
  assert.deepEqual(settings.reddit.subreddits, ["LocalLLaMA"]);
  assert.deepEqual(settings.watch, ["agents", "RAG"]);
  assert.equal(settings.cadenceMinutes, 60);
  assert.equal(settings.sinceHours, 24);
});

test("public settings never return secrets and report configuration state", () => {
  const dir = tempDir();
  news.initialize(dir);
  try {
    news.setSettings({ reddit: { clientId: "client-id", clientSecret: "shh" }, x: { bearerToken: "token" }, github: { token: "ghp_secret" } });
    const settings = news.getSettings();
    assert.equal(settings.reddit.clientSecret, "");
    assert.equal(settings.reddit.configured, true);
    assert.equal(settings.x.bearerToken, "");
    assert.equal(settings.x.configured, true);
    assert.equal(settings.github.token, "");
    assert.equal(settings.github.configured, true);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
