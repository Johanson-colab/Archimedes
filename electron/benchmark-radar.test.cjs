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
  return { schema: 1, updatedAt: "2026-11-01", records: [record({ id: "public-benchmark", name: "Public Benchmark" })], directions: [], ...overrides };
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
