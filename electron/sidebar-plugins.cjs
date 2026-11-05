const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const PLUGINS_DIRNAME = "plugins";
const MANIFEST_NAME = "manifest.json";
const STATE_FILE = "sidebar-plugins.json";
const INSTALL_MARKER = ".archimedes-plugin.json";
const HOST_ENGINE = "0.1";
const MAX_PLUGIN_FILES = 40;
const MAX_FILE_BYTES = 2_000_000;
const MAX_MANIFEST_BYTES = 32_000;
const researchApps = require("../shared/research-apps.json");
const RESEARCH_CATEGORIES = new Set(researchApps.categories.map((category) => category.id));
const SECTIONS = new Set(["knowledge", "create"]);
const ICONS = new Set([
  "book-open",
  "calendar-days",
  "file-pen-line",
  "flask-conical",
  "image-plus",
  "puzzle",
  "radar",
  "sparkles",
  "table",
  "timer",
]);

let pluginsRoot = "";
let statePath = "";

function safeString(value, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safePluginId(value) {
  return safeString(value, 64).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function initialize(userDataPath) {
  const root = path.resolve(String(userDataPath || ""));
  if (!root) throw new Error("Sidebar plugins need a user data directory.");
  pluginsRoot = path.join(root, PLUGINS_DIRNAME);
  statePath = path.join(root, STATE_FILE);
}

function rootDir() {
  if (pluginsRoot) return pluginsRoot;
  // Tests and tooling may call before initialize(); keep resolution harmless.
  return path.join(os.tmpdir(), "archimedes-plugins");
}

function pluginDir(id) {
  return path.join(rootDir(), id);
}

function readState() {
  if (!statePath || !fs.existsSync(statePath)) return { version: 1, disabled: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return parsed && typeof parsed === "object" ? { version: 1, disabled: parsed.disabled || {} } : { version: 1, disabled: {} };
  } catch {
    return { version: 1, disabled: {} };
  }
}

function writeState(state) {
  if (!statePath) return;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/**
 * Validate a parsed manifest.json. The manifest is the plugin's contract with
 * the host: one sidebar view in a fixed section, no arbitrary top-level UI.
 */
function validateManifest(parsed, directoryId = "") {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "The plugin manifest is not an object." };
  const id = safePluginId(parsed.id);
  if (!id || id.length < 2) return { error: "The plugin manifest needs an id of 2-64 characters (a-z, 0-9, dot, dash)." };
  if (directoryId && id !== directoryId) return { error: "The plugin manifest id does not match its folder." };
  const name = safeString(parsed.name, 80);
  if (!name) return { error: "The plugin manifest needs a name." };
  const version = safeString(parsed.version, 40) || "0.0.0";
  const section = safeString(parsed.section, 20);
  if (!SECTIONS.has(section)) return { error: 'The plugin manifest section must be "knowledge" or "create".' };
  const researchCategory = safeString(parsed.researchCategory, 40);
  if (researchCategory && !RESEARCH_CATEGORIES.has(researchCategory)) return { error: "The plugin research category is not supported." };
  const entry = safeString(parsed.entry, 200).replaceAll("\\", "/").replace(/^\/+/, "") || "main.mjs";
  const entryParts = entry.split("/");
  if (!entry.endsWith(".mjs") || entryParts.some((part) => !part || part === "." || part === "..")) {
    return { error: "The plugin entry must be a relative .mjs path inside the plugin folder." };
  }
  const icon = safeString(parsed.icon, 40);
  const title = safeString(parsed.title, 80);
  const engine = safeString(parsed.engine, 40);
  return {
    manifest: {
      id,
      name,
      version,
      section,
      researchCategory: researchCategory || (Object.hasOwn(researchApps.legacyAppCategories, id) ? researchApps.legacyAppCategories[id] : researchApps.legacySectionCategories[section]),
      entry,
      icon: ICONS.has(icon) ? icon : "puzzle",
      title: title || name,
      engine,
    },
  };
}

function readManifest(id) {
  const dir = pluginDir(id);
  const manifestPath = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) return { error: "manifest.json was not found." };
  if (fs.statSync(manifestPath).size > MAX_MANIFEST_BYTES) return { error: "manifest.json is too large." };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { error: "manifest.json is not valid JSON." };
  }
  return validateManifest(parsed, id);
}

/**
 * Resolve a path inside a plugin folder without touching the filesystem.
 * Returns null for anything that would escape the plugin directory.
 */
function resolvePluginPath(id, relativePath) {
  const pluginId = safePluginId(id);
  if (!pluginId) return null;
  const relative = safeString(relativePath, 300).replaceAll("\\", "/").replace(/^\/+/, "");
  const parts = relative.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) return null;
  const dir = pluginDir(pluginId);
  const target = path.resolve(dir, ...parts);
  if (target !== dir && !target.startsWith(`${dir}${path.sep}`)) return null;
  return target;
}

/**
 * Resolve an existing file inside a plugin folder for the archimedes-plugin://
 * handler. Returns null for anything that escapes the plugin directory or
 * does not exist.
 */
