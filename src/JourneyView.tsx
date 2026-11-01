import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUISettings } from "./i18n";
import { chapterChunkStatus, eventFailedAnswer, eventHasError, eventOrdinal, isUnresolvedError, latestAnswerOrdinal } from "./journeyEventState";
import { artifactPaths, collectTouchedPaths, toolArgumentsOf, toolNameOf } from "./evidencePaths";
import { planChapterMerges } from "./journeyMergePlan";
import { useDialogFocus } from "./useDialogFocus";

type JourneyViewProps = {
  bridge: ResearchDeskBridge;
  thread: ResearchThread | null;
  events: ResearchEvent[];
  modeLabel: string;
  settings: JourneySettings;
  pendingAction: AgentAction | null;
  agentBusy: boolean;
  active: boolean;
  onOpenTrajectory: () => void;
  onOpenTrajectoryAt?: (ordinal: number) => void;
  onOpenSettings: () => void;
  onReviewPending: () => void;
  onStartResearch?: () => void;
};

type JourneyEpisode = {
  id: string;
  title: string;
  outcome: string;
  status: "done" | "running" | "waiting" | "error" | "open";
  start: number;
  end: number;
  steps: number;
};

type JourneyChapter = {
  id: string;
  title: string;
  summary: string;
  status: "done" | "running" | "waiting" | "error" | "open";
  start: number;
  end: number;
  steps: number;
  episodes: JourneyEpisode[];
  manual?: boolean;
  planned?: boolean;
  memberIds?: string[];
};

type JourneyMergeRange = {
  start: number;
  end: number;
};

type JourneyChapterPlan = {
  id: string;
  title: string;
  summary: string;
  chapterIds: string[];
};

type JourneyEvidence = {
  sources: number;
  files: number;
  artifacts: number;
  open: number;
};

type JourneyData = {
  chapters: JourneyChapter[];
  evidence: JourneyEvidence;
  brief: string;
  nextMove: string;
  status: "waiting" | "running" | "attention" | "complete" | "chat-only" | "not-started";
  steps: number;
  duration: string;
};

