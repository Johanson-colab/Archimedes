import { useEffect, useMemo, useRef, useState } from "react";
import { useUISettings } from "./i18n";
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
  onOpenSettings: () => void;
  onReviewPending: () => void;
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
  status: "waiting" | "running" | "attention" | "complete" | "not-started";
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

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
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

function collectFiles(payload: unknown, files: Set<string>): void {
  if (Array.isArray(payload)) {
    for (const item of payload) collectFiles(item, files);
    return;
  }
  if (!payload || typeof payload !== "object") return;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if ((key === "path" || key === "file" || key === "filePath") && typeof value === "string") files.add(value);
    else if (key === "files" && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") files.add(item);
        else collectFiles(item, files);
      }
    } else collectFiles(value, files);
  }
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

function eventHasError(event: ResearchEvent): boolean {
  const payload = record(event.payload);
  if (event.type.toLowerCase().includes("error")) return true;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) return true;
  if (event.type === "tool_result" || event.type === "tool.result") {
    const content = payload.content;
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && typeof parsed.error === "string" && parsed.error.trim()) return true;
      } catch { /* plain text tool output */ }
    }
  }
  return false;
}

function eventFiles(event: ResearchEvent): Set<string> {
  const files = new Set<string>();
  collectFiles(event.payload, files);
  return files;
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
  for (const event of events) {
    const callId = text(record(event.payload).call_id);
    if (callId && (event.type === "tool_result" || event.type === "tool.result")) results.set(callId, event);
  }
  const episodes: JourneyEpisode[] = [];
  let index = 0;
  for (const event of events) {
    if (event.type === "user_message") {
      const value = eventText(event);
      if (!value) continue;
      episodes.push({ id: `${event.id}:request`, title: index === 0 ? "Framed the request" : "Follow-up request", outcome: truncate(value, 140), status: "done", start: event.sequence, end: event.sequence, steps: 1 });
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
        start: event.sequence,
        end: result?.sequence ?? event.sequence,
        steps: result ? 2 : 1,
      });
      index += 1;
      continue;
    }
    if (event.type === "assistant_message") {
      const value = eventText(event);
      if (!value) continue;
      episodes.push({ id: `${event.id}:answer`, title: "Drafted the answer", outcome: truncate(value, 140), status: "done", start: event.sequence, end: event.sequence, steps: 1 });
      index += 1;
    }
  }
  if (!episodes.length) {
    episodes.push({ id: "thread:empty", title: "Research step", outcome: "The event range has not produced a readable step yet.", status: "open", start: events[0]?.sequence ?? 0, end: events.at(-1)?.sequence ?? 0, steps: events.length });
  }
  return episodes;
}

function chapterFromEvents(events: ResearchEvent[], index: number, firstOfTurn: boolean, t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const sources = new Set<string>();
  const files = new Set<string>();
  const artifacts = new Set<string>();
  let toolCalls = 0;
  let lastAnswer = "";
  let hasAnswer = false;
  for (const event of sorted) {
    if (event.type === "tool_call") {
      toolCalls += 1;
      const name = toolName(event);
      if (name === "write_file" || name === "write_artifact") {
        const path = text(record(record(event.payload).arguments).path) || text(record(record(event.payload).arguments).file_path);
        if (path) artifacts.add(path);
      }
    }
    if (event.type === "source_evidence") for (const source of eventSources(event)) sources.add(source);
    for (const file of eventFiles(event)) files.add(file);
    if (event.type === "assistant_message") {
      const value = eventText(event);
      if (value) { lastAnswer = value; hasAnswer = true; }
    }
  }
  const firstUser = sorted.find((event) => event.type === "user_message");
  const title = firstOfTurn && firstUser ? truncate(eventText(firstUser), 58) : `Continued research ${index + 1}`;
  const summaryParts = [plural(sorted.length, t("step"))];
  if (toolCalls) summaryParts.push(plural(toolCalls, t("tool call")));
  if (sources.size) summaryParts.push(plural(sources.size, t("source")));
  if (files.size) summaryParts.push(plural(files.size, t("file")));
  if (artifacts.size) summaryParts.push(plural(artifacts.size, t("artifact")));
  const summary = `${summaryParts.join(" · ")}${lastAnswer ? ` · ${truncate(lastAnswer, 150)}` : ""}`;
  return {
    id: `${sorted[0]?.turn_id || "thread"}:${sorted[0]?.sequence ?? index}:${index}`,
    title: title || `Research chapter ${index + 1}`,
    summary,
    status: hasAnswer ? "done" : "open",
    start: sorted[0]?.sequence ?? 0,
    end: sorted.at(-1)?.sequence ?? 0,
    steps: sorted.length,
    episodes: buildEpisodes(sorted),
  };
}

