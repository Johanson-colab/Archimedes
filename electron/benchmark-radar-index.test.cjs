const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PUBLIC_INDEX_URL,
  CACHE_SCHEMA,
  normalizeCanonicalIndexes,
  normalizePublicIndex,
  adaptPublicRecord,
  readIndexFile,
  writeIndexFile,
  fetchPublicIndex,
  refreshPublicIndex,
  indexPayload,
} = require("./benchmark-radar-index.cjs");

function benchmark(overrides = {}) {
  return {
    key: "claire-radar:2609.00001",
    slug: "claire-radar-2609-00001",
    name: "Example Benchmark",
    description: "A public benchmark description.",
    released: "2026-09-04",
    categories: ["Agents", "General AI"],
    authors: ["A Researcher"],
    collected_at: "2026-10-14T09:44:51Z",
    library_direction: { primary: "agentic-coding", categories: ["agentic-coding", "tool-use"] },
    attention_signals: { github_stars: 39, hf_paper_upvotes: 10, hf_dataset_downloads: null, repository: "gh:sierra-research/hyper-tau-bench" },
    released_reference: { source_url: "https://arxiv.org/abs/2609.00001" },
    source_url: "https://example.test/benchmark",
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    benchmarks: [benchmark()],
    library_taxonomy: { categories: [{ id: "agentic-coding", name: "Agentic Coding", group: "reasoning-knowledge" }, { id: "tool-use", name: "Tool Use", group: "agentic" }] },
    ...overrides,
  };
}

function response({ status = 200, body = "{}", headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => body };
}

test("public index records are adapted to the desktop record shape", () => {
  const record = adaptPublicRecord(benchmark());
  const normalized = normalizePublicIndex(payload());
  assert.equal(normalized.updatedAt, "2026-10-14");
  assert.equal(normalized.records.length, 1);
  assert.deepEqual(normalized.records[0].directions, ["agentic-coding", "tool-use"]);
  assert.deepEqual(normalized.records[0].topics, ["Agents", "General AI"]);
  assert.deepEqual(normalized.records[0].links, { paper: "https://arxiv.org/abs/2609.00001", code: "https://github.com/sierra-research/hyper-tau-bench" });
  assert.equal(normalized.records[0].attention.githubStars, 39);
  assert.equal(normalized.records[0].attention.hfPaperUpvotes, 10);
  assert.equal(normalized.records[0].attention.datasetDownloads, null);
  assert.equal(normalized.records[0].releasedAt, "2026-09-04");
  assert.equal(record.publication.venue, "");
  assert.deepEqual(normalized.directions, [
    { id: "agentic-coding", name: "Agentic Coding", section: "Reasoning Knowledge", count: 1 },
    { id: "tool-use", name: "Tool Use", section: "Agentic", count: 1 },
  ]);
});

test("public index rejects malformed payloads and drops nameless records", () => {
  assert.throws(() => normalizePublicIndex({}), /unexpected index/);
  assert.throws(() => normalizePublicIndex(null), /unexpected index/);
  const normalized = normalizePublicIndex(payload({ benchmarks: [benchmark({ name: "" }), benchmark({ key: "", slug: "" }), benchmark()] }));
  assert.deepEqual(normalized.records.map((record) => record.id), ["claire-radar:2609.00001"]);
});

test("fetchPublicIndex surfaces HTTP failures, oversize bodies, and 304 responses", async () => {
  await assert.rejects(fetchPublicIndex({ fetchImpl: async () => response({ status: 500 }) }), /HTTP 500/);
  await assert.rejects(fetchPublicIndex({ fetchImpl: async () => response({ body: JSON.stringify(payload({ benchmarks: [] })) }) }), /empty index/);
  const oversized = JSON.stringify({ benchmarks: [benchmark({ description: "x".repeat(2000) })] });
  await assert.rejects(fetchPublicIndex({ fetchImpl: async () => response({ headers: { "content-length": String(64 * 1024 * 1024) }, body: oversized }) }), /too large/);
  const notModified = await fetchPublicIndex({ fetchImpl: async () => response({ status: 304 }), etag: 'W/"abc"' });
  assert.deepEqual(notModified, { notModified: true });
});

test("fetchPublicIndex sends the cached ETag and normalizes a fresh body", async () => {
  let requested = null;
  const result = await fetchPublicIndex({
    etag: 'W/"abc"',
    fetchImpl: async (url, options) => {
      requested = { url, headers: options.headers };
      return response({ body: JSON.stringify(payload()), headers: { etag: 'W/"def"' } });
    },
  });
  assert.equal(requested.url, PUBLIC_INDEX_URL);
  assert.equal(requested.headers["if-none-match"], 'W/"abc"');
  assert.equal(result.etag, 'W/"def"');
  assert.equal(result.index.records.length, 1);
});

