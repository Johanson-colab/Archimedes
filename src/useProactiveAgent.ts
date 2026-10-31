import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEvent,
  citationSignalFromMessages,
  createdToday,
  dismissalsInLastThree,
  expireAndPrune,
  fingerprintFor,
  isQuietHours,
  loadProactiveState,
  markSuggestionAccepted,
  markSuggestionDismissed,
  markSuggestionUndone,
  observationsToday,
  recordObservation,
  recordSignal,
  saveProactiveState,
  setAllQueuedShown,
  updateSettings as applySettings,
} from "./proactive-engine";
import { subscribeProactiveSignals } from "./proactive-signals";
import {
  buildProactiveContext,
  currentSelectionText,
  focusedElementLabel,
  signalFromObservation,
} from "./proactive-context";
import { observationInterval, shouldObserve, type ActivitySnapshot } from "./activityPulse";
import { useActivityPulse } from "./useActivityPulse";
import type {
  ProactiveContextSnapshot,
  ProactiveSettings,
  ProactiveSignal,
  ProactiveState,
  ProactiveSuggestion,
} from "./proactive-types";

const COMPOSER_SELECTOR = '[data-ui="research-composer"]';
const MANUAL_SHOW_DELAY_MS = 1200;
const IGNORE_COOLDOWN_MS = 2 * 60 * 60 * 1000;

type ProactiveAgentOptions = {
  messages: Array<{ id: string; role: string; text: string }>;
  thread: { id: string | null; title?: string; status?: string } | null;
  threadId: string | null;
  projectId: string | null;
  workspace: string;
  section: string;
  bridge?: ResearchDeskBridge;
  onRun: (suggestion: ProactiveSuggestion) => void | Promise<void>;
  onNotice?: (text: string) => void;
};

export type ProactiveAgentController = {
  state: ProactiveState;
  settings: ProactiveSettings;
  open: boolean;
  setOpen: (open: boolean) => void;
  panelView: "inbox" | "history";
  setPanelView: (view: "inbox" | "history") => void;
  queuedCount: number;
  todayCount: number;
  observationCount: number;
  workspace: string;
  composerFocused: boolean;
  quiet: boolean;
  budgetReached: boolean;
  observationBudgetReached: boolean;
  suppressed: boolean;
  activity: ActivitySnapshot;
  observing: boolean;
  modelReady: boolean;
  lastObservationAt: number;
  replyBusy: boolean;
  setSettings: (patch: Partial<ProactiveSettings>) => void;
  markShown: () => void;
  accept: (suggestion: ProactiveSuggestion) => void;
  dismiss: (suggestion: ProactiveSuggestion) => void;
  undo: (suggestion: ProactiveSuggestion) => void;
  observeOnce: () => void;
  reply: (text: string, suggestion?: ProactiveSuggestion | null) => Promise<string>;
  resetHistory: () => void;
};

function composerHasFocus(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  if (active.closest(COMPOSER_SELECTOR)) return true;
  return active instanceof HTMLTextAreaElement && active.closest(COMPOSER_SELECTOR) !== null;
}

