const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SETTINGS_FILE = "extension-sources.json";
const CATALOG_PATH = path.join(__dirname, "..", "shared", "extensions-catalog.json");
const CACHE_TTL = 5 * 60 * 1000;
const INSTALL_MARKER = ".archimedes-extension.json";
const MAX_SOURCES = 24;
const MAX_ITEMS = 72;
const MAX_FILE_BYTES = 500_000;
const MAX_PREVIEW_CHARS = 16_000;

const TYPES = new Set(["skill", "mcp", "plugin", "source", "automation"]);
const SOURCE_TYPES = new Set(["archimedes", "json", "github", "mcp", "npm"]);

const DEFAULT_SOURCES = [
  {
    id: "archimedes",
    name: "Archimedes index",
    type: "archimedes",
    url: "",
    enabled: true,
    builtin: true,
  },
  {
    id: "github",
    name: "GitHub",
    type: "github",
    url: "https://api.github.com/search/repositories?q=topic%3Aclaude-skills&sort=stars&order=desc",
    enabled: true,
    builtin: true,
  },
  {
    id: "mcp-registry",
    name: "MCP Registry",
    type: "mcp",
    url: "https://registry.modelcontextprotocol.io/v0/servers",
    enabled: true,
    builtin: true,
  },
  {
    id: "npm",
    name: "npm",
    type: "npm",
    url: "https://registry.npmjs.org/-/v1/search?text=keywords%3Amcp-server",
    enabled: true,
    builtin: true,
  },
];

let settingsPath = "";
let sourceCache = new Map();
let lastFeed = { items: [], at: 0 };

