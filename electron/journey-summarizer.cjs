const { complete } = require("./agent.cjs");
const { getActiveModelConfig } = require("./model-config.cjs");

const SUMMARY_TIMEOUT_MS = 90_000;

function text(value, limit) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : normalized;
}

function parseSummary(content) {
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

function hasSummaryContent(value) {
  return Boolean(value) && ((typeof value.brief === "string" && value.brief.trim()) || (Array.isArray(value.chapters) && value.chapters.length > 0));
}

function instructionForLength(length) {
  if (length === "concise") return "Keep the brief to 1-2 sentences and each chapter summary to one sentence.";
  if (length === "detailed") return "Write a 4-6 sentence brief and 2-3 sentence chapter summaries, but stay specific.";
  return "Write a 2-4 sentence brief and 1-2 sentence chapter summaries.";
}

function buildPrompt(input, settings, previous) {
  const system = [
    "You maintain the Journey panel for a research workstation.",
    "Summarize the supplied structured chapters and episodes. Return JSON only.",
    "Never invent chapter ids, episode ids, event ranges, source counts, status, or percentages; the system renders those facts.",
    "Use only the supplied ids. Preserve every chapter and episode id.",
    "Be specific about what was read, what was produced, and what remains open. If evidence is missing, say so.",
    "Write in the same language as the thread title and chapter text.",
    "JSON shape: {\"brief\":\"...\",\"nextMove\":\"...\",\"chapters\":[{\"id\":\"...\",\"title\":\"...\",\"summary\":\"...\",\"episodes\":[{\"id\":\"...\",\"title\":\"...\",\"outcome\":\"...\"}]}],\"claims\":[{\"id\":\"claim-1\",\"text\":\"...\",\"status\":\"supported|open|contradicted\",\"sourceIds\":[\"source-id\"]}]}",
    "Only cite source ids from the supplied sources; use each source's id field, not eventId. If no supplied source supports or contradicts a claim, use status open and an empty sourceIds array. Maximum 8 claims.",
    "Titles should be short. Outcomes should be one line. Do not add markdown fences.",
    instructionForLength(settings.summaryLength),
    `Keep the response within roughly ${settings.summaryTokenBudget} tokens.`,
  ].join("\n");
  const payload = {
    threadTitle: input.threadTitle || "Research thread",
    previousBrief: previous?.brief || "",
    brief: input.brief || "",
    sources: (input.sources || []).slice(0, 40),
    chapters: (input.chapters || []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      status: chapter.status,
      steps: chapter.steps,
      episodes: (chapter.episodes || []).slice(0, settings.targetEpisodes || 4).map((episode) => ({
        id: episode.id,
        title: episode.title,
        outcome: episode.outcome,
        status: episode.status,
        steps: episode.steps,
      })),
    })),
  };
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function normalizeClaims(rawClaims, input, previous) {
  const sourceIds = new Set((input.sources || []).map((source) => source.id));
  const sourceClaims = Array.isArray(rawClaims) ? rawClaims : null;
  if (!sourceClaims) return Array.isArray(previous?.claims) ? normalizeClaims(previous.claims, input, null) : [];
  const seen = new Set();
  const claims = [];
  for (const [index, claim] of sourceClaims.slice(0, 8).entries()) {
    const content = text(claim?.text, 500);
    if (!content) continue;
    let id = text(claim?.id, 80) || `claim-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const ids = Array.isArray(claim?.sourceIds) ? [...new Set(claim.sourceIds.filter((value) => typeof value === "string" && sourceIds.has(value)))] : [];
    let status = claim?.status === "supported" || claim?.status === "contradicted" || claim?.status === "open" ? claim.status : "open";
    if (!ids.length) status = "open";
    claims.push({ id, text: content, status, sourceIds: ids });
  }
  return claims;
}

function validateSummary(raw, input, previous, config, settings) {
  const chapters = Array.isArray(input.chapters) ? input.chapters : [];
  const aiChapters = Array.isArray(raw?.chapters) ? raw.chapters : [];
  const aiById = new Map();
  for (const chapter of aiChapters) {
    if (chapter && typeof chapter.id === "string" && !aiById.has(chapter.id)) aiById.set(chapter.id, chapter);
  }
  const normalized = chapters.map((chapter) => {
    const ai = aiById.get(chapter.id);
    const aiEpisodes = Array.isArray(ai?.episodes) ? ai.episodes : [];
    const episodeById = new Map();
    for (const episode of aiEpisodes) {
      if (episode && typeof episode.id === "string" && !episodeById.has(episode.id)) episodeById.set(episode.id, episode);
    }
    return {
      id: chapter.id,
      title: text(ai?.title, 140) || chapter.title,
      summary: text(ai?.summary, 600) || chapter.summary,
      episodes: (chapter.episodes || []).map((episode) => {
        const aiEpisode = episodeById.get(episode.id);
        return {
          id: episode.id,
          title: text(aiEpisode?.title, 140) || episode.title,
          outcome: text(aiEpisode?.outcome, 280) || episode.outcome,
        };
      }),
    };
  });
  return {
    threadId: input.threadId,
    brief: text(raw?.brief, 1600) || previous?.brief || input.brief || "",
    nextMove: text(raw?.nextMove, 320) || previous?.nextMove || "",
    coversTo: Number(input.coversTo) || 0,
    updatedAt: new Date().toISOString(),
    model: config?.model || config?.provider || "unknown",
    chapters: normalized,
    claims: normalizeClaims(raw?.claims, input, previous),
    source: "ai",
    summaryLength: settings.summaryLength,
  };
}

async function summarizeJourney({ input, settings, previous, complete: completeFn, config } = {}) {
  if (!input?.threadId) throw new Error("A thread is required to summarize a journey.");
  const resolvedSettings = { summaryLength: "standard", summaryTokenBudget: 500, targetEpisodes: 4, ...(settings || {}) };
  const runtimeConfig = config || getActiveModelConfig();
  if (!runtimeConfig?.apiKey && runtimeConfig?.provider !== "openrouter") {
    throw new Error("Configure a model with an API key in Settings → Models before enabling AI summaries.");
  }
  const run = completeFn || complete;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
  const messages = buildPrompt(input, resolvedSettings, previous);
  try {
    let response = await run(runtimeConfig, messages, {
      signal: controller.signal,
      allowTools: false,
      reasoningEffort: "low",
      maxOutputTokens: resolvedSettings.summaryTokenBudget,
      onTextDelta: () => {},
    });
    let raw = parseSummary(response?.content);
    if (!hasSummaryContent(raw)) {
      response = await run(runtimeConfig, [...messages, { role: "user", content: "Your previous answer was not valid JSON. Return only the JSON object now." }], {
        signal: controller.signal,
        allowTools: false,
        reasoningEffort: "low",
        maxOutputTokens: resolvedSettings.summaryTokenBudget,
        onTextDelta: () => {},
      });
      raw = parseSummary(response?.content);
    }
    if (!hasSummaryContent(raw)) throw new Error("The model did not return a valid Journey summary. The previous brief is still available.");
    return validateSummary(raw, input, previous, runtimeConfig, resolvedSettings);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Journey summary timed out. The previous brief is still available.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildPrompt, parseSummary, summarizeJourney, validateSummary };
