import type { ProactiveSignal } from "./proactive-types";

export const PROACTIVE_SIGNAL_EVENT = "archimedes:proactive-signal";

/**
 * L0 signals are emitted by the surface that owns the evidence (reader,
 * LaTeX workspace, chat). The proactive engine listens at the app shell so a
 * module can stay mounted while the user moves between sections.
 */
export function emitProactiveSignal(signal: ProactiveSignal): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProactiveSignal>(PROACTIVE_SIGNAL_EVENT, { detail: signal }));
}

export function subscribeProactiveSignals(handler: (signal: ProactiveSignal) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const signal = (event as CustomEvent<ProactiveSignal>).detail;
    if (signal && typeof signal.fingerprint === "string") handler(signal);
  };
  window.addEventListener(PROACTIVE_SIGNAL_EVENT, listener);
  return () => window.removeEventListener(PROACTIVE_SIGNAL_EVENT, listener);
}
