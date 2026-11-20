const fs = require("node:fs");
const path = require("node:path");
const { buildModelRequestOptions, formatConnectionError, sanitizeHeaders, sanitizeSessionHeader } = require("./model-request-headers.cjs");
const { readModelResponseJson } = require("./model-response-json.cjs");

const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const OPENCODE_GO_SESSION_HEADER = { name: "x-opencode-session", strategy: "thread" };
const OPENCODE_GO_USER_AGENT = `Archimedes/${require("../package.json").version}`;
const PROVIDERS = new Set(["openai", "anthropic", "gemini", "glm", "minimax", "deepseek", "qwen", "moonshot", "openrouter", "opencode-go", "custom"]);
const ROLES = new Set(["agent", "proactive"]);
let configPath = "";

function normalizeRole(role) {
  return ROLES.has(role) ? role : "agent";
}

function environmentConfig() {
  const legacyPrefix = ["AX", "IOM_LLM_"].join("");
  const read = (name) => process.env[`ARCHIMEDES_LLM_${name}`] || process.env[`${legacyPrefix}${name}`] || "";
  const baseUrl = trimBaseUrl(read("BASE_URL") || "https://api.openai.com/v1");
  const provider = normalizeProvider("custom", baseUrl);
  return {
    provider,
    baseUrl,
    model: read("MODEL") || "gpt-4.1-mini",
    apiKey: read("API_KEY"),
    ...(provider === "opencode-go" ? { sessionHeader: OPENCODE_GO_SESSION_HEADER, userAgent: OPENCODE_GO_USER_AGENT } : {}),
  };
}

function initializeModelConfig(userDataPath) {
  configPath = path.join(userDataPath, "model-config.json");
}

function readSavedConfig() {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    // v1 stored one flat config. v2 stores named roles so Proactive can use a
    // different (usually cheaper) model from the main research Agent.
    if (Object.hasOwn(parsed, "agent") || Object.hasOwn(parsed, "proactive")) {
      return {
        agent: parsed.agent && typeof parsed.agent === "object" ? parsed.agent : null,
        proactive: parsed.proactive && typeof parsed.proactive === "object" ? parsed.proactive : null,
      };
    }
    return { agent: parsed, proactive: null };
  } catch {
    return null;
  }
}

function readRoleConfig(role) {
  const saved = readSavedConfig();
  return saved ? saved[normalizeRole(role)] : null;
}

function writeSavedConfig(saved) {
  if (!configPath) throw new Error("Model configuration storage is not ready.");
  const next = {};
  if (saved.agent) next.agent = saved.agent;
  if (saved.proactive) next.proactive = saved.proactive;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(configPath, 0o600); } catch { /* Windows and some filesystems ignore POSIX modes. */ }
}

function trimBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeBaseUrl(value) {
  const baseUrl = trimBaseUrl(value);
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

function normalizeProvider(provider, baseUrl) {
  // Earlier versions used Custom for this exact OpenCode Go endpoint.
  if (provider === "custom" && baseUrl === OPENCODE_GO_BASE_URL) return "opencode-go";
  return PROVIDERS.has(provider) ? provider : "custom";
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

function modelListUrl(provider, baseUrl) {
  const endpoint = new URL(normalizeBaseUrl(baseUrl));
  if (provider === "opencode-go" && baseUrl === OPENCODE_GO_BASE_URL) {
    return "https://opencode.ai/inference/go/v1/models";
  }
  if (provider === "qwen" && endpoint.hostname === "dashscope.aliyuncs.com" && endpoint.pathname.includes("compatible-mode")) {
    return "https://dashscope.aliyuncs.com/api/v1/models?providers=qwen&page_size=100";
  }
  return `${endpoint.toString().replace(/\/$/, "")}/models`;
}

function extractModelIds(payload) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.output?.models)
      ? payload.output.models
      : [];
  return [...new Set(candidates.map((entry) => String(entry?.id || entry?.model || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function getActiveModelConfig(role = "agent") {
  const normalizedRole = normalizeRole(role);
  const fallback = environmentConfig();
  const own = readRoleConfig(normalizedRole);
  const inherited = normalizedRole === "proactive" && !own ? readRoleConfig("agent") : null;
  const saved = own || inherited;
  if (!saved) return { ...fallback, role: normalizedRole, inheritedFromAgent: false };
  const baseUrl = trimBaseUrl(saved.baseUrl || fallback.baseUrl);
  const provider = normalizeProvider(saved.provider, baseUrl);
  return {
    provider,
    baseUrl,
    model: saved.model || fallback.model,
    apiKey: saved.apiKey || fallback.apiKey,
    headers: sanitizeHeaders(saved.headers),
    sessionHeader: sanitizeSessionHeader(saved.sessionHeader === undefined && provider === "opencode-go"
      ? OPENCODE_GO_SESSION_HEADER : saved.sessionHeader),
    userAgent: typeof saved.userAgent === "string" ? saved.userAgent.slice(0, 300)
      : provider === "opencode-go" ? OPENCODE_GO_USER_AGENT : "",
    role: normalizedRole,
    inheritedFromAgent: Boolean(inherited),
  };
}

function connectionSettings(input, current, provider, baseUrl) {
  const sameConnection = current.provider === provider && current.baseUrl === baseUrl;
  const saved = sameConnection ? current : {};
  const defaults = provider === "opencode-go" && !sameConnection
    ? { sessionHeader: OPENCODE_GO_SESSION_HEADER, userAgent: OPENCODE_GO_USER_AGENT }
    : saved;
  const sessionHeader = input.sessionHeader === undefined ? defaults.sessionHeader : input.sessionHeader;
  const fixedValue = saved.sessionHeader?.strategy === "fixed" &&
    saved.sessionHeader.name.toLowerCase() === String(sessionHeader?.name || "").trim().toLowerCase()
    ? saved.sessionHeader.value : "";
  return {
    apiKey: String(input.apiKey || "").trim() || saved.apiKey || "",
    headers: sanitizeHeaders(input.headers === undefined ? saved.headers : input.headers),
    sessionHeader: sanitizeSessionHeader(sessionHeader?.strategy === "fixed" && sessionHeader.value === undefined
      ? { ...sessionHeader, value: fixedValue }
      : sessionHeader),
    userAgent: typeof input.userAgent === "string" ? input.userAgent.trim().slice(0, 300) : defaults.userAgent || "",
  };
}

async function listProviderModels(input = {}, role = "agent") {
  const current = getActiveModelConfig(role);
  const baseUrl = normalizeBaseUrl(input.baseUrl || current.baseUrl);
  const provider = normalizeProvider(PROVIDERS.has(input.provider) ? input.provider : current.provider, baseUrl);
  const config = connectionSettings(input, current, provider, baseUrl);
  if (!config.apiKey && provider !== "openrouter" && provider !== "opencode-go") throw new Error("Enter or save this provider's API key before refreshing its live model catalog.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const requestOptions = buildModelRequestOptions(config, "archimedes-model-catalog", {
      baseHeaders: { Accept: "application/json" },
      anthropic: provider === "anthropic",
    });
    const response = await fetch(modelListUrl(provider, baseUrl), { ...requestOptions, signal: controller.signal });
    if (!response.ok) throw new Error(`Model catalog request failed (${response.status}).`);
    const models = extractModelIds(await readModelResponseJson(response));
    if (!models.length) throw new Error("The provider returned no compatible chat models.");
    return { models, source: "live" };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Model catalog request timed out after 15 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getPublicModelConfig(role = "agent") {
  const normalizedRole = normalizeRole(role);
  const config = getActiveModelConfig(normalizedRole);
  const own = readRoleConfig(normalizedRole);
  const inherited = normalizedRole === "proactive" && !own && Boolean(readRoleConfig("agent"));
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    hasCustomHeaders: Boolean(Object.keys(config.headers || {}).length),
    sessionHeader: config.sessionHeader ? {
      name: config.sessionHeader.name,
      strategy: config.sessionHeader.strategy,
      hasValue: Boolean(config.sessionHeader.value),
    } : null,
    userAgent: config.userAgent,
    source: own ? "saved" : inherited ? "agent" : "environment",
    role: normalizedRole,
    inheritedFromAgent: inherited,
  };
}

function saveModelConfig(input = {}, role = "agent") {
  if (!configPath) throw new Error("Model configuration storage is not ready.");
  const normalizedRole = normalizeRole(role);
  const saved = readSavedConfig() ?? { agent: null, proactive: null };
  if (normalizedRole === "proactive" && input.useAgent === true) {
    saved.proactive = null;
    writeSavedConfig(saved);
    return getPublicModelConfig("proactive");
  }
  const previous = getActiveModelConfig(normalizedRole);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const provider = normalizeProvider(input.provider, baseUrl);
  const model = validateModelId(baseUrl, input.model);
  const connection = connectionSettings(input, previous, provider, baseUrl);
  if (!connection.apiKey || connection.apiKey.length > 2_000) throw new Error("Enter a valid API key.");
  saved[normalizedRole] = { provider, baseUrl, model, ...connection };
  writeSavedConfig(saved);
  return getPublicModelConfig(normalizedRole);
}

async function testModelConfig(input = null, role = "agent") {
  const current = getActiveModelConfig(role);
  const baseUrl = normalizeBaseUrl(input?.baseUrl || current.baseUrl);
  const provider = normalizeProvider(PROVIDERS.has(input?.provider) ? input.provider : current.provider, baseUrl);
  const candidate = {
    provider,
    baseUrl,
    model: validateModelId(baseUrl, input?.model || current.model),
    ...connectionSettings(input || {}, current, provider, baseUrl),
  };
  if (!candidate.apiKey) throw new Error("Add an API key before testing the connection.");
  if (!candidate.model) throw new Error("Add a model name before testing the connection.");

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const anthropic = candidate.provider === "anthropic";
    const requestOptions = buildModelRequestOptions(candidate, "archimedes-connection-test", {
      anthropic,
      baseHeaders: { "Content-Type": "application/json" },
    });
    const response = await fetch(`${candidate.baseUrl.replace(/\/+$/, "")}/${anthropic ? "messages" : "chat/completions"}`, {
      method: "POST",
      ...requestOptions,
      body: JSON.stringify({ model: candidate.model, messages: [{ role: "user", content: "Reply with OK." }], stream: false, ...(anthropic ? { max_tokens: 32 } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(formatConnectionError(response.status, await response.text(), candidate));
    }
    const body = await readModelResponseJson(response);
    if (anthropic ? !Array.isArray(body?.content) : !body?.choices?.[0]?.message) throw new Error("The endpoint responded, but did not return a compatible message.");
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
  listProviderModels,
  saveModelConfig,
  testModelConfig,
  extractModelIds,
  normalizeRole,
  validateModelId,
};
