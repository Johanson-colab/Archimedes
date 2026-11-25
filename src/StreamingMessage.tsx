import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";

export type AssistantDraft = { turnId: string; text: string };

export function createAssistantStream() {
  let snapshot: AssistantDraft | null = null;
  let pending: AssistantDraft | null = null;
  let frame: number | null = null;
  let finishedTurnId: string | null = null;
  const listeners = new Set<() => void>();

  const publish = () => {
    for (const listener of listeners) listener();
  };

  const cancelFrame = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  const flush = () => {
    cancelFrame();
    if (pending) {
      snapshot = pending;
      pending = null;
      publish();
    }
    return snapshot;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    hasText: () => Boolean(snapshot?.text.trim()),
    append(turnId: string, delta: string) {
      if (turnId === finishedTurnId) return;
      const draft = pending ?? snapshot;
      pending = { turnId, text: draft?.turnId === turnId ? draft.text + delta : delta };
      if (frame === null) frame = requestAnimationFrame(flush);
    },
    flush,
    finish(turnId: string) {
      finishedTurnId = turnId;
      if (pending?.turnId === turnId) {
        pending = null;
        cancelFrame();
      }
      if (snapshot?.turnId === turnId) {
        snapshot = null;
        publish();
      }
    },
    clear() {
      cancelFrame();
      pending = null;
      if (snapshot) {
        snapshot = null;
        publish();
      }
    },
  };
}

export type AssistantStream = ReturnType<typeof createAssistantStream>;

export function useAssistantStreamHasText(stream: AssistantStream) {
  return useSyncExternalStore(stream.subscribe, stream.hasText);
}

export default function StreamingMessage({ stream, render, onUpdate }: {
  stream: AssistantStream;
  render: (draft: AssistantDraft) => ReactNode;
  onUpdate: () => void;
}) {
  const draft = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  useLayoutEffect(() => {
    if (draft) onUpdate();
  }, [draft, onUpdate]);
  return draft ? render(draft) : null;
}