test("refreshPublicIndex skips a fresh cache, writes a stale one, and keeps the old cache on failure", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-cache-"));
  const cachePath = path.join(directory, "public-index.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const index = normalizePublicIndex(payload());
  writeIndexFile(cachePath, { ...index, sourceUrl: PUBLIC_INDEX_URL, fetchedAt: "2026-10-30T00:00:00.000Z", etag: 'W/"old"' });

  let calls = 0;
  const skipped = await refreshPublicIndex({ cachePath, now: new Date("2026-10-30T01:00:00.000Z"), fetchImpl: async () => { calls += 1; return response({ body: "{}" }); } });
  assert.equal(skipped.skipped, true);
  assert.equal(calls, 0);

  const refreshed = await refreshPublicIndex({
    cachePath,
    now: new Date("2026-11-01T00:00:00.000Z"),
    fetchImpl: async () => response({ body: JSON.stringify(payload({ benchmarks: [benchmark({ key: "newer" })] })), headers: { etag: 'W/"new"' } }),
  });
  assert.equal(refreshed.refreshed, true);
  const written = readIndexFile(cachePath);
  assert.equal(written.records[0].id, "newer");
  assert.equal(written.etag, 'W/"new"');
  assert.equal(written.schema, CACHE_SCHEMA);

  await assert.rejects(refreshPublicIndex({ cachePath, force: true, fetchImpl: async () => { throw new Error("offline"); } }), /offline/);
  assert.equal(readIndexFile(cachePath).records[0].id, "newer");
});

test("refreshPublicIndex reuses the cache when the server answers 304", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-cache-"));
  const cachePath = path.join(directory, "public-index.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  writeIndexFile(cachePath, { ...normalizePublicIndex(payload()), fetchedAt: "2026-10-01T00:00:00.000Z", etag: 'W/"abc"' });
  const result = await refreshPublicIndex({ cachePath, now: new Date("2026-11-01T00:00:00.000Z"), fetchImpl: async () => response({ status: 304 }) });
  assert.equal(result.refreshed, false);
  assert.equal(result.index.records.length, 1);
  assert.equal(readIndexFile(cachePath).fetchedAt, "2026-11-01T00:00:00.000Z");
});

test("readIndexFile ignores truncated or foreign cache files", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-cache-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const truncated = path.join(directory, "truncated.json");
  fs.writeFileSync(truncated, '{"schema":1,"records":[');
  assert.equal(readIndexFile(truncated), null);
  const foreign = path.join(directory, "foreign.json");
  fs.writeFileSync(foreign, JSON.stringify({ benchmarks: [] }));
  assert.equal(readIndexFile(foreign), null);
  assert.equal(readIndexFile(path.join(directory, "missing.json")), null);
});

test("indexPayload shares one record list between the radar and library tabs", () => {
  const index = normalizePublicIndex(payload());
  const result = indexPayload(index, { source: "bundled", sourceRoot: "seed" });
  assert.equal(result.source, "bundled");
  assert.equal(result.sourceRoot, "seed");
  assert.equal(result.updatedAt, "2026-10-14");
  assert.equal(result.radar, result.library);
  assert.deepEqual(result.directions, index.directions);
});

test("forecast explanations survive both public formats and unknown fields stay absent", () => {
  const forecast = { score: 45, horizon: "7d", confidence: "Low", reason: "A broad evaluation with public artifacts." };
  for (const field of ["attentionForecast", "attention_forecast"]) {
    const record = normalizePublicIndex(payload({ benchmarks: [benchmark({ [field]: forecast, readiness: "Runnable" })] })).records[0];
    assert.equal(record.forecast, 45);
    assert.equal(record.forecastReason, forecast.reason);
    assert.equal(record.forecastConfidence, "Low");
    assert.equal(record.forecastHorizon, "7d");
    assert.equal(record.readiness, "Runnable");
  }
  const absent = normalizePublicIndex(payload()).records[0];
  assert.equal(absent.forecast, null);
  assert.equal(absent.forecastReason, "");
});

