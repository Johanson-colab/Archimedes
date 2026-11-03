const fs = require("node:fs");
const path = require("node:path");
const { CodexClient } = require("./agent/codex-client.cjs");
const { listNativeModels } = require("./agent/codex-models.cjs");
let configPath;

function initialize(userData) { configPath = path.join(userData, "agent-backend.json"); }
function normalize(input = {}) {
  if (input.backend !== undefined && !["api", "codex"].includes(input.backend)) throw new Error("Unknown Agent backend.");
  const binary = String(input.binary || "codex").trim();
  const model = String(input.model || "").trim();
  const effort = String(input.effort || "").trim();
  const permissionMode = input.permissionMode || "read-only";
  if (!["read-only", "workspace-write"].includes(permissionMode)) throw new Error("Unsupported Codex permission mode.");
  if (binary !== "codex" && !path.isAbsolute(binary)) throw new Error("Codex path must be absolute.");
  if (binary.length > 2000 || model.length > 160 || effort.length > 100 || /[\r\n\0]/.test(binary + model + effort)) throw new Error("Invalid Codex configuration.");
  return { backend: input.backend || "api", binary, model, effort, permissionMode };
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
  const config = normalize(input);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}
async function check(input = get(), Client = CodexClient) {
  const config = normalize(input);
  const client = new Client({ binary: config.binary });
  try {
    await client.start();
    const result = await client.request("account/read", { refreshToken: false });
    if (!result?.account) throw new Error("Codex is not signed in. Run codex login in your terminal, then check again.");
    const models = (await listNativeModels(client)).map(({ isDefault, ...model }) => model);
    return { ready: true, models, message: "Codex is connected. Model access is verified only when a turn succeeds." };
  } finally { client.close(); }
}
module.exports = { initialize, get, save, check, normalize };