function safeString(value, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeUrl(value) {
  const raw = safeString(value, 2_000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function safeId(value, fallback) {
  const raw = safeString(value, 220).toLowerCase().replace(/[^a-z0-9._:/-]+/g, "-").replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function normalizeSource(input, index = 0) {
  const type = SOURCE_TYPES.has(input?.type) ? input.type : "json";
  const fallback = `${type}-${index + 1}`;
  return {
    id: safeId(input?.id, fallback),
    name: safeString(input?.name, 120) || `Source ${index + 1}`,
    type,
    url: safeString(input?.url, 2_000),
    query: safeString(input?.query, 500),
    token: safeString(input?.token, 4_000),
    enabled: input?.enabled !== false,
    builtin: Boolean(input?.builtin),
  };
}

function readSources() {
  if (!settingsPath) return DEFAULT_SOURCES.map((source) => ({ ...source }));
  try {
    if (!fs.existsSync(settingsPath)) return DEFAULT_SOURCES.map((source) => ({ ...source }));
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.sources;
    if (!Array.isArray(list)) return DEFAULT_SOURCES.map((source) => ({ ...source }));
    const normalized = list
      .slice(0, MAX_SOURCES)
      .map((source, index) => normalizeSource(source, index))
      .filter((source) => source.name);
    const seen = new Set();
    const result = normalized.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
    if (!result.some((source) => source.type === "archimedes")) result.unshift({ ...DEFAULT_SOURCES[0] });
    return result;
  } catch {
    return DEFAULT_SOURCES.map((source) => ({ ...source }));
  }
}

function writeSources(sources) {
  if (!settingsPath) throw new Error("Extensions settings are unavailable.");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify({ version: 1, sources }, null, 2)}\n`, "utf8");
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
}

function clearCache() {
  sourceCache = new Map();
  lastFeed = { items: [], at: 0 };
}

function sourceStatus(source) {
  const cached = sourceCache.get(source.id);
  return {
    ...source,
    count: cached?.items?.length || 0,
    total: cached?.total || 0,
    lastSync: cached?.at ? new Date(cached.at).toISOString() : "",
    error: cached?.error || "",
  };
}

function listSources() {
  return readSources().map(sourceStatus);
}

function saveSources(input) {
  if (!Array.isArray(input)) throw new Error("Extension sources must be a list.");
  const sources = input.slice(0, MAX_SOURCES).map((source, index) => normalizeSource(source, index));
  const seen = new Set();
  const unique = sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
  if (!unique.some((source) => source.type === "archimedes")) unique.unshift({ ...DEFAULT_SOURCES[0] });
  writeSources(unique);
  clearCache();
  return unique.map(sourceStatus);
}

function resetSources() {
  if (settingsPath && fs.existsSync(settingsPath)) fs.rmSync(settingsPath, { force: true });
  clearCache();
  return listSources();
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function requestJson(url, source, ms = 9_000) {
  const target = safeUrl(url);
  if (!target) throw new Error("Source URL is invalid.");
  const timer = timeoutSignal(ms);
  try {
    const headers = { Accept: "application/json", "User-Agent": "Archimedes/0.1" };
    if (source?.token) headers.Authorization = `Bearer ${source.token}`;
    if (source?.type === "github") headers.Accept = "application/vnd.github+json";
    const response = await fetch(target, { headers, signal: timer.signal });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Source timed out.");
    throw error;
  } finally {
    timer.clear();
  }
}

async function requestText(url, source, ms = 9_000) {
  const target = safeUrl(url);
  if (!target) throw new Error("Source URL is invalid.");
  const timer = timeoutSignal(ms);
  try {
    const headers = { Accept: "text/plain", "User-Agent": "Archimedes/0.1" };
    if (source?.token) headers.Authorization = `Bearer ${source.token}`;
    const response = await fetch(target, { headers, signal: timer.signal });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Source timed out.");
    throw error;
  } finally {
    timer.clear();
  }
}

function withLimit(url, key, limit) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, String(limit));
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeType(value) {
  return TYPES.has(value) ? value : "skill";
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.slice(0, 40).flatMap((file) => {
    const relative = safeString(file?.path, 300).replaceAll("\\", "/").replace(/^\/+/, "");
    const content = typeof file?.content === "string" ? file.content : "";
    if (!relative || relative.split("/").some((part) => !part || part === ".." || part === ".") || content.length > MAX_FILE_BYTES) return [];
    return [{ path: relative, content }];
  });
}

function normalizeItem(input, source) {
  if (!input || typeof input !== "object") return null;
  const name = safeString(input.name || input.title, 180);
  if (!name) return null;
  const type = normalizeType(input.type);
  const id = safeId(input.id, `${source.id}:${name}`);
  const files = normalizeFiles(input.files);
  const size = Number.isFinite(Number(input.size))
    ? Number(input.size)
    : files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
  const item = {
    id,
    canonicalId: safeString(input.canonicalId, 300) || id,
    name,
    type,
    description: safeString(input.description, 700),
    version: safeString(input.version, 80) || "1.0.0",
    author: safeString(input.author, 160) || source.name,
    license: safeString(input.license, 80) || "Unknown",
    homepage: safeUrl(input.homepage || input.sourceUrl),
    sourceUrl: safeUrl(input.sourceUrl || input.homepage),
    permissions: Array.isArray(input.permissions)
      ? input.permissions.slice(0, 12).map((permission) => safeString(permission, 80)).filter(Boolean)
      : [],
    installs: Math.max(0, Math.round(Number(input.installs) || 0)),
    size: Math.max(0, Math.round(size)),
    updatedAt: safeString(input.updatedAt, 80),
    source: source.name,
    sourceId: source.id,
    sourceType: source.type,
    files,
    config: input.config && typeof input.config === "object" ? input.config : null,
    repo: safeString(input.repo, 300),
    packageName: safeString(input.packageName, 300),
  };
  return item;
}

function catalogItems(source, limit) {
  const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    items: items.slice(0, limit).map((item) => normalizeItem(item, source)).filter(Boolean),
    total: items.length,
  };
}

async function jsonItems(source, limit) {
  if (!source.url) throw new Error("Add a JSON index URL.");
  const payload = await requestJson(source.url, source);
  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items)) throw new Error("The JSON index does not contain an items list.");
  const total = Math.max(items.length, Number(payload?.total) || 0);
  return {
    items: items.slice(0, limit).map((item) => normalizeItem(item, source)).filter(Boolean),
    total,
  };
}

function githubType(repo) {
  const topics = Array.isArray(repo?.topics) ? repo.topics.map((topic) => String(topic).toLowerCase()) : [];
  if (topics.some((topic) => topic.includes("mcp"))) return "mcp";
  if (topics.some((topic) => topic.includes("plugin"))) return "plugin";
  if (topics.some((topic) => topic.includes("automation"))) return "automation";
  return "skill";
}

async function githubItems(source, limit) {
  let url = source.url || "https://api.github.com/search/repositories";
  const repoMatch = String(source.url || "").match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!source.query && repoMatch) {
    url = `https://api.github.com/repos/${encodeURIComponent(repoMatch[1])}/${encodeURIComponent(repoMatch[2].replace(/\.git$/i, ""))}`;
  } else if (source.query) {
    url = `https://api.github.com/search/repositories?q=${encodeURIComponent(source.query)}&sort=stars&order=desc`;
  }
  const payload = await requestJson(withLimit(url, "per_page", limit), source);
  const repos = Array.isArray(payload?.items) ? payload.items : payload?.full_name ? [payload] : [];
  const items = repos.map((repo) => normalizeItem({
    id: `github:${repo.full_name}`,
    canonicalId: `github:${String(repo.full_name).toLowerCase()}`,
    name: repo.name,
    type: githubType(repo),
    description: repo.description || `A public GitHub repository maintained by ${repo.owner?.login || "the community"}.`,
    version: String(repo.pushed_at || "").slice(0, 10) || "main",
    author: repo.owner?.login || "GitHub",
    license: repo.license?.spdx_id || "Unknown",
    homepage: repo.html_url,
    sourceUrl: repo.html_url,
    permissions: ["read:repository"],
    installs: repo.stargazers_count,
    updatedAt: repo.pushed_at || "",
    repo: repo.full_name,
    config: { branch: repo.default_branch || "main" },
  }, source)).filter(Boolean);
  return { items, total: Math.max(items.length, Number(payload?.total_count) || 0) };
}

function versionParts(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

async function mcpItems(source, limit) {
  const payload = await requestJson(withLimit(source.url || "https://registry.modelcontextprotocol.io/v0/servers", "limit", Math.min(limit * 2, 100)), source);
  const servers = Array.isArray(payload?.servers) ? payload.servers : [];
  const byName = new Map();
  for (const entry of servers) {
    const server = entry?.server || entry;
    const name = safeString(server?.name, 300);
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || compareVersions(server.version, existing.server.version) > 0) byName.set(name, { server, meta: entry?._meta });
  }
  const items = [...byName.values()].slice(0, limit).map(({ server, meta }) => normalizeItem({
    id: `mcp:${server.name}`,
    canonicalId: `mcp:${String(server.name).toLowerCase()}`,
    name: server.title || String(server.name).split("/").pop(),
    type: "mcp",
    description: server.description || "An MCP server published to the official registry.",
    version: server.version,
    author: "MCP Registry",
    license: "Unknown",
    homepage: server.websiteUrl || "",
    sourceUrl: "https://registry.modelcontextprotocol.io/",
    permissions: ["network:mcp"],
    installs: 0,
    updatedAt: meta?.["io.modelcontextprotocol.registry/official"]?.updatedAt || "",
    config: server,
  }, source)).filter(Boolean);
  return { items, total: items.length };
}

function npmType(pkg) {
  const keywords = Array.isArray(pkg?.keywords) ? pkg.keywords.map((keyword) => String(keyword).toLowerCase()) : [];
  return keywords.some((keyword) => keyword.includes("mcp")) ? "mcp" : "plugin";
}

async function npmItems(source, limit) {
  const url = source.url || "https://registry.npmjs.org/-/v1/search?text=keywords%3Amcp-server";
  const payload = await requestJson(withLimit(url, "size", limit), source);
  const objects = Array.isArray(payload?.objects) ? payload.objects : [];
  const items = objects.map((entry) => {
    const pkg = entry?.package || {};
    return normalizeItem({
      id: `npm:${pkg.name}`,
      canonicalId: `npm:${String(pkg.name).toLowerCase()}`,
      name: pkg.name,
      type: npmType(pkg),
      description: pkg.description || "A package published to npm.",
      version: pkg.version,
      author: pkg.publisher?.username || "npm",
      license: pkg.license || "Unknown",
      homepage: pkg.links?.homepage || pkg.links?.repository || pkg.links?.npm,
      sourceUrl: pkg.links?.npm || pkg.links?.repository || "",
      permissions: ["network:npm"],
      installs: entry?.downloads?.weekly || 0,
      updatedAt: pkg.date || "",
      packageName: pkg.name,
    }, source);
  }).filter(Boolean);
  return { items, total: Math.max(items.length, Number(payload?.total) || 0) };
}

async function loadSource(source, limit) {
  switch (source.type) {
    case "archimedes":
      return catalogItems(source, limit);
    case "json":
      return jsonItems(source, limit);
    case "github":
      return githubItems(source, limit);
    case "mcp":
      return mcpItems(source, limit);
    case "npm":
      return npmItems(source, limit);
    default:
      throw new Error(`Unsupported source type: ${source.type}.`);
  }
}

async function cachedSource(source, limit, refresh) {
  const cached = sourceCache.get(source.id);
  if (!refresh && cached && cached.limit === limit && Date.now() - cached.at < CACHE_TTL) return cached;
  try {
    const result = await loadSource(source, limit);
    const status = { ...result, at: Date.now(), limit, error: "" };
    sourceCache.set(source.id, status);
    return status;
  } catch (error) {
    const failed = { items: [], total: 0, at: Date.now(), limit, error: error.message || String(error) };
    sourceCache.set(source.id, failed);
    return failed;
  }
}

function installedMetadata(workspace) {
  const roots = [
    { root: path.join(path.resolve(workspace || "."), ".agents", "skills"), scope: "workspace" },
    { root: path.join(os.homedir(), ".agents", "skills"), scope: "global" },
  ];
  const result = new Map();
  for (const { root, scope } of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const marker = path.join(root, entry.name, INSTALL_MARKER);
      if (!fs.existsSync(marker)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(marker, "utf8"));
        if (parsed?.id) result.set(parsed.id, { ...parsed, path: path.join(root, entry.name), scope });
      } catch {
        // Ignore malformed install markers.
      }
    }
  }
  return result;
}

