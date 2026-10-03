const fs = require("node:fs");
const path = require("node:path");

let configPath = "";

function initializeWebSearch(userDataPath) {
  configPath = path.join(userDataPath, "web-search-config.json");
}

function savedKey() {
  if (!configPath || !fs.existsSync(configPath)) return "";
  try { return String(JSON.parse(fs.readFileSync(configPath, "utf8")).apiKey || ""); }
  catch { return ""; }
}

function activeKey() {
  return savedKey() || process.env.ARCHIMEDES_WEB_SEARCH_API_KEY || "";
}

function getPublicWebSearchConfig() {
  return { provider: "brave", hasApiKey: Boolean(activeKey()) };
}

function saveWebSearchConfig(input = {}) {
  if (!configPath) throw new Error("Web search configuration is not ready.");
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey || apiKey.length > 2_000) throw new Error("Enter a valid Brave Search API key.");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify({ apiKey })}\n`, { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch { /* POSIX permissions are unavailable on some systems. */ }
  return getPublicWebSearchConfig();
}

function normalizeSearchResults(payload, type) {
  const rows = type === "news" ? payload?.results : payload?.web?.results;
  return (Array.isArray(rows) ? rows : []).filter((row) => row.url && row.title).map((row) => ({
    title: String(row.title), url: String(row.url), snippet: String(row.description || ""),
    published_at: String(row.page_age || ""), source: type === "news" ? "news" : "web",
  }));
}

async function searchWeb(input = {}, options = {}) {
  const query = String(input.query || "").trim();
  if (!query || query.length > 400) throw new Error("Web search requires a query of at most 400 characters.");
  const apiKey = options.apiKey || activeKey();
  if (!apiKey) throw new Error("Web search needs a Brave Search API key. Open Web search settings or set ARCHIMEDES_WEB_SEARCH_API_KEY.");
  const type = input.type === "news" ? "news" : "web";
  const endpoint = new URL(`https://api.search.brave.com/res/v1/${type}/search`);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", String(Math.max(1, Math.min(Number(input.limit) || 6, 10))));
  if (["pd", "pw", "pm", "py"].includes(input.freshness)) endpoint.searchParams.set("freshness", input.freshness);
  if (type === "web") endpoint.searchParams.set("result_filter", "web");
  const response = await (options.fetchImpl || fetch)(endpoint, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Web search failed (${response.status}). Check the Brave key and quota.`);
  return { query, type, results: normalizeSearchResults(await response.json(), type) };
}

module.exports = { getPublicWebSearchConfig, initializeWebSearch, normalizeSearchResults, saveWebSearchConfig, searchWeb };