function resolvePluginFile(id, relativePath) {
  const target = resolvePluginPath(id, relativePath);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

function versionParts(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .replace(/^[^0-9]*/, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** The host gates plugins on a major.minor match: engine ">=0.1" runs on 0.1.x hosts. */
function engineCompatible(engine, hostVersion = HOST_ENGINE) {
  const raw = safeString(engine, 40);
  if (!raw) return true;
  const host = versionParts(hostVersion);
  const required = versionParts(raw);
  if ((host[0] || 0) !== (required[0] || 0)) return (host[0] || 0) > (required[0] || 0);
  return (host[1] || 0) >= (required[1] || 0);
}

function normalizeChecksums(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).slice(0, MAX_PLUGIN_FILES).flatMap(([file, digest]) => {
    const relative = safeString(file, 300).replaceAll("\\", "/").replace(/^\/+/, "");
    const hex = safeString(digest, 128).toLowerCase();
    if (!relative || !/^[a-f0-9]{64}$/.test(hex)) return [];
    return [[relative, hex]];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}

function fileChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Install a ui-plugin from the marketplace feed into userData/plugins/<id>/.
 * Safety model (route A+): official catalog only, SHA-256 checksums for every
 * file, and an engine compatibility gate. No sandbox — documented in #244.
 */
function installUiPlugin(item, { hostVersion = HOST_ENGINE } = {}) {
  if (!item || item.type !== "ui-plugin") throw new Error("Only sidebar plugin packages can be installed this way.");
  if (item.sourceType !== "archimedes") throw new Error("Sidebar plugins can only be installed from the official Archimedes index.");
  if (!engineCompatible(item.engine, hostVersion)) {
    throw new Error(`This plugin needs Archimedes ${safeString(item.engine, 40) || "a newer version"}; update the app first.`);
  }
  const files = Array.isArray(item.files) ? item.files : [];
  if (!files.length) throw new Error("This plugin does not include installable files.");
  if (files.length > MAX_PLUGIN_FILES) throw new Error("This plugin includes too many files.");
  const manifestFile = files.find((file) => file.path === MANIFEST_NAME);
  if (!manifestFile) throw new Error("The plugin package is missing manifest.json.");
  let parsed;
  try {
    parsed = JSON.parse(manifestFile.content);
  } catch {
    throw new Error("The plugin manifest.json is not valid JSON.");
  }
  const validated = validateManifest(parsed);
  if (validated.error) throw new Error(validated.error);
  const manifest = validated.manifest;
  if (!files.some((file) => file.path === manifest.entry)) throw new Error(`The plugin package is missing its entry file (${manifest.entry}).`);
  const checksums = normalizeChecksums(item.checksums);
  if (!checksums) throw new Error("The plugin package does not declare SHA-256 checksums.");
  for (const file of files) {
    const expected = checksums[file.path];
    if (!expected) throw new Error(`The plugin file ${file.path} has no declared checksum.`);
    if (fileChecksum(file.content) !== expected) throw new Error(`The plugin file ${file.path} does not match its checksum.`);
  }
  for (const file of files) {
    if (Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES) throw new Error(`The plugin file ${file.path} is too large.`);
  }
  const target = pluginDir(manifest.id);
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, INSTALL_MARKER))) {
    throw new Error("A plugin with the same id already exists in this location.");
  }
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    const destination = resolvePluginPath(manifest.id, file.path);
    if (!destination) throw new Error("The plugin package contains an unsafe file path.");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, "utf8");
  }
  fs.writeFileSync(path.join(target, INSTALL_MARKER), `${JSON.stringify({
    id: item.id,
    pluginId: manifest.id,
    version: manifest.version,
    sourceId: item.sourceId || "archimedes",
    source: item.source || "Archimedes index",
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  return { item, path: target, scope: "app" };
}

function listPlugins() {
  const state = readState();
  const root = rootDir();
  const results = [];
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const read = readManifest(entry.name);
    if (read.error) {
      results.push({ id: entry.name, name: entry.name, version: "", section: "", icon: "puzzle", entry: "", enabled: false, error: read.error, path: pluginDir(entry.name) });
      continue;
    }
    const marker = path.join(pluginDir(entry.name), INSTALL_MARKER);
    let installedAt = "";
    let source = "";
    try {
      const parsed = JSON.parse(fs.readFileSync(marker, "utf8"));
      installedAt = safeString(parsed.installedAt, 40);
      source = safeString(parsed.source, 120);
    } catch {
      // A plugin without a marker (e.g. sideloaded) still loads; it just has no provenance.
    }
    results.push({
      ...read.manifest,
      enabled: !state.disabled[read.manifest.id],
      installedAt,
      source,
      path: pluginDir(entry.name),
    });
  }
  return results.sort((left, right) => left.name.localeCompare(right.name));
}

function installedIndex() {
  const index = new Map();
  for (const plugin of listPlugins()) {
    if (plugin.error || !plugin.version) continue;
    index.set(`archimedes/${plugin.id}`, { version: plugin.version, path: plugin.path, scope: "app" });
  }
  return index;
}

function setEnabled(id, enabled) {
  const pluginId = safePluginId(id);
  if (!pluginId) throw new Error("Choose a plugin to update.");
  const state = readState();
  if (enabled) delete state.disabled[pluginId];
  else state.disabled[pluginId] = true;
  writeState(state);
  return listPlugins();
}

function removePlugin(id) {
  const pluginId = safePluginId(id);
  if (!pluginId) throw new Error("Choose a plugin to remove.");
  const target = pluginDir(pluginId);
  if (fs.existsSync(target)) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(`${path.resolve(rootDir())}${path.sep}`)) throw new Error("The plugin path is invalid.");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  const state = readState();
  delete state.disabled[pluginId];
  writeState(state);
  return listPlugins();
}

module.exports = {
  HOST_ENGINE,
  ICONS,
  initialize,
  installUiPlugin,
  engineCompatible,
  listPlugins,
  installedIndex,
  normalizeChecksums,
  readManifest,
  removePlugin,
  resolvePluginFile,
  resolvePluginPath,
  safePluginId,
  setEnabled,
  validateManifest,
};
