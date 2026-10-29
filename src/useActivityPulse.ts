import { useEffect, useRef, useState } from "react";
import {
  observationInterval,
  scoreActivity,
  scoreToLevel,
  smoothActivity,
  type ActivitySnapshot,
} from "./activityPulse";

const IDLE_SNAPSHOT: ActivitySnapshot = {
  level: "idle",
  score: 0,
  pointerRate: 0,
  keyRate: 0,
  scrollRate: 0,
  lastInputAt: 0,
  sampledAt: 0,
};

/**
 * Samples coarse pointer / typing / scroll activity once a second. The raw
 * counts never leave the renderer; only the derived level and rates are shown
 * and, when the user opts into live observation, included in the context sent
 * to Proactive agent's own model.
 */
export function useActivityPulse(enabled: boolean): ActivitySnapshot {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>(IDLE_SNAPSHOT);
  const countsRef = useRef({ pointer: 0, keys: 0, scroll: 0, lastInputAt: 0 });
  const smoothedRef = useRef(0);
  const lastSampleRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(IDLE_SNAPSHOT);
      return;
    }
    const record = (kind: "pointer" | "keys" | "scroll") => {
      countsRef.current[kind] += 1;
      countsRef.current.lastInputAt = Date.now();
    };
    const onPointer = () => record("pointer");
    const onKey = (event: KeyboardEvent) => {
      // Ignore modifier-only presses so holding Shift does not read as work.
      if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
      record("keys");
    };
    const onWheel = () => record("scroll");
    const onVisibility = () => {
      if (document.hidden) {
        countsRef.current = { pointer: 0, keys: 0, scroll: 0, lastInputAt: 0 };
        smoothedRef.current = 0;
        setSnapshot(IDLE_SNAPSHOT);
      }
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = lastSampleRef.current ? Math.max(250, now - lastSampleRef.current) : 1_000;
      lastSampleRef.current = now;
      const counts = countsRef.current;
      const pointerRate = Math.round((counts.pointer * 60_000) / elapsed);
      const keyRate = Math.round((counts.keys * 60_000) / elapsed);
      const scrollRate = Math.round((counts.scroll * 60_000) / elapsed);
      const raw = scoreActivity({ pointer: pointerRate, keys: keyRate, scroll: scrollRate, lastInputAt: counts.lastInputAt }, now);
      const score = smoothActivity(smoothedRef.current, raw);
      smoothedRef.current = score;
      setSnapshot({
        level: scoreToLevel(score),
        score,
        pointerRate,
        keyRate,
        scrollRate,
        lastInputAt: counts.lastInputAt,
        sampledAt: now,
      });
      countsRef.current = { pointer: 0, keys: 0, scroll: 0, lastInputAt: counts.lastInputAt };
    }, 1_000);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled]);

  return snapshot;
}

export { observationInterval };
