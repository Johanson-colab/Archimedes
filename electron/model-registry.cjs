const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const ROLES = new Set(["agent", "proactive"]);
let registryPath = "";
let cache = null;

function normalizeRole(role) {
  return ROLES.has(role) ? role : "agent";
}

function emptyRegistry() {
  return { version: 1, models: [], roles: { agent: null, proactive: null } };
}

function initializeModelRegistry(userDataPath) {
  registryPath = path.join(userDataPath, "model-registry.json");
  cache = null;
}

function readRegistry() {
  if (!registryPath) throw new Error("Model registry storage is not ready.");
  if (cache) return cache;
  let data = emptyRegistry();
  const exists = fs.existsSync(registryPath);
  try {
    if (exists) {
      const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      if (parsed && Array.isArray(parsed.models)) {
        data = {
          version: 1,
          models: parsed.models.filter((model) => model && typeof model.id === "string" && model.id),
          roles: {
            agent: typeof parsed.roles?.agent === "string" ? parsed.roles.agent : null,
            proactive: typeof parsed.roles?.proactive === "string" ? parsed.roles.proactive : null,
          },
        };
      }
    }
  } catch {
    data = emptyRegistry();
  }
  if (!exists) migrateLegacyConfigs(data);
  cache = data;
  return cache;
}

function writeRegistry(data) {
  if (!registryPath) throw new Error("Model registry storage is not ready.");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const temporaryPath = `${registryPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, registryPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
  cache = data;
  return data;
}

function readLegacyRoleConfigs() {
  const legacyPath = path.join(path.dirname(registryPath), "model-config.json");
  if (!fs.existsSync(legacyPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (Object.hasOwn(parsed, "agent") || Object.hasOwn(parsed, "proactive")) {
      return { agent: parsed.agent || null, proactive: parsed.proactive || null };
    }
    return { agent: parsed, proactive: null };
  } catch {
    return null;
  }
}

function migrateLegacyConfigs(registry) {
  const legacy = readLegacyRoleConfigs();
  if (!legacy) return;
  let changed = false;
  for (const role of ["agent", "proactive"]) {
    const config = legacy[role];
    if (!config || !config.baseUrl || !config.model || !config.apiKey) continue;
    const id = `legacy-${role}`;
    registry.models.push({
      id,
      label: config.model,
      provider: config.provider || "custom",
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      headers: config.headers || {},
      sessionHeader: config.sessionHeader,
      userAgent: config.userAgent,
      contextWindowTokens: 0,
      maxOutputTokens: 0,
      capabilities: {},
    });
    registry.roles[role] = id;
    changed = true;
  }
  if (changed) writeRegistry(registry);
}

function publicConnectionSettings(model) {
  return {
    hasApiKey: Boolean(model.apiKey),
    hasCustomHeaders: Boolean(Object.keys(model.headers || {}).length),
    sessionHeader: model.sessionHeader ? {
      name: model.sessionHeader.name,
      strategy: model.sessionHeader.strategy,
      hasValue: Boolean(model.sessionHeader.value),
    } : null,
    userAgent: model.userAgent || "",
  };
}

function publicProfile(model) {
  if (!model) return null;
  return {
    id: model.id,
    label: model.label || model.model,
    provider: model.provider || "custom",
    baseUrl: model.baseUrl || "",
    model: model.model || "",
    ...publicConnectionSettings(model),
    contextWindowTokens: Number(model.contextWindowTokens) || 0,
    maxOutputTokens: Number(model.maxOutputTokens) || 0,
    capabilities: model.capabilities || {},
  };
}

function listModels() {
  return readRegistry().models;
}

function getModel(id) {
  const model = readRegistry().models.find((item) => item.id === id);
  return model || null;
}

function getPublicModel(id) {
  return publicProfile(getModel(id));
}

function saveModel(input = {}, role) {
  const registry = readRegistry();
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID();
  if (id.length > 200 || /[\r\n\0]/.test(id)) throw new Error("Enter a valid model ID.");
  const label = String(input.label || input.model || "Model").trim().slice(0, 120);
  if (!label) throw new Error("Enter a model name.");
  const existing = registry.models.find((model) => model.id === id) || {};
  const model = {
    ...existing,
    id,
    label,
    provider: input.provider || existing.provider || "custom",
    baseUrl: input.baseUrl || existing.baseUrl || "",
    model: input.model || existing.model || "",
    apiKey: input.apiKey || existing.apiKey || "",
    headers: input.headers || existing.headers || {},
    sessionHeader: input.sessionHeader === undefined ? (existing.sessionHeader || null) : input.sessionHeader,
    userAgent: input.userAgent === undefined ? (existing.userAgent || "") : input.userAgent,
    contextWindowTokens: Number(input.contextWindowTokens ?? existing.contextWindowTokens) || 0,
    maxOutputTokens: Number(input.maxOutputTokens ?? existing.maxOutputTokens) || 0,
    capabilities: input.capabilities || existing.capabilities || {},
  };
  const models = existing.id ? registry.models.map((item) => item.id === id ? model : item) : [...registry.models, model];
  const roles = role === undefined ? registry.roles : { ...registry.roles, [normalizeRole(role)]: id };
  writeRegistry({ ...registry, models, roles });
  return publicProfile(model);
}

function deleteModel(id) {
  const registry = readRegistry();
  const models = registry.models.filter((model) => model.id !== id);
  const roles = Object.fromEntries(Object.entries(registry.roles).map(([role, modelId]) => [role, modelId === id ? null : modelId]));
  writeRegistry({ ...registry, models, roles });
  return true;
}

function setRoleModel(role, id) {
  const normalizedRole = normalizeRole(role);
  const registry = readRegistry();
  if (id !== null && !registry.models.some((model) => model.id === id)) throw new Error("The selected model is not in the registry.");
  writeRegistry({ ...registry, roles: { ...registry.roles, [normalizedRole]: id } });
  return getPublicModel(id);
}

function getRoleModel(role) {
  const registry = readRegistry();
  const id = registry.roles[normalizeRole(role)];
  return id ? getModel(id) : null;
}

function getRoleAssignments() {
  return { ...readRegistry().roles };
}

module.exports = {
  deleteModel,
  getModel,
  getPublicModel,
  getRoleModel,
  getRoleAssignments,
  initializeModelRegistry,
  listModels,
  publicConnectionSettings,
  publicProfile,
  saveModel,
  setRoleModel,
};