function mergeChapters(chapters: JourneyChapter[], first: number, last: number, t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter {
  const merged = chapters.slice(first, last);
  const episodes = merged.flatMap((chapter) => chapter.episodes);
  return {
    id: `merged:${merged[0]?.id ?? "early"}`,
    title: "Earlier research",
    summary: `${plural(merged.length, t("chapter"))} · ${plural(merged.reduce((total, chapter) => total + chapter.steps, 0), t("step"))}`,
    status: merged.some((chapter) => chapter.status === "error") ? "error" : merged.some((chapter) => chapter.status === "waiting") ? "waiting" : "done",
    start: merged[0]?.start ?? 0,
    end: merged.at(-1)?.end ?? 0,
    steps: merged.reduce((total, chapter) => total + chapter.steps, 0),
    episodes: episodes.slice(-12),
  };
}

function buildChapters(events: ResearchEvent[], settings: JourneySettings, pendingAction: AgentAction | null, thread: ResearchThread | null, t: (key: string, values?: Record<string, string | number>) => string): JourneyChapter[] {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
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
    for (const [segmentIndex, segment] of segments.entries()) {
      chapters.push(chapterFromEvents(segment, chapters.length, segmentIndex === 0, t));
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
    const keep = Math.max(1, settings.maxChapters - 1);
    const merged = mergeChapters(chapters, 0, chapters.length - keep, t);
    chapters = [merged, ...chapters.slice(chapters.length - keep)];
  }
  return chapters;
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
  for (const event of events) {
    for (const source of eventSources(event)) sources.add(source);
    for (const file of eventFiles(event)) files.add(file);
    if (eventHasError(event)) open += 1;
    if (event.type === "tool_call" && (toolName(event) === "write_file" || toolName(event) === "write_artifact")) {
      const path = text(record(record(event.payload).arguments).path) || text(record(record(event.payload).arguments).file_path);
      if (path) artifacts.add(path);
    }
  }
  return { sources: sources.size, files: files.size, artifacts: artifacts.size, open };
}

function buildBrief(data: { steps: number; chapters: JourneyChapter[]; evidence: JourneyEvidence; events: ResearchEvent[]; pendingAction: AgentAction | null; thread: ResearchThread | null; settings: JourneySettings }, t: (key: string, values?: Record<string, string | number>) => string): string {
  const { steps, chapters, evidence, events, pendingAction, thread, settings } = data;
  if (!steps) return t("No research activity yet. Start a task and the journey will take shape here.");
  const answer = [...events].reverse().find((event) => event.type === "assistant_message");
  const answerText = answer ? truncate(eventText(answer), settings.summaryLength === "concise" ? 110 : settings.summaryLength === "detailed" ? 260 : 170) : "";
  const facts = t("This thread has {steps} across {chapters}, with {sources} and {files} touched.", {
    steps: plural(steps, t("step")),
    chapters: plural(chapters.length, t("chapter")),
    sources: plural(evidence.sources, t("source")),
    files: plural(evidence.files, t("file")),
  });
  if (pendingAction) {
    return `${facts} ${t("It is waiting for review on {kind} before it can continue.", { kind: t(pendingAction.kind === "write" ? "a file write" : "a command") })}`;
  }
  if (thread?.status === "running") {
    return `${facts} ${t("The agent is working through the current chapter.")}${answerText ? ` ${t("Latest response: {answer}", { answer: answerText })}` : ""}`;
  }
  if (evidence.open > 0) {
    return `${facts} ${t("Some steps need attention before the chapter can be considered closed.")}`;
  }
  return `${facts}${answerText ? ` ${t("Latest response: {answer}", { answer: answerText })}` : ""}`;
}

function buildNextMove(data: { pendingAction: AgentAction | null; thread: ResearchThread | null; evidence: JourneyEvidence; steps: number }, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (data.pendingAction) return t("Review the pending {kind}, then continue.", { kind: t(data.pendingAction.kind === "write" ? "file write" : "command") });
  if (data.thread?.status === "running") return t("Let the agent finish the current chapter, then audit the result.");
  if (data.evidence.open > 0) return t("Resolve the failed step before continuing.");
  if (!data.steps) return t("Start a research task to build a journey.");
  return t("Audit the event range or continue with a follow-up question.");
}

function viewKey(kind: "pins" | "seen", threadId: string | null): string {
  return `archimedes-journey-${kind}:${threadId || "new"}`;
}

function readPins(threadId: string | null): string[] {
  if (!threadId) return [];
  try { return JSON.parse(localStorage.getItem(viewKey("pins", threadId)) || "[]") as string[]; }
  catch { return []; }
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
      title: ai.title || chapter.title,
      summary: ai.summary || chapter.summary,
      episodes: chapter.episodes.map((episode) => {
        const aiEpisode = episodesById.get(episode.id);
        return aiEpisode ? { ...episode, title: aiEpisode.title || episode.title, outcome: aiEpisode.outcome || episode.outcome } : episode;
      }),
    };
  });
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

