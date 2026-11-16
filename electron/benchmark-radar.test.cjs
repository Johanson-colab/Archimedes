const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const modulePath = require.resolve("./benchmark-radar.cjs");

function record(overrides = {}) {
  return {
    id: "visible-benchmark",
    name: "Visible Benchmark",
    paperTitle: "Visible Benchmark paper",
    description: "A public evaluation with a concise description.",
    releasedAt: "2026-10-15",
    libraryCategories: ["reasoning"],
    topics: ["reasoning"],
    source: { authors: ["A Researcher"] },
    publication: { status: "published", venue: "ICML" },
    links: { paper: "https://example.test/paper", unsafe: "http://example.test/unsafe" },
    attention: { githubStars: 25, hfPaperUpvotes: 7, hfDatasetDownloads: 99 },
    ranking: { "90d": { score: 8.5, rank: 4 } },
    attentionForecast: { score: 12 },
    ...overrides,
  };
}

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-"));
  const data = path.join(root, "data");
  fs.mkdirSync(data);
  for (const [name, payload] of Object.entries(files)) {
    fs.writeFileSync(path.join(data, name), JSON.stringify(payload), "utf8");
  }
  return root;
}

function index(overrides = {}) {
  return { schema: 2, sourceUrl: "https://benchmark-radar.com/data/benchmarks_index.json", updatedAt: "2026-11-01", records: [record({ id: "public-benchmark", name: "Public Benchmark" })], directions: [], ...overrides };
}

function writeIndex(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
}

function loadAt(root) {
  const previous = process.env.BENCHMARK_RADAR_ROOT;
  if (root === undefined) delete process.env.BENCHMARK_RADAR_ROOT;
  else process.env.BENCHMARK_RADAR_ROOT = root;
  delete require.cache[modulePath];
  const api = require("./benchmark-radar.cjs");
  return {
    api,
    restore() {
      if (previous === undefined) delete process.env.BENCHMARK_RADAR_ROOT;
      else process.env.BENCHMARK_RADAR_ROOT = previous;
      delete require.cache[modulePath];
    },
  };
}

test("Benchmark Radar reads only public indexes and normalizes visible records", async (t) => {
  const root = fixture({
    "benchmarks_index.json": {
      manifest: { dataAsOf: "2026-10-15" },
      records: [record(), record({ id: "hidden", name: "Hidden", displayEligible: false })],
    },
    "library_index.json": {
      manifest: { libraryTaxonomy: { directions: [{ id: "reasoning", name: "Reasoning", section: "Capabilities", count: 1 }] } },
      records: [record()],
    },
    // A legacy/private-looking snapshot must never become an implicit fallback.
    "benchmarks.json": { records: [record({ id: "legacy", name: "Legacy" })] },
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { api, restore } = loadAt(root);
  t.after(restore);

  const data = await api.getBenchmarkRadarData();
  assert.equal(data.updatedAt, "2026-10-15");
  assert.equal(data.source, "local");
  assert.deepEqual(data.radar.map((item) => item.id), ["visible-benchmark"]);
  assert.deepEqual(data.library.map((item) => item.id), ["visible-benchmark"]);
  assert.deepEqual(data.directions, [{ id: "reasoning", name: "Reasoning", section: "Capabilities", count: 1 }]);
  assert.deepEqual(data.radar[0].links, { paper: "https://example.test/paper" });
  assert.equal(data.radar[0].attention.githubStars, 25);
  assert.equal(data.radar[0].attentionScore, 8.5);
  assert.equal(data.radar[0].forecast, 12);
});

test("Benchmark Radar rejects an explicit root without both public indexes", async (t) => {
  const root = fixture({ "benchmarks.json": { records: [record({ id: "legacy", name: "Legacy" })] } });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { api, restore } = loadAt(root);
  t.after(restore);
  await assert.rejects(api.getBenchmarkRadarData({ allowNetwork: false }), /BENCHMARK_RADAR_ROOT/);
});

test("Benchmark Radar falls back to the bundled snapshot without a checkout", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-seed-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const seedPath = path.join(directory, "seed.json");
  const cachePath = path.join(directory, "cache.json");
  writeIndex(seedPath, index());
  const { api, restore } = loadAt(undefined);
  t.after(restore);

  const data = await api.getBenchmarkRadarData({ seedPath, cachePath, allowNetwork: false });
  assert.equal(data.source, "bundled");
  assert.deepEqual(data.radar.map((item) => item.id), ["public-benchmark"]);
  assert.equal(data.radar, data.library);
  assert.equal(fs.existsSync(cachePath), false);
});

test("Benchmark Radar prefers a newer cache over the bundled snapshot", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-seed-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const seedPath = path.join(directory, "seed.json");
  const cachePath = path.join(directory, "cache.json");
  writeIndex(seedPath, index({ updatedAt: "2026-10-01" }));
  writeIndex(cachePath, index({ updatedAt: "2026-11-02", records: [record({ id: "cached-benchmark", name: "Cached Benchmark" })] }));
  const { api, restore } = loadAt(undefined);
  t.after(restore);

  const data = await api.getBenchmarkRadarData({ seedPath, cachePath, allowNetwork: false });
  assert.equal(data.source, "cached");
  assert.deepEqual(data.radar.map((item) => item.id), ["cached-benchmark"]);
});

