const fs = require("node:fs");
const path = require("node:path");
const venues = require("./paper-review-venues.cjs");

const SETTINGS_FILE = "paper-review-settings.json";
const SETTINGS_VERSION = 1;
const PROVIDERS = new Set(["openai", "anthropic", "gemini", "glm", "minimax", "deepseek", "qwen", "moonshot", "openrouter", "custom"]);

let settingsPath = "";
let settings = null;

function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    defaultVenueId: venues.publicVenues()[0]?.id || "iclr-2026-main",
    concurrency: 3,
    model: {
      mode: "agent",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "",
      apiKey: "",
    },
  };
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Enter a valid model API base URL.");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Model APIs must use HTTPS, except for localhost development servers.");
  }
  return baseUrl;
}

function normalize(input = {}) {
  const base = defaultSettings();
  const source = input && typeof input === "object" ? input : {};
  const modelSource = source.model && typeof source.model === "object" ? source.model : {};
  const defaultVenueId = venues.publicVenues().some((venue) => venue.id === source.defaultVenueId)
    ? String(source.defaultVenueId)
    : base.defaultVenueId;
  const provider = PROVIDERS.has(modelSource.provider) ? modelSource.provider : base.model.provider;
  return {
    version: SETTINGS_VERSION,
    defaultVenueId,
    concurrency: Math.min(8, Math.max(1, Number(source.concurrency) || base.concurrency)),
    model: {
      mode: modelSource.mode === "custom" ? "custom" : "agent",
      provider,
      baseUrl: normalizeBaseUrl(modelSource.baseUrl || base.model.baseUrl),
      model: String(modelSource.model ?? base.model.model).trim().slice(0, 160),
      apiKey: String(modelSource.apiKey ?? base.model.apiKey).trim().slice(0, 2_000),
    },
  };
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalize(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaultSettings();
  }
  return getPublicSettings();
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(settingsPath, 0o600); } catch { /* Windows ignores POSIX modes. */ }
}

function getPrivateSettings() {
  if (!settings) settings = defaultSettings();
  return structuredClone(settings);
}

function getPublicSettings() {
  const current = getPrivateSettings();
  return {
    ...current,
    model: {
      ...current.model,
      apiKey: "",
      configured: current.model.mode === "agent" || Boolean(current.model.apiKey),
    },
  };
}

function saveSettings(patch = {}) {
  const current = getPrivateSettings();
  const incoming = patch && typeof patch === "object" ? patch : {};
  const modelPatch = incoming.model && typeof incoming.model === "object" ? incoming.model : {};
  const next = {
    ...current,
    defaultVenueId: incoming.defaultVenueId ?? current.defaultVenueId,
    concurrency: incoming.concurrency ?? current.concurrency,
    model: {
      ...current.model,
      ...modelPatch,
      // A blank secret means "keep the saved key", matching the other local
      // provider settings. An explicit empty key is never persisted.
      apiKey: modelPatch.apiKey ? modelPatch.apiKey : current.model.apiKey,
    },
  };
  settings = normalize(next);
  persist();
  return getPublicSettings();
}

function clearApiKey() {
  const current = getPrivateSettings();
  settings = normalize({ ...current, model: { ...current.model, apiKey: "" } });
  persist();
  return getPublicSettings();
}

module.exports = {
  PROVIDERS,
  initialize,
  getPrivateSettings,
  getPublicSettings,
  saveSettings,
  clearApiKey,
  normalize,
  normalizeBaseUrl,
};
