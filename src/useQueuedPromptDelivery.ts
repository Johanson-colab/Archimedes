import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Keep queued payloads (including attachments) until delivery succeeds. A failed
// delivery pauses the queue instead of competing with the user's current draft.
export function useQueuedPromptDelivery<T extends { id: string }>({ items, setItems, busy, submit, onFailure }: {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  busy: boolean;
  submit: (item: T) => Promise<boolean>;
  onFailure: () => void;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [drain, setDrain] = useState(false);
  const inFlight = useRef<string | null>(null);
  const previousBusy = useRef(busy);
  const generation = useRef(0);
  const latest = useRef({ items, busy, submit, onFailure, setItems });
  latest.current = { items, busy, submit, onFailure, setItems };

  useEffect(() => () => { generation.current += 1; }, []);

  const deliver = useCallback(async (item: T) => {
    if (latest.current.busy || inFlight.current) return;
    const runGeneration = generation.current;
    inFlight.current = item.id;
    setSendingId(item.id);
    setFailedId(null);
    setDrain(false);
    let sent = false;
    try { sent = await latest.current.submit(item); }
    catch { /* Treat rejected requests like a failed submission. */ }
    if (generation.current !== runGeneration) return;
    inFlight.current = null;
    setSendingId(null);
    if (sent) {
      latest.current.setItems((current) => current.filter((queued) => queued.id !== item.id));
      setDrain(true);
    } else if (latest.current.items.some((queued) => queued.id === item.id)) {
      setFailedId(item.id);
      latest.current.onFailure();
    } else {
      // An explicitly removed item must not reappear after its request settles.
      setDrain(true);
    }
  }, []);

  useEffect(() => {
    if (previousBusy.current && !busy) setDrain(true);
    previousBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    if (failedId && !items.some((item) => item.id === failedId)) {
      setFailedId(null);
      setDrain(true);
    }
  }, [items, failedId]);

  useEffect(() => {
    if (!drain || busy || sendingId || failedId || !items.length) return;
    void deliver(items[0]);
  }, [drain, busy, sendingId, failedId, items, deliver]);

  const retry = useCallback(() => {
    const item = latest.current.items.find((queued) => queued.id === failedId);
    if (item) void deliver(item);
  }, [failedId, deliver]);

  return { failedId, sendingId, retry };
}
