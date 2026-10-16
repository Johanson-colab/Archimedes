const fs = require("node:fs");
const path = require("node:path");

let cachedPayload = null;

function radarRoots() {
  return [
    process.env.BENCHMARK_RADAR_ROOT,
    path.resolve(__dirname, "..", "..", "benchmark-radar"),
    path.resolve(process.cwd(), "..", "benchmark-radar"),
  ].filter(Boolean);
}

function resolveRadarRoot() {
  const root = radarRoots().find((candidate) => fs.existsSync(path.join(candidate, "data", "benchmarks_index.json"))
    && fs.existsSync(path.join(candidate, "data", "library_index.json")));
  if (!root) {
    throw new Error("Benchmark Radar data was not found. Keep the benchmark-radar project next to ResearchDesk, or set BENCHMARK_RADAR_ROOT.");
  }
  return root;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value, limit = 1600) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function strings(value, limit = 8) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, limit) : [];
}

function links(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(candidate).filter(([, url]) => typeof url === "string" && /^https:\/\//.test(url)));
}

function attention(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    githubStars: Number.isFinite(candidate.githubStars) ? candidate.githubStars : null,
    hfPaperUpvotes: Number.isFinite(candidate.hfPaperUpvotes) ? candidate.hfPaperUpvotes : null,
    datasetDownloads: Number.isFinite(candidate.hfDatasetDownloads) ? candidate.hfDatasetDownloads : null,
  };
}

function normalizeRecord(record) {
  const ranking = record.ranking && typeof record.ranking === "object" ? record.ranking : {};
  const source = record.source && typeof record.source === "object" ? record.source : {};
  const publication = record.publication && typeof record.publication === "object" ? record.publication : {};
  return {
    id: text(record.id, 180),
    name: text(record.name, 400),
    title: text(record.paperTitle || record.name, 700),
    description: text(record.description || record.oneLine, 1800),
    oneLine: text(record.oneLine || record.description, 700),
    releasedAt: text(record.releasedAt, 32),
    readiness: text(record.readiness, 80),
    area: text(record.area, 180),
    primaryDomain: text(record.primaryDomain, 180),
    topics: strings(record.topics),
    capabilities: strings(record.capabilities),
    capabilityGroups: strings(record.capabilityGroups),
    directions: strings(record.libraryCategories || record.researchDirections || record.researchTopics, 4),
    authors: strings(source.authors, 12),
    publication: { status: text(publication.status, 64), venue: text(publication.venue, 180) },
    links: links(record.links),
    attention: attention(record.attention),
    attentionScore: Number.isFinite(ranking["90d"]?.score) ? ranking["90d"].score : null,
    attentionRank: Number.isFinite(ranking["90d"]?.rank) ? ranking["90d"].rank : null,
    forecast: Number.isFinite(record.attentionForecast?.score) ? record.attentionForecast.score : null,
  };
}

function getBenchmarkRadarData() {
  if (cachedPayload) return cachedPayload;
  const root = resolveRadarRoot();
  // Benchmark Radar's public Radar surface consumes this generated index, not
  // the internal canonical snapshot.  Keeping that contract here preserves its
  // filtering and display eligibility rules inside Archimedes as well.
  const radarSource = readJson(path.join(root, "data", "benchmarks_index.json"));
  const librarySource = readJson(path.join(root, "data", "library_index.json"));
  const radar = Array.isArray(radarSource.records) ? radarSource.records.filter((record) => record && record.displayEligible !== false).map(normalizeRecord) : [];
  const library = Array.isArray(librarySource.records) ? librarySource.records.filter((record) => record && record.displayEligible !== false).map(normalizeRecord) : [];
  const taxonomy = librarySource.manifest?.libraryTaxonomy || librarySource.manifest?.researchTaxonomy || {};
  const directions = Array.isArray(taxonomy.directions) ? taxonomy.directions.map((direction) => ({
    id: text(direction.id, 120), name: text(direction.name, 180), section: text(direction.section, 120), count: Number.isFinite(direction.count) ? direction.count : 0,
  })).filter((direction) => direction.id && direction.name) : [];
  cachedPayload = {
    sourceRoot: root,
    updatedAt: text(radarSource.manifest?.dataAsOf || librarySource.manifest?.dataAsOf, 32),
    radar,
    library,
    directions,
  };
  return cachedPayload;
}

module.exports = { getBenchmarkRadarData };
