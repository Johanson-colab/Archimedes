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

function loadAt(root) {
  const previous = process.env.BENCHMARK_RADAR_ROOT;
  process.env.BENCHMARK_RADAR_ROOT = root;
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

test("Benchmark Radar reads only public indexes and normalizes visible records", (t) => {
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

  const data = api.getBenchmarkRadarData();
  assert.equal(data.updatedAt, "2026-10-15");
  assert.deepEqual(data.radar.map((item) => item.id), ["visible-benchmark"]);
  assert.deepEqual(data.library.map((item) => item.id), ["visible-benchmark"]);
  assert.deepEqual(data.directions, [{ id: "reasoning", name: "Reasoning", section: "Capabilities", count: 1 }]);
  assert.deepEqual(data.radar[0].links, { paper: "https://example.test/paper" });
  assert.equal(data.radar[0].attention.githubStars, 25);
  assert.equal(data.radar[0].attentionScore, 8.5);
  assert.equal(data.radar[0].forecast, 12);
});

test("Benchmark Radar rejects an explicit root without both public indexes", (t) => {
  const root = fixture({ "benchmarks.json": { records: [record()] } });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { api, restore } = loadAt(root);
  t.after(restore);
  assert.throws(() => api.getBenchmarkRadarData(), /Benchmark Radar data was not found/);
});
