type CountdownClock = {
  now: () => number;
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (id: number) => void;
};
export function startApprovalCountdown(onTick: (seconds: number) => void, onComplete: () => void, clock?: CountdownClock): () => void;
