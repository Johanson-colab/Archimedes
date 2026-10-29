const { complete } = require("./agent.cjs");
const { getActiveModelConfig } = require("./model-config.cjs");

const SOURCES = new Set(["search", "selection", "latex", "citation", "reader", "repo", "library", "chat"]);
const OPEN_TARGETS = new Set(["chat", "library", "daily", "writing", "artifacts"]);

function clip(value, limit) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

function parseJson(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function buildReplyMessages(input = {}) {
  const system = [
    "You are Proactive agent, a quiet research sidekick inside Archimedes.",
    "Answer the user's reply directly in 1-3 short paragraphs, in the same language as the user.",
    "Use only the supplied app context. Never invent evidence, files, results, or actions.",
    "You cannot open, edit, run, or save anything. If the user asks for an action, offer the smallest safe draft or next step and say it needs confirmation.",
    "No markdown tables. No filler. Be specific and calm.",
  ].join("\n");
  const context = input.context && typeof input.context === "object" ? input.context : {};
  return [
    { role: "system", content: system },
    { role: "user", content: `App context:\n${JSON.stringify(context)}\n\nUser reply:\n${clip(input.prompt, 4_000)}` },
  ];
}

function buildObservationMessages(context = {}) {
  const system = [
    "You are the observer, judge, and tutor for Proactive agent, a quiet research sidekick inside Archimedes.",
    "Decide whether exactly one short suggestion is worth showing now. Silence is the default.",
    "Return JSON only, with no markdown fences:",
    '{"shouldSuggest":true|false,"source":"search|selection|latex|citation|reader|repo|library|chat","title":"one sentence","whyNow":"why this is useful right now, grounded in the supplied activity and context","evidenceIds":["evidence-id"],"confidence":0.0,"action":{"kind":"insert|copy|open","label":"short verb","text":"draft only","target":"chat|library|daily|writing|artifacts"}}',
    "Rules:",
    "- evidenceIds must contain at least one id from context.evidence. Never invent an id or an evidence label.",
    "- whyNow must describe what the context actually shows, including the activity signal when relevant.",
    "- Prefer insert/copy actions. You cannot execute anything; text is a draft for the user to confirm.",
    "- Do not repeat a suggestion already listed in context.suggestions unless the new context materially changes it.",
    "- If the user is simply progressing, if evidence is weak, or if the suggestion would interrupt without value, return {\"shouldSuggest\":false}.",
    "- Write title and whyNow in the same language as the latest user message.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `Context:\n${JSON.stringify(context)}` },
  ];
}

function normalizeAction(raw, title, evidenceIds) {
  const source = raw && typeof raw === "object" ? raw : {};
  const label = clip(source.label, 60);
  const kind = source.kind === "open" || source.kind === "copy" || source.kind === "insert" ? source.kind : "insert";
  if (kind === "open") {
    const target = OPEN_TARGETS.has(source.target) ? source.target : "chat";
    return { kind: "open", label: label || "Open", target };
  }
  const text = clip(source.text, 1_200) || clip(title, 1_200);
  return { kind, label: label || (kind === "copy" ? "Copy draft" : "Draft in chat"), text };
}

function normalizeObservation(raw, context = {}) {
  if (!raw || typeof raw !== "object" || raw.shouldSuggest !== true) return null;
  const title = clip(raw.title, 160);
  const whyNow = clip(raw.whyNow, 320);
  if (!title || !whyNow) return null;
  const available = new Set((Array.isArray(context.evidence) ? context.evidence : []).map((item) => item && item.id).filter(Boolean));
  const evidenceIds = Array.isArray(raw.evidenceIds)
    ? [...new Set(raw.evidenceIds.filter((id) => typeof id === "string" && available.has(id)))]
    : [];
  if (!evidenceIds.length) return null;
  const source = SOURCES.has(raw.source) ? raw.source : "chat";
  const confidence = Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.6;
  return {
    shouldSuggest: true,
    source,
    title,
    whyNow,
    evidenceIds,
    confidence,
    action: normalizeAction(raw.action, title, evidenceIds),
  };
}

async function callModel(config, messages, options = {}) {
  if (!config || !config.apiKey) {
    throw new Error("Configure Proactive agent's model in Settings → Proactive model first.");
  }
  if (typeof options.completeFn !== "function") throw new Error("The model runtime is not available.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30_000);
  try {
    const result = await options.completeFn(config, messages, {
      allowTools: false,
      maxOutputTokens: options.maxOutputTokens || 800,
      signal: controller.signal,
    });
    return typeof result?.content === "string" ? result.content : "";
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Proactive model timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runProactiveReply(input = {}, deps = {}) {
  const prompt = clip(input.prompt, 4_000);
  if (!prompt) throw new Error("Write a reply first.");
  const config = deps.config || getActiveModelConfig("proactive");
  const completeFn = deps.complete || complete;
  const content = await callModel(config, buildReplyMessages({ prompt, context: input.context }), {
    completeFn,
    maxOutputTokens: 900,
    timeoutMs: 35_000,
  });
  const text = clip(content, 8_000);
  if (!text) throw new Error("Proactive model returned an empty reply.");
  return { text, model: config.model, provider: config.provider };
}

async function runProactiveObservation(input = {}, deps = {}) {
  const context = input.context && typeof input.context === "object" ? input.context : {};
  const config = deps.config || getActiveModelConfig("proactive");
  const completeFn = deps.complete || complete;
  const content = await callModel(config, buildObservationMessages(context), {
    completeFn,
    maxOutputTokens: 700,
    timeoutMs: 25_000,
  });
  return normalizeObservation(parseJson(content), context);
}

module.exports = {
  buildObservationMessages,
  buildReplyMessages,
  normalizeObservation,
  parseJson,
  runProactiveObservation,
  runProactiveReply,
};