test("Benchmark Radar explains how to get data when nothing is available", async (t) => {
  const { api, restore } = loadAt(undefined);
  t.after(restore);
  await assert.rejects(
    api.getBenchmarkRadarData({ seedPath: path.join(os.tmpdir(), "missing-seed.json"), cachePath: path.join(os.tmpdir(), "missing-cache.json"), allowNetwork: false }),
    /Connect to the internet once to download the public index/,
  );
});

function publicResponse(name = "Fresh Benchmark") {
  return {
    ok: true, status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ benchmarks: [{ key: "fresh", name, released: "2026-11-15", collected_at: "2026-11-16T00:00:00Z" }] }),
  };
}

function cacheFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-refresh-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { api, restore } = loadAt(undefined);
  t.after(restore);
  return { api, cachePath: path.join(directory, "cache.json"), seedPath: path.join(directory, "seed.json") };
}

test("default calls return the online update instead of an old seed or adjacent checkout", async (t) => {
  const { api, cachePath, seedPath } = cacheFixture(t);
  writeIndex(seedPath, index());
  const data = await api.getBenchmarkRadarData({ cachePath, seedPath, fetchImpl: async () => publicResponse() });
  assert.equal(data.source, "remote");
  assert.equal(data.radar[0].name, "Fresh Benchmark");
  assert.equal(data.updatedAt, "2026-11-16");
  assert.ok(data.fetchedAt);
  assert.equal(JSON.parse(fs.readFileSync(cachePath)).records[0].id, "fresh");
});

test("offline startup returns saved data and explains the failed update", async (t) => {
  const { api, cachePath, seedPath } = cacheFixture(t);
  writeIndex(seedPath, index());
  const data = await api.getBenchmarkRadarData({ cachePath, seedPath, fetchImpl: async () => { throw Error("offline"); } });
  assert.equal(data.source, "bundled");
  assert.equal(data.radar[0].id, "public-benchmark");
  assert.equal(data.refreshError, "offline");
});

test("manual refresh bypasses the six-hour TTL and returns fresh data to the caller", async (t) => {
  const { api, cachePath, seedPath } = cacheFixture(t);
  const now = new Date("2026-11-16T12:00:00Z");
  writeIndex(cachePath, index({ fetchedAt: now.toISOString() }));
  let calls = 0;
  const fetchImpl = async () => { calls++; return publicResponse(); };
  const cached = await api.getBenchmarkRadarData({ cachePath, seedPath, now, fetchImpl });
  assert.equal(cached.source, "cached");
  assert.equal(calls, 0);
  const fresh = await api.getBenchmarkRadarData({ cachePath, seedPath, now, force: true, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(fresh.source, "remote");
  assert.equal(fresh.radar[0].id, "fresh");
});

test("failed manual refresh preserves the last good cache and surfaces its age", async (t) => {
  const { api, cachePath, seedPath } = cacheFixture(t);
  writeIndex(cachePath, index({ fetchedAt: "2026-10-01T00:00:00Z" }));
  const before = fs.readFileSync(cachePath, "utf8");
  const data = await api.getBenchmarkRadarData({ cachePath, seedPath, force: true, fetchImpl: async () => { throw Error("network unavailable"); } });
  assert.equal(data.source, "cached");
  assert.equal(data.fetchedAt, "2026-10-01T00:00:00Z");
  assert.equal(data.refreshError, "network unavailable");
  assert.equal(fs.readFileSync(cachePath, "utf8"), before);
});

test("concurrent requests share one download and receive the same fresh records", async (t) => {
  const { api, cachePath } = cacheFixture(t);
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const fetchImpl = async () => { calls++; await gate; return publicResponse(); };
  const first = api.getBenchmarkRadarData({ cachePath, fetchImpl });
  const second = api.getBenchmarkRadarData({ cachePath, fetchImpl, force: true });
  assert.equal(calls, 1);
  finish();
  const data = await Promise.all([first, second]);
  assert.equal(data[0].radar[0].id, "fresh");
  assert.equal(data[1].radar[0].id, "fresh");
  // Settled requests do not leave an in-flight entry blocking future refreshes.
  await api.getBenchmarkRadarData({ cachePath, fetchImpl, force: true });
  assert.equal(calls, 2);
});

test("explicit development data is reread without restarting the process", async (t) => {
  const root = fixture({
    "benchmarks_index.json": { records: [record()] },
    "library_index.json": { records: [record()] },
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { api, restore } = loadAt(root);
  t.after(restore);
  assert.equal((await api.getBenchmarkRadarData()).radar[0].name, "Visible Benchmark");
  fs.writeFileSync(path.join(root, "data/benchmarks_index.json"), JSON.stringify({ records: [record({ name: "Edited Benchmark" })] }));
  assert.equal((await api.getBenchmarkRadarData({ force: true })).radar[0].name, "Edited Benchmark");
});
