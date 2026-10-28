import {
  DEFAULT_PROACTIVE_SETTINGS,
  emptyProactiveState,
  PROACTIVE_DEFAULT_TTL_MS,
  PROACTIVE_HISTORY_RETENTION_MS,
  PROACTIVE_STORAGE_KEY,
  type ProactiveEvidence,
  type ProactiveEvent,
  type ProactiveSettings,
  type ProactiveSignal,
  type ProactiveSuggestion,
  type ProactiveState,
} from "./proactive-types";

const DEFAULT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
const DISMISSED_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRED_DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUGGESTIONS = 200;

export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function proactiveId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fingerprintFor(source: string, key: string): string {
  return `${source}:${hashString(key)}`;
}

export function localDayStart(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isQuietHours(settings: ProactiveSettings, now: number): boolean {
  const quiet = settings.quietHours;
  if (!quiet.enabled) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function createdToday(state: ProactiveState, now: number): number {
  const start = localDayStart(now);
  return state.suggestions.filter((suggestion) => suggestion.createdAt >= start && suggestion.origin !== "manual").length;
}

export function canPresent(state: ProactiveState, now: number, composerFocused: boolean): boolean {
  if (state.settings.mode === "off") return false;
  const queued = state.suggestions.filter((suggestion) => suggestion.status === "queued");
  if (!queued.length) return false;
  if (state.settings.mode === "manual") return queued.some((suggestion) => suggestion.origin === "manual");
  if (composerFocused) return false;
  if (isQuietHours(state.settings, now)) return false;
  if (now < state.suppressedUntil) return false;
  return true;
}

function dedupeWindowFor(signal: ProactiveSignal): number {
  if (signal.dedupeWindowMs && signal.dedupeWindowMs > 0) return signal.dedupeWindowMs;
  switch (signal.source) {
    case "selection":
    case "search":
      return 2 * 60 * 60 * 1000;
    case "latex":
    case "citation":
      return 30 * 60 * 1000;
    default:
      return DEFAULT_DEDUPE_WINDOW_MS;
  }
}

export function isDuplicate(state: ProactiveState, signal: ProactiveSignal, now: number): boolean {
  const windowMs = dedupeWindowFor(signal);
  return state.suggestions.some((suggestion) => {
    if (suggestion.fingerprint !== signal.fingerprint) return false;
    const age = now - suggestion.updatedAt;
    if (suggestion.status === "queued" || suggestion.status === "shown" || suggestion.status === "accepted") {
      return age < windowMs;
    }
    if (suggestion.status === "dismissed") return age < DISMISSED_DEDUPE_WINDOW_MS;
    if (suggestion.status === "expired") return age < EXPIRED_DEDUPE_WINDOW_MS;
    return false;
  });
}

export function createSuggestion(signal: ProactiveSignal, now: number): ProactiveSuggestion {
  return {
    ...signal,
    id: proactiveId("sug"),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + PROACTIVE_DEFAULT_TTL_MS,
    status: "queued",
    confidence: signal.confidence ?? 0.7,
    origin: signal.origin ?? "auto",
  };
}

function event(type: ProactiveEvent["type"], suggestionId: string, at: number, detail?: string): ProactiveEvent {
  return { id: proactiveId("evt"), suggestionId, type, at, detail };
}

export function addEvent(state: ProactiveState, next: ProactiveEvent): ProactiveState {
  return { ...state, events: [next, ...state.events].slice(0, 1000) };
}

export function expireAndPrune(state: ProactiveState, now: number): ProactiveState {
  const cutoff = now - PROACTIVE_HISTORY_RETENTION_MS;
  const events: ProactiveEvent[] = [];
  const suggestions = state.suggestions
    .filter((suggestion) => suggestion.createdAt >= cutoff)
    .map((suggestion) => {
      if ((suggestion.status === "queued" || suggestion.status === "shown") && suggestion.expiresAt <= now) {
        events.push(event("expired", suggestion.id, now));
        return { ...suggestion, status: "expired" as const, updatedAt: now };
      }
      return suggestion;
    })
    .slice(0, MAX_SUGGESTIONS);
  const existingEvents = state.events.filter((entry) => entry.at >= cutoff);
  if (!events.length && existingEvents.length === state.events.length && suggestions.length === state.suggestions.length) {
    return state;
  }
  return { ...state, suggestions, events: [...events, ...existingEvents].slice(0, 1000) };
}

export function loadProactiveState(): ProactiveState {
  if (typeof window === "undefined") return emptyProactiveState();
  try {
    const raw = window.localStorage.getItem(PROACTIVE_STORAGE_KEY);
    if (!raw) return emptyProactiveState();
    const parsed = JSON.parse(raw) as Partial<ProactiveState>;
    if (!parsed || parsed.version !== 1) return emptyProactiveState();
    return expireAndPrune({
      version: 1,
      settings: {
        ...DEFAULT_PROACTIVE_SETTINGS,
        ...(parsed.settings ?? {}),
        quietHours: { ...DEFAULT_PROACTIVE_SETTINGS.quietHours, ...(parsed.settings?.quietHours ?? {}) },
        sources: { ...DEFAULT_PROACTIVE_SETTINGS.sources, ...(parsed.settings?.sources ?? {}) },
      },
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      suppressedUntil: typeof parsed.suppressedUntil === "number" ? parsed.suppressedUntil : 0,
    }, Date.now());
  } catch {
    return emptyProactiveState();
  }
}

export function saveProactiveState(state: ProactiveState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROACTIVE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked localStorage must never break the live UI.
  }
}

export function markSuggestionShown(state: ProactiveState, id: string, now: number): ProactiveState {
  const target = state.suggestions.find((suggestion) => suggestion.id === id && suggestion.status === "queued");
  if (!target) return state;
  const suggestions = state.suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, status: "shown" as const, shownAt: now, updatedAt: now } : suggestion,
  );
  return addEvent({ ...state, suggestions }, event("shown", id, now));
}

