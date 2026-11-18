const fs = require("node:fs");
const path = require("node:path");

const { normalizeRecord, readIndexFile, refreshPublicIndex, indexPayload, PUBLIC_INDEX_URL } = require("./benchmark-radar-index.cjs");

const refreshes = new Map();

function resolveRadarRoot() {
  const explicit = process.env.BENCHMARK_RADAR_ROOT;
  if (!explicit) return null;
  if (!fs.existsSync(path.join(explicit, "data", "benchmarks_index.json"))
    || !fs.existsSync(path.join(explicit, "data", "library_index.json"))) {
    throw new Error("Benchmark Radar data was not found at BENCHMARK_RADAR_ROOT. Point it at a checkout containing data/benchmarks_index.json and data/library_index.json.");
  }
  return explicit;
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

// Share concurrent renderer requests without leaving a background refresh that
// finishes after its caller has already received an obsolete snapshot.
function refreshIndex(options) {
  const key = `${options.cachePath || ""}:${options.url || PUBLIC_INDEX_URL}`;
  if (!refreshes.has(key)) {
    const request = refreshPublicIndex(options).finally(() => {
      if (refreshes.get(key) === request) refreshes.delete(key);
    });
    refreshes.set(key, request);
  }
  return refreshes.get(key);
}

async function getBenchmarkRadarData(options = {}) {
  const root = resolveRadarRoot();
  // An explicit development override is reread on every call, including Refresh.
  if (root) return localPayload(root);

  const cached = readIndexFile(options.cachePath);
  const seed = readIndexFile(options.seedPath);
  const best = newestIndex(cached, seed);
  const payload = (entry, extra = {}) => indexPayload(entry.index, {
    source: entry.source,
    sourceRoot: entry.source === "bundled" ? options.seedPath : options.cachePath || PUBLIC_INDEX_URL,
    ...extra,
  });
  if (options.allowNetwork === false) {
    if (best) return payload(best);
    throw new Error("Benchmark Radar data was not found. Connect to the internet once to download the public index, or set BENCHMARK_RADAR_ROOT.");
  }

  try {
    const result = await refreshIndex(options);
    const current = newestIndex(result.index, seed);
    if (!current) throw new Error("Benchmark Radar returned no usable data.");
    if (current.source === "cached" && !result.skipped) {
      return payload({ ...current, source: "remote" }, { sourceRoot: options.url || PUBLIC_INDEX_URL });
    }
    return payload(current);
  } catch (failure) {
    const detail = (failure instanceof Error ? failure.message : String(failure)).slice(0, 300);
    if (best) return { ...payload(best), refreshError: detail };
    throw new Error(`Benchmark Radar data is unavailable. ${detail} Connect to the internet once, or set BENCHMARK_RADAR_ROOT.`);
  }
}

module.exports = { getBenchmarkRadarData };