function decorateItems(items, workspace) {
  const installed = installedMetadata(workspace);
  return items.map((item) => {
    const local = installed.get(item.id);
    const available = Boolean(local);
    return {
      ...item,
      installed: available,
      installedVersion: local?.version || "",
      installedPath: local?.path || "",
      installedScope: local?.scope || "",
      updateAvailable: available && compareVersions(item.version, local.version) > 0,
    };
  });
}

async function listExtensions({ workspace, limit = 24, refresh = false } = {}) {
  const pageSize = Math.max(12, Math.min(MAX_ITEMS, Math.round(Number(limit) || 24)));
  const sources = readSources();
  const enabled = sources.filter((source) => source.enabled);
  const results = await Promise.all(enabled.map((source) => cachedSource(source, pageSize, refresh)));
  const seen = new Set();
  const items = [];
  let total = 0;
  enabled.forEach((source, index) => {
    const result = results[index];
    total += result.total || 0;
    for (const item of result.items) {
      const key = item.canonicalId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  });
  const decorated = decorateItems(items, workspace);
  lastFeed = { items: decorated, at: Date.now() };
  return {
    items: decorated,
    total: Math.max(total, decorated.length),
    sources: sources.map(sourceStatus),
    syncedAt: new Date().toISOString(),
  };
}

async function previewExtension({ id, workspace } = {}) {
  const targetId = safeString(id, 300);
  if (!targetId) throw new Error("Choose an extension to preview.");
  let item = lastFeed.items.find((candidate) => candidate.id === targetId);
  if (!item) {
    const feed = await listExtensions({ workspace, limit: 72 });
    item = feed.items.find((candidate) => candidate.id === targetId);
  }
  if (!item) throw new Error("This extension is no longer in the current feed.");
  let content = "";
  let filename = "";
  let language = "markdown";
  if (item.files?.length) {
    const primary = item.files.find((file) => /^skill\.md$/i.test(file.path)) || item.files[0];
    content = primary.content;
    filename = primary.path;
  } else if (item.sourceType === "github" && item.repo) {
    const attempts = ["SKILL.md", "README.md"];
    for (const candidate of attempts) {
      try {
        content = await requestText(`https://raw.githubusercontent.com/${item.repo}/HEAD/${candidate}`, {});
        filename = candidate;
        break;
      } catch {
        // Try the next conventional file.
      }
    }
    if (!content) content = item.description;
  } else if (item.sourceType === "npm" && item.packageName) {
    try {
      const payload = await requestJson(`https://registry.npmjs.org/${encodeURIComponent(item.packageName)}`, {});
      content = typeof payload?.readme === "string" ? payload.readme : "";
      filename = "README.md";
    } catch {
      content = item.description;
    }
  } else if (item.config) {
    content = JSON.stringify(item.config, null, 2);
    filename = item.type === "mcp" ? "mcp.json" : "config.json";
    language = "json";
  } else {
    content = item.description;
    filename = "README.md";
  }
  return {
    id: item.id,
    filename,
    language,
    content: String(content || "").slice(0, MAX_PREVIEW_CHARS),
    item,
  };
}

function safeSlug(item) {
  const raw = item.id.includes("/") ? item.id.split("/").pop() : item.id.split(":").pop();
  return String(raw || item.name).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "extension";
}

async function installExtension({ id, workspace, scope = "workspace" } = {}) {
  const targetId = safeString(id, 300);
  if (!targetId) throw new Error("Choose an extension to install.");
  if (!workspace) throw new Error("Open a workspace before installing an extension.");
  let item = lastFeed.items.find((candidate) => candidate.id === targetId);
  if (!item) {
    const feed = await listExtensions({ workspace, limit: 72 });
    item = feed.items.find((candidate) => candidate.id === targetId);
  }
  if (!item) throw new Error("This extension is no longer in the current feed.");
  if (item.type !== "skill") throw new Error("Only skill packages can be installed from this release. Open the source to install other extension types.");
  if (!item.files?.length) throw new Error("This skill does not include installable files.");
  const root = scope === "global"
    ? path.join(os.homedir(), ".agents", "skills")
    : path.join(path.resolve(workspace), ".agents", "skills");
  const target = path.join(root, safeSlug(item));
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, INSTALL_MARKER))) {
    throw new Error("A skill with the same name already exists in this location.");
  }
  fs.mkdirSync(target, { recursive: true });
  for (const file of item.files) {
    const destination = path.resolve(target, file.path);
    if (!destination.startsWith(`${path.resolve(target)}${path.sep}`)) throw new Error("The skill package contains an unsafe file path.");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, "utf8");
  }
  fs.writeFileSync(path.join(target, INSTALL_MARKER), `${JSON.stringify({
    id: item.id,
    version: item.version,
    sourceId: item.sourceId,
    source: item.source,
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  return { item, path: target, scope };
}

module.exports = {
  DEFAULT_SOURCES,
  clearCache,
  initialize,
  installExtension,
  listExtensions,
  listSources,
  previewExtension,
  resetSources,
  saveSources,
};
