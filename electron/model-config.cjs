const { buildModelRequestOptions, formatConnectionError, sanitizeHeaders, sanitizeSessionHeader } = require("./model-request-headers.cjs");
const { readModelResponseJson } = require("./model-response-json.cjs");
const modelRegistry = require("./model-registry.cjs");
const { completeResponses } = require("./agent/openai-responses.cjs");
const { isOfficialOpenAI, openAIWorkModel } = require("./agent/openai-work-models.cjs");

const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const OPENCODE_GO_SESSION_HEADER = { name: "x-opencode-session", strategy: "thread" };
const OPENCODE_GO_USER_AGENT = `Archimedes/${require("../package.json").version}`;
const PROVIDERS = new Set(["openai", "anthropic", "gemini", "glm", "minimax", "deepseek", "qwen", "moonshot", "openrouter", "opencode-go", "custom"]);
const ROLES = new Set(["agent", "proactive"]);

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

function initializeModelConfig(userDataPath, safeStorage) {
  modelRegistry.initializeModelRegistry(userDataPath, safeStorage);
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
  const own = modelRegistry.getRoleModel(normalizedRole);
  const inherited = normalizedRole === "proactive" && !own ? modelRegistry.getRoleModel("agent") : null;
  const saved = own || inherited;
  if (!saved) return { ...fallback, role: normalizedRole, inheritedFromAgent: false, modelId: "", modelLabel: "", contextWindowTokens: 0, maxOutputTokens: 0, capabilities: {} };
  return {
    ...resolveStoredConnection({
      ...saved,
      baseUrl: saved.baseUrl || fallback.baseUrl,
      model: saved.model || fallback.model,
      apiKey: saved.apiKey || fallback.apiKey,
    }),
    modelId: saved.id,
    modelLabel: saved.label || "",
    contextWindowTokens: saved.contextWindowTokens || 0,
    maxOutputTokens: saved.maxOutputTokens || 0,
    capabilities: saved.capabilities || {},
    role: normalizedRole,
    inheritedFromAgent: Boolean(inherited),
  };
}

function resolveStoredConnection(saved) {
  const baseUrl = trimBaseUrl(saved.baseUrl);
  const provider = normalizeProvider(saved.provider, baseUrl);
  return {
    ...saved,
    provider,
    baseUrl,
    headers: sanitizeHeaders(saved.headers),
    sessionHeader: sanitizeSessionHeader(saved.sessionHeader === undefined && provider === "opencode-go"
      ? OPENCODE_GO_SESSION_HEADER : saved.sessionHeader),
    userAgent: typeof saved.userAgent === "string" ? saved.userAgent.slice(0, 300)
      : provider === "opencode-go" ? OPENCODE_GO_USER_AGENT : "",
  };
}

function connectionSettings(input, current, provider, baseUrl) {
  const sameConnection = current?.provider === provider && current.baseUrl === baseUrl;
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
  const current = profileForInput(input, role);
  const baseUrl = normalizeBaseUrl(input.baseUrl || current?.baseUrl);
  const provider = normalizeProvider(PROVIDERS.has(input.provider) ? input.provider : current?.provider, baseUrl);
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
    const ids = extractModelIds(await readModelResponseJson(response));
    const models = input.purpose === "work" && isOfficialOpenAI({ provider, baseUrl }) ? ids.filter(openAIWorkModel) : ids;
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
  const own = modelRegistry.getRoleModel(normalizedRole);
  const inherited = normalizedRole === "proactive" && !own && Boolean(modelRegistry.getRoleModel("agent"));
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    ...modelRegistry.publicConnectionSettings(config),
    modelId: config.modelId,
    modelLabel: config.modelLabel,
    sharedAcrossRoles: Boolean(own && Object.values(modelRegistry.getRoleAssignments()).every((id) => id === own.id)),
    contextWindowTokens: config.contextWindowTokens,
    maxOutputTokens: config.maxOutputTokens,
    capabilities: config.capabilities,
    source: own ? "saved" : inherited ? "agent" : "environment",
    role: normalizedRole,
    inheritedFromAgent: inherited,
  };
}

function profileForInput(input, role) {
  if (input?.id === null) return null;
  if (typeof input?.id === "string") {
    const profile = modelRegistry.getModel(input.id);
    if (!profile) throw new Error("The selected model is not in the registry.");
    return resolveStoredConnection(profile);
  }
  return getActiveModelConfig(role);
}

