const fs = require("node:fs");
const path = require("node:path");

const PROVIDERS = new Set(["openai", "deepseek", "qwen", "moonshot", "openrouter", "custom"]);
let configPath = "";

function environmentConfig() {
  const legacyPrefix = ["AX", "IOM_LLM_"].join("");
  const read = (name) => process.env[`ARCHIMEDES_LLM_${name}`] || process.env[`${legacyPrefix}${name}`] || "";
  return {
    provider: "custom",
    baseUrl: read("BASE_URL") || "https://api.openai.com/v1",
    model: read("MODEL") || "gpt-4.1-mini",
    apiKey: read("API_KEY"),
  };
}

function initializeModelConfig(userDataPath) {
  configPath = path.join(userDataPath, "model-config.json");
}

function readSavedConfig() {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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

function validateModelId(baseUrl, value) {
  const model = String(value || "").trim();
  if (!model || model.length > 160) throw new Error("Enter a model name of at most 160 characters.");
  const hostname = new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
  if ((hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai")) && !model.includes("/")) {
    throw new Error(`OpenRouter model IDs must include the provider prefix, for example openai/${model}.`);
  }
  return model;
}

function getActiveModelConfig() {
  const saved = readSavedConfig();
  const fallback = environmentConfig();
  if (!saved) return fallback;
  return {
    provider: PROVIDERS.has(saved.provider) ? saved.provider : "custom",
    baseUrl: saved.baseUrl || fallback.baseUrl,
    model: saved.model || fallback.model,
    apiKey: saved.apiKey || fallback.apiKey,
  };
}

function getPublicModelConfig() {
  const config = getActiveModelConfig();
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    source: readSavedConfig() ? "saved" : "environment",
  };
}

function saveModelConfig(input = {}) {
  if (!configPath) throw new Error("Model configuration storage is not ready.");
  const previous = getActiveModelConfig();
  const provider = PROVIDERS.has(input.provider) ? input.provider : "custom";
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = validateModelId(baseUrl, input.model);
  const apiKey = String(input.apiKey || "").trim() || previous.apiKey;
  if (!apiKey || apiKey.length > 2_000) throw new Error("Enter a valid API key.");
  const config = { provider, baseUrl, model, apiKey };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch { /* Windows and some filesystems ignore POSIX modes. */ }
  return getPublicModelConfig();
}

async function testModelConfig(input = null) {
  const current = getActiveModelConfig();
  const candidate = input && typeof input === "object" ? {
    provider: PROVIDERS.has(input.provider) ? input.provider : "custom",
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: validateModelId(input.baseUrl || current.baseUrl, input.model || current.model),
    apiKey: String(input.apiKey || "").trim() || current.apiKey,
  } : current;
  if (!candidate.apiKey) throw new Error("Add an API key before testing the connection.");
  if (!candidate.model) throw new Error("Add a model name before testing the connection.");

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${candidate.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${candidate.apiKey}` },
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: "user", content: "Reply with OK." }],
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Connection failed (${response.status}): ${detail}`);
    }
    const body = await response.json();
    if (!body?.choices?.[0]?.message) throw new Error("The endpoint responded, but did not return an OpenAI-compatible message.");
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      resolvedModel: String(body.model || candidate.model),
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Connection test timed out after 25 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getActiveModelConfig,
  getPublicModelConfig,
  initializeModelConfig,
  saveModelConfig,
  testModelConfig,
  validateModelId,
};
