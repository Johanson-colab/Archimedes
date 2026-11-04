const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const newsStore = require("./news-store.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-"));
}

function item(overrides = {}) {
  return {
    id: overrides.id || "hn:abc",
    source: overrides.source || "hn",
    sourceLabel: overrides.sourceLabel || "Hacker News",
    title: overrides.title || "Postman silently auto-installs AI plugins",
    url: overrides.url || "https://example.com/postman",
    author: overrides.author || "mike_hearn",
    publishedAt: overrides.publishedAt || new Date().toISOString(),
    score: overrides.score ?? 1247,
    comments: overrides.comments ?? 410,
    summary: overrides.summary || "",
    tags: overrides.tags || ["security"],
    media: overrides.media || [],
    native: overrides.native || { points: 1247 },
  };
}

test("store keeps items, read state, saved state and source summaries", () => {
  const dir = tempDir();
  newsStore.initialize(dir);
  try {
    assert.equal(newsStore.upsertItems([item(), item({ id: "gh:abc", source: "github", sourceLabel: "GitHub", title: "deepseek-ai/dsh-superagent-prototype", score: 17867, native: {} })]), 2);
    const all = newsStore.listItems({ sinceHours: 24, sort: "hot" });
    assert.equal(all.length, 2);
    assert.equal(all[0].id, "gh:abc");
    assert.equal(all[0].native.points, undefined);

    newsStore.markRead("hn:abc", true);
    newsStore.setSaved("hn:abc", true);
    const saved = newsStore.listItems({ savedOnly: true });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].read, true);

    const summary = newsStore.sourceSummary(24);
    const hn = summary.find((entry) => entry.source === "hn");
    assert.equal(hn.total, 1);
    assert.equal(hn.unread, 0);
    assert.equal(summary.find((entry) => entry.source === "github").unread, 1);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("store upsert preserves read/saved flags and refreshes metadata", () => {
  const dir = tempDir();
  newsStore.initialize(dir);
  try {
    newsStore.upsertItems([item()]);
    newsStore.markRead("hn:abc", true);
    newsStore.setSaved("hn:abc", true);
    newsStore.upsertItems([item({ title: "Postman ships a fix", score: 1300 })]);
    const [row] = newsStore.listItems({});
    assert.equal(row.title, "Postman ships a fix");
    assert.equal(row.score, 1300);
    assert.equal(row.read, true);
    assert.equal(row.saved, true);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("store filters by source, query and time window", () => {
  const dir = tempDir();
  newsStore.initialize(dir);
  try {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    newsStore.upsertItems([
      item(),
      item({ id: "ax:abc", source: "arxiv", sourceLabel: "arXiv", title: "Cognitive symbionts", publishedAt: old }),
      item({ id: "lb:abc", source: "lobsters", sourceLabel: "Lobste.rs", title: "Death comes for XSLT" }),
    ]);
    assert.equal(newsStore.listItems({ source: "arxiv" }).length, 1);
    assert.equal(newsStore.listItems({ query: "xsl" }).length, 1);
    assert.equal(newsStore.listItems({ sinceHours: 24 }).length, 2);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("store records per-source health and conditional request state", () => {
  const dir = tempDir();
  newsStore.initialize(dir);
  try {
    newsStore.setSourceState("hn", { status: "error", message: "HTTP 500", lastAttemptAt: "2026-11-04T00:00:00Z" });
    const failed = newsStore.getSourceState("hn");
    assert.equal(failed.status, "error");
    assert.equal(failed.message, "HTTP 500");

    newsStore.setSourceState("hn", { status: "ok", message: "", lastSuccessAt: "2026-11-04T01:00:00Z", etag: "abc" });
    const healthy = newsStore.getSourceState("hn");
    assert.equal(healthy.status, "ok");
    assert.equal(healthy.etag, "abc");
    assert.equal(healthy.last_success_at, "2026-11-04T01:00:00Z");
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("prune drops stale unsaved items but keeps saved ones", () => {
  const dir = tempDir();
  newsStore.initialize(dir);
  try {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    newsStore.upsertItems([item({ id: "hn:old", publishedAt: old }), item({ id: "hn:saved", publishedAt: old })]);
    newsStore.setSaved("hn:saved", true);
    newsStore.prune({ days: 14, maxItems: 100 });
    const rows = newsStore.listItems({});
    assert.deepEqual(rows.map((row) => row.id), ["hn:saved"]);
  } finally {
    newsStore.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
