import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEvent,
  citationSignalFromMessages,
  createdToday,
  dismissalsInLastThree,
  expireAndPrune,
  isQuietHours,
  loadProactiveState,
  markSuggestionAccepted,
  markSuggestionDismissed,
  markSuggestionUndone,
  recordSignal,
  saveProactiveState,
  setAllQueuedShown,
  updateSettings as applySettings,
} from "./proactive-engine";
import { subscribeProactiveSignals } from "./proactive-signals";
import type {
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
  threadId: string | null;
  projectId: string | null;
  workspace: string;
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
  composerFocused: boolean;
  quiet: boolean;
  budgetReached: boolean;
  suppressed: boolean;
  setSettings: (patch: Partial<ProactiveSettings>) => void;
  markShown: () => void;
  accept: (suggestion: ProactiveSuggestion) => void;
  dismiss: (suggestion: ProactiveSuggestion) => void;
  undo: (suggestion: ProactiveSuggestion) => void;
  observeOnce: () => void;
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
  threadId,
  projectId,
  workspace,
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
  const blurTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(open);
  openRef.current = open;
  const composerFocusedRef = useRef(composerFocused);
  composerFocusedRef.current = composerFocused;

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
        workspace: signal.workspace ?? workspace,
        threadId: signal.threadId ?? threadId,
        projectId: signal.projectId ?? projectId,
      };
      setState((current) => recordSignal(current, nextSignal, Date.now()));
    });
  }, [projectId, threadId, workspace]);

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
    const signal = citationSignalFromMessages(messages, { threadId, projectId, workspace });
    if (!signal) {
      onNotice?.("No uncited claims found in the latest answer.");
      return;
    }
    setState((current) => recordSignal(current, signal, Date.now()));
    setOpen(true);
    setPanelView("inbox");
  }, [messages, onNotice, projectId, threadId, workspace]);

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
  const quiet = isQuietHours(state.settings, Date.now());
  const budgetReached = todayCount >= state.settings.dailyBudget;
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
    composerFocused,
    quiet,
    budgetReached,
    suppressed,
    setSettings,
    markShown,
    accept,
    dismiss,
    undo,
    observeOnce,
    resetHistory,
  };
}
