type FigureBridge = Pick<ResearchDeskBridge, "getDailyFigure">;
type Listener = (url: string) => void;
type Request = { key: string; id: string; thumbnail: boolean; priority: number; started: boolean; listeners: Set<Listener> };
type State = { cache: Map<string, { url: string; expires: number; bytes: number }>; bytes: number; requests: Map<string, Request>; queue: Request[]; active: number; scheduled: boolean };
const states = new WeakMap<FigureBridge, State>();
const MAX_BYTES = 16 * 1024 * 1024;
const keyFor = (id: string, thumbnail: boolean) => `${thumbnail ? "thumb" : "original"}:${id}`;
function stateFor(bridge: FigureBridge): State {
  let state = states.get(bridge);
  if (!state) {
    state = { cache: new Map(), bytes: 0, requests: new Map(), queue: [], active: 0, scheduled: false };
    states.set(bridge, state);
  }
  return state;
}
export function forgetDailyFigure(bridge: FigureBridge, id: string, thumbnail = true) {
  const state = stateFor(bridge), key = keyFor(id, thumbnail), cached = state.cache.get(key);
  if (cached) state.bytes -= cached.bytes;
  state.cache.delete(key);
}
export function peekDailyFigure(bridge: FigureBridge, id: string, thumbnail = true): string {
  const state = stateFor(bridge), key = keyFor(id, thumbnail), cached = state.cache.get(key);
  if (!cached) return "";
  if (cached.expires <= Date.now()) { forgetDailyFigure(bridge, id, thumbnail); return ""; }
  state.cache.delete(key); state.cache.set(key, cached);
  return cached.url;
}
function remember(state: State, request: Request, url: string) {
  const previous = state.cache.get(request.key);
  if (previous) state.bytes -= previous.bytes;
  state.cache.delete(request.key);
  const bytes = url.length * 2;
  if (bytes > MAX_BYTES) return;
  state.cache.set(request.key, { url, bytes, expires: Date.now() + (url.startsWith("data:") ? 24 * 60 * 60 * 1000 : url ? 2 * 60 * 1000 : 30_000) });
  state.bytes += bytes;
  while (state.cache.size > 128 || state.bytes > MAX_BYTES) {
    const key = state.cache.keys().next().value!;
    state.bytes -= state.cache.get(key)!.bytes; state.cache.delete(key);
  }
}
function schedule(bridge: FigureBridge, state: State) {
  if (state.scheduled) return;
  state.scheduled = true;
  queueMicrotask(() => {
    state.scheduled = false;
    state.queue.sort((a, b) => a.priority - b.priority);
    while (state.active < 3 && state.queue.length) {
      const request = state.queue.shift()!;
      if (!request.listeners.size) { state.requests.delete(request.key); continue; }
      request.started = true; state.active++;
      void Promise.resolve().then(() => bridge.getDailyFigure?.(request.id, { thumbnail: request.thumbnail })).then(url => {
        const source = typeof url === "string" ? url : "";
        remember(state, request, source);
        request.listeners.forEach(notify => notify(source));
      }).catch(() => { /* Leave transient failures retryable on the next visit. */ }).finally(() => {
        request.listeners.clear();
        state.active--; state.requests.delete(request.key); schedule(bridge, state);
      });
    }
  });
}

/** Deduplicate IPC, prioritize the viewport, and drop queued work after scrolling away. */
export function subscribeDailyFigure(bridge: FigureBridge, id: string, thumbnail: boolean, priority: number, notify: Listener): () => void {
  if (!id || !bridge.getDailyFigure) return () => {};
  const state = stateFor(bridge), key = keyFor(id, thumbnail);
  peekDailyFigure(bridge, id, thumbnail); // Expire stale entries before checking misses.
  const cached = state.cache.get(key);
  if (cached) { let current = true; queueMicrotask(() => { if (current) notify(cached.url); }); return () => { current = false; }; }
  let request = state.requests.get(key);
  if (!request) {
    request = { key, id, thumbnail, priority, started: false, listeners: new Set() };
    state.requests.set(key, request); state.queue.push(request);
  }
  request.priority = Math.min(request.priority, priority);
  request.listeners.add(notify); schedule(bridge, state);
  const subscription = request;
  return () => {
    subscription.listeners.delete(notify);
    if (!subscription.started && !subscription.listeners.size) {
      state.queue = state.queue.filter(item => item !== subscription); state.requests.delete(key);
    }
  };
}
