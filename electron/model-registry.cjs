const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { settingsSecrets } = require("./security/secrets-store.cjs");

const ROLES = new Set(["agent", "proactive"]);
let registryPath = "";
let cache = null;
let registrySecrets;
let legacySecrets;

function normalizeRole(role) {
  return ROLES.has(role) ? role : "agent";
}

function emptyRegistry() {
  return { version: 1, models: [], roles: { agent: null, proactive: null } };
}

function connectionSecrets(model, change) {
  if (!model || typeof model !== "object") return model;
  const next = { ...model };
  if (Object.hasOwn(model, "apiKey")) next.apiKey = change(model.apiKey);
  if (model.headers && typeof model.headers === "object") {
    next.headers = Object.fromEntries(Object.entries(model.headers).map(([name, value]) => [name, change(value)]));
  }
  if (model.sessionHeader && Object.hasOwn(model.sessionHeader, "value")) {
    next.sessionHeader = { ...model.sessionHeader, value: change(model.sessionHeader.value) };
  }
  return next;
}

function transformLegacy(data, change) {
  if (!Object.hasOwn(data, "agent") && !Object.hasOwn(data, "proactive")) return connectionSecrets(data, change);
  const next = { ...data };
  for (const role of ROLES) if (Object.hasOwn(data, role)) next[role] = connectionSecrets(data[role], change);
  return next;
}

function initializeModelRegistry(userDataPath, safeStorage) {
  registryPath = path.join(userDataPath, "model-registry.json");
  registrySecrets = settingsSecrets(safeStorage, (data, change) => ({
    ...data, models: data.models.map(model => connectionSecrets(model, change)),
  }));
  legacySecrets = settingsSecrets(safeStorage, transformLegacy);
  cache = null;
}

function readRecord(file, legacy = false) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" || (legacy && error instanceof SyntaxError)) return null;
    throw new Error("Model settings could not be opened. The original file was kept.");
  }
}

function readRegistry() {
  if (!registryPath) throw new Error("Model registry storage is not ready.");
  if (cache) return cache;
  const saved = readRecord(registryPath);
  const legacyPath = path.join(path.dirname(registryPath), "model-config.json");
  const legacySaved = readRecord(legacyPath, Boolean(saved));
  const migrateLegacy = legacySaved && legacySecrets.available() && legacySecrets.hasPlaintext(legacySaved);
  const legacy = legacySaved && (!saved || migrateLegacy) ? legacySecrets.open(legacySaved) : null;
  let data = emptyRegistry();
  let original;
  if (saved) {
    if (!Array.isArray(saved.models)) throw new Error("The model registry is invalid. The original file was kept.");
    original = registrySecrets.open(saved);
    data = {
      ...original,
      models: original.models.filter(model => model && typeof model.id === "string" && model.id),
      roles: {
        agent: typeof original.roles?.agent === "string" ? original.roles.agent : null,
        proactive: typeof original.roles?.proactive === "string" ? original.roles.proactive : null,
      },
    };
  } else if (legacy) {
    const roles = Object.hasOwn(legacy, "agent") || Object.hasOwn(legacy, "proactive") ? legacy : { agent: legacy };
    migrateLegacyConfigs(data, roles);
  }
  if (registrySecrets.available() && (saved ? registrySecrets.hasPlaintext(saved) : data.models.length > 0)) {
    registrySecrets.write(registryPath, original || data);
  }
  if (migrateLegacy) legacySecrets.write(legacyPath, legacy);
  cache = data;
  return cache;
}

function writeRegistry(data) {
  if (!registryPath) throw new Error("Model registry storage is not ready.");
  registrySecrets.write(registryPath, data);
  cache = data;
  return data;
}

function migrateLegacyConfigs(registry, legacy) {
  for (const role of ROLES) {
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
  }
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
