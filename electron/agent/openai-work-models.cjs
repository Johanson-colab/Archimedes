// The official model cards describe endpoint and function support. The model-list
// API returns IDs and ownership only. Keep dated snapshots on their base profile.
const responses = new Set([
  "gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-sol", "gpt-6-astra",
  "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini",
  "gpt-5.4-nano", "gpt-5.4-pro", "gpt-5.3-codex", "gpt-5.2", "gpt-5.2-pro", "gpt-5.1", "gpt-5",
  "gpt-5-pro", "gpt-5-mini", "gpt-5-nano", "o3", "o3-pro",
]);
const chat = new Set(["chat-latest", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]);
const standardEfforts = ["low", "medium", "high"];
const proEfforts = new Map([
  ["gpt-5-pro", ["high"]], ["gpt-5.2-pro", ["medium", "high"]], ["gpt-5.4-pro", ["medium", "high"]],
  ["gpt-5.5-pro", ["medium", "high"]],
]);
const buffered = new Set(["gpt-5.5-pro", "o3-pro"]);

function isOfficialOpenAI(config) {
  return ["openai", "custom"].includes(config.provider) && (config.baseUrl
    ? config.baseUrl.replace(/\/+$/, "") === "https://api.openai.com/v1" : config.provider === "openai");
}

function openAIWorkModel(model) {
  const base = String(model || "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (responses.has(base)) return { endpoint: "responses", efforts: proEfforts.get(base) || standardEfforts, stream: !buffered.has(base) };
  if (chat.has(base)) return { endpoint: "chat/completions", efforts: [], stream: true };
  return null;
}

module.exports = { isOfficialOpenAI, openAIWorkModel };