export function useProactiveAgent({
  messages,
  thread,
  threadId,
  projectId,
  workspace,
  section,
  bridge,
  onRun,
  onNotice,
}: ProactiveAgentOptions): ProactiveAgentController {
  const [state, setState] = useState<ProactiveState>(loadProactiveState);
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem("archimedes-proactive-open") === "true";
    } catch {
      return false;
    }
  });
  const [, setClockTick] = useState(0);
  const [panelView, setPanelView] = useState<"inbox" | "history">("inbox");
  const [composerFocused, setComposerFocused] = useState(composerHasFocus);
  const [observing, setObserving] = useState(false);
  const [lastObservationAt, setLastObservationAt] = useState(0);
  const [replyBusy, setReplyBusy] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const blurTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(open);
  openRef.current = open;
  const composerFocusedRef = useRef(composerFocused);
  composerFocusedRef.current = composerFocused;
  const observingRef = useRef(false);
  const lastObservationRef = useRef(0);
  const lastCaptureRef = useRef(0);
  const citationMessageRef = useRef<string | null>(null);
  const contextRef = useRef({ messages, thread, threadId, projectId, workspace, section });
  contextRef.current = { messages, thread, threadId, projectId, workspace, section };
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const activity = useActivityPulse(state.settings.mode !== "off");
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const modelReadyRef = useRef(false);
  modelReadyRef.current = modelReady;
  const radarBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const activeBridge = bridgeRef.current;
      if (!activeBridge?.getModelConfig) return;
      void activeBridge.getModelConfig("proactive").then((config) => {
        if (!cancelled) setModelReady(Boolean(config.hasApiKey));
      }).catch(() => {
        if (!cancelled) setModelReady(false);
      });
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    saveProactiveState(state);
  }, [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem("archimedes-proactive-open", String(open && state.settings.mode !== "off"));
    } catch {
      // Best-effort layout persistence.
    }
  }, [open, state.settings.mode]);

  useEffect(() => {
    return subscribeProactiveSignals((signal) => {
      const nextSignal: ProactiveSignal = {
        ...signal,
        workspace: signal.workspace ?? contextRef.current.workspace,
        threadId: signal.threadId ?? contextRef.current.threadId,
        projectId: signal.projectId ?? contextRef.current.projectId,
      };
      setState((current) => recordSignal(current, nextSignal, Date.now()));
    });
  }, []);

  useEffect(() => {
    const handleFocusIn = () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      setComposerFocused(composerHasFocus());
    };
    const handleFocusOut = () => {
      if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = window.setTimeout(() => {
        setComposerFocused(composerHasFocus());
        blurTimerRef.current = null;
      }, MANUAL_SHOW_DELAY_MS);
    };
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  // Opening the dock is the "shown" boundary. Suggestions stay queued (and only
  // contribute to the badge) until the user asks to look at them.
  useEffect(() => {
    if (!open) return;
    setState((current) => setAllQueuedShown(current, Date.now(), composerFocused));
  }, [composerFocused, open]);

  useEffect(() => {
    if (!open) return;
    setState((current) => {
      const next = setAllQueuedShown(current, Date.now(), composerFocused);
      return next;
    });
  }, [composerFocused, open, state.suggestions.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => {
        const now = Date.now();
        let next = expireAndPrune(current, now);
        if (openRef.current) next = setAllQueuedShown(next, now, composerFocusedRef.current);
        return next;
      });
      // Force a render even when the state object is unchanged so the quiet
      // hours / budget labels reflect the current clock.
      setClockTick((tick) => tick + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Citation checking is cheap and deterministic, so Auto mode can run it on
  // every new answer instead of waiting for a manual review.
  useEffect(() => {
    const latest = [...messages].reverse().find((message) => message.role === "assistant" && message.text.trim());
    if (!latest) return;
    if (!citationMessageRef.current) {
      citationMessageRef.current = latest.id;
      return;
    }
    if (citationMessageRef.current === latest.id) return;
    citationMessageRef.current = latest.id;
    if (stateRef.current.settings.mode !== "auto" || !stateRef.current.settings.sources.citation) return;
    const signal = citationSignalFromMessages(messages, contextRef.current);
    if (!signal) return;
    setState((current) => recordSignal(current, {
      ...signal,
      origin: "auto",
      whyNow: "A recent answer states results without a source. This appeared automatically after the turn finished.",
      dedupeWindowMs: 30 * 60 * 1000,
    }, Date.now()));
  }, [messages]);

  // Daily library radar. This is the cheap, offline half of issue #78's P0:
  // one digest per day instead of watching arXiv or repository commits.
  const checkRadar = useCallback(async () => {
    const current = stateRef.current;
    if (current.settings.mode !== "auto" || !current.settings.sources.library) return;
    if (radarBusyRef.current) return;
    const activeBridge = bridgeRef.current;
    if (!activeBridge?.listLibraries || !activeBridge?.listLibraryPapers) return;
    const day = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem("archimedes-proactive-radar-day") === day) return;
    } catch {
      // Storage is best-effort; the fingerprint still dedupes.
    }
    radarBusyRef.current = true;
    try {
      const libraries = await activeBridge.listLibraries(contextRef.current.projectId ?? undefined);
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const additions: Array<{ libraryName: string; paper: LibraryPaper }> = [];
      for (const library of libraries.slice(0, 8)) {
        try {
          const papers = await activeBridge.listLibraryPapers(library.id);
          for (const paper of papers) {
            const addedAt = Date.parse(paper.created_at);
            if (Number.isFinite(addedAt) && addedAt >= since) additions.push({ libraryName: library.name, paper });
          }
        } catch {
          // One unreadable library should not block the rest of the radar.
        }
      }
      try {
        window.localStorage.setItem("archimedes-proactive-radar-day", day);
      } catch {
        // Best-effort.
      }
      if (!additions.length) return;
      const names = [...new Set(additions.map((entry) => entry.libraryName))];
      const evidence = additions.slice(0, 4).map(({ paper }) => ({
        kind: "generic" as const,
        label: paper.title,
        detail: [paper.venue, paper.year].filter(Boolean).join(" · "),
      }));
      const signal: ProactiveSignal = {
        source: "library",
        title: additions.length === 1
          ? `1 new paper in ${names[0]}`
          : `${additions.length} new papers in ${names.length === 1 ? names[0] : `${names.length} libraries`}`,
        whyNow: "Added to your library in the last 24 hours. Group or triage them before they get buried.",
        evidence,
        action: { kind: "open", label: "Open library", target: "library" },
        confidence: 0.7,
        fingerprint: fingerprintFor("library-radar", `${day}:${additions.map((entry) => entry.paper.id).sort().join(",")}`),
        threadId: contextRef.current.threadId,
        projectId: contextRef.current.projectId,
        workspace: contextRef.current.workspace,
        origin: "auto",
        dedupeWindowMs: 20 * 60 * 60 * 1000,
      };
      setState((stateNow) => recordSignal(stateNow, signal, Date.now()));
    } finally {
      radarBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (state.settings.mode !== "auto" || !state.settings.sources.library) return;
    void checkRadar();
    const timer = window.setInterval(() => void checkRadar(), 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [checkRadar, state.settings.mode, state.settings.sources.library]);

  const buildContext = useCallback((screenshot?: { capturedAt: string; width: number; height: number }): ProactiveContextSnapshot => {
    const current = contextRef.current;
    return buildProactiveContext({
      section: current.section,
      thread: current.thread,
      projectId: current.projectId,
      workspace: current.workspace,
      activity: activityRef.current,
      selection: currentSelectionText(),
      focused: focusedElementLabel(),
      screenshot,
      messages: current.messages,
      suggestions: stateRef.current.suggestions,
    });
  }, []);

  const runObservation = useCallback(async (origin: "auto" | "manual"): Promise<ProactiveSignal | null> => {
    const activeBridge = bridgeRef.current;
    if (!activeBridge?.runProactiveObservation) {
      throw new Error("Live observation needs the desktop app.");
    }
    if (observingRef.current) return null;
    observingRef.current = true;
    setObserving(true);
    const now = Date.now();
    lastObservationRef.current = now;
    setLastObservationAt(now);
    setState((current) => recordObservation(current, now, origin));
    try {
      let screenshot: { dataUrl: string; width: number; height: number } | null = null;
      const settings = stateRef.current.settings;
      const wantsScreenshot = settings.appCapture
        && settings.visionCapable
        && modelReadyRef.current
        && typeof document !== "undefined"
        && (origin === "manual" || now - lastCaptureRef.current >= 8_000)
        && typeof activeBridge.captureProactiveScreenshot === "function";
      if (wantsScreenshot) {
        document.documentElement.dataset.proactiveCapture = "true";
        try {
          // Two frames let the capture-only CSS hide the floating layer before
          // the compositor snapshots the page. The timer is a fallback for an
          // occluded window where requestAnimationFrame can be paused.
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            requestAnimationFrame(() => requestAnimationFrame(finish));
            window.setTimeout(finish, 150);
          });
          screenshot = await activeBridge.captureProactiveScreenshot();
          if (screenshot) lastCaptureRef.current = now;
        } catch {
          screenshot = null;
        } finally {
          delete document.documentElement.dataset.proactiveCapture;
        }
      }
      const context = buildContext(screenshot
        ? { capturedAt: new Date(now).toISOString(), width: screenshot.width, height: screenshot.height }
        : undefined);
      const observation = await activeBridge.runProactiveObservation({
        context,
        ...(screenshot ? { screenshot: { dataUrl: screenshot.dataUrl, width: screenshot.width, height: screenshot.height } } : {}),
      });
      if (!observation) return null;
      const signal = signalFromObservation(observation, context, {
        threadId: contextRef.current.threadId,
        projectId: contextRef.current.projectId,
        workspace: contextRef.current.workspace,
      });
      if (!signal) return null;
      if (origin === "manual") signal.origin = "manual";
      setState((current) => recordSignal(current, signal, Date.now()));
      return signal;
    } finally {
      observingRef.current = false;
      setObserving(false);
    }
  }, [buildContext]);

  // Seconds-level observer. It only fires when the activity bar is above the
  // calm threshold, the user has opted into live observation, and the daily
  // observation budget still has room.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (current.settings.mode !== "auto" || !current.settings.liveObservation) return;
      if (!modelReadyRef.current) return;
      if (observingRef.current) return;
      const now = Date.now();
      if (isQuietHours(current.settings, now)) return;
      if (now < current.suppressedUntil) return;
      if (createdToday(current, now) >= current.settings.dailyBudget) return;
      if (observationsToday(current, now) >= current.settings.liveObservationBudget) return;
      const snapshot = activityRef.current;
      if (!shouldObserve(snapshot, now)) return;
      if (now - lastObservationRef.current < observationInterval(snapshot.level)) return;
      void runObservation("auto").catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [runObservation]);

  const setSettings = useCallback((patch: Partial<ProactiveSettings>) => {
    setState((current) => {
      const next = applySettings(current, patch);
      return patch.mode && patch.mode !== "off" ? { ...next, suppressedUntil: 0 } : next;
    });
  }, []);

  const markShown = useCallback(() => {
    setState((current) => setAllQueuedShown(current, Date.now(), composerFocusedRef.current));
  }, []);

  const accept = useCallback((suggestion: ProactiveSuggestion) => {
    setState((current) => markSuggestionAccepted(current, suggestion.id, Date.now()));
    void onRun(suggestion);
  }, [onRun]);

  const dismiss = useCallback((suggestion: ProactiveSuggestion) => {
    const now = Date.now();
    setState((current) => {
      let next = markSuggestionDismissed(current, suggestion.id, now);
      if (dismissalsInLastThree(next, now) >= 3 && next.suppressedUntil < now) {
        next = addEvent(
          { ...next, suppressedUntil: now + IGNORE_COOLDOWN_MS },
          {
            id: `evt-suppressed-${now}`,
            suggestionId: suggestion.id,
            type: "suppressed",
            at: now,
            detail: "Three suggestions dismissed; frequency reduced for two hours.",
          },
        );
        onNotice?.("Three suggestions dismissed. Proactive agent will stay quiet for two hours.");
      }
      return next;
    });
  }, [onNotice]);

  const undo = useCallback((suggestion: ProactiveSuggestion) => {
    setState((current) => markSuggestionUndone(current, suggestion.id, Date.now()));
  }, []);

  const observeOnce = useCallback(() => {
    if (stateRef.current.settings.mode === "off") {
      onNotice?.("Turn on Proactive agent before asking it to review the current context.");
      return;
    }
    void (async () => {
      try {
        const signal = await runObservation("manual");
        if (signal) {
          setOpen(true);
          setPanelView("inbox");
          return;
        }
        onNotice?.("No suggestion is worth showing right now.");
      } catch {
        // Without a configured model, keep the deterministic citation check so
        // the manual button still does something useful offline.
        const fallback = citationSignalFromMessages(contextRef.current.messages, contextRef.current);
        if (!fallback) {
          onNotice?.("Configure Proactive model in Settings, or add an answer with an uncited claim.");
          return;
        }
        setState((current) => recordSignal(current, fallback, Date.now()));
        setOpen(true);
        setPanelView("inbox");
        onNotice?.("Used the local citation check because Proactive model is not configured.");
      }
    })();
  }, [onNotice, runObservation]);

  const reply = useCallback(async (text: string, suggestion?: ProactiveSuggestion | null) => {
    const prompt = text.trim();
    if (!prompt) throw new Error("Write a reply first.");
    const activeBridge = bridgeRef.current;
    if (!activeBridge?.runProactiveReply) throw new Error("Proactive replies need the desktop app.");
    const context = buildContext();
    if (suggestion) {
      context.suggestions = [
        { id: suggestion.id, source: suggestion.source, title: suggestion.title, status: suggestion.status },
        ...context.suggestions.filter((item) => item.id !== suggestion.id),
      ].slice(0, 6);
    }
    setReplyBusy(true);
    try {
      const result = await activeBridge.runProactiveReply({ prompt, context });
      return result.text;
    } finally {
      setReplyBusy(false);
    }
  }, [buildContext]);

  const resetHistory = useCallback(() => {
    setState((current) => ({
      ...current,
      suggestions: [],
      events: [],
      suppressedUntil: 0,
    }));
  }, []);

  const queuedCount = useMemo(
    () => state.suggestions.filter((suggestion) => suggestion.status === "queued").length,
    [state.suggestions],
  );
  const todayCount = useMemo(() => createdToday(state, Date.now()), [state]);
  const observationCount = useMemo(() => observationsToday(state, Date.now()), [state]);
  const quiet = isQuietHours(state.settings, Date.now());
  const budgetReached = todayCount >= state.settings.dailyBudget;
  const observationBudgetReached = observationCount >= state.settings.liveObservationBudget;
  const suppressed = Date.now() < state.suppressedUntil;
  const canOpen = state.settings.mode !== "off";

  useEffect(() => {
    if (!canOpen && open) setOpen(false);
  }, [canOpen, open]);

  // The returned open state never lies about the mode: an off agent has no dock.
  return {
    state,
    settings: state.settings,
    open: canOpen && open,
    setOpen,
    panelView,
    setPanelView,
    queuedCount: canOpen ? queuedCount : 0,
    todayCount,
    observationCount,
    workspace,
    composerFocused,
    quiet,
    budgetReached,
    observationBudgetReached,
    suppressed,
    activity,
    observing,
    modelReady,
    lastObservationAt,
    replyBusy,
    setSettings,
    markShown,
    accept,
    dismiss,
    undo,
    observeOnce,
    reply,
    resetHistory,
  };
}
