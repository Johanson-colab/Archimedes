const { normalizeDailyOptions, discoverDailyPapers } = require('./literature.cjs');
const TTL = 20 * 60 * 1000;

function createDailyDiscovery({ discover = discoverDailyPapers } = {}) {
  const pending = new Map();
  const active = new Map();
  return async function load(input, owner, consumerId = 0) {
    const options = normalizeDailyOptions(input);
    // Query semantics changed from recent-category filtering to archive search.
    const key = (options.query ? 'archive-search-v1:' : '') + JSON.stringify(options);
    const cached = owner.getDailyFeedCache(key);
    const fresh = cached && Date.now() - Date.parse(cached.fetched_at) < TTL;
    if (input.cacheOnly) return cached ? { ...cached, options, cached: true, stale: !fresh } : null;
    if (!input.forceRefresh && fresh) return { ...cached, options, cached: true, stale: false };
    // Superseded filters stop network work in this window, never another window.
    const consumer = `${owner.workspace}:${consumerId}`;
    const lock = `${consumer}:${key}`;
    const previous = active.get(consumer);
    if (previous && previous.lock !== lock) {
      previous.controller.abort();
      pending.delete(previous.lock);
    }
    if (!pending.has(lock)) {
      const controller = new AbortController();
      const entry = { lock, controller };
      active.set(consumer, entry);
      const task = (async () => {
        try {
          const response = await discover(options, { signal: controller.signal });
          if (controller.signal.aborted) throw new Error('Daily request superseded.');
          const saved = owner.setDailyFeedCache(key, response);
          return { ...saved, options, cached: false, stale: false };
        } catch (error) {
          if (controller.signal.aborted) throw new Error('Daily request superseded.');
          if (cached) return { ...cached, options, cached: true, stale: true, warning: error instanceof Error ? error.message : 'Live refresh failed; showing cached papers.' };
          throw error;
        }
      })();
      pending.set(lock, task);
      // Keep rejected work observed even if a window has gone away.
      void task.finally(() => {
        if (pending.get(lock) === task) pending.delete(lock);
        if (active.get(consumer) === entry) active.delete(consumer);
      }).catch(() => {});
    }
    return pending.get(lock);
  };
}
module.exports = { createDailyDiscovery };