test("304 revalidation reports the new check time in the current response", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-304-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, "cache.json");
  writeIndexFile(cachePath, { ...normalizePublicIndex(payload()), fetchedAt: "2026-10-01T00:00:00Z", etag: "abc" });
  const now = new Date("2026-11-16T00:00:00Z");
  const result = await refreshPublicIndex({ cachePath, now, force: true, fetchImpl: async () => response({ status: 304 }) });
  assert.equal(indexPayload(result.index).fetchedAt, now.toISOString());
});

function canonicalPayloads() {
  const raw = (id, name, overrides = {}) => ({ id, name, releasedAt: "2026-11-13", libraryCategories: ["agentic-coding"], links: { code: "https://github.com/example/benchmark" }, ...overrides });
  return {
    radar: { manifest: { dataAsOf: "2026-11-16" }, records: [raw("november", "November Benchmark"), raw("hidden", "Hidden Benchmark", { displayEligible: false })] },
    library: {
      manifest: { dataAsOf: "2026-11-16", libraryTaxonomy: { directions: [{ id: "agentic-coding", name: "Agentic Coding", section: "Coding", count: 100 }] } },
      records: [raw("november", "November Benchmark"), raw("classic", "Classic Benchmark", { releasedAt: "2024-01-01" })],
    },
  };
}

function canonicalFetch({ failLibrary = false, requested = [] } = {}) {
  const fixtures = canonicalPayloads();
  return async (url, options) => {
    requested.push({ url, headers: options.headers });
    if (url.endsWith("library_index.json")) {
      if (failLibrary) return response({ status: 503 });
      return response({ body: JSON.stringify(fixtures.library) });
    }
    return response({ body: JSON.stringify(fixtures.radar), headers: { etag: "radar-etag" } });
  };
}

test("the original project's canonical Radar and Library indexes retain November releases", async () => {
  const requested = [];
  const result = await fetchPublicIndex({ fetchImpl: canonicalFetch({ requested }) });
  assert.deepEqual(requested.map(r => r.url), [
    "https://benchmark-radar.com/data/benchmarks_index.json",
    "https://benchmark-radar.com/data/library_index.json",
  ]);
  const data = indexPayload(result.index);
  assert.equal(data.updatedAt, "2026-11-16");
  assert.deepEqual(data.radar.map(r => r.id), ["november"]);
  assert.deepEqual(data.library.map(r => r.id), ["november", "classic"]);
  assert.equal(data.radar[0].releasedAt, "2026-11-13");
  assert.equal(data.directions[0].count, 2);
  // A single-file ETag cannot validate two independently updated feeds.
  assert.equal(result.etag, "");
});

test("canonical normalization rejects a missing or empty half of the catalog pair", () => {
  const { radar, library } = canonicalPayloads();
  assert.throws(() => normalizeCanonicalIndexes(radar, {}), /unexpected index/);
  assert.throws(() => normalizeCanonicalIndexes({ records: [] }, library), /empty index/);
});

test("fresh caches from the different .org catalog cannot suppress migration", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-migration-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const schema of [1, CACHE_SCHEMA]) {
    const cachePath = path.join(directory, `cache-${schema}.json`);
    const now = new Date("2026-11-16T12:00:00Z");
    fs.writeFileSync(cachePath, JSON.stringify({
      schema, sourceUrl: "https://benchmark-radar.org/data/benchmark-index.json",
      fetchedAt: now.toISOString(), etag: "wrong-catalog-etag", ...normalizePublicIndex(payload()),
    }));
    const requested = [];
    const result = await refreshPublicIndex({ cachePath, now, fetchImpl: canonicalFetch({ requested }) });
    assert.equal(result.refreshed, true);
    assert.equal(requested.length, 2);
    assert.ok(requested.every(r => !r.headers["if-none-match"]));
    const saved = readIndexFile(cachePath);
    assert.equal(saved.schema, CACHE_SCHEMA);
    assert.equal(saved.sourceUrl, PUBLIC_INDEX_URL);
    assert.equal(indexPayload(saved).radar[0].id, "november");
    await refreshPublicIndex({ cachePath, now, fetchImpl: async () => { assert.fail("The canonical cache should respect its TTL"); } });
  }
});

test("partial canonical downloads never replace the last complete cached pair", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-radar-pair-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, "cache.json");
  await refreshPublicIndex({ cachePath, fetchImpl: canonicalFetch() });
  const before = fs.readFileSync(cachePath, "utf8");
  await assert.rejects(refreshPublicIndex({ cachePath, force: true, fetchImpl: canonicalFetch({ failLibrary: true }) }), /HTTP 503/);
  assert.equal(fs.readFileSync(cachePath, "utf8"), before);
});
