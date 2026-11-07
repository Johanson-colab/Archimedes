const fs = require("node:fs");
const path = require("node:path");
const { CodexClient } = require("./agent/codex-client.cjs");
const { listNativeModels, resolveNativeModel } = require("./agent/codex-models.cjs");
let configPath;

function initialize(userData) { configPath = path.join(userData, "agent-backend.json"); }
const nativeIds = ["codex", "claude", "opencode"];
function profile(input = {}, backend = "codex") {
  const binary = String(input.binary || backend).trim();
  const model = String(input.model || "").trim();
  const effort = String(input.effort || "").trim();
  const permissionMode = input.permissionMode || "ask";
  if (!(backend === "codex" ? ["ask", "auto-review", "full-access", "read-only", "workspace-write"] : ["ask"]).includes(permissionMode)) throw new Error("Unsupported native permission mode.");
  if (binary !== backend && !path.isAbsolute(binary)) throw new Error("Native executable path must be absolute.");
  if (binary.length > 2000 || model.length > 160 || effort.length > 100 || /[\r\n\0]/.test(binary + model + effort)) throw new Error("Invalid native configuration.");
  return { binary, model, effort, permissionMode };
}
function normalize(input = {}) {
  const backend = input.backend || "api";
  if (!["api", ...nativeIds].includes(backend)) throw new Error("Unknown Agent backend.");
  const selected = backend === "api" ? "codex" : backend;
  const profiles = Object.fromEntries(nativeIds.map(id => [id, profile(input.profiles?.[id], id)]));
  profiles[selected] = profile({ ...profiles[selected], ...Object.fromEntries(["binary", "model", "effort", "permissionMode"].filter(key => input[key] !== undefined).map(key => [key, input[key]])) }, selected);
  return { backend, ...profiles[selected], profiles };
}
function get() {
  if (!configPath) return normalize();
  try { return normalize(JSON.parse(fs.readFileSync(configPath, "utf8"))); }
  catch (error) {
    if (error.code === "ENOENT") return normalize();
    throw new Error("Agent backend configuration is invalid. Repair agent-backend.json in Electron user data; no backend was selected automatically.");
  }
}
function save(input) {
  if (!configPath) throw new Error("Agent backend storage is not initialized.");
  const current = get();
  const backend = input.backend || current.backend;
  const selected = backend === "api" ? "codex" : backend;
  const profiles = { ...current.profiles, ...input.profiles };
  const config = normalize({ ...profiles[selected], ...input, backend, profiles });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}
async function listCodexModelCatalog(input = {}, Client = CodexClient) {
  const config = normalize({ ...input, backend: "codex" });
  const client = new Client({ binary: config.binary });
  try {
    await client.start();
    const models = await listNativeModels(client);
    const effectiveModel = await resolveNativeModel(client, config.model, models);
    return { models, effectiveModelId: effectiveModel?.id };
  } finally { client.close(); }
}
async function check(input = get(), Client = CodexClient) {
  const config = normalize(input);
  if (["claude", "opencode"].includes(config.backend)) return require("./agent/external-backend.cjs").checkNative(config);
  const client = new Client({ binary: config.binary });
  try {
    await client.start();
    const result = await client.request("account/read", { refreshToken: false });
    if (!result?.account) throw new Error("Codex is not signed in. Run codex login in your terminal, then check again.");
    const models = await listNativeModels(client);
    const effectiveModel = await resolveNativeModel(client, config.model, models);
    return { ready: true, models, effectiveModelId: effectiveModel?.id, message: "Codex is connected. Model access is verified only when a turn succeeds." };
  } finally { client.close(); }
}
module.exports = { initialize, get, save, check, listCodexModelCatalog, normalize };
