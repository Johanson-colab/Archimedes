export type ActivityLevel = "idle" | "calm" | "active" | "intense";

export type ActivitySnapshot = {
  level: ActivityLevel;
  /** Smoothed 0..1 activity score used by the header pulse bar. */
  score: number;
  /** Pointer events per minute in the last sample window. */
  pointerRate: number;
  /** Key presses per minute in the last sample window. */
  keyRate: number;
  /** Wheel / scroll events per minute in the last sample window. */
  scrollRate: number;
  lastInputAt: number;
  sampledAt: number;
};

export type ActivityRates = {
  pointer: number;
  keys: number;
  scroll: number;
  lastInputAt: number;
};

export const ACTIVITY_LEVELS: ActivityLevel[] = ["idle", "calm", "active", "intense"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Turns raw per-second input counts into a 0..1 score. The weights favour
 * pointer movement and typing, which are the two signals that correlate best
 * with "the user is working right now".
 */
export function scoreActivity(rates: ActivityRates, now: number): number {
  const pointer = clamp(rates.pointer / 600, 0, 1);
  const keys = clamp(rates.keys / 180, 0, 1);
  const scroll = clamp(rates.scroll / 120, 0, 1);
  const recent = rates.lastInputAt > 0 ? clamp(1 - (now - rates.lastInputAt) / 20_000, 0, 1) : 0;
  return clamp(pointer * 0.42 + keys * 0.36 + scroll * 0.1 + recent * 0.12, 0, 1);
}

export function smoothActivity(previous: number, next: number): number {
  return clamp(previous * 0.55 + next * 0.45, 0, 1);
}

export function scoreToLevel(score: number): ActivityLevel {
  if (score >= 0.7) return "intense";
  if (score >= 0.4) return "active";
  if (score >= 0.15) return "calm";
  return "idle";
}

/**
 * How often Proactive agent may look at the current context. Intense work gets
 * a few seconds; an idle window backs off so we do not burn model calls.
 */
export function observationInterval(level: ActivityLevel): number {
  if (level === "intense") return 4_000;
  if (level === "active") return 7_000;
  if (level === "calm") return 15_000;
  return 45_000;
}

export function shouldObserve(activity: ActivitySnapshot, now: number): boolean {
  if (activity.score < 0.25) return false;
  if (!activity.lastInputAt) return false;
  return now - activity.lastInputAt < 30_000;
}

export function activityLabel(level: ActivityLevel): string {
  if (level === "intense") return "Intense";
  if (level === "active") return "Active";
  if (level === "calm") return "Calm";
  return "Idle";
}
