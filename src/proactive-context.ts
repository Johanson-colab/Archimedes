import { activityLabel, type ActivitySnapshot } from "./activityPulse";
import { fingerprintFor } from "./proactive-engine";
import type {
  ProactiveAction,
  ProactiveContextEvidence,
  ProactiveContextSnapshot,
  ProactiveEvidence,
  ProactiveObservation,
  ProactiveSignal,
  ProactiveSuggestion,
} from "./proactive-types";

type BuildContextInput = {
  section: string;
  thread: { id?: string | null; title?: string; status?: string } | null;
  projectId: string | null;
  workspace: string;
  activity: ActivitySnapshot;
  selection: string;
  focused: string;
  messages: Array<{ id: string; role: string; text: string }>;
  suggestions: ProactiveSuggestion[];
};

function clip(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

export function buildProactiveContext(input: BuildContextInput): ProactiveContextSnapshot {
  const evidence: ProactiveContextEvidence[] = [];
  let index = 0;
  const add = (label: string, item: ProactiveEvidence) => {
    if (evidence.length >= 14) return;
    index += 1;
    evidence.push({ id: `e${index}`, label, evidence: item });
  };

  add("Activity", {
    kind: "generic",
    label: "Activity",
    detail: `${activityLabel(input.activity.level)} · ${input.activity.pointerRate} pointer/min · ${input.activity.keyRate} keys/min`,
  });
  add("Current view", { kind: "generic", label: "Current view", detail: input.section });
  if (input.thread?.title) {
    add("Thread", {
      kind: "generic",
      label: "Thread",
      detail: [input.thread.title, input.thread.status].filter(Boolean).join(" · "),
    });
  }
  if (input.selection.trim()) {
    add("Selection", {
      kind: "generic",
      label: "Selection",
      detail: clip(input.selection, 700),
    });
  }
  if (input.focused.trim()) {
    add("Focus", { kind: "generic", label: "Focus", detail: clip(input.focused, 180) });
  }
  for (const message of input.messages.slice(-4)) {
    add(message.role === "user" ? "Recent request" : "Recent answer", {
      kind: "generic",
      label: message.role === "user" ? "Recent request" : "Recent answer",
      detail: clip(message.text, 900),
    });
  }

  return {
    section: input.section,
    thread: input.thread,
    projectId: input.projectId,
    workspace: input.workspace,
    activity: {
      level: input.activity.level,
      score: Number(input.activity.score.toFixed(2)),
      pointerRate: input.activity.pointerRate,
      keyRate: input.activity.keyRate,
      lastInputAt: input.activity.lastInputAt,
    },
    selection: clip(input.selection, 1_200),
    focused: clip(input.focused, 180),
    messages: input.messages.slice(-4).map((message) => ({
      id: message.id,
      role: message.role,
      text: clip(message.text, 1_200),
    })),
    suggestions: input.suggestions.slice(0, 6).map((suggestion) => ({
      id: suggestion.id,
      source: suggestion.source,
      title: suggestion.title,
      status: suggestion.status,
    })),
    evidence,
    at: new Date().toISOString(),
  };
}

export function signalFromObservation(
  observation: ProactiveObservation,
  context: ProactiveContextSnapshot,
  meta: { threadId: string | null; projectId: string | null; workspace: string },
): ProactiveSignal | null {
  const byId = new Map(context.evidence.map((item) => [item.id, item.evidence]));
  const evidence = observation.evidenceIds.map((id) => byId.get(id)).filter((item): item is ProactiveEvidence => Boolean(item));
  if (!evidence.length) return null;
  const action: ProactiveAction = observation.action.kind === "open"
    ? { kind: "open", label: observation.action.label, target: observation.action.target }
    : observation.action.kind === "copy"
      ? { kind: "copy", label: observation.action.label, text: observation.action.text }
      : { kind: "insert", label: observation.action.label, text: observation.action.text };
  return {
    source: observation.source,
    title: observation.title,
    whyNow: observation.whyNow,
    evidence,
    action,
    confidence: observation.confidence,
    // Title + source is the stable identity. Evidence details (activity rates,
    // timestamps) change between observations and must not defeat dedupe.
    fingerprint: fingerprintFor(observation.source, observation.title.trim().toLowerCase()),
    threadId: meta.threadId,
    projectId: meta.projectId,
    workspace: meta.workspace,
    origin: "auto",
    dedupeWindowMs: 5 * 60 * 1000,
  };
}

export function focusedElementLabel(): string {
  if (typeof document === "undefined") return "";
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return "";
  const label = active.getAttribute("aria-label") || active.getAttribute("title") || active.getAttribute("placeholder") || active.textContent || "";
  return clip(`${active.tagName.toLowerCase()} ${label}`, 160);
}

export function currentSelectionText(): string {
  if (typeof window === "undefined") return "";
  return clip(window.getSelection()?.toString() ?? "", 1_200);
}