function getAgentModelConfig(profileId) {
  if (profileId === undefined) return getActiveModelConfig();
  if (typeof profileId !== "string" || !profileId || profileId.length > 200) throw new Error("Choose a saved model profile.");
  const profile = profileForInput({ id: profileId }, "agent");
  if (!profile.apiKey) throw new Error("The selected model profile needs an API key.");
  return { ...profile, modelId: profile.id };
}

function saveProfile(input, previous, role) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const provider = normalizeProvider(input.provider, baseUrl);
  const model = validateModelId(baseUrl, input.model);
  const connection = connectionSettings(input, previous, provider, baseUrl);
  if (!connection.apiKey || connection.apiKey.length > 2_000) throw new Error("Enter a valid API key.");
  const previousLabel = previous?.label || previous?.modelLabel;
  return modelRegistry.saveModel({
    id: input.id === null ? undefined : (input.id || (previous?.inheritedFromAgent ? undefined : previous?.id || previous?.modelId)),
    label: input.label || (previousLabel === previous?.model ? model : previousLabel) || model,
    provider,
    baseUrl,
    model,
    ...connection,
    contextWindowTokens: Number(input.contextWindowTokens ?? previous?.contextWindowTokens) || 0,
    maxOutputTokens: Number(input.maxOutputTokens ?? previous?.maxOutputTokens) || 0,
    capabilities: input.capabilities || previous?.capabilities || {},
  }, role);
}

function saveModelConfig(input = {}, role = "agent") {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "proactive" && input.useAgent === true) {
    modelRegistry.setRoleModel("proactive", null);
  } else {
    const previous = profileForInput(input, normalizedRole);
    const assignments = modelRegistry.getRoleAssignments();
    const shared = assignments.agent && assignments.agent === assignments.proactive;
    // The basic editor saves independently per role. Only an explicit profile
    // edit from the advanced UI changes a profile assigned to both roles.
    saveProfile(input.id === undefined && shared ? { ...input, id: null } : input, previous, normalizedRole);
  }
  return getPublicModelConfig(normalizedRole);
}

function saveModelProfile(input = {}) {
  const previous = modelRegistry.getModel(input.id);
  return saveProfile(input, previous ? resolveStoredConnection(previous) : null);
}

function listModelProfiles() {
  return modelRegistry.listModels().map((profile) => modelRegistry.publicProfile(resolveStoredConnection(profile)));
}

async function testModelConfig(input = null, role = "agent") {
  const current = profileForInput(input, role);
  const baseUrl = normalizeBaseUrl(input?.baseUrl || current?.baseUrl);
  const provider = normalizeProvider(PROVIDERS.has(input?.provider) ? input.provider : current?.provider, baseUrl);
  const candidate = {
    provider,
    baseUrl,
    model: validateModelId(baseUrl, input?.model || current?.model),
    ...connectionSettings(input || {}, current, provider, baseUrl),
  };
  if (!candidate.apiKey) throw new Error("Add an API key before testing the connection.");
  if (!candidate.model) throw new Error("Add a model name before testing the connection.");

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const profile = isOfficialOpenAI(candidate) ? openAIWorkModel(candidate.model) : null;
    if (profile?.endpoint === "responses") {
      await completeResponses(candidate, { ...profile, stream: false }, [{ role: "user", content: "Reply with OK." }], {
        signal: controller.signal, sessionId: "archimedes-connection-test", tools: [], effort: profile.efforts[0], onTextDelta: () => {},
      });
      return { ok: true, latencyMs: Date.now() - startedAt, resolvedModel: candidate.model };
    }
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
      resolvedModel: candidate.model,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Connection test timed out after 25 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  deleteModelProfile: modelRegistry.deleteModel,
  getActiveModelConfig,
  getAgentModelConfig,
  getPublicModelConfig,
  getRoleAssignments: modelRegistry.getRoleAssignments,
  initializeModelConfig,
  listModelProfiles,
  listProviderModels,
  saveModelProfile,
  saveModelConfig,
  setRoleModel: modelRegistry.setRoleModel,
  testModelConfig,
  extractModelIds,
  normalizeRole,
  validateModelId,
};
