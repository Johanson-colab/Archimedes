const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const news = require("./news.cjs");
const store = require("./news-store.cjs");

function profile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-mark-read-"));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  news.initialize(directory);
  return directory;
}

test("marking a source read clears only that source's unread stories", async (t) => {
  profile(t);
  const now = new Date().toISOString();
  store.upsertItems([
    { id: "x-tavily:1", source: "x-tavily", title: "First post", url: "https://x.com/Lab/status/1", publishedAt: now },
    { id: "x-tavily:2", source: "x-tavily", title: "Second post", url: "https://x.com/Lab/status/2", publishedAt: now },
    { id: "rss:1", source: "rss", title: "Feed story", url: "https://lab.example/story", publishedAt: now },
  ]);
  news.markAllRead("x-tavily");
  assert.equal(store.listItems({ source: "x-tavily" }).every((item) => item.read), true);
  assert.equal(store.listItems({ source: "rss" }).every((item) => !item.read), true);
  news.markAllRead("");
  assert.equal(store.listItems({}).every((item) => item.read), true);
});