export function markSuggestionAccepted(state: ProactiveState, id: string, now: number): ProactiveState {
  const suggestions = state.suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, status: "accepted" as const, actedAt: now, updatedAt: now } : suggestion,
  );
  return addEvent({ ...state, suggestions }, event("accepted", id, now));
}

export function markSuggestionDismissed(state: ProactiveState, id: string, now: number): ProactiveState {
  const suggestions = state.suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, status: "dismissed" as const, dismissedAt: now, updatedAt: now } : suggestion,
  );
  return addEvent({ ...state, suggestions }, event("dismissed", id, now));
}

export function markSuggestionUndone(state: ProactiveState, id: string, now: number): ProactiveState {
  const suggestions = state.suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, status: "undone" as const, updatedAt: now } : suggestion,
  );
  return addEvent({ ...state, suggestions }, event("undone", id, now));
}

export function dismissalsInLastThree(state: ProactiveState, now: number): number {
  const since = now - 3 * 60 * 60 * 1000;
  return state.suggestions.filter((suggestion) => suggestion.status === "dismissed" && (suggestion.dismissedAt ?? 0) >= since).length;
}

export function recordSignal(state: ProactiveState, signal: ProactiveSignal, now: number): ProactiveState {
  if (state.settings.mode === "off") return state;
  const origin = signal.origin ?? "auto";
  if (state.settings.mode === "manual" && origin !== "manual") return state;
  if (signal.source === "search" && !state.settings.sources.search) return state;
  if (signal.source === "selection" && !state.settings.sources.selection) return state;
  if (signal.source === "latex" && !state.settings.sources.latex) return state;
  if (signal.source === "citation" && !state.settings.sources.citation) return state;
  if (origin === "auto" && now < state.suppressedUntil) return state;
  if (origin === "auto" && createdToday(state, now) >= state.settings.dailyBudget) return state;
  if (isDuplicate(state, signal, now)) return state;
  const suggestion = createSuggestion(signal, now);
  return addEvent({ ...state, suggestions: [suggestion, ...state.suggestions].slice(0, MAX_SUGGESTIONS) }, event("created", suggestion.id, now));
}

export function updateSettings(state: ProactiveState, patch: Partial<ProactiveSettings>): ProactiveState {
  return {
    ...state,
    settings: {
      ...state.settings,
      ...patch,
      quietHours: { ...state.settings.quietHours, ...(patch.quietHours ?? {}) },
      sources: { ...state.settings.sources, ...(patch.sources ?? {}) },
    },
  };
}

export function setAllQueuedShown(state: ProactiveState, now: number, composerFocused: boolean): ProactiveState {
  if (!canPresent(state, now, composerFocused)) return state;
  let next = state;
  for (const suggestion of state.suggestions) {
    if (suggestion.status !== "queued") continue;
    next = markSuggestionShown(next, suggestion.id, now);
  }
  return next;
}

export function findUncitedClaims(text: string): string[] {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [];
  const seen = new Set<string>();
  const claims: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (sentence.length < 45 || sentence.length > 320) continue;
    if (/\[\d+\]|\([A-Z][^)]*\d{4}[^)]*\)|https?:\/\/|doi:|arxiv:/i.test(sentence)) continue;
    if (!/\b(shows?|suggests?|demonstrates?|indicates?|outperforms?|improves?|reduces?|increases?|achieves?|finds?|found|reports?|results?|evidence|significant|state-of-the-art|better than|comparable)\b/i.test(sentence)) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push(sentence);
    if (claims.length >= 2) break;
  }
  return claims;
}

export function citationSignalFromMessages(
  messages: Array<{ id: string; role: string; text: string }>,
  context: { threadId?: string | null; projectId?: string | null; workspace?: string },
): ProactiveSignal | null {
  const latest = [...messages].reverse().find((message) => message.role === "assistant" && message.text.trim().length > 0);
  if (!latest) return null;
  const claims = findUncitedClaims(latest.text);
  if (!claims.length) return null;
  const evidence: ProactiveEvidence[] = claims.map((quote) => ({
    kind: "citation",
    quote,
    messageId: latest.id,
    threadId: context.threadId ?? undefined,
  }));
  return {
    source: "citation",
    title: `${claims.length} claim${claims.length === 1 ? "" : "s"} without a citation`,
    whyNow: "You asked Proactive agent to review the latest answer. These sentences state a result without a source.",
    evidence,
    action: {
      kind: "insert",
      label: "Find sources",
      text: `Find sources for these claims and add citations to the answer:\n\n${claims.map((claim, index) => `${index + 1}. ${claim}`).join("\n")}`,
    },
    confidence: 0.55,
    fingerprint: fingerprintFor("citation", `${context.threadId ?? "draft"}:${claims.join("|")}`),
    threadId: context.threadId,
    projectId: context.projectId,
    workspace: context.workspace,
    origin: "manual",
    dedupeWindowMs: 30 * 60 * 1000,
  };
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function evidenceLabel(evidence: ProactiveEvidence): string {
  switch (evidence.kind) {
    case "search":
      return `${evidence.resultCount} result${evidence.resultCount === 1 ? "" : "s"} · “${evidence.query}”`;
    case "selection":
      return `${evidence.paperTitle} · p. ${evidence.page}`;
    case "terminal":
      return evidence.filePath ? `${evidence.filePath}${evidence.line ? `:${evidence.line}` : ""}` : `${evidence.command} · exit ${evidence.exitCode}`;
    case "citation":
      return "Uncited claim";
    case "generic":
      return evidence.label;
  }
}
