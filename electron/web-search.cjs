const fs = require("node:fs");
const path = require("node:path");

const PROVIDERS = new Set(["brave", "tavily", "exa", "firecrawl"]);
let configPath = "";

function initializeWebSearch(userDataPath) {
  configPath = path.join(userDataPath, "web-search-config.json");
}

function readConfig() {
  if (!configPath || !fs.existsSync(configPath)) return { provider: "brave", apiKeys: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      provider: PROVIDERS.has(saved.provider) ? saved.provider : "brave",
      apiKeys: { ...(saved.apiKeys && typeof saved.apiKeys === "object" ? saved.apiKeys : {}), ...(saved.apiKey ? { brave: saved.apiKey } : {}) },
    };
  } catch { return { provider: "brave", apiKeys: {} }; }
}

function activeKey(provider, config = readConfig()) {
  return String(config.apiKeys[provider] || (provider === "brave" ? process.env.ARCHIMEDES_WEB_SEARCH_API_KEY : "") || "");
}

function getPublicWebSearchConfig() {
  const config = readConfig();
  return { provider: config.provider, hasApiKey: Boolean(activeKey(config.provider, config)), configuredProviders: [...PROVIDERS].filter((provider) => Boolean(activeKey(provider, config))) };
}

function saveWebSearchConfig(input = {}) {
  if (!configPath) throw new Error("Web search configuration is not ready.");
  const provider = String(input.provider || "brave");
  if (!PROVIDERS.has(provider)) throw new Error("Choose a supported web search provider.");
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length > 2_000) throw new Error("Enter a valid API key.");
  const config = readConfig();
  if (apiKey) config.apiKeys[provider] = apiKey;
  if (!activeKey(provider, config)) throw new Error(`Enter a ${provider} API key before selecting this provider.`);
  config.provider = provider;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config)}\n`, { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch { /* POSIX permissions unavailable. */ }
  return getPublicWebSearchConfig();
}

function normalizeSearchResults(payload, type) {
  const rows = type === "news" ? payload?.results : payload?.web?.results;
  return (Array.isArray(rows) ? rows : []).filter((row) => row.url && row.title).map((row) => ({
    title: String(row.title), url: String(row.url), snippet: String(row.description || ""),
    published_at: String(row.page_age || ""), source: type === "news" ? "news" : "web",
  }));
}

function normalizeDomains(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) throw new Error("Provide at most five domain filters.");
  return value.map((domain) => {
    const normalized = String(domain).toLowerCase().trim();
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(normalized)) throw new Error("Domain filters must be hostnames, without a URL or path.");
    return normalized;
  });
}

function normalizeQueries(input) {
  const queries = input.queries === undefined ? [input.query] : input.queries;
  if (!Array.isArray(queries) || !queries.length || queries.length > 4) throw new Error("Provide one to four web queries.");
  return queries.map((value) => {
    const query = String(value || "").trim();
    if (!query || query.length > 400) throw new Error("Web search requires a query of at most 400 characters.");
    return query;
  });
}

function rowsFrom(payload, provider, type) {
  if (provider === "brave") return normalizeSearchResults(payload, type);
  const rows = provider === "firecrawl" ? payload?.data?.[type] || payload?.data : payload?.results;
  return (Array.isArray(rows) ? rows : []).filter((row) => row.url && row.title).map((row) => ({
    title: String(row.title), url: String(row.url),
    snippet: String(row.description || row.content || row.summary || row.highlights?.[0] || "").slice(0, 1200),
    published_at: String(row.publishedDate || row.published_at || ""), source: type,
  }));
}

function requestFor(provider, query, input, domains, apiKey) {
  const type = input.type === "news" ? "news" : "web";
  const limit = Math.max(1, Math.min(Number(input.limit) || 6, 10));
  const siteQuery = domains.length ? `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})` : query;
  if (provider === "brave") {
    const endpoint = new URL(`https://api.search.brave.com/res/v1/${type}/search`);
    endpoint.searchParams.set("q", siteQuery);
    endpoint.searchParams.set("count", String(limit));
    if (["pd", "pw", "pm", "py"].includes(input.freshness) || /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/.test(input.freshness || "")) endpoint.searchParams.set("freshness", input.freshness);
    if (type === "web") endpoint.searchParams.set("result_filter", "web");
    return [endpoint, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } }];
  }
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  let endpoint;
  let body;
  if (provider === "tavily") {
    endpoint = "https://api.tavily.com/search";
    headers.Authorization = `Bearer ${apiKey}`;
    body = { query, topic: type === "news" ? "news" : "general", max_results: limit, include_domains: domains };
  } else if (provider === "exa") {
    endpoint = "https://api.exa.ai/search";
    headers["x-api-key"] = apiKey;
    body = { query, type: "auto", numResults: limit, ...(type === "news" ? { category: "news" } : {}), ...(domains.length ? { includeDomains: domains } : {}), contents: { highlights: true } };
  } else {
    endpoint = "https://api.firecrawl.dev/v2/search";
    headers.Authorization = `Bearer ${apiKey}`;
    body = { query, limit, sources: [type], ...(domains.length ? { includeDomains: domains } : {}) };
  }
  return [endpoint, { method: "POST", headers, body: JSON.stringify(body) }];
}

async function searchOne(query, input, options, domains) {
  const { provider, apiKey } = options;
  const type = input.type === "news" ? "news" : "web";
  const [endpoint, request] = requestFor(provider, query, input, domains, apiKey);
  const response = await (options.fetchImpl || fetch)(endpoint, {
    ...request,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Web search failed (${response.status}) with ${provider}. Check its key and quota.`);
  const results = rowsFrom(await response.json(), provider, type).filter((result) => !domains.length || domains.some((domain) => {
    try { const host = new URL(result.url).hostname.toLowerCase(); return host === domain || host.endsWith(`.${domain}`); }
    catch { return false; }
  }));
  return { query, type, results };
}

async function searchWeb(input = {}, options = {}) {
  const queries = normalizeQueries(input);
  const domains = normalizeDomains(input.domains);
  const provider = options.provider || readConfig().provider;
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported web search provider.");
  const apiKey = options.apiKey || activeKey(provider);
  if (!apiKey) throw new Error(provider === "brave"
    ? "Web search needs a Brave Search API key. Open Web search settings or set ARCHIMEDES_WEB_SEARCH_API_KEY."
    : `Web search needs a ${provider} API key. Open Web search settings.`);
  const searchOptions = { ...options, provider, apiKey };
  if (queries.length === 1) return searchOne(queries[0], input, searchOptions, domains);
  const settled = await Promise.allSettled(queries.map((query) => searchOne(query, input, searchOptions, domains)));
  const searches = settled.map((result, index) => result.status === "fulfilled"
    ? result.value : { query: queries[index], type: input.type === "news" ? "news" : "web", results: [], error: result.reason?.message || String(result.reason) });
  return { searches, results: [...new Map(searches.flatMap((search) => search.results).map((row) => [row.url, row])).values()] };
}

module.exports = { getPublicWebSearchConfig, initializeWebSearch, normalizeSearchResults, saveWebSearchConfig, searchWeb };
