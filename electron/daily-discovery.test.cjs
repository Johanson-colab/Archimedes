const test = require("node:test");
const assert = require("node:assert/strict");
const { createDailyDiscovery } = require("./daily-discovery.cjs");
function owner(workspace = "/one") {
  const entries = new Map();
  return { workspace, entries, getDailyFeedCache: key => entries.get(key), setDailyFeedCache(key, value) {
    const saved = { ...value, fetched_at: new Date().toISOString() }; entries.set(key, saved); return saved;
  } };
}
const response = title => ({ papers: [{ title }], providers: ["arxiv"] });
function controlled() {
  const calls = [];
  const discover = (options, { signal }) => new Promise((resolve, reject) => {
    calls.push({ options, signal, resolve, reject });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  return { discover, calls };
}

test("cache-only returns old papers immediately without starting a request", async () => {
  const store = owner(); const load = createDailyDiscovery({ discover: () => { throw Error("must not fetch"); } });
  assert.equal(await load({ cacheOnly: true }, store), null);
  const populate = createDailyDiscovery({ discover: async () => response("cached") });
  await populate({}, store);
  for (const [key, value] of store.entries) store.entries.set(key, { ...value, fetched_at: "2020-01-01T00:00:00Z" });
  const result = await load({ cacheOnly: true }, store);
  assert.equal(result.papers[0].title, "cached"); assert.equal(result.stale, true);
});

test("matching in-flight requests coalesce and become a fresh persistent cache", async () => {
  const { discover, calls } = controlled(); const store = owner(); const load = createDailyDiscovery({ discover });
  const a = load({}, store), b = load({}, store);
  assert.equal(calls.length, 1); calls[0].resolve(response("one"));
  assert.deepEqual(await a, await b);
  assert.equal((await load({}, store)).cached, true); assert.equal(calls.length, 1);
});

test("a superseded search is cancelled only in its window and cannot persist", async () => {
  const { discover, calls } = controlled(); const store = owner(); const load = createDailyDiscovery({ discover });
  const first = load({ query: "one" }, store, 1); const rejected = assert.rejects(first, /superseded/);
  const otherWindow = load({ query: "one" }, store, 2);
  const second = load({ query: "two" }, store, 1);
  assert.equal(calls[0].signal.aborted, true); assert.equal(calls[1].signal.aborted, false);
  calls[1].resolve(response("other window")); calls[2].resolve(response("latest"));
  await rejected; await otherWindow; await second;
  assert.equal(store.entries.size, 2);
});

test("switching A to B to A starts new work rather than reusing an aborted promise", async () => {
  const { discover, calls } = controlled(); const store = owner(); const load = createDailyDiscovery({ discover });
  const a = assert.rejects(load({ query: "a" }, store), /superseded/);
  const b = assert.rejects(load({ query: "b" }, store), /superseded/);
  const back = load({ query: "a" }, store);
  assert.equal(calls.length, 3); assert.equal(calls[2].signal.aborted, false);
  calls[2].resolve(response("new a")); await a; await b;
  assert.equal((await back).papers[0].title, "new a"); assert.equal(store.entries.size, 1);
});

test("workspace ownership stays isolated while source work is pending", async () => {
  const { discover, calls } = controlled(); const first = owner(), second = owner("/two"); const load = createDailyDiscovery({ discover });
  const a = load({}, first, 1), b = load({}, second, 1);
  assert.equal(calls[0].signal.aborted, false);
  calls[1].resolve(response("second")); calls[0].resolve(response("first")); await a; await b;
  assert.equal([...first.entries.values()][0].papers[0].title, "first");
  assert.equal([...second.entries.values()][0].papers[0].title, "second");
});

test("source failure preserves matching old papers and never caches an empty success", async () => {
  const store = owner(); await createDailyDiscovery({ discover: async () => response("old") })({}, store);
  const load = createDailyDiscovery({ discover: async () => { throw Error("HTTP 429"); } });
  const result = await load({ forceRefresh: true }, store);
  assert.equal(result.papers[0].title, "old"); assert.equal(result.stale, true); assert.match(result.warning, /429/);
  const before = store.entries.size;
  await assert.rejects(load({ query: "uncached" }, store), /429/); assert.equal(store.entries.size, before);
});