export default function JourneyView({ bridge, thread, events, modeLabel, settings, pendingAction, agentBusy, active, onOpenTrajectory, onOpenSettings, onReviewPending }: JourneyViewProps) {
  const { t } = useUISettings();
  const [view, setView] = useState<"story" | "outline">(settings.defaultView);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapQuery, setMapQuery] = useState("");
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(() => readPins(thread?.id ?? null));
  const [seen, setSeen] = useState<number | null>(() => readSeen(thread?.id ?? null));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [touchedExpanded, setTouchedExpanded] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [showAllEpisodes, setShowAllEpisodes] = useState<Set<string>>(new Set());
  const [outlineFilter, setOutlineFilter] = useState<"all" | "open" | "pinned">("all");
  const [dismissedSince, setDismissedSince] = useState(false);
  const [summary, setSummary] = useState<JourneySummarySnapshot | null>(null);
  const [summaryUpdating, setSummaryUpdating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const summaryBusyRef = useRef(false);
  const lastSummaryAtRef = useRef(0);
  const summaryThreadRef = useRef<string | null>(thread?.id ?? null);
  const previousBusyRef = useRef(agentBusy);
  const previousPendingRef = useRef<string | null>(pendingAction?.id ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mapDialogRef = useDialogFocus<HTMLElement>(mapOpen, () => setMapOpen(false));

  const sourceChapters = useMemo(() => buildChapters(events, settings, pendingAction, thread, t), [events, pendingAction, settings, thread, t]);
  const chapters = useMemo(() => mergeSummaryChapters(sourceChapters, summary), [sourceChapters, summary]);
  const evidence = useMemo(() => buildEvidence(events, pendingAction), [events, pendingAction]);
  const steps = events.length;
  const firstTime = timeValue(events[0]?.created_at) || timeValue(thread?.created_at);
  const lastTime = timeValue(events.at(-1)?.created_at) || timeValue(thread?.updated_at) || Date.now();
  const duration = formatDuration(firstTime, lastTime, t);
  const hasErrors = events.some(eventHasError);
  const status: JourneyData["status"] = !steps ? "not-started" : pendingAction ? "waiting" : thread?.status === "running" ? "running" : hasErrors ? "attention" : chapters.every((chapter) => chapter.status === "done") ? "complete" : "attention";
  const ruleBrief = useMemo(() => buildBrief({ steps, chapters: sourceChapters, evidence, events, pendingAction, thread, settings }, t), [events, evidence, pendingAction, settings, sourceChapters, steps, thread, t]);
  const ruleNextMove = buildNextMove({ pendingAction, thread, evidence, steps }, t);
  const brief = summary?.brief || ruleBrief;
  const nextMove = summary?.nextMove || ruleNextMove;
  const pinnedChapters = chapters.filter((chapter) => pins.includes(chapter.id));
  const mapAvailable = steps > 0 && settings.mapMode !== "off" && (settings.mapMode === "always" || chapters.length >= settings.mapChapters || steps >= settings.mapSteps);
  const lastSequence = events.at(-1)?.sequence ?? 0;
  const newEvents = seen === null ? [] : events.filter((event) => event.sequence > seen);
  const digest = useMemo(() => {
    if (!newEvents.length) return null;
    const sources = new Set<string>();
    for (const event of newEvents) for (const source of eventSources(event)) sources.add(source);
    return { steps: newEvents.length, sources: sources.size, approval: pendingAction ? 1 : 0 };
  }, [newEvents, pendingAction]);
  const visibleChapters = showAllChapters || chapters.length <= 4 ? chapters : chapters.slice(-4);
  const hiddenChapterCount = chapters.length - visibleChapters.length;
  const activeChapter = chapters.at(-1);
  const defaultExpanded = useMemo(() => {
    const next = new Set<string>();
    for (const chapter of chapters) {
      if (chapter.status === "running" || chapter.status === "waiting" || chapter.status === "open" || chapter.status === "error") next.add(chapter.id);
      else if (!settings.collapseCompleted) next.add(chapter.id);
    }
    return next;
  }, [chapters, settings.collapseCompleted]);
  const expandedIds = touchedExpanded ? expanded : defaultExpanded;

  useEffect(() => {
    setView(settings.defaultView);
  }, [settings.defaultView]);

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
    setSummary(null);
    setSummaryError("");
    setSummaryUpdating(false);
    summaryThreadRef.current = thread?.id ?? null;
    previousBusyRef.current = agentBusy;
    previousPendingRef.current = pendingAction?.id ?? null;
    lastSummaryAtRef.current = 0;
  }, [thread?.id]);

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
    const next = lastSequence;
    localStorage.setItem(viewKey("seen", thread.id), String(next));
    setSeen(next);
  }, [lastSequence, seen, steps, thread?.id]);

  useEffect(() => {
    if (!mapOpen) return;
    setMapSelected((current) => current && chapters.some((chapter) => chapter.id === current) ? current : activeChapter?.id ?? null);
  }, [activeChapter?.id, chapters, mapOpen]);

  useEffect(() => {
    if (!mapAvailable && mapOpen) setMapOpen(false);
  }, [mapAvailable, mapOpen]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !settings.followLive) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 40) element.scrollTop = element.scrollHeight;
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
    setPins((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : current.length >= settings.maxPinned ? current : [...current, id];
      localStorage.setItem(viewKey("pins", thread.id), JSON.stringify(next));
      return next;
    });
  }

  function dismissSince() {
    if (!thread?.id) return;
    localStorage.setItem(viewKey("seen", thread.id), String(lastSequence));
    setSeen(lastSequence);
    setDismissedSince(true);
  }

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }

  function jumpToChapter(id: string) {
    setTouchedExpanded(true);
    setExpanded((current) => new Set(current.size ? current : defaultExpanded).add(id));
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-journey-chapter="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  async function requestSummary(force = false) {
    const threadId = thread?.id;
    if (!threadId || !sourceChapters.length || summaryBusyRef.current) return;
    if (!force && !settings.liveSummaries) return;
    if (!force && summary && summary.coversTo >= lastSequence) return;
    if (!force && Date.now() - lastSummaryAtRef.current < settings.briefInterval * 60_000) return;
    summaryBusyRef.current = true;
    setSummaryUpdating(true);
    setSummaryError("");
    try {
      const next = await bridge.summarizeJourney({
        threadId,
        threadTitle: thread?.title || "Research thread",
        brief: ruleBrief,
        coversTo: lastSequence,
        force,
        chapters: sourceChapters.map((chapter) => ({
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
    }
  }

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
    if (!active || !summary || settings.liveSummaries || summary.coversTo >= lastSequence) return;
    if (!settings.updateOnTurnEnd && !(settings.updateOnApproval && pendingAction)) return;
    const timer = window.setTimeout(() => { void requestSummary(true); }, 1000);
    return () => window.clearTimeout(timer);
  }, [active, lastSequence, pendingAction, settings.liveSummaries, settings.updateOnApproval, settings.updateOnTurnEnd, summary, thread?.id]);

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

  const summarySignature = `${settings.summaryLength}|${settings.summaryModel}|${settings.summaryTokenBudget}|${settings.targetEpisodes}|${settings.maxChapters}|${settings.autoMerge}`;
  const previousSummarySignatureRef = useRef(summarySignature);
  useEffect(() => {
    if (!active) return;
    const previous = previousSummarySignatureRef.current;
    previousSummarySignatureRef.current = summarySignature;
    if (previous === summarySignature || !thread?.id || !sourceChapters.length) return;
    const timer = window.setTimeout(() => { void requestSummary(true); }, 700);
    return () => window.clearTimeout(timer);
  }, [active, sourceChapters.length, summarySignature, thread?.id]);

  function renderChapter(chapter: JourneyChapter, index: number, dense = false) {
    const isExpanded = expandedIds.has(chapter.id);
    const isPinned = pins.includes(chapter.id);
    const episodes = dense || showAllEpisodes.has(chapter.id) ? chapter.episodes : chapter.episodes.slice(0, settings.targetEpisodes);
    const hidden = chapter.episodes.length - episodes.length;
    return <div className={dense ? "journey-chapter dense" : "journey-chapter"} key={chapter.id} data-journey-chapter={chapter.id}>
      <div className="journey-chapter-row">
        <button className="journey-chapter-toggle" aria-expanded={isExpanded} onClick={() => toggleChapter(chapter.id)}>
          <span className="journey-chevron">{isExpanded ? "▾" : "›"}</span>
          <span className="journey-chapter-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="journey-chapter-title">{chapter.title}</span>
          <span className="journey-chapter-meta">{plural(chapter.steps, t("step"))}{chapter.status !== "done" ? ` · ${t(chapterStatusLabel(chapter.status))}` : ""}</span>
        </button>
        <button className={isPinned ? "journey-pin pinned" : "journey-pin"} aria-pressed={isPinned} title={isPinned ? t("Unpin chapter") : t("Pin chapter")} onClick={() => togglePin(chapter.id)}>{isPinned ? t("Pinned") : t("Pin")}</button>
      </div>
      {isExpanded && <div className="journey-episodes">
        {episodes.map((episode) => <button className={`journey-episode ${episode.status}`} key={episode.id} title={`Events #${episode.start}–#${episode.end}`} onClick={onOpenTrajectory}>
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
  const selectedMapChapter = chapters.find((chapter) => chapter.id === mapSelected) ?? activeChapter;
  const filterChapters = outlineFilter === "pinned" ? pinnedChapters : outlineFilter === "open" ? chapters.filter((chapter) => chapter.status !== "done") : chapters;

  const since = settings.sinceYouLeft && !dismissedSince && digest ? <aside className="journey-since">
    <div className="journey-since-head"><span>{t("Since your last visit")}</span><button onClick={dismissSince}>{t("Dismiss")}</button></div>
    <p>{plural(digest.steps, t("step"))}{digest.sources ? ` · ${plural(digest.sources, t("new source"), t("new sources"))}` : ""}{digest.approval ? ` · ${t("{count} approval waiting", { count: digest.approval })}` : ""}</p>
  </aside> : null;

  const summaryLabel = summary ? (summary.source === "preview" ? t("Preview summary") : t("AI brief")) : t("Rule-based brief");
  const summaryBehind = summary ? Math.max(0, steps - summary.coversTo) : 0;
  const summaryMeta = summaryUpdating
    ? t("updating…")
    : summary
      ? `${relativeTime(summary.updatedAt, t)} · #1–#${summary.coversTo}${summaryBehind ? ` · +${summaryBehind}` : ""}`
      : `${modeLabel} · ${t("from {count} events", { count: steps })}`;

  const header = <header className="journey-header">
    <div className="journey-topline">
      <span className="journey-kicker">Journey</span>
      <div className="journey-views">
        <button className={view === "story" ? "active" : ""} onClick={() => setView("story")}>{t("Story")}</button>
        <button className={view === "outline" ? "active" : ""} onClick={() => setView("outline")}>{t("Outline")}</button>
        {mapAvailable && <button onClick={() => setMapOpen(true)}>{t("Map")}</button>}
      </div>
    </div>
    <h1>{thread?.title || t("New research task")}</h1>
    <div className="journey-status-line">
      <span className={`journey-status-dot ${status}`} />
      <strong>{t(statusLabel(status))}</strong>
      {duration && <><span className="journey-dot-sep">·</span><span>{duration}</span></>}
      <span className="journey-dot-sep">·</span><span>{plural(steps, t("step"))}</span>
    </div>
  </header>;

  const dock = <footer className="journey-dock">
    <div className="journey-dock-head"><strong>{t("Next move")}</strong><span>{plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</span></div>
    <p>{t(nextMove)}</p>
    <div className="journey-dock-actions">
      {pendingAction ? <button className="journey-primary" onClick={onReviewPending}>{t("Review approval")}</button> : <button className="journey-primary" onClick={onOpenTrajectory}>{t("Open trajectory")}</button>}
      <button className="journey-ghost" onClick={onOpenSettings}>{t("Journey settings")}</button>
    </div>
  </footer>;

  if (!steps) {
    return <section className="journey-view" aria-label={t("Agent journey")}>
      {header}
      <div className="journey-empty-state">
        <h2>{t("No journey yet")}</h2>
        <p>{t("Journey starts after the first research turn. It will summarize what the agent read, what it produced, and what still needs review.")}</p>
        <button className="journey-ghost" onClick={onOpenSettings}>{t("Journey settings")}</button>
      </div>
    </section>;
  }

  return <section className="journey-view" aria-label={t("Agent journey")} ref={scrollRef}>
    {header}
    <div className="journey-scrubber" aria-label={t("Chapter timeline")} style={{ "--journey-playhead": "98%" } as React.CSSProperties}>
      <div className="journey-scrubber-bars">
        {chapters.map((chapter) => <button key={chapter.id} className={chapter.id === activeChapter?.id ? "current" : chapter.status === "error" ? "error" : "done"} style={{ flex: Math.max(1, chapter.steps) }} title={`${chapter.title} · ${plural(chapter.steps, t("step"))}`} aria-label={`${chapter.title}, ${plural(chapter.steps, t("step"))}`} onClick={() => jumpToChapter(chapter.id)} />)}
        <span className="journey-playhead" />
        {chapters.filter((chapter) => pins.includes(chapter.id)).map((chapter) => <span key={`pin-${chapter.id}`} className="journey-mark pin" style={{ left: `${Math.min(99, (chapters.slice(0, chapters.indexOf(chapter)).reduce((total, item) => total + item.steps, 0) / Math.max(1, steps)) * 100)}%` }} />)}
        {chapters.filter((chapter) => chapter.status === "error").map((chapter) => <span key={`error-${chapter.id}`} className="journey-mark error" style={{ left: `${Math.min(99, (chapters.slice(0, chapters.indexOf(chapter)).reduce((total, item) => total + item.steps, 0) / Math.max(1, steps)) * 100)}%` }} />)}
      </div>
      <div className="journey-scrubber-meta"><span>{duration || t("This session")} · {plural(chapters.length, t("chapter"))}</span><button onClick={jumpToLatest}>{t("Jump to latest")}</button></div>
    </div>
    {since}
    {view === "story" ? <div className="journey-story">
      <section className="journey-brief">
        <div className="journey-section-head"><h2>{summaryLabel}</h2><span>{summaryMeta}</span></div>
        <p>{brief}</p>
        {summaryError && <p className="journey-summary-note" title={summaryError}>{summary ? t("Summary update failed. Showing the previous AI brief.") : t("AI summary unavailable. Showing the rule-based brief.")} <button onClick={() => void requestSummary(true)}>{t("Retry")}</button></p>}
        <button className="journey-text-action" onClick={onOpenTrajectory}>{t("View events #1–#{count}", { count: steps })} →</button>
      </section>
      <section className="journey-section">
        <div className="journey-section-head"><h2>{t("Chapters")}</h2><div className="journey-section-actions"><span>{t("{count} total", { count: chapters.length })}</span>{mapAvailable && <button onClick={() => setMapOpen(true)}>{t("Open map")}</button>}</div></div>
        {pinnedChapters.length > 0 && <div className="journey-pinned"><span className="journey-mini-label">{t("Pinned")}</span>{pinnedChapters.map((chapter) => <button key={chapter.id} onClick={() => jumpToChapter(chapter.id)}>{chapter.title}<span>{plural(chapter.steps, "step")}</span></button>)}</div>}
        {hiddenChapterCount > 0 && <button className="journey-earlier" onClick={() => setShowAllChapters(true)}>{t("Earlier chapters ({count})", { count: hiddenChapterCount })} ↑</button>}
        <div className="journey-chapters">{visibleChapters.map((chapter) => renderChapter(chapter, chapters.indexOf(chapter)))}</div>
      </section>
      {settings.evidenceLedger && <section className="journey-section">
        <div className="journey-section-head"><h2>{t("Evidence")}</h2><span>{t("from this thread")}</span></div>
        <dl className="journey-evidence">
          <div><dt>{t("Sources")}</dt><dd>{evidence.sources}</dd></div>
          <div><dt>{t("Files")}</dt><dd>{evidence.files}</dd></div>
          <div><dt>{t("Artifacts")}</dt><dd>{evidence.artifacts}</dd></div>
          {settings.openClaims && <div><dt>{t("Open items")}</dt><dd>{evidence.open}</dd></div>}
        </dl>
      </section>}
      {dock}
    </div> : <div className="journey-outline">
      <div className="journey-outline-filters">
        <button className={outlineFilter === "all" ? "active" : ""} onClick={() => setOutlineFilter("all")}>{t("All {count}", { count: chapters.length })}</button>
        <button className={outlineFilter === "open" ? "active" : ""} onClick={() => setOutlineFilter("open")}>{t("Open {count}", { count: chapters.filter((chapter) => chapter.status !== "done").length })}</button>
        <button className={outlineFilter === "pinned" ? "active" : ""} onClick={() => setOutlineFilter("pinned")}>{t("Pinned {count}", { count: pinnedChapters.length })}</button>
      </div>
      {pinnedChapters.length > 0 && <div className="journey-pinned outline"><span className="journey-mini-label">{t("Pinned")}</span>{pinnedChapters.map((chapter) => <button key={chapter.id} onClick={() => jumpToChapter(chapter.id)}>{chapter.title}<span>{plural(chapter.steps, t("step"))}</span></button>)}</div>}
      <div className="journey-outline-tree">{filterChapters.map((chapter) => renderChapter(chapter, chapters.indexOf(chapter), true))}</div>
      <p className="journey-outline-hint">{t("Click a chapter to expand. Open map for the full tree.")}</p>
      {dock}
    </div>}
    {mapOpen && <div className="journey-map-scrim" role="presentation" onMouseDown={() => setMapOpen(false)}>
      <section ref={mapDialogRef} tabIndex={-1} className="journey-map" role="dialog" aria-modal="true" aria-label={t("Journey map")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="journey-map-header">
          <div><h2>{t("Journey map")}</h2><p>{thread?.title || t("New research task")} · {plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</p></div>
          <div className="journey-map-tools"><input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder={t("Search episodes, sources, files")} aria-label={t("Search journey")} /><button onClick={() => setMapOpen(false)}>{t("Close")}</button></div>
        </header>
        <div className="journey-map-body">
          <div className="journey-map-tree">
            <div className="journey-map-root"><span>{t("Research question")}</span><strong>{thread?.title || t("New research task")}</strong><small>{plural(steps, t("step"))} · {plural(chapters.length, t("chapter"))}</small></div>
            <div className="journey-map-chapters">
              {filteredMapChapters.map((chapter) => <div className="journey-map-chapter-group" key={chapter.id}>
                <button className={selectedMapChapter?.id === chapter.id ? "journey-map-chapter selected" : "journey-map-chapter"} onClick={() => setMapSelected(chapter.id)}>
                  <span className="journey-map-index">{String(chapters.indexOf(chapter) + 1).padStart(2, "0")}</span>
                  <span><strong>{chapter.title}</strong><small>{plural(chapter.steps, t("step"))} · {t(chapterStatusLabel(chapter.status))}</small></span>
                </button>
                {selectedMapChapter?.id === chapter.id && <div className="journey-map-episode-list">{chapter.episodes.map((episode) => <button key={episode.id} onClick={onOpenTrajectory}><span className={`journey-map-episode-dot ${episode.status}`} /><strong>{episode.title}</strong><small>#{episode.start}</small></button>)}</div>}
              </div>)}
            </div>
            {filteredMapChapters.length === 0 && <p className="journey-map-empty">{t("No chapters match this search.")}</p>}
          </div>
          <aside className="journey-map-inspector">
            {selectedMapChapter ? <>
              <span className="journey-kicker">{t("Chapter")} {String(chapters.indexOf(selectedMapChapter) + 1).padStart(2, "0")} · {t(chapterStatusLabel(selectedMapChapter.status))}</span>
              <h2>{selectedMapChapter.title}</h2>
              <p className="journey-map-meta">{plural(selectedMapChapter.steps, t("step"))} · #{selectedMapChapter.start}–#{selectedMapChapter.end}</p>
              <p className="journey-map-summary">{selectedMapChapter.summary}</p>
              <h3>{t("Episodes")}</h3>
              <div className="journey-map-episodes">{selectedMapChapter.episodes.map((episode) => <button key={episode.id} onClick={onOpenTrajectory}><span>#{episode.start}</span><strong>{episode.title}</strong><small>{plural(episode.steps, t("step"))}</small></button>)}</div>
              <h3>{t("Evidence")}</h3>
              <div className="journey-map-evidence"><span>{plural(evidence.sources, t("source"))}</span><span>{plural(evidence.files, t("file"))}</span><span>{plural(evidence.artifacts, t("artifact"))}</span></div>
              <div className="journey-map-actions">
                <button className="journey-primary" onClick={onOpenTrajectory}>{t("Open in Trajectory")}</button>
                <button className="journey-ghost" onClick={() => togglePin(selectedMapChapter.id)}>{pins.includes(selectedMapChapter.id) ? t("Unpin chapter") : t("Pin chapter")}</button>
              </div>
            </> : <p className="journey-map-empty">{t("Select a chapter to inspect it.")}</p>}
          </aside>
        </div>
        <footer className="journey-map-footer"><span>{t("Click a chapter to inspect. Hover a row to see its event range.")}</span><span>{summaryLabel} · {plural(steps, t("step"))}</span></footer>
      </section>
    </div>}
  </section>;
}

