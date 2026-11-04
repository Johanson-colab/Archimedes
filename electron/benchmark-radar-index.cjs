const fs = require("node:fs");
const path = require("node:path");

// Benchmark Radar publishes one public index for the dashboard. The desktop
// workspace reads a snapshot of it instead of requiring a neighbouring checkout.
const PUBLIC_INDEX_URL = "https://benchmark-radar.org/data/benchmark-index.json";
const CACHE_SCHEMA = 1;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;

function text(value, limit = 1600) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function strings(value, limit = 8) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, limit) : [];
}

function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value) ? value : "";
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

function humanize(value) {
  return text(value, 120).split(/[-_]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

// The public index uses snake_case signals and a single taxonomy category list.
// Convert one entry into the record shape the desktop reader already handles.
function adaptPublicRecord(record) {
  if (!record || typeof record !== "object") return null;
  const direction = record.library_direction && typeof record.library_direction === "object" ? record.library_direction : {};
  const signals = record.attention_signals && typeof record.attention_signals === "object" ? record.attention_signals : {};
  const released = record.released_reference && typeof record.released_reference === "object" ? record.released_reference : {};
  const repository = typeof signals.repository === "string" ? signals.repository.replace(/^gh:/, "") : "";
  const id = text(record.key || record.slug, 180);
  const name = text(record.name, 400);
  if (!id || !name) return null;
  return {
    id,
    name,
    paperTitle: name,
    description: text(record.description, 1800),
    oneLine: text(record.description, 700),
    releasedAt: text(record.released, 32),
    libraryCategories: strings(direction.categories, 4),
    topics: strings(record.categories, 8),
    capabilities: strings(direction.categories, 8),
    source: { authors: strings(record.authors, 12) },
    publication: { status: "", venue: "" },
    links: {
      paper: httpsUrl(released.source_url) || httpsUrl(record.source_url),
      code: repository ? httpsUrl(`https://github.com/${repository}`) : "",
    },
    attention: {
      githubStars: Number.isFinite(signals.github_stars) ? signals.github_stars : null,
      hfPaperUpvotes: Number.isFinite(signals.hf_paper_upvotes) ? signals.hf_paper_upvotes : null,
      hfDatasetDownloads: Number.isFinite(signals.hf_dataset_downloads) ? signals.hf_dataset_downloads : null,
    },
  };
}

function latestCollected(benchmarks) {
  let latest = "";
  for (const record of benchmarks) {
    const collected = text(record?.collected_at, 32);
    if (collected > latest) latest = collected;
  }
  return latest.slice(0, 10);
}

function normalizePublicIndex(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.benchmarks)) {
    throw new Error("Benchmark Radar returned an unexpected index.");
  }
  const records = payload.benchmarks.map(adaptPublicRecord).filter(Boolean).map(normalizeRecord).filter((record) => record.id && record.name);
  const taxonomy = payload.library_taxonomy && typeof payload.library_taxonomy === "object" ? payload.library_taxonomy : {};
  const categories = Array.isArray(taxonomy.categories) ? taxonomy.categories : [];
  const counts = new Map();
  for (const record of records) for (const id of record.directions) counts.set(id, (counts.get(id) || 0) + 1);
  const directions = categories.map((category) => {
    const id = text(category?.id, 120);
    return { id, name: text(category?.name, 180), section: humanize(category?.group) || "Research directions", count: counts.get(id) || 0 };
  }).filter((direction) => direction.id && direction.name);
  return { updatedAt: latestCollected(payload.benchmarks), records, directions };
}

function validIndex(value) {
  return Boolean(value && value.schema === CACHE_SCHEMA && Array.isArray(value.records) && Array.isArray(value.directions));
}

function readIndexFile(filePath) {
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return validIndex(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeIndexFile(filePath, index) {
  const envelope = { schema: CACHE_SCHEMA, updatedAt: text(index.updatedAt, 32), fetchedAt: text(index.fetchedAt, 40), etag: text(index.etag, 400), records: index.records, directions: index.directions };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(envelope), "utf8");
  fs.renameSync(temporary, filePath);
  return envelope;
}

async function fetchPublicIndex({ url = PUBLIC_INDEX_URL, fetchImpl = globalThis.fetch, etag = "", timeoutMs = REQUEST_TIMEOUT_MS, now = new Date() } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Benchmark Radar cannot download its public index in this runtime.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { accept: "application/json" };
    if (etag) headers["if-none-match"] = etag;
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (response.status === 304) return { notModified: true };
    if (!response.ok) throw new Error(`Benchmark Radar returned HTTP ${response.status}.`);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > MAX_INDEX_BYTES) throw new Error("Benchmark Radar returned an index that is too large.");
    const body = await response.text();
    if (body.length > MAX_INDEX_BYTES) throw new Error("Benchmark Radar returned an index that is too large.");
    const index = normalizePublicIndex(JSON.parse(body));
    if (!index.records.length) throw new Error("Benchmark Radar returned an empty index.");
    return { index, etag: text(response.headers?.get?.("etag"), 400), fetchedAt: now.toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

async function refreshPublicIndex({ cachePath = "", url = PUBLIC_INDEX_URL, fetchImpl, ttlMs = DEFAULT_TTL_MS, now = new Date(), timeoutMs, force = false } = {}) {
  const cached = readIndexFile(cachePath);
  const fetchedAt = cached?.fetchedAt ? Date.parse(cached.fetchedAt) : Number.NaN;
  if (!force && Number.isFinite(fetchedAt) && now.getTime() - fetchedAt < ttlMs) return { index: cached, refreshed: false, skipped: true };
  const result = await fetchPublicIndex({ url, fetchImpl, etag: cached?.etag || "", now, ...(timeoutMs ? { timeoutMs } : {}) });
  if (result.notModified) {
    if (cached && cachePath) writeIndexFile(cachePath, { ...cached, fetchedAt: now.toISOString() });
    return { index: cached, refreshed: false, skipped: false };
  }
  const envelope = { ...result.index, fetchedAt: result.fetchedAt, etag: result.etag };
  if (cachePath) writeIndexFile(cachePath, envelope);
  return { index: envelope, refreshed: true, skipped: false };
}

function indexPayload(index, { source = "cached", sourceRoot = PUBLIC_INDEX_URL } = {}) {
  const records = Array.isArray(index?.records) ? index.records : [];
  return {
    source,
    sourceRoot,
    updatedAt: text(index?.updatedAt, 32),
    radar: records,
    library: records,
    directions: Array.isArray(index?.directions) ? index.directions : [],
  };
}

module.exports = {
  PUBLIC_INDEX_URL,
  CACHE_SCHEMA,
  DEFAULT_TTL_MS,
  normalizeRecord,
  adaptPublicRecord,
  normalizePublicIndex,
  readIndexFile,
  writeIndexFile,
  fetchPublicIndex,
  refreshPublicIndex,
  indexPayload,
};
