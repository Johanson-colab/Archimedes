const fs = require("node:fs");
const path = require("node:path");

const { normalizeRecord, readIndexFile, refreshPublicIndex, indexPayload, PUBLIC_INDEX_URL } = require("./benchmark-radar-index.cjs");

let cachedLocalPayload = null;
let refreshInFlight = null;

function radarRoots() {
  // An explicit path is a deployment contract, not a hint. Falling back to a
  // neighboring checkout would silently show unrelated/stale data instead.
  if (process.env.BENCHMARK_RADAR_ROOT) return [process.env.BENCHMARK_RADAR_ROOT];
  return [
    path.resolve(__dirname, "..", "..", "benchmark-radar"),
    path.resolve(process.cwd(), "..", "benchmark-radar"),
  ];
}

function isRadarRoot(candidate) {
  return Boolean(candidate)
    && fs.existsSync(path.join(candidate, "data", "benchmarks_index.json"))
    && fs.existsSync(path.join(candidate, "data", "library_index.json"));
}

function resolveRadarRoot() {
  const explicit = process.env.BENCHMARK_RADAR_ROOT;
  if (explicit) {
    if (!isRadarRoot(explicit)) {
      throw new Error("Benchmark Radar data was not found at BENCHMARK_RADAR_ROOT. Point it at a checkout containing data/benchmarks_index.json and data/library_index.json.");
    }
    return explicit;
  }
  return radarRoots().find(isRadarRoot) || null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function localPayload(root) {
  // Benchmark Radar's public Radar surface consumes this generated index, not
  // the internal canonical snapshot.  Keeping that contract here preserves its
  // filtering and display eligibility rules inside Archimedes as well.
  const radarSource = readJson(path.join(root, "data", "benchmarks_index.json"));
  const librarySource = readJson(path.join(root, "data", "library_index.json"));
  const radar = Array.isArray(radarSource.records) ? radarSource.records.filter((record) => record && record.displayEligible !== false).map(normalizeRecord) : [];
  const library = Array.isArray(librarySource.records) ? librarySource.records.filter((record) => record && record.displayEligible !== false).map(normalizeRecord) : [];
  const taxonomy = librarySource.manifest?.libraryTaxonomy || librarySource.manifest?.researchTaxonomy || {};
  const directions = Array.isArray(taxonomy.directions) ? taxonomy.directions.map((direction) => ({
    id: typeof direction?.id === "string" ? direction.id.slice(0, 120) : "",
    name: typeof direction?.name === "string" ? direction.name.slice(0, 180) : "",
    section: typeof direction?.section === "string" ? direction.section.slice(0, 120) : "",
    count: Number.isFinite(direction?.count) ? direction.count : 0,
  })).filter((direction) => direction.id && direction.name) : [];
  return {
    source: "local",
    sourceRoot: root,
    updatedAt: typeof radarSource.manifest?.dataAsOf === "string" ? radarSource.manifest.dataAsOf.slice(0, 32) : typeof librarySource.manifest?.dataAsOf === "string" ? librarySource.manifest.dataAsOf.slice(0, 32) : "",
    radar,
    library,
    directions,
  };
}

function newestIndex(cached, seed) {
  if (!cached) return seed ? { index: seed, source: "bundled" } : null;
  if (!seed) return { index: cached, source: "cached" };
  return (cached.updatedAt || "") >= (seed.updatedAt || "") ? { index: cached, source: "cached" } : { index: seed, source: "bundled" };
}

function scheduleRefresh(options) {
  if (options.allowNetwork === false || !options.cachePath || refreshInFlight) return;
  refreshInFlight = refreshPublicIndex({ cachePath: options.cachePath, url: options.url, ttlMs: options.ttlMs })
    .catch(() => {})
    .finally(() => { refreshInFlight = null; });
}

async function getBenchmarkRadarData(options = {}) {
  const root = resolveRadarRoot();
  if (root) {
    if (!cachedLocalPayload || cachedLocalPayload.sourceRoot !== root) cachedLocalPayload = localPayload(root);
    return cachedLocalPayload;
  }

  const cached = readIndexFile(options.cachePath);
  const seed = readIndexFile(options.seedPath);
  const best = newestIndex(cached, seed);
  if (best) {
    scheduleRefresh(options);
    return indexPayload(best.index, { source: best.source, sourceRoot: options.cachePath || PUBLIC_INDEX_URL });
  }

  if (options.allowNetwork === false) throw new Error("Benchmark Radar data was not found. Connect to the internet once to download the public index, or set BENCHMARK_RADAR_ROOT.");
  try {
    const result = await refreshPublicIndex({ cachePath: options.cachePath, url: options.url, ttlMs: options.ttlMs, force: true });
    return indexPayload(result.index, { source: "remote", sourceRoot: PUBLIC_INDEX_URL });
  } catch (failure) {
    const detail = failure instanceof Error ? failure.message : String(failure);
    throw new Error(`Benchmark Radar data is unavailable. ${detail} Connect to the internet once, or set BENCHMARK_RADAR_ROOT.`);
  }
}

module.exports = { getBenchmarkRadarData };
