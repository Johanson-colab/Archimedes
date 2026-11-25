type CountdownClock = {
  now: () => number;
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (id: number) => void;
};
export function localCommandApprovalId(action: Pick<AgentAction, 'id' | 'kind' | 'payload'> | null): string | null;
export function startApprovalCountdown(onTick: (seconds: number) => void, onComplete: () => void, clock?: CountdownClock): () => void;
