export type ProactiveMode = "off" | "manual" | "auto";

export type ProactiveSource =
  | "search"
  | "selection"
  | "latex"
  | "citation"
  | "reader"
  | "repo"
  | "library"
  | "chat";

export type ProactiveStatus = "queued" | "shown" | "accepted" | "dismissed" | "expired" | "undone";

export type ProactiveEvidence =
  | {
      kind: "search";
      query: string;
      resultCount: number;
      paperId?: string;
      paperTitle?: string;
      libraryName?: string;
    }
  | {
      kind: "selection";
      paperId: string;
      paperTitle: string;
      page: number;
      text: string;
      libraryName?: string;
    }
  | {
      kind: "terminal";
      command: string;
      exitCode: number;
      output: string;
      filePath?: string;
      line?: number;
    }
  | {
      kind: "citation";
      quote: string;
      messageId?: string;
      threadId?: string;
    }
  | {
      kind: "generic";
      label: string;
      detail: string;
    };

export type ProactiveAction =
  | {
      kind: "insert";
      label: string;
      text: string;
      undo?: { label: string; token?: string };
    }
  | {
      kind: "open";
      label: string;
      target: "chat" | "library" | "daily" | "writing" | "artifacts";
      undo?: { label: string; token?: string };
    }
  | {
      kind: "copy";
      label: string;
      text: string;
      undo?: { label: string; token?: string };
    };

export type ProactiveSignal = {
  source: ProactiveSource;
  title: string;
  whyNow: string;
  evidence: ProactiveEvidence[];
  action: ProactiveAction;
  confidence?: number;
  fingerprint: string;
  threadId?: string | null;
  projectId?: string | null;
  workspace?: string;
  origin?: "auto" | "manual";
  /** Override the default repeat-suppression window for this signal. */
  dedupeWindowMs?: number;
};

export type ProactiveSuggestion = ProactiveSignal & {
  id: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: ProactiveStatus;
  shownAt?: number;
  actedAt?: number;
  dismissedAt?: number;
};

export type ProactiveEventType =
  | "created"
  | "shown"
  | "accepted"
  | "dismissed"
  | "expired"
  | "undone"
  | "suppressed"
  | "observed"
  | "evidence-opened";

export type ProactiveEvent = {
  id: string;
  suggestionId: string;
  type: ProactiveEventType;
  at: number;
  detail?: string;
};

export type ProactiveSettings = {
  mode: ProactiveMode;
  dailyBudget: number;
  /** Seconds-level context observation while the user is active. */
  liveObservation: boolean;
  /** Cap live model calls per day so active typing cannot run unbounded. */
  liveObservationBudget: number;
  /** L2: capture only Archimedes' own window for vision-capable observation. */
  appCapture: boolean;
  /** The configured Proactive model accepts image input. */
  visionCapable: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  sources: {
    search: boolean;
    selection: boolean;
    latex: boolean;
    citation: boolean;
    library: boolean;
  };
};

export type ProactiveState = {
  version: 1;
  settings: ProactiveSettings;
  suggestions: ProactiveSuggestion[];
  events: ProactiveEvent[];
  suppressedUntil: number;
};

export const PROACTIVE_STORAGE_KEY = "archimedes-proactive-v1";
export const PROACTIVE_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PROACTIVE_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  // Proactive is opt-in. Off means no signal collection and no suggestions.
  mode: "off",
  dailyBudget: 8,
  liveObservation: true,
  liveObservationBudget: 120,
  appCapture: false,
  visionCapable: false,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
  sources: { search: true, selection: true, latex: true, citation: true, library: true },
};

export type ProactiveContextEvidence = {
  id: string;
  label: string;
  evidence: ProactiveEvidence;
};

/**
 * The serializable slice of app context Proactive agent may send to its own
 * model. It contains no screenshots, keystrokes, window titles, or file
 * contents outside the current selection.
 */
export type ProactiveContextSnapshot = {
  section: string;
  thread: { id?: string | null; title?: string; status?: string } | null;
  projectId?: string | null;
  workspace?: string;
  activity: {
    level: string;
    score: number;
    pointerRate: number;
    keyRate: number;
    lastInputAt: number;
  };
  selection?: string;
  focused?: string;
  screenshot?: { capturedAt: string; width: number; height: number };
  messages: Array<{ id: string; role: string; text: string }>;
  suggestions: Array<{ id: string; source: ProactiveSource; title: string; status: ProactiveStatus }>;
  evidence: ProactiveContextEvidence[];
  at: string;
};

export type ProactiveObservation = {
  shouldSuggest: boolean;
  source: ProactiveSource;
  title: string;
  whyNow: string;
  evidenceIds: string[];
  confidence: number;
  action: ProactiveAction;
};

export const PROACTIVE_SOURCE_LABELS: Record<ProactiveSource, string> = {
  search: "Search",
  selection: "Selection",
  latex: "LaTeX",
  citation: "Citation",
  reader: "Reader",
  repo: "Repository",
  library: "Library",
  chat: "Chat",
};

export const PROACTIVE_STATUS_LABELS: Record<ProactiveStatus, string> = {
  queued: "Queued",
  shown: "Shown",
  accepted: "Accepted",
  dismissed: "Dismissed",
  expired: "Expired",
  undone: "Undone",
};

export function emptyProactiveState(): ProactiveState {
  return {
    version: 1,
    settings: { ...DEFAULT_PROACTIVE_SETTINGS, quietHours: { ...DEFAULT_PROACTIVE_SETTINGS.quietHours }, sources: { ...DEFAULT_PROACTIVE_SETTINGS.sources } },
    suggestions: [],
    events: [],
    suppressedUntil: 0,
  };
}