const CHAPTER_EVENT_LIMIT = 24;

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Model output and tool text can contain markdown. Journey is a reading
// surface, not a markdown renderer, so flatten it before it reaches a label.
function plainText(value: unknown): string {
  return text(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1$2")
    .replace(/^[#>\-\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, length: number): string {
  const cleaned = plainText(value);
  if (cleaned.length <= length) return cleaned;
  const cut = cleaned.slice(0, Math.max(0, length - 1));
  const boundary = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  const trimmed = boundary > length * 0.55 ? cut.slice(0, boundary) : cut;
  return `${trimmed.trimEnd()}…`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  const word = /[^\x00-\x7F]/.test(singular) ? singular : count === 1 ? singular : pluralForm;
  return `${count} ${word}`;
}

function eventText(event: ResearchEvent): string {
  const payload = record(event.payload);
  return text(payload.text) || text(payload.content) || text(payload.message) || "";
}

function toolName(event: ResearchEvent): string {
  return text(record(event.payload).name) || "Tool";
}

function toolDetail(event: ResearchEvent): string {
  const payload = record(event.payload);
  const args = record(payload.arguments);
  const first = ["query", "queries", "path", "file_path", "file", "command", "url", "paper_id", "attached_paper_id"].map((key) => args[key]).find((value) => typeof value === "string" || Array.isArray(value));
  if (Array.isArray(first)) return first.filter((value) => typeof value === "string").join(", ");
  if (typeof first === "string") return first;
  return text(payload.detail) || text(payload.content);
}

function humanize(value: string): string {
  const cleaned = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Step";
}

function collectSources(payload: unknown, sources: Set<string>): void {
  if (Array.isArray(payload)) {
    for (const item of payload) collectSources(item, sources);
    return;
  }
  if (!payload || typeof payload !== "object") return;
  const item = payload as Record<string, unknown>;
  const key = text(item.url) || text(item.doi) || text(item.title) || text(item.paper_id);
  if (key) sources.add(key);
  for (const value of Object.values(item)) {
    if (value && typeof value === "object") collectSources(value, sources);
  }
}

function collectSummarySources(events: ResearchEvent[]): JourneySourceInput[] {
  const sources = new Map<string, JourneySourceInput>();
  events.forEach((event, index) => {
    if (event.type !== "source_evidence") return;
    const payload = record(event.payload);
    const ordinal = eventOrdinal(event, index);
    const title = text(payload.title) || text(payload.url) || text(payload.doi) || `Source ${ordinal}`;
    sources.set(event.id, { id: event.id, title: truncate(title, 160), url: text(payload.url), eventId: ordinal });
  });
  return [...sources.values()].slice(-40);
}

function eventFiles(event: ResearchEvent): Set<string> {
  return collectTouchedPaths(event.payload);
}

function eventSources(event: ResearchEvent): Set<string> {
  const sources = new Set<string>();
  collectSources(event.payload, sources);
  return sources;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function buildEpisodes(events: ResearchEvent[]): JourneyEpisode[] {
  const results = new Map<string, ResearchEvent>();
  const ordinals = new Map<string, number>();
  events.forEach((event, index) => ordinals.set(event.id, eventOrdinal(event, index)));
  for (const event of events) {
    const callId = text(record(event.payload).call_id);
    if (callId && (event.type === "tool_result" || event.type === "tool.result")) results.set(callId, event);
  }
  const episodes: JourneyEpisode[] = [];
  let index = 0;
  for (const event of events) {
    const ordinal = ordinals.get(event.id) ?? index + 1;
    if (event.type === "user_message") {
      const value = eventText(event);
      if (!value) continue;
      episodes.push({ id: `${event.id}:request`, title: index === 0 ? "Framed the request" : "Follow-up request", outcome: truncate(value, 140), status: "done", start: ordinal, end: ordinal, steps: 1 });
      index += 1;
      continue;
    }
    if (event.type === "tool_call") {
      const name = toolName(event);
      const callId = text(record(event.payload).call_id);
      const result = callId ? results.get(callId) : undefined;
      const detail = toolDetail(event);
      const resultText = result ? truncate(text(record(result.payload).content), 140) : "";
      episodes.push({
        id: `${event.id}:tool`,
        title: humanize(name),
        outcome: detail || resultText || "Workspace tool",
        status: result && eventHasError(result) ? "error" : result ? "done" : "open",
        start: ordinal,
        end: result ? ordinals.get(result.id) ?? ordinal : ordinal,
        steps: result ? 2 : 1,
      });
      index += 1;
      continue;
    }
    if (event.type === "assistant_message") {
      const value = eventText(event);
      if (!value) continue;
      episodes.push({ id: `${event.id}:answer`, title: "Drafted the answer", outcome: truncate(value, 140), status: "done", start: ordinal, end: ordinal, steps: 1 });
      index += 1;
    }
  }
  if (!episodes.length) {
    const first = events[0] ? eventOrdinal(events[0], 0) : 0;
    const last = events.at(-1) ? eventOrdinal(events.at(-1)!, events.length - 1) : 0;
    episodes.push({ id: "thread:empty", title: "Research step", outcome: "The event range has not produced a readable step yet.", status: "open", start: first, end: last, steps: events.length });
  }
  return episodes;
}

function isTrivialPrompt(value: string): boolean {
  const cleaned = value.replace(/[`"'“”‘’]/g, "").trim();
  return !cleaned || cleaned.length < 3 || /^(hi|hello|hey|yo|test|ok|okay|thanks|thank you|1|m|hmm|mm)[.!?]*$/i.test(cleaned);
}

function chapterTitle(firstUser: ResearchEvent | undefined, index: number, t: (key: string, values?: Record<string, string | number>) => string): string {
  const raw = firstUser ? eventText(firstUser) : "";
  if (/^(hi|hello|hey|yo)[.!?]*$/i.test(raw.replace(/[`"'“”‘’]/g, "").trim())) return t("Greeting");
  if (!raw || isTrivialPrompt(raw)) return t("Follow-up {index}", { index: index + 1 });
  return truncate(raw, 58);
}

function chapterFromEvents(events: ResearchEvent[], index: number, firstOfTurn: boolean, t: (key: string, values?: Record<string, string | number>) => string, turn?: { last: boolean; failed: boolean }): JourneyChapter {
  const sorted = [...events].sort((a, b) => (a.ordinal ?? a.sequence) - (b.ordinal ?? b.sequence));
  const sources = new Set<string>();
  const files = new Set<string>();
  const artifacts = new Set<string>();
  let toolCalls = 0;
  let hasAnswer = false;
  let hasFailure = false;
  for (const event of sorted) {
    if (event.type === "tool_call") {
      toolCalls += 1;
      for (const path of artifactPaths(toolNameOf(event.payload), toolArgumentsOf(event.payload))) artifacts.add(path);
    }
    if (event.type === "source_evidence") for (const source of eventSources(event)) sources.add(source);
    for (const file of eventFiles(event)) files.add(file);
    if (event.type === "assistant_message" && eventText(event)) hasAnswer = true;
    if (eventFailedAnswer(event)) hasFailure = true;
  }
  const firstUser = sorted.find((event) => event.type === "user_message");
  const title = firstOfTurn && firstUser ? chapterTitle(firstUser, index, t) : `Continued research ${index + 1}`;
  const summaryParts = [plural(sorted.length, t("step"))];
  if (toolCalls) summaryParts.push(plural(toolCalls, t("tool call")));
  if (sources.size) summaryParts.push(plural(sources.size, t("source")));
  if (files.size) summaryParts.push(plural(files.size, t("file")));
  if (artifacts.size) summaryParts.push(plural(artifacts.size, t("artifact")));
  // A single agent turn can span dozens of chunks. Only its final chunk can be
  // waiting for an answer; earlier chunks already finished and must not keep the
  // whole thread in "open" forever.
  const status: JourneyChapter["status"] = chapterChunkStatus({
    hasAnswer,
    hasFailure,
    lastInTurn: turn ? turn.last : true,
    turnFailed: turn?.failed ?? false,
  });
  return {
    id: `${sorted[0]?.turn_id || "thread"}:${sorted[0]?.sequence ?? index}:${index}`,
    title: title || `Research chapter ${index + 1}`,
    summary: summaryParts.join(" · "),
    status,
    start: sorted[0] ? eventOrdinal(sorted[0], 0) : 0,
    end: sorted.at(-1) ? eventOrdinal(sorted.at(-1)!, sorted.length - 1) : 0,
    steps: sorted.length,
    episodes: buildEpisodes(sorted),
  };
}

function mergeChapterBatch(merged: JourneyChapter[], t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter {
  const episodes = merged.flatMap((chapter) => chapter.episodes);
  const start = merged[0]?.start ?? 0;
  const end = merged.at(-1)?.end ?? 0;
  const steps = merged.reduce((total, chapter) => total + chapter.steps, 0);
  return {
    id: `merged:${merged[0]?.id ?? "early"}`,
    title: `${t("Earlier research")} · #${start}–#${end}`,
    summary: `${plural(merged.length, t("chapter"))} · ${plural(steps, t("step"))}`,
    status: merged.some((chapter) => chapter.status === "error") ? "error" : merged.some((chapter) => chapter.status === "waiting") ? "waiting" : merged.some((chapter) => chapter.status === "running") ? "running" : merged.some((chapter) => chapter.status === "open") ? "open" : "done",
    start,
    end,
    steps,
    episodes,
    memberIds: merged.flatMap((chapter) => [chapter.id, ...(chapter.memberIds ?? [])]),
  };
}

function mergeChapterRange(chapters: JourneyChapter[], range: JourneyMergeRange, t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter | null {
  const parts = chapters.filter((chapter) => chapter.start <= range.end && chapter.end >= range.start);
  if (parts.length < 2) return null;
  const steps = parts.reduce((total, chapter) => total + chapter.steps, 0);
  return {
    id: manualChapterId(range),
    title: t("Merged chapter"),
    summary: `${plural(parts.length, t("chapter"))} · ${plural(steps, t("step"))}`,
    status: parts.some((chapter) => chapter.status === "error") ? "error" : parts.some((chapter) => chapter.status === "waiting") ? "waiting" : parts.some((chapter) => chapter.status === "running") ? "running" : parts.some((chapter) => chapter.status === "open") ? "open" : "done",
    start: parts[0].start,
    end: parts.at(-1)?.end ?? range.end,
    steps,
    episodes: parts.flatMap((chapter) => chapter.episodes),
    manual: true,
    memberIds: parts.flatMap((chapter) => [chapter.id, ...(chapter.memberIds ?? [])]),
  };
}

function applyMergeRanges(chapters: JourneyChapter[], ranges: JourneyMergeRange[], t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter[] {
  let next = chapters;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const parts = next.filter((chapter) => chapter.start <= range.end && chapter.end >= range.start);
    if (parts.length < 2) continue;
    const merged = mergeChapterRange(next, range, t);
    if (!merged) continue;
    const firstIndex = next.indexOf(parts[0]);
    next = [...next.slice(0, firstIndex), merged, ...next.slice(firstIndex + parts.length)];
  }
  return next;
}

function dedupeChapterTitles(chapters: JourneyChapter[]): JourneyChapter[] {
  const counts = new Map<string, number>();
  return chapters.map((chapter) => {
    const count = counts.get(chapter.title) || 0;
    counts.set(chapter.title, count + 1);
    return count ? { ...chapter, title: `${chapter.title} · ${count + 1}` } : chapter;
  });
}

function buildChapters(events: ResearchEvent[], settings: JourneySettings, pendingAction: AgentAction | null, thread: ResearchThread | null, t: (key: string, values?: Record<string, string | number>) => string, mergeRanges: JourneyMergeRange[] = []): JourneyChapter[] {
  const sorted = [...events].sort((a, b) => (a.ordinal ?? a.sequence) - (b.ordinal ?? b.sequence));
  const groups = new Map<string, ResearchEvent[]>();
  for (const event of sorted) {
    const key = event.turn_id || "thread";
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }
  let chapters: JourneyChapter[] = [];
  for (const group of groups.values()) {
    const segments = chunk(group, CHAPTER_EVENT_LIMIT);
    const failed = group.some(eventFailedAnswer);
    for (const [segmentIndex, segment] of segments.entries()) {
      chapters.push(chapterFromEvents(segment, chapters.length, segmentIndex === 0, t, {
        last: segmentIndex === segments.length - 1,
        failed,
      }));
    }
  }
  if (!chapters.length) return [];
  const lastIndex = chapters.length - 1;
  chapters = chapters.map((chapter, index) => {
    if (chapter.status === "error") return chapter;
    if (index === lastIndex && pendingAction) return { ...chapter, status: "waiting" };
    if (index === lastIndex && thread?.status === "running") return { ...chapter, status: "running" };
    return chapter;
  });
  if (settings.autoMerge && chapters.length > settings.maxChapters) {
    const plan = planChapterMerges(chapters.length, settings.maxChapters);
    const merged = plan.batches.map(({ start, end }) => mergeChapterBatch(chapters.slice(start, end), t));
    chapters = [...merged, ...chapters.slice(plan.keepFrom)];
  }
  return dedupeChapterTitles(applyMergeRanges(chapters, mergeRanges, t));
}

function formatDuration(first: number, last: number, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (!first || !last) return "";
  const minutes = Math.max(0, Math.round((last - first) / 60_000));
  if (minutes < 1) return t("under a minute");
  if (minutes < 60) return t("{minutes}m", { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("{hours}h {minutes}m", { hours, minutes: rest }) : t("{hours}h", { hours });
}

function timeValue(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEvidence(events: ResearchEvent[], pendingAction: AgentAction | null): JourneyEvidence {
  const files = new Set<string>();
  const sources = new Set<string>();
  const artifacts = new Set<string>();
  let open = pendingAction ? 1 : 0;
  const latestAnswer = latestAnswerOrdinal(events);
  events.forEach((event, index) => {
    for (const source of eventSources(event)) sources.add(source);
    for (const file of eventFiles(event)) files.add(file);
    if (isUnresolvedError(event, latestAnswer, index)) open += 1;
    if (event.type === "tool_call") {
      for (const path of artifactPaths(toolNameOf(event.payload), toolArgumentsOf(event.payload))) artifacts.add(path);
    }
  });
  return { sources: sources.size, files: files.size, artifacts: artifacts.size, open };
}

function buildBrief(data: { steps: number; chapters: JourneyChapter[]; evidence: JourneyEvidence; pendingAction: AgentAction | null; thread: ResearchThread | null; openChapters: number; failedTurn: boolean; chatOnly: boolean }, t: (key: string, values?: Record<string, string | number>) => string): string {
  const { steps, chapters, evidence, openChapters } = data;
  if (!steps) return t("No research activity yet. Start a task and the journey will take shape here.");
  const hasResearch = evidence.sources + evidence.files + evidence.artifacts > 0;
  const facts = t("This thread has {steps} across {chapters}, with {sources} and {files} touched.", {
    steps: plural(steps, t("step")),
    chapters: plural(chapters.length, t("chapter")),
    sources: plural(evidence.sources, t("source")),
    files: plural(evidence.files, t("file")),
  });
  if (data.pendingAction) {
    return `${facts} ${t("It is waiting for review on {kind} before it can continue.", { kind: t(data.pendingAction.kind === "write" ? "a file write" : "a command") })}`;
  }
  if (data.thread?.status === "running") {
    return `${facts} ${t("The agent is working through the current chapter.")}`;
  }
  if (data.failedTurn) {
    return `${facts} ${t("The last turn failed before producing a final answer.")}`;
  }
  if (evidence.open > 0) {
    return `${facts} ${t("{count} steps still need attention before the chapter can be considered closed.", { count: evidence.open })}`;
  }
  if (openChapters > 0) {
    return `${facts} ${t("{count} chapters still need a closer look.", { count: openChapters })}`;
  }
  if (!hasResearch) {
    return `${facts} ${data.chatOnly
      ? t("No sources or artifacts yet. This is conversation only — ask a research question or attach a paper to start collecting evidence.")
      : t("No sources or artifacts were recorded for this run.")}`;
  }
  const latestChapter = chapters.at(-1)?.title;
  return latestChapter ? `${facts} ${t("Latest chapter: {title}.", { title: latestChapter })}` : facts;
}

function buildNextMove(data: { pendingAction: AgentAction | null; thread: ResearchThread | null; evidence: JourneyEvidence; steps: number; openChapters: number; failedTurn: boolean; hasToolActivity: boolean }, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (data.pendingAction) return t("Review the pending {kind}, then continue.", { kind: t(data.pendingAction.kind === "write" ? "file write" : "command") });
  if (data.thread?.status === "running") return t("Let the agent finish the current chapter, then audit the result.");
  if (data.failedTurn) return t("Retry the failed turn, or continue with a follow-up question.");
  if (data.evidence.open > 0) return t("Resolve {count} open steps, or continue with a follow-up question.", { count: data.evidence.open });
  if (data.openChapters > 0) return t("Review {count} open chapters, or continue with a follow-up question.", { count: data.openChapters });
  if (!data.steps) return t("Start a research task to build a journey.");
  if (!data.hasToolActivity) return t("Ask a research question or attach a paper to start collecting evidence.");
  if (!data.evidence.sources && !data.evidence.files && !data.evidence.artifacts) return t("Review the trajectory or continue with a follow-up question.");
  return t("Review the evidence or draft the next section.");
}

function viewKey(kind: "pins" | "seen" | "titles" | "merges" | "ungrouped", threadId: string | null): string {
  // Ordinal ranges replaced per-turn sequence ranges. Old seen/merge values
  // would point at the wrong event, so give those two a one-time v2 namespace.
  const version = kind === "seen" || kind === "merges" ? ":v2" : "";
  return `archimedes-journey-${kind}${version}:${threadId || "new"}`;
}

function readPins(threadId: string | null): string[] {
  if (!threadId) return [];
  try { return JSON.parse(localStorage.getItem(viewKey("pins", threadId)) || "[]") as string[]; }
  catch { return []; }
}

function readTitles(threadId: string | null): Record<string, string> {
  if (!threadId) return {};
  try { return JSON.parse(localStorage.getItem(viewKey("titles", threadId)) || "{}") as Record<string, string>; }
  catch { return {}; }
}

function manualChapterId(range: JourneyMergeRange): string {
  return `range:${range.start}-${range.end}`;
}

function readMerges(threadId: string | null): JourneyMergeRange[] {
  if (!threadId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(viewKey("merges", threadId)) || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    const sorted = value
      .filter((range): range is JourneyMergeRange => Boolean(range) && typeof (range as JourneyMergeRange).start === "number" && typeof (range as JourneyMergeRange).end === "number")
      .map((range) => ({ start: range.start, end: range.end }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start);
    const normalized: JourneyMergeRange[] = [];
    for (const range of sorted) {
      const last = normalized.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else normalized.push({ ...range });
    }
    return normalized;
  } catch { return []; }
}

function readUngrouped(threadId: string | null): string[] {
  if (!threadId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(viewKey("ungrouped", threadId)) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function readSeen(threadId: string | null): number | null {
  if (!threadId) return null;
  const value = Number(localStorage.getItem(viewKey("seen", threadId)));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mergeSummaryChapters(chapters: JourneyChapter[], summary: JourneySummarySnapshot | null): JourneyChapter[] {
  if (!summary?.chapters?.length) return chapters;
  const chaptersById = new Map(summary.chapters.map((chapter) => [chapter.id, chapter]));
  return chapters.map((chapter) => {
    const ai = chaptersById.get(chapter.id);
    if (!ai) return chapter;
    const episodesById = new Map((ai.episodes || []).map((episode) => [episode.id, episode]));
    return {
      ...chapter,
      title: plainText(ai.title) || chapter.title,
      summary: plainText(ai.summary) || chapter.summary,
      episodes: chapter.episodes.map((episode) => {
        const aiEpisode = episodesById.get(episode.id);
        return aiEpisode ? { ...episode, title: plainText(aiEpisode.title) || episode.title, outcome: plainText(aiEpisode.outcome) || episode.outcome } : episode;
      }),
    };
  });
}

function applyChapterPlan(chapters: JourneyChapter[], plan: JourneyChapterPlan[] | undefined, t: (key: string, values?: Record<string, string | number>) => string, ungrouped: string[] = []): JourneyChapter[] {
  if (!plan?.length) return chapters;
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const groups = new Map<string, JourneyChapterPlan>();
  for (const group of plan) {
    if (!Array.isArray(group.chapterIds) || group.chapterIds.length < 2) continue;
    if (ungrouped.includes(group.chapterIds[0])) continue;
    if (group.chapterIds.some((id) => !byId.has(id))) continue;
    const indexes = group.chapterIds.map((id) => chapters.findIndex((chapter) => chapter.id === id));
    if (indexes.some((value, index) => value < 0 || (index > 0 && value !== indexes[index - 1] + 1))) continue;
    groups.set(group.chapterIds[0], group);
  }
  if (!groups.size) return chapters;
  const result: JourneyChapter[] = [];
  const consumed = new Set<string>();
  for (const chapter of chapters) {
    if (consumed.has(chapter.id)) continue;
    const group = groups.get(chapter.id);
    if (!group) { result.push(chapter); continue; }
    const parts = group.chapterIds.map((id) => byId.get(id)).filter((part): part is JourneyChapter => Boolean(part));
    if (parts.length < 2) { result.push(chapter); continue; }
    const steps = parts.reduce((total, part) => total + part.steps, 0);
    result.push({
      id: parts[0].id,
      title: plainText(group.title) || parts[0].title,
      summary: plainText(group.summary) || `${plural(parts.length, t("chapter"))} · ${plural(steps, t("step"))}`,
      status: parts.some((part) => part.status === "error") ? "error" : parts.some((part) => part.status === "waiting") ? "waiting" : parts.some((part) => part.status === "running") ? "running" : parts.some((part) => part.status === "open") ? "open" : "done",
      start: parts[0].start,
      end: parts.at(-1)?.end ?? parts[0].end,
      steps,
      episodes: parts.flatMap((part) => part.episodes),
      memberIds: parts.flatMap((part) => [part.id, ...(part.memberIds ?? [])]),
      planned: true,
    });
    for (const id of group.chapterIds) consumed.add(id);
  }
  return result;
}

function relativeTime(value: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t("just now");
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{minutes}m ago", { minutes });
  const hours = Math.floor(minutes / 60);
  return t("{hours}h ago", { hours });
}

function statusLabel(status: JourneyData["status"]): string {
  if (status === "waiting") return "Waiting for review";
  if (status === "running") return "Running";
  if (status === "attention") return "Needs attention";
  if (status === "chat-only") return "Chat only";
  if (status === "complete") return "Complete";
  return "Not started";
}

function chapterStatusLabel(status: JourneyChapter["status"]): string {
  if (status === "running") return "active";
  if (status === "waiting") return "waiting";
  if (status === "error") return "error";
  if (status === "open") return "open";
  return "done";
}

function isOpenChapter(chapter: JourneyChapter): boolean {
  return chapter.status === "open" || chapter.status === "waiting" || chapter.status === "running";
}

function episodeLabel(episode: JourneyEpisode): string {
  return episode.outcome ? `${episode.title} · ${episode.outcome}` : episode.title;
}

function claimStatusLabel(status: JourneyClaim["status"]): string {
  if (status === "supported") return "Supported";
  if (status === "contradicted") return "Contradicted";
  return "Needs evidence";
}

function chapterPinIds(chapter: JourneyChapter): string[] {
  return [...new Set([chapter.id, ...(chapter.memberIds ?? [])])];
}

export default function JourneyView({ bridge, thread, events, modeLabel, settings, pendingAction, agentBusy, active, onOpenTrajectory, onOpenTrajectoryAt, onOpenSettings, onReviewPending, onStartResearch }: JourneyViewProps) {
  const { t } = useUISettings();
  const [view, setView] = useState<"story" | "outline">(settings.defaultView);
  const [atLatest, setAtLatest] = useState(true);
  const [readProgress, setReadProgress] = useState(0);
  const scrollPositionsRef = useRef<Record<"story" | "outline", number>>({ story: 0, outline: 0 });
  const pendingChapterJumpRef = useRef<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapQuery, setMapQuery] = useState("");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(() => readPins(thread?.id ?? null));
  const [seen, setSeen] = useState<number | null>(() => readSeen(thread?.id ?? null));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [touchedExpanded, setTouchedExpanded] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [showAllEpisodes, setShowAllEpisodes] = useState<Set<string>>(new Set());
  const [outlineFilter, setOutlineFilter] = useState<"all" | "open" | "pinned">("all");
  const [dismissedSince, setDismissedSince] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>(() => readTitles(thread?.id ?? null));
  const [merges, setMerges] = useState<JourneyMergeRange[]>(() => readMerges(thread?.id ?? null));
  const [ungrouped, setUngrouped] = useState<string[]>(() => readUngrouped(thread?.id ?? null));
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [summary, setSummary] = useState<JourneySummarySnapshot | null>(null);
  const [summaryUpdating, setSummaryUpdating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const summaryBusyRef = useRef(false);
  const pendingSummaryRefreshRef = useRef<{ threadId: string; force: boolean } | null>(null);
  const requestSummaryRef = useRef<(force?: boolean) => void>(() => {});
  const lastSummaryAtRef = useRef(0);
  const summaryThreadRef = useRef<string | null>(thread?.id ?? null);
  const previousBusyRef = useRef(agentBusy);
  const previousPendingRef = useRef<string | null>(pendingAction?.id ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mapDialogRef = useDialogFocus<HTMLElement>(mapOpen, () => setMapOpen(false));

  const sourceChapters = useMemo(() => buildChapters(events, settings, pendingAction, thread, t, merges), [events, merges, pendingAction, settings, thread, t]);
  const titledSourceChapters = useMemo(() => sourceChapters.map((chapter) => titles[chapter.id] ? { ...chapter, title: titles[chapter.id] } : chapter), [sourceChapters, titles]);
  const summarizedChapters = useMemo(() => mergeSummaryChapters(sourceChapters, summary), [sourceChapters, summary]);
  const groupedChapters = useMemo(() => settings.chapterDetection === "ai" ? applyChapterPlan(summarizedChapters, summary?.chapterPlan, t, ungrouped) : summarizedChapters, [settings.chapterDetection, summarizedChapters, summary?.chapterPlan, t, ungrouped]);
  const chapters = useMemo(() => groupedChapters.map((chapter) => {
    const custom = titles[chapter.id] ?? chapter.memberIds?.map((id) => titles[id]).find(Boolean);
    return custom ? { ...chapter, title: custom } : chapter;
  }), [groupedChapters, titles]);
  const evidence = useMemo(() => buildEvidence(events, pendingAction), [events, pendingAction]);
  const chapterEvidence = useMemo(() => new Map(chapters.map((chapter) => [chapter.id, buildEvidence(events.filter((event, index) => {
    const ordinal = eventOrdinal(event, index);
    return ordinal >= chapter.start && ordinal <= chapter.end;
  }), null)])), [chapters, events]);
  const sourceInfo = useMemo(() => new Map(collectSummarySources(events).map((source) => [source.id, { title: source.title, eventId: source.eventId }])), [events]);
  const steps = events.length;
  const firstTime = timeValue(events[0]?.created_at) || timeValue(thread?.created_at);
  const lastTime = timeValue(events.at(-1)?.created_at) || timeValue(thread?.updated_at) || Date.now();
  const duration = formatDuration(firstTime, lastTime, t);
  const hasErrors = evidence.open > (pendingAction ? 1 : 0);
  const hasResearch = evidence.sources + evidence.files + evidence.artifacts > 0;
  const allDone = chapters.every((chapter) => chapter.status === "done");
  const failedChapterCount = chapters.filter((chapter) => chapter.status === "error").length;
  const openChapterCount = chapters.filter(isOpenChapter).length;
  const lastAnswer = [...events].reverse().find((event) => event.type === "assistant_message");
  const failedTurn = Boolean(lastAnswer && eventFailedAnswer(lastAnswer));
  const hasToolActivity = useMemo(() => events.some((event) => event.type === "tool_call" || event.type === "tool_result"), [events]);
  const attentionLabel = failedChapterCount > 0
    ? plural(failedChapterCount, t("failed chapter"), t("failed chapters"))
    : openChapterCount > 0
      ? plural(openChapterCount, t("open chapter"), t("open chapters"))
      : evidence.open > 0
        ? plural(evidence.open, t("open step"), t("open steps"))
        : "";
  const chatOnly = steps > 0 && !hasResearch && !hasToolActivity && !pendingAction && !hasErrors && allDone;
  const hasOpenChapters = openChapterCount > 0;
  const status: JourneyData["status"] = !steps ? "not-started" : pendingAction ? "waiting" : agentBusy || thread?.status === "running" ? "running" : hasErrors ? "attention" : chatOnly ? "chat-only" : allDone ? "complete" : "attention";
  const ruleBrief = useMemo(() => buildBrief({ steps, chapters, evidence, pendingAction, thread, openChapters: openChapterCount, failedTurn, chatOnly }, t), [chapters, chatOnly, evidence, failedTurn, openChapterCount, pendingAction, steps, thread, t]);
  const ruleNextMove = buildNextMove({ pendingAction, thread, evidence, steps, openChapters: openChapterCount, failedTurn, hasToolActivity }, t);
  const brief = summary?.brief ? plainText(summary.brief) : ruleBrief;
  const nextMove = summary?.nextMove ? plainText(summary.nextMove) : ruleNextMove;
  const pinnedChapters = chapters.filter((chapter) => chapterPinIds(chapter).some((id) => pins.includes(id)));
  const mapAvailable = steps > 0 && settings.mapMode !== "off" && (settings.mapMode === "always" || chapters.length >= settings.mapChapters || steps >= settings.mapSteps);
  const lastOrdinal = events.length ? eventOrdinal(events.at(-1)!, events.length - 1) : 0;
  const newEvents = seen === null ? [] : events.filter((event, index) => eventOrdinal(event, index) > seen);
  const digest = useMemo(() => {
    if (!newEvents.length) return null;
    const sources = new Set<string>();
    for (const event of newEvents) for (const source of eventSources(event)) sources.add(source);
    return { steps: newEvents.length, sources: sources.size, approval: pendingAction ? 1 : 0, firstOrdinal: newEvents[0] ? eventOrdinal(newEvents[0], 0) : 0 };
  }, [newEvents, pendingAction]);
  const visibleChapters = showAllChapters || chapters.length <= 4 ? chapters : chapters.slice(-4);
  const hiddenChapterCount = chapters.length - visibleChapters.length;
  const activeChapter = chapters.at(-1);
  const defaultExpanded = useMemo(() => {
    const next = new Set<string>();
    if (activeChapter) next.add(activeChapter.id);
    if (!settings.collapseCompleted) {
      for (const chapter of chapters) next.add(chapter.id);
    }
    return next;
  }, [activeChapter, chapters, settings.collapseCompleted]);
  const expandedIds = touchedExpanded ? expanded : defaultExpanded;

  useEffect(() => {
    setView(settings.defaultView);
  }, [settings.defaultView]);

  useEffect(() => {
    if (settings.chapterDetection === "ai" || !thread?.id) return;
    setUngrouped([]);
    localStorage.removeItem(viewKey("ungrouped", thread.id));
  }, [settings.chapterDetection, thread?.id]);

  useEffect(() => {
    setPins(readPins(thread?.id ?? null));
    setSeen(readSeen(thread?.id ?? null));
    setExpanded(new Set());
    setTouchedExpanded(false);
    setShowAllChapters(false);
    setShowAllEpisodes(new Set());
    setDismissedSince(false);
    setMapOpen(false);
    setMapSelected(null);
    setAtLatest(true);
    setReadProgress(0);
    scrollPositionsRef.current = { story: 0, outline: 0 };
    pendingChapterJumpRef.current = null;
    setTitles(readTitles(thread?.id ?? null));
    setMerges(readMerges(thread?.id ?? null));
    setUngrouped(readUngrouped(thread?.id ?? null));
    setEditingChapter(null);
    setDraftTitle("");
    setSummary(null);
    setSummaryError("");
    setSummaryUpdating(false);
    summaryThreadRef.current = thread?.id ?? null;
    previousBusyRef.current = agentBusy;
    previousPendingRef.current = pendingAction?.id ?? null;
    lastSummaryAtRef.current = 0;
    pendingSummaryRefreshRef.current = null;
  }, [thread?.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateScrollState());
    return () => cancelAnimationFrame(frame);
  }, [steps, view, chapters.length]);

  useEffect(() => {
    if (!showAllChapters || !pendingChapterJumpRef.current) return;
    const id = pendingChapterJumpRef.current;
    pendingChapterJumpRef.current = null;
    const frame = requestAnimationFrame(() => jumpToChapter(id));
    return () => cancelAnimationFrame(frame);
  }, [showAllChapters]);

  useEffect(() => {
    if (!thread?.id) return;
    let cancelled = false;
    void bridge.getJourneySummary(thread.id)
      .then((snapshot) => {
        if (cancelled || summaryThreadRef.current !== thread.id) return;
        setSummary(snapshot);
        lastSummaryAtRef.current = snapshot ? Date.parse(snapshot.updatedAt) || 0 : 0;
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [bridge, thread?.id]);

  useEffect(() => {
    if (!thread?.id || !steps || seen !== null) return;
    const next = lastOrdinal;
    localStorage.setItem(viewKey("seen", thread.id), String(next));
    setSeen(next);
  }, [lastOrdinal, seen, steps, thread?.id]);

  useEffect(() => {
    if (!mapOpen) return;
    setMapSelected((current) => current && chapters.some((chapter) => chapter.id === current) ? current : activeChapter?.id ?? null);
  }, [activeChapter?.id, chapters, mapOpen]);

  useEffect(() => {
    if (!mapAvailable && mapOpen) setMapOpen(false);
  }, [mapAvailable, mapOpen]);

  // The map is portaled to document.body, so hiding the Journey panel does not
  // hide it. Close it whenever another workbench tab takes over.
  useEffect(() => {
    if (!active && mapOpen) setMapOpen(false);
  }, [active, mapOpen]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !settings.followLive) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 40) {
      element.scrollTop = element.scrollHeight;
      requestAnimationFrame(() => updateScrollState());
    }
  }, [settings.followLive, steps]);

  function toggleChapter(id: string) {
    setTouchedExpanded(true);
    setExpanded((current) => {
      const base = current.size ? current : defaultExpanded;
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePin(id: string) {
    if (!thread?.id) return;
    const target = chapters.find((chapter) => chapter.id === id);
    const groupIds = target ? chapterPinIds(target) : [id];
    setPins((current) => {
      const pinned = groupIds.some((value) => current.includes(value));
      const next = pinned
        ? current.filter((value) => !groupIds.includes(value))
        : current.length >= settings.maxPinned ? current : [...current, id];
      localStorage.setItem(viewKey("pins", thread.id), JSON.stringify(next));
      return next;
    });
  }

  function dismissSince() {
    if (!thread?.id) return;
    localStorage.setItem(viewKey("seen", thread.id), String(lastOrdinal));
    setSeen(lastOrdinal);
    setDismissedSince(true);
  }

  function updateScrollState() {
    const element = scrollRef.current;
    if (!element) return;
    const max = element.scrollHeight - element.clientHeight;
    setAtLatest(max <= 8 || element.scrollTop >= max - 8);
    setReadProgress(max <= 0 ? 1 : Math.min(1, Math.max(0, element.scrollTop / max)));
    scrollPositionsRef.current[view] = element.scrollTop;
  }

  function switchView(next: "story" | "outline") {
    if (next === view) return;
    const element = scrollRef.current;
    if (element) scrollPositionsRef.current[view] = element.scrollTop;
    setView(next);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollPositionsRef.current[next];
      updateScrollState();
    });
  }

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    setAtLatest(true);
    setReadProgress(1);
  }

  function jumpToFirstNew() {
    if (!digest?.firstOrdinal) return;
    const chapter = chapters.find((item) => item.start <= digest.firstOrdinal && item.end >= digest.firstOrdinal);
    if (!chapter) return;
    setView("story");
    requestAnimationFrame(() => jumpToChapter(chapter.id));
  }

  function reviewOpenSteps() {
    const openChapter = chapters.find(isOpenChapter);
    const failedChapter = chapters.find((chapter) => chapter.status === "error");
    const evidenceChapter = chapters.find((chapter) => (chapterEvidence.get(chapter.id)?.open ?? 0) > 0);
    const target = openChapter ?? failedChapter ?? evidenceChapter;
    setView("outline");
    setOutlineFilter(openChapter ? "open" : "all");
    requestAnimationFrame(() => {
      if (target) jumpToChapter(target.id);
      else if (scrollRef.current) scrollRef.current.scrollTop = 0;
      updateScrollState();
    });
  }

  function jumpToChapter(id: string) {
    const target = chapters.find((chapter) => chapter.id === id);
    const visible = showAllChapters || chapters.length <= 4 ? chapters : chapters.slice(-4);
    if (target && !visible.some((chapter) => chapter.id === id)) {
      pendingChapterJumpRef.current = id;
      setShowAllChapters(true);
      return;
    }
    pendingChapterJumpRef.current = null;
    setTouchedExpanded(true);
    setExpanded((current) => new Set(current.size ? current : defaultExpanded).add(id));
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-journey-chapter="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  async function requestSummary(force = false) {
    const threadId = thread?.id;
    if (!threadId || !sourceChapters.length) return;
    if (summaryBusyRef.current) {
      if (force) pendingSummaryRefreshRef.current = { threadId, force };
      return;
    }
    if (!force && !settings.liveSummaries) return;
    if (!force && summary && summary.coversTo >= lastOrdinal) return;
    if (!force && Date.now() - lastSummaryAtRef.current < settings.briefInterval * 60_000) return;
    summaryBusyRef.current = true;
    setSummaryUpdating(true);
    setSummaryError("");
    try {
      const next = await bridge.summarizeJourney({
        threadId,
        threadTitle: thread?.title || "Research thread",
        brief: ruleBrief,
        coversTo: lastOrdinal,
        force,
        chapters: titledSourceChapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          summary: chapter.summary,
          status: chapter.status,
          steps: chapter.steps,
          episodes: chapter.episodes.slice(0, settings.targetEpisodes).map((episode) => ({
            id: episode.id,
            title: episode.title,
            outcome: episode.outcome,
            status: episode.status,
            steps: episode.steps,
          })),
        })),
      });
      if (summaryThreadRef.current !== threadId) return;
      if (next) {
        setSummary(next);
        lastSummaryAtRef.current = Date.now();
      }
    } catch (error) {
      if (summaryThreadRef.current === threadId) setSummaryError(String(error).replace(/^Error:\s*/, ""));
    } finally {
      summaryBusyRef.current = false;
      if (summaryThreadRef.current === threadId) setSummaryUpdating(false);
      const pending = pendingSummaryRefreshRef.current;
      pendingSummaryRefreshRef.current = null;
      if (pending?.threadId === summaryThreadRef.current) {
        window.setTimeout(() => requestSummaryRef.current(true), 150);
      }
    }
  }

  requestSummaryRef.current = (force = false) => { void requestSummary(force); };

  useEffect(() => {
    const triggered = settings.liveSummaries || settings.updateOnTurnEnd || (settings.updateOnApproval && Boolean(pendingAction));
    if (!active || !triggered || !thread?.id || summary || summaryError || !sourceChapters.length) return;
    const force = !settings.liveSummaries;
    const timer = window.setTimeout(() => { void requestSummary(force); }, 1200);
    return () => window.clearTimeout(timer);
  }, [active, pendingAction, settings.liveSummaries, settings.updateOnApproval, settings.updateOnTurnEnd, sourceChapters.length, summary, summaryError, thread?.id]);

  useEffect(() => {
    if (!active || !thread?.id || !settings.liveSummaries || !sourceChapters.length) return;
    const newSteps = steps - (summary?.coversTo ?? 0);
    if (newSteps <= 0) return;
    const throttle = Math.max(0, settings.briefInterval * 60_000 - (Date.now() - lastSummaryAtRef.current));
    const due = newSteps >= settings.episodeCadence ? 800 : settings.idleDelay * 1000;
    const timer = window.setTimeout(() => { void requestSummary(false); }, Math.max(due, throttle + 200));
    return () => window.clearTimeout(timer);
  }, [active, settings.briefInterval, settings.episodeCadence, settings.idleDelay, settings.liveSummaries, sourceChapters.length, steps, summary?.coversTo, thread?.id]);

  useEffect(() => {
    if (!active || !summary || settings.liveSummaries || summary.coversTo >= lastOrdinal) return;
    if (!settings.updateOnTurnEnd && !(settings.updateOnApproval && pendingAction)) return;
    const timer = window.setTimeout(() => { void requestSummary(true); }, 1000);
    return () => window.clearTimeout(timer);
  }, [active, lastOrdinal, pendingAction, settings.liveSummaries, settings.updateOnApproval, settings.updateOnTurnEnd, summary, thread?.id]);

  useEffect(() => {
    const wasBusy = previousBusyRef.current;
    previousBusyRef.current = agentBusy;
    if (active && wasBusy && !agentBusy && settings.updateOnTurnEnd) void requestSummary(true);
  }, [active, agentBusy, settings.updateOnTurnEnd]);

  useEffect(() => {
    const id = pendingAction?.id ?? null;
    const previous = previousPendingRef.current;
    previousPendingRef.current = id;
    if (active && id && id !== previous && settings.updateOnApproval) void requestSummary(true);
  }, [active, pendingAction?.id, settings.updateOnApproval]);

  const summarySignature = `${settings.summaryLength}|${settings.summaryModel}|${settings.summaryTokenBudget}|${settings.targetEpisodes}|${settings.maxChapters}|${settings.autoMerge}|${settings.chapterDetection}|${JSON.stringify(merges)}`;
  const previousSummarySignatureRef = useRef(summarySignature);
  useEffect(() => {
    if (!active) return;
    const previous = previousSummarySignatureRef.current;
    previousSummarySignatureRef.current = summarySignature;
    if (!summary || !thread?.id || !sourceChapters.length || previous === summarySignature) return;
    const timer = window.setTimeout(() => { void requestSummary(true); }, 700);
    return () => window.clearTimeout(timer);
  }, [active, sourceChapters.length, summary, summarySignature, thread?.id]);

  function beginRename(chapter: JourneyChapter) {
    setEditingChapter(chapter.id);
    setDraftTitle(titles[chapter.id] || chapter.title);
  }

  function saveRename(chapter: JourneyChapter) {
    if (!thread?.id) return;
    const value = draftTitle.trim();
    const next = { ...titles };
    if (value) next[chapter.id] = value.slice(0, 140);
    else delete next[chapter.id];
    setTitles(next);
    localStorage.setItem(viewKey("titles", thread.id), JSON.stringify(next));
    setEditingChapter(null);
    setDraftTitle("");
  }

  function mergeWithNext(chapter: JourneyChapter, nextChapter: JourneyChapter | undefined) {
    if (!thread?.id || !nextChapter) return;
    const range = { start: chapter.start, end: nextChapter.end };
    const group = chapters.filter((item) => item.start <= range.end && item.end >= range.start);
    const groupIds = [...new Set(group.flatMap((item) => chapterPinIds(item)))];
    const mergedId = manualChapterId(range);
    const nextMerges = [...merges.filter((item) => item.end < range.start || item.start > range.end), range].sort((a, b) => a.start - b.start);
    setMerges(nextMerges);
    localStorage.setItem(viewKey("merges", thread.id), JSON.stringify(nextMerges));
    const inheritedTitle = groupIds.map((id) => titles[id]).find(Boolean) || chapter.title;
    if (inheritedTitle) {
      const nextTitles = { ...titles };
      for (const id of groupIds) delete nextTitles[id];
      nextTitles[mergedId] = inheritedTitle;
      setTitles(nextTitles);
      localStorage.setItem(viewKey("titles", thread.id), JSON.stringify(nextTitles));
    }
    if (groupIds.some((id) => pins.includes(id))) {
      const nextPins = pins.filter((id) => !groupIds.includes(id));
      if (nextPins.length < settings.maxPinned) nextPins.push(mergedId);
      setPins(nextPins);
      localStorage.setItem(viewKey("pins", thread.id), JSON.stringify(nextPins));
    }
  }

  function splitChapter(chapter: JourneyChapter) {
    if (!thread?.id) return;
    if (chapter.planned) {
      const nextUngrouped = [...new Set([...ungrouped, chapter.id])];
      setUngrouped(nextUngrouped);
      localStorage.setItem(viewKey("ungrouped", thread.id), JSON.stringify(nextUngrouped));
      return;
    }
    if (!chapter.manual) return;
    const nextMerges = merges.filter((item) => item.end < chapter.start || item.start > chapter.end);
    setMerges(nextMerges);
    localStorage.setItem(viewKey("merges", thread.id), JSON.stringify(nextMerges));
    if (titles[chapter.id]) {
      const nextTitles = { ...titles };
      delete nextTitles[chapter.id];
      setTitles(nextTitles);
      localStorage.setItem(viewKey("titles", thread.id), JSON.stringify(nextTitles));
    }
    if (pins.includes(chapter.id)) {
      const nextPins = pins.filter((id) => id !== chapter.id);
      setPins(nextPins);
      localStorage.setItem(viewKey("pins", thread.id), JSON.stringify(nextPins));
    }
  }

  function openTrajectoryAt(ordinal?: number) {
    // The map lives in a body portal, so close it explicitly before the tab
    // switch hides the Journey panel.
    setMapOpen(false);
    if (typeof ordinal === "number" && onOpenTrajectoryAt) onOpenTrajectoryAt(ordinal);
    else onOpenTrajectory();
  }

  function openClaim(claim: JourneyClaim) {
    const ordinal = claim.sourceIds.map((id) => sourceInfo.get(id)?.eventId).find((value): value is number => typeof value === "number");
    openTrajectoryAt(ordinal);
  }

  function renderChapter(chapter: JourneyChapter, index: number, dense = false) {
    const isExpanded = expandedIds.has(chapter.id);
    const isPinned = chapterPinIds(chapter).some((id) => pins.includes(id));
    const isCurrent = chapter.id === activeChapter?.id;
    const nextChapter = chapters[index + 1];
    const chapterSources = chapterEvidence.get(chapter.id)?.sources ?? 0;
    const episodes = dense || showAllEpisodes.has(chapter.id) ? chapter.episodes : chapter.episodes.slice(0, settings.targetEpisodes);
    const hidden = chapter.episodes.length - episodes.length;
    return <div className={`journey-chapter${dense ? " dense" : ""}${isCurrent ? " current" : ""}`} key={chapter.id} data-journey-chapter={chapter.id}>
      <div className="journey-chapter-row">
        {editingChapter === chapter.id ? <div className="journey-chapter-editor">
          <input value={draftTitle} autoFocus aria-label={t("Rename chapter")} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveRename(chapter); } if (event.key === "Escape") { setEditingChapter(null); setDraftTitle(""); } }} />
          <button onClick={() => saveRename(chapter)}>{t("Save")}</button>
          <button onClick={() => { setEditingChapter(null); setDraftTitle(""); }}>{t("Cancel")}</button>
        </div> : <button className="journey-chapter-toggle" aria-expanded={isExpanded} onClick={() => toggleChapter(chapter.id)}>
          <span className="journey-chevron">{isExpanded ? "▾" : "›"}</span>
          <span className={isPinned ? "journey-chapter-index pinned" : "journey-chapter-index"} title={isPinned ? t("Pinned") : undefined}>{String(index + 1).padStart(2, "0")}</span>
          <span className="journey-chapter-title">{chapter.title}</span>
          <span className="journey-chapter-meta">{plural(chapter.steps, t("step"))}{chapterSources ? <span className="journey-chapter-sources">{` · ${plural(chapterSources, t("source"))}`}</span> : null}{chapter.status !== "done" ? ` · ${t(chapterStatusLabel(chapter.status))}` : ""}</span>
        </button>}
        {editingChapter !== chapter.id && <div className="journey-chapter-actions">
          <button className="journey-row-action" onClick={() => beginRename(chapter)}>{t("Rename")}</button>
          {nextChapter && <button className="journey-row-action" title={t("Merge with next chapter")} onClick={() => mergeWithNext(chapter, nextChapter)}>{t("Merge")}</button>}
          {chapter.manual || chapter.planned ? <button className="journey-row-action" title={t("Split chapter group")} onClick={() => splitChapter(chapter)}>{t("Split")}</button> : null}
          <button className={isPinned ? "journey-pin pinned" : "journey-pin"} aria-pressed={isPinned} title={isPinned ? t("Unpin chapter") : t("Pin chapter")} onClick={() => togglePin(chapter.id)}>{isPinned ? t("Pinned") : t("Pin")}</button>
        </div>}
      </div>
      {isExpanded && <div className="journey-episodes">
        {episodes.map((episode) => <button className={`journey-episode ${episode.status}`} key={episode.id} title={`Events #${episode.start}–#${episode.end}`} onClick={() => openTrajectoryAt(episode.start)}>
          <span className="journey-episode-head"><span className="journey-episode-dot" /><span className="journey-episode-title">{episode.title}</span><span className="journey-episode-meta">#{episode.start}{episode.end !== episode.start ? `–#${episode.end}` : ""}</span></span>
          <span className="journey-episode-outcome">{episode.outcome}</span>
        </button>)}
        {hidden > 0 && <button className="journey-show-more" onClick={() => setShowAllEpisodes((current) => new Set(current).add(chapter.id))}>{t("Show {count} more", { count: hidden })}</button>}
      </div>}
    </div>;
  }

  const filteredMapChapters = mapQuery.trim()
    ? chapters.filter((chapter) => `${chapter.title} ${chapter.summary} ${chapter.episodes.map((episode) => `${episode.title} ${episode.outcome}`).join(" ")}`.toLowerCase().includes(mapQuery.trim().toLowerCase()))
    : chapters;
  const selectedMapChapter = filteredMapChapters.find((chapter) => chapter.id === mapSelected)
    ?? filteredMapChapters.find((chapter) => chapter.id === activeChapter?.id)
    ?? filteredMapChapters[0];
  const selectedEvidence = selectedMapChapter ? chapterEvidence.get(selectedMapChapter.id) ?? evidence : evidence;
  const filterChapters = outlineFilter === "pinned" ? pinnedChapters : outlineFilter === "open" ? chapters.filter(isOpenChapter) : chapters;

  const since = settings.sinceYouLeft && !dismissedSince && digest ? <aside className="journey-since">
    <div className="journey-since-head"><span>{t("Since your last visit")}</span><div className="journey-since-actions"><button onClick={jumpToFirstNew}>{t("Jump to first new")}</button><button onClick={dismissSince}>{t("Dismiss")}</button></div></div>
    <p>{plural(digest.steps, t("step"))}{digest.sources ? ` · ${plural(digest.sources, t("new source"), t("new sources"))}` : ""}{digest.approval ? ` · ${t("{count} approval waiting", { count: digest.approval })}` : ""}</p>
  </aside> : null;

  const summaryLabel = summary ? (summary.source === "preview" ? t("Preview summary") : t("AI brief")) : t("Research brief");
  const summaryBehind = summary ? Math.max(0, steps - summary.coversTo) : 0;
  const claims = summary?.claims ?? [];
  const claimStats = [
    [t("Supported"), claims.filter((claim) => claim.status === "supported").length],
    [t("Needs evidence"), claims.filter((claim) => claim.status === "open").length],
    [t("Contradicted"), claims.filter((claim) => claim.status === "contradicted").length],
  ].filter(([, count]) => Number(count) > 0).map(([label, count]) => `${label} ${count}`).join(" · ");
  const summaryMeta = summaryUpdating
    ? t("updating…")
    : summary
      ? `${relativeTime(summary.updatedAt, t)} · #1–#${summary.coversTo}${summaryBehind ? ` · +${summaryBehind}` : ""}`
      : `${modeLabel} · ${t("from {count} events", { count: steps })}`;

  const header = <header className="journey-header">
    <div className="journey-topline">
      <span className="journey-kicker">Journey</span>
      <div className="journey-views">
        <button className={view === "story" ? "active" : ""} onClick={() => switchView("story")}>{t("Story")}</button>
        <button className={view === "outline" ? "active" : ""} onClick={() => switchView("outline")}>{t("Outline")}</button>
        {mapAvailable && <button onClick={() => setMapOpen(true)}>{t("Map")}</button>}
      </div>
    </div>
    <h1>{thread?.title || t("New research task")}</h1>
    <div className="journey-status-line" role="status" aria-live="polite">
      <strong className={`journey-status-text ${status}`}>{t(statusLabel(status))}</strong>
      {duration && <><span className="journey-dot-sep">·</span><span>{duration}</span></>}
      <span className="journey-dot-sep">·</span><span>{plural(steps, t("step"))}</span>
      {attentionLabel && <button className="journey-open-chip" onClick={reviewOpenSteps}>{attentionLabel}</button>}
    </div>
  </header>;

  const dock = <footer className="journey-dock">
    <div className="journey-dock-head"><strong>{t("Next move")}</strong><span>{plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</span></div>
    <p>{t(nextMove)}</p>
    <div className="journey-dock-actions">
      {pendingAction
        ? <button className="journey-primary" onClick={onReviewPending}>{t("Review approval")}</button>
        : failedChapterCount > 0
          ? <button className="journey-primary" onClick={reviewOpenSteps}>{t("Review failed chapter")}</button>
          : evidence.open > 0 || hasOpenChapters
            ? <button className="journey-primary" onClick={reviewOpenSteps}>{evidence.open > 0 ? t("Review open steps") : t("Review open chapters")}</button>
            : chatOnly && onStartResearch
              ? <button className="journey-primary" onClick={onStartResearch}>{t("Start a research task")}</button>
              : <button className="journey-primary" onClick={onOpenTrajectory}>{t("Open trajectory")}</button>}
      {(pendingAction || evidence.open > 0 || hasOpenChapters || (chatOnly && onStartResearch)) && <button className="journey-ghost" onClick={onOpenTrajectory}>{t("Open trajectory")}</button>}
      <button className="journey-ghost" onClick={onOpenSettings}>{t("Journey settings")}</button>
    </div>
  </footer>;

  if (!steps) {
    return <section className="journey-view" aria-label={t("Agent journey")}>
      {header}
      <div className="journey-empty-state">
        <h2>{t("No journey yet")}</h2>
        <p>{t("Journey starts after the first research turn. It will summarize what the agent read, what it produced, and what still needs review.")}</p>
        {onStartResearch && <button className="journey-primary" onClick={onStartResearch}>{t("Start a research task")}</button>}
        <button className="journey-ghost" onClick={onOpenSettings}>{t("Journey settings")}</button>
      </div>
    </section>;
  }

  return <section className="journey-view" aria-label={t("Agent journey")} ref={scrollRef} onScroll={updateScrollState}>
    {header}
    <div className="journey-scrubber" aria-label={t("Chapter timeline")} style={{ "--journey-playhead": `${Math.round(readProgress * 100)}%` } as React.CSSProperties}>
      <div className="journey-scrubber-bars">
        {chapters.map((chapter) => <button key={chapter.id} className={chapter.id === activeChapter?.id ? "current" : chapter.status === "error" ? "error" : "done"} style={{ flex: Math.max(1, chapter.steps) }} title={`${chapter.title} · ${plural(chapter.steps, t("step"))}`} aria-label={`${chapter.title}, ${plural(chapter.steps, t("step"))}`} onClick={() => jumpToChapter(chapter.id)} />)}
        <span className="journey-playhead" />
        {chapters.filter((chapter) => pins.includes(chapter.id)).map((chapter) => <span key={`pin-${chapter.id}`} className="journey-mark pin" style={{ left: `${Math.min(99, (chapters.slice(0, chapters.indexOf(chapter)).reduce((total, item) => total + item.steps, 0) / Math.max(1, steps)) * 100)}%` }} />)}
        {chapters.filter((chapter) => chapter.status === "error").map((chapter) => <span key={`error-${chapter.id}`} className="journey-mark error" style={{ left: `${Math.min(99, (chapters.slice(0, chapters.indexOf(chapter)).reduce((total, item) => total + item.steps, 0) / Math.max(1, steps)) * 100)}%` }} />)}
      </div>
      <div className="journey-scrubber-meta"><span>{duration || t("This session")} · {plural(chapters.length, t("chapter"))}</span>{!atLatest && <button onClick={jumpToLatest}>{t("Jump to latest")}</button>}</div>
    </div>
    {since}
    {view === "story" ? <div className="journey-story">
      <section className="journey-brief">
        <div className="journey-section-head">
          <h2>{summaryLabel}</h2>
          {summaryError
            ? <button className="journey-inline-status" title={summaryError} onClick={() => void requestSummary(true)}>{summary ? t("Update failed · Retry") : t("AI unavailable · Retry")}</button>
            : <span>{summaryMeta}</span>}
        </div>
        <p>{brief}</p>
        <button className="journey-text-action" onClick={onOpenTrajectory}>{t("Open all {count} events", { count: steps })} →</button>
      </section>
      <section className="journey-section">
        <div className="journey-section-head"><h2>{t("Chapters")}</h2><div className="journey-section-actions"><span>{t("{count} total", { count: chapters.length })}</span>{mapAvailable && <button onClick={() => setMapOpen(true)}>{t("Open map")}</button>}</div></div>
        {pinnedChapters.length > 0 && <div className="journey-pinned"><span className="journey-mini-label">{t("Pinned")}</span>{pinnedChapters.map((chapter) => <button key={chapter.id} onClick={() => jumpToChapter(chapter.id)}>{chapter.title}<span>{plural(chapter.steps, "step")}</span></button>)}</div>}
        {hiddenChapterCount > 0 && <button className="journey-earlier" onClick={() => setShowAllChapters(true)}>{t("Earlier chapters ({count})", { count: hiddenChapterCount })} ↑</button>}
        <div className="journey-chapters">{visibleChapters.map((chapter) => renderChapter(chapter, chapters.indexOf(chapter)))}</div>
      </section>
      {settings.evidenceLedger && <section className="journey-section">
        <div className="journey-section-head"><h2>{t("Evidence")}</h2><span>{t("from this thread")}</span></div>
        {evidence.sources + evidence.files + evidence.artifacts + evidence.open === 0
          ? <p className="journey-evidence-empty">{hasToolActivity ? t("No sources or artifacts were recorded for this run.") : t("No sources or artifacts yet. Ask a research question or attach a paper.")}</p>
          : <dl className="journey-evidence">
            <div><dt>{t("Sources")}</dt><dd>{evidence.sources}</dd></div>
            <div><dt>{t("Files")}</dt><dd>{evidence.files}</dd></div>
            <div><dt>{t("Artifacts")}</dt><dd>{evidence.artifacts}</dd></div>
            <div><dt>{t("Pending")}</dt><dd>{evidence.open}</dd></div>
          </dl>}
      </section>}
      {settings.openClaims && (claims.length > 0 || summary) && <section className="journey-section journey-claims-section">
        <div className="journey-section-head"><h2>{t("Claims")}</h2><span>{claims.length ? claimStats : t("from AI summary")}</span></div>
        {claims.length ? <div className="journey-claims">{claims.map((claim) => {
          const claimText = plainText(claim.text);
          const sourceLabels = claim.sourceIds.map((id) => sourceInfo.get(id)?.title).filter(Boolean) as string[];
          const sourceMeta = sourceLabels.length
            ? `${truncate(sourceLabels[0], 56)}${sourceLabels.length > 1 ? ` +${sourceLabels.length - 1}` : ""}`
            : claim.sourceIds.length ? plural(claim.sourceIds.length, t("source")) : t("no sources");
          return <button className="journey-claim" key={claim.id} title={`${claimText} — ${t(claimStatusLabel(claim.status))}`} onClick={() => openClaim(claim)}>
            <span className={`journey-claim-dot ${claim.status}`} />
            <span className="journey-claim-copy"><span className="journey-claim-text">{claimText}</span><span className="journey-claim-meta" title={sourceLabels.join(" · ")}>{t(claimStatusLabel(claim.status))} · {sourceMeta}</span></span>
          </button>;
        })}</div> : <p className="journey-claims-empty">{t("No claims extracted yet.")}</p>}
      </section>}
      {dock}
    </div> : <div className="journey-outline">
      <div className="journey-outline-filters">
        <button className={outlineFilter === "all" ? "active" : ""} onClick={() => setOutlineFilter("all")}>{t("All {count}", { count: chapters.length })}</button>
        <button className={outlineFilter === "open" ? "active" : ""} onClick={() => setOutlineFilter("open")}>{t("Open {count}", { count: chapters.filter(isOpenChapter).length })}</button>
        <button className={outlineFilter === "pinned" ? "active" : ""} onClick={() => setOutlineFilter("pinned")}>{t("Pinned {count}", { count: pinnedChapters.length })}</button>
      </div>
      {pinnedChapters.length > 0 && <div className="journey-pinned outline"><span className="journey-mini-label">{t("Pinned")}</span>{pinnedChapters.map((chapter) => <button key={chapter.id} onClick={() => jumpToChapter(chapter.id)}>{chapter.title}<span>{plural(chapter.steps, t("step"))}</span></button>)}</div>}
      <div className="journey-outline-tree">{filterChapters.map((chapter) => renderChapter(chapter, chapters.indexOf(chapter), true))}</div>
      <p className="journey-outline-hint">{t("Click a chapter to expand. Open map for the full tree.")}</p>
      {dock}
    </div>}
    {mapOpen && typeof document !== "undefined" && createPortal(<div className="journey-map-scrim app-dialog-overlay" role="presentation" onMouseDown={() => setMapOpen(false)}>
      <section ref={mapDialogRef} tabIndex={-1} className="journey-map app-dialog app-dialog-full" role="dialog" aria-modal="true" aria-label={t("Journey map")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="journey-map-header">
          <div><h2>{t("Journey map")}</h2><p>{thread?.title || t("New research task")} · {plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</p></div>
          <div className="journey-map-tools">
            <div className="journey-map-zoom" role="group" aria-label={t("Map zoom")}>
              <button onClick={() => setMapZoom((current) => Math.max(0.8, Math.round((current - 0.1) * 10) / 10))} aria-label={t("Zoom out")}>−</button>
              <button className="journey-map-zoom-value" onClick={() => setMapZoom(1)} aria-label={t("Reset map zoom")} title={t("Reset map zoom")}>{Math.round(mapZoom * 100)}%</button>
              <button onClick={() => setMapZoom((current) => Math.min(1.4, Math.round((current + 0.1) * 10) / 10))} aria-label={t("Zoom in")}>+</button>
            </div>
            <input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder={t("Search chapters and episodes")} aria-label={t("Search journey")} />
            <button onClick={() => setMapOpen(false)}>{t("Close")}</button>
          </div>
        </header>
        <div className="journey-map-body">
          <div className="journey-map-tree">
            <div className="journey-map-canvas" style={{ zoom: mapZoom } as React.CSSProperties}>
              <div className="journey-map-root"><span>{t("Research question")}</span><strong>{thread?.title || t("New research task")}</strong><small>{plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</small></div>
              <div className="journey-map-chapters">
                {filteredMapChapters.map((chapter) => <div className="journey-map-chapter-group" key={chapter.id}>
                  <button className={selectedMapChapter?.id === chapter.id ? "journey-map-chapter selected" : "journey-map-chapter"} onClick={() => setMapSelected(chapter.id)}>
                    <span className="journey-map-index">{String(chapters.indexOf(chapter) + 1).padStart(2, "0")}</span>
                    <span><strong>{chapter.title}</strong><small>{plural(chapter.steps, t("step"))} · {t(chapterStatusLabel(chapter.status))}</small></span>
                  </button>
                  {selectedMapChapter?.id === chapter.id && <div className="journey-map-episode-list">{chapter.episodes.map((episode) => <button key={episode.id} onClick={() => openTrajectoryAt(episode.start)}><span className={`journey-map-episode-dot ${episode.status}`} /><strong title={episodeLabel(episode)}>{episodeLabel(episode)}</strong><small>#{episode.start}</small></button>)}</div>}
                </div>)}
              </div>
              {filteredMapChapters.length === 0 && <p className="journey-map-empty">{t("No chapters match this search.")}</p>}
            </div>
          </div>
          <aside className="journey-map-inspector">
            {selectedMapChapter ? <>
              <span className="journey-kicker">{t("Chapter")} {String(chapters.indexOf(selectedMapChapter) + 1).padStart(2, "0")} · {t(chapterStatusLabel(selectedMapChapter.status))}</span>
              <h2>{selectedMapChapter.title}</h2>
              <p className="journey-map-meta">{plural(selectedMapChapter.steps, t("step"))} · #{selectedMapChapter.start}–#{selectedMapChapter.end}</p>
              <p className="journey-map-summary">{selectedMapChapter.summary}</p>
              <h3>{t("Episodes")}</h3>
              <div className="journey-map-episodes">{selectedMapChapter.episodes.map((episode) => <button key={episode.id} onClick={() => openTrajectoryAt(episode.start)}><span>#{episode.start}</span><strong title={episodeLabel(episode)}>{episodeLabel(episode)}</strong><small>{plural(episode.steps, t("step"))}</small></button>)}</div>
              {settings.evidenceLedger && <>
                <h3>{t("Evidence")}</h3>
                <div className="journey-map-evidence"><span>{plural(selectedEvidence.sources, t("source"))}</span><span>{plural(selectedEvidence.files, t("file"))}</span><span>{plural(selectedEvidence.artifacts, t("artifact"))}</span></div>
              </>}
              <div className="journey-map-actions">
                <button className="journey-primary" onClick={() => openTrajectoryAt(selectedMapChapter.start)}>{t("Open in Trajectory")}</button>
                <button className="journey-ghost" onClick={() => togglePin(selectedMapChapter.id)}>{chapterPinIds(selectedMapChapter).some((id) => pins.includes(id)) ? t("Unpin chapter") : t("Pin chapter")}</button>
              </div>
            </> : <p className="journey-map-empty">{t("Select a chapter to inspect it.")}</p>}
          </aside>
        </div>
        <footer className="journey-map-footer"><span>{t("Click a chapter to inspect. Hover a row to see its event range.")}</span><span>{summaryLabel} · {plural(steps, t("step"))}</span></footer>
      </section>
    </div>, document.body)}
  </section>;
}
