const fs = require("node:fs");
const path = require("node:path");
const sources = require("./news-sources.cjs");
const newsStore = require("./news-store.cjs");

const SETTINGS_FILE = "news-settings.json";
const SETTINGS_VERSION = 1;
const SOURCE_IDS = ["hn", "github", "arxiv", "lobsters", "reddit", "rss", "x"];

let settingsPath = "";
let settings = null;
let initialized = false;
const redditTokenCache = { token: "", expiresAt: 0 };
let refreshPromise = null;

function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    view: "feed",
    sources: { hn: true, github: true, arxiv: true, lobsters: true, reddit: false, rss: true, x: false },
    rssFeeds: [
      { id: "https://www.theverge.com/rss/index.xml", label: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
      { id: "https://arstechnica.com/feed/", label: "Ars Technica", url: "https://arstechnica.com/feed/" },
    ],
    reddit: { subreddits: ["LocalLLaMA"], clientId: "", clientSecret: "" },
    github: { token: "" },
    x: { bearerToken: "", query: "" },
    watch: ["agents", "RAG", "inference"],
    mute: [],
    cadenceMinutes: 10,
    sinceHours: 24,
    clustering: true,
  };
}

function cleanKeywords(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, 24);
}

function cleanRssFeeds(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const feeds = [];
  for (const entry of entries) {
    const url = String(entry?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    feeds.push({ id: String(entry?.id || url).slice(0, 200), label: String(entry?.label || "").trim().slice(0, 80), url: url.slice(0, 2000) });
    if (feeds.length >= 20) break;
  }
  return feeds;
}

function cleanSubreddits(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((entry) => String(entry || "").replace(/^\/?r\//i, "").trim()).filter((entry) => /^[A-Za-z0-9_]{2,60}$/.test(entry)))].slice(0, 5);
}

function normalizeSettings(input = {}) {
  const base = defaultSettings();
  const source = input && typeof input === "object" ? input : {};
  const enabled = source.sources && typeof source.sources === "object" ? source.sources : {};
  const normalized = {
    ...base,
    view: source.view === "board" ? "board" : "feed",
    sources: Object.fromEntries(SOURCE_IDS.map((id) => [id, enabled[id] === undefined ? base.sources[id] : Boolean(enabled[id])])),
    rssFeeds: cleanRssFeeds(source.rssFeeds),
    reddit: {
      subreddits: cleanSubreddits(source.reddit?.subreddits ?? base.reddit.subreddits),
      clientId: String(source.reddit?.clientId ?? base.reddit.clientId).trim().slice(0, 200),
      clientSecret: String(source.reddit?.clientSecret ?? base.reddit.clientSecret).trim().slice(0, 400),
    },
    github: {
      token: String(source.github?.token ?? base.github.token).trim().slice(0, 400),
    },
    x: {
      bearerToken: String(source.x?.bearerToken ?? base.x.bearerToken).trim().slice(0, 2000),
      query: String(source.x?.query ?? base.x.query).trim().slice(0, 400),
    },
    watch: cleanKeywords(source.watch ?? base.watch),
    mute: cleanKeywords(source.mute ?? base.mute),
    cadenceMinutes: Math.min(60, Math.max(5, Number(source.cadenceMinutes) || base.cadenceMinutes)),
    sinceHours: [24, 72, 168].includes(Number(source.sinceHours)) ? Number(source.sinceHours) : base.sinceHours,
    clustering: source.clustering === undefined ? base.clustering : Boolean(source.clustering),
  };
  return normalized;
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaultSettings();
  }
  newsStore.initialize(userDataPath);
  initialized = true;
  return publicSettings();
}

function settingsOrDefaults() {
  if (!settings) settings = defaultSettings();
  return settings;
}

function publicSettings() {
  const current = settingsOrDefaults();
  return {
    ...structuredClone(current),
    reddit: { ...current.reddit, clientSecret: "", configured: Boolean(current.reddit.clientId && current.reddit.clientSecret) },
    github: { ...current.github, token: "", configured: Boolean(current.github.token) },
    x: { ...current.x, bearerToken: "", configured: Boolean(current.x.bearerToken) },
  };
}

function getSettings() {
  return publicSettings();
}

function setSettings(patch = {}) {
  const current = structuredClone(settingsOrDefaults());
  const next = { ...current };
  if (patch && typeof patch === "object") {
    if (patch.view !== undefined) next.view = patch.view;
    if (patch.sources !== undefined) next.sources = { ...current.sources, ...(patch.sources || {}) };
    if (patch.rssFeeds !== undefined) next.rssFeeds = patch.rssFeeds;
    if (patch.reddit !== undefined) {
      const incoming = patch.reddit || {};
      next.reddit = {
        subreddits: incoming.subreddits !== undefined ? incoming.subreddits : current.reddit.subreddits,
        clientId: incoming.clientId !== undefined ? incoming.clientId : current.reddit.clientId,
        clientSecret: incoming.clientSecret ? incoming.clientSecret : current.reddit.clientSecret,
      };
    }
    if (patch.x !== undefined) {
      const incoming = patch.x || {};
      next.x = {
        bearerToken: incoming.bearerToken ? incoming.bearerToken : current.x.bearerToken,
        query: incoming.query !== undefined ? incoming.query : current.x.query,
      };
    }
    if (patch.github !== undefined) {
      const incoming = patch.github || {};
      next.github = { token: incoming.token ? incoming.token : current.github.token };
    }
    if (patch.watch !== undefined) next.watch = patch.watch;
    if (patch.mute !== undefined) next.mute = patch.mute;
    if (patch.cadenceMinutes !== undefined) next.cadenceMinutes = patch.cadenceMinutes;
    if (patch.sinceHours !== undefined) next.sinceHours = patch.sinceHours;
    if (patch.clustering !== undefined) next.clustering = patch.clustering;
  }
  settings = normalizeSettings(next);
  persist();
  return publicSettings();
}

function muted(item, muteList) {
  if (!muteList.length) return false;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return muteList.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function titleTokens(title) {
  const stopwords = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "your", "you", "are", "was", "were", "has", "have", "how", "why", "what", "when", "who", "will", "can", "not", "but", "its", "our", "their", "they", "them", "about", "after", "before", "more", "most", "than", "then", "there", "here", "just", "now", "new", "via", "per", "out", "off", "all", "any", "one", "two"]);
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !stopwords.has(token)),
  );
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function computeClusters() {
  const rows = newsStore.recentForClustering(3, 500);
  const groups = [];
  const byUrl = new Map();
  const assignments = {};
  for (const row of rows) {
    const tokens = titleTokens(row.title);
    let group = byUrl.get(row.url);
    if (!group) {
      let best = null;
      let bestScore = 0.6;
      for (const candidate of groups) {
        const score = jaccard(tokens, candidate.tokens);
        if (score >= bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      group = best;
    }
    if (!group) {
      group = { id: row.id, tokens };
      groups.push(group);
    }
    byUrl.set(row.url, group);
    assignments[row.id] = group.id;
  }
  newsStore.updateClusters(assignments);
  return assignments;
}

function shouldRefresh(force) {
  if (force) return true;
  const current = settingsOrDefaults();
  const states = SOURCE_IDS.filter((id) => current.sources[id]).map((id) => newsStore.getSourceState(id));
  if (!states.length) return false;
  const cutoff = Date.now() - current.cadenceMinutes * 60000;
  return states.some((state) => {
    const attempted = Date.parse(state.last_attempt_at || "");
    return !Number.isFinite(attempted) || attempted < cutoff;
  });
}

async function runSource(source, task) {
  const state = newsStore.getSourceState(source);
  const attemptedAt = new Date().toISOString();
  try {
    const result = await task(state);
    if (result?.notModified) {
      newsStore.setSourceState(source, {
        status: "ok",
        message: "Cached (not modified)",
        lastAttemptAt: attemptedAt,
        lastSuccessAt: state.last_success_at || attemptedAt,
        etag: result.etag ?? state.etag,
        lastModified: result.lastModified ?? state.last_modified,
      });
      return { source, status: "ok", updated: 0 };
    }
    const items = (result?.items || []).filter((item) => !muted(item, settingsOrDefaults().mute));
    const written = newsStore.upsertItems(items);
    newsStore.setSourceState(source, {
      status: "ok",
      message: "",
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      etag: result?.etag || state.etag,
      lastModified: result?.lastModified || state.last_modified,
    });
    return { source, status: "ok", updated: written };
  } catch (error) {
    newsStore.setSourceState(source, {
      status: "error",
      message: sources.truncate(error instanceof Error ? error.message : String(error), 200),
      lastAttemptAt: attemptedAt,
    });
    return { source, status: "error", updated: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function refresh({ force = false, fetchImpl } = {}) {
  if (!shouldRefresh(force)) return { skipped: true, results: [] };
  if (refreshPromise) return refreshPromise;
  const current = settingsOrDefaults();
  const jobs = [];
  if (current.sources.hn) jobs.push(() => runSource("hn", () => sources.fetchHackerNews({ fetchImpl })));
  if (current.sources.github) jobs.push(() => runSource("github", () => sources.fetchGitHub({ fetchImpl, token: current.github.token })));
  if (current.sources.arxiv) jobs.push(() => runSource("arxiv", () => sources.fetchArxiv({ fetchImpl })));
  if (current.sources.lobsters) jobs.push(() => runSource("lobsters", () => sources.fetchLobsters({ fetchImpl })));
  if (current.sources.reddit) {
    jobs.push(() => runSource("reddit", () => sources.fetchReddit({
      fetchImpl,
      clientId: current.reddit.clientId,
      clientSecret: current.reddit.clientSecret,
      subreddits: current.reddit.subreddits,
      tokenCache: redditTokenCache,
      // One OAuth token covers several subreddits; conditional ETags would be
      // shared across them, so this adapter always refetches on cadence.
      state: {},
    })));
  }
  if (current.sources.x) {
    jobs.push(() => runSource("x", () => sources.fetchX({ fetchImpl, bearerToken: current.x.bearerToken, query: current.x.query })));
  }
  if (current.sources.rss) {
    for (const feed of current.rssFeeds) {
      // Several feeds share the "rss" source id, so conditional headers are
      // per-request only; the SQLite cache still keeps offline reads working.
      jobs.push(() => runSource("rss", () => sources.fetchRss({ fetchImpl, feed, state: {} })));
    }
  }
  refreshPromise = (async () => {
    const results = await Promise.all(jobs.map((job) => job()));
    if (settingsOrDefaults().clustering) computeClusters();
    newsStore.prune();
    return { skipped: false, results };
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function sourceList() {
  const current = settingsOrDefaults();
  const counts = new Map(newsStore.sourceSummary(current.sinceHours).map((entry) => [entry.source, entry]));
  return SOURCE_IDS.filter((id) => current.sources[id]).map((id) => {
    const count = counts.get(id);
    const state = newsStore.getSourceState(id);
    return {
      id,
      label: sources.SOURCE_LABELS[id] || id,
      total: count?.total || 0,
      unread: count?.unread || 0,
      status: state.status || "idle",
      message: state.message || "",
      lastSuccessAt: state.last_success_at || "",
    };
  });
}

function list(filters = {}) {
  const current = settingsOrDefaults();
  const sinceHours = Number(filters.sinceHours) || current.sinceHours;
  const items = newsStore.listItems({ ...filters, sinceHours });
  return {
    items,
    sources: sourceList(),
    updatedAt: sourceList().reduce((latest, entry) => (entry.lastSuccessAt > latest ? entry.lastSuccessAt : latest), ""),
    settings: publicSettings(),
  };
}

function markRead(id, read) {
  newsStore.markRead(id, read);
  return { ok: true };
}

function setSaved(id, saved) {
  newsStore.setSaved(id, saved);
  return { ok: true };
}

function markAllRead(source) {
  newsStore.markAllRead(source);
  return { ok: true };
}

function isInitialized() {
  return initialized;
}

module.exports = {
  initialize,
  getSettings,
  setSettings,
  list,
  refresh,
  markRead,
  setSaved,
  markAllRead,
  isInitialized,
  // exposed for tests
  _normalizeSettings: normalizeSettings,
  _computeClusters: computeClusters,
  _titleTokens: titleTokens,
  _jaccard: jaccard,
};
