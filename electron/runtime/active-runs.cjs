const activeRuns = new Map();

function keyFor({ workspace, domain, id }) {
  return JSON.stringify([workspace, domain, id]);
}

function hasActiveRun(scope) {
  return activeRuns.has(keyFor(scope));
}

function findActiveRun(scope) {
  const entry = activeRuns.get(keyFor(scope));
  return entry && entry.store === scope.store && entry.ownerId === scope.ownerId ? entry.run : undefined;
}

function registerActiveRun(scope, run) {
  const key = keyFor(scope);
  if (activeRuns.has(key)) throw new Error("This run is already active.");
  const entry = { domain: scope.domain, store: scope.store, ownerId: scope.ownerId, run };
  activeRuns.set(key, entry);
  return () => {
    if (activeRuns.get(key) === entry) activeRuns.delete(key);
  };
}

function listActiveRuns(domain) {
  return [...activeRuns.values()].filter(entry => !domain || entry.domain === domain).map(entry => entry.run);
}

function installQuitGuard({ app, dialog, hasWork, stopWork, restoreWindow, timeoutMs = 2_000 }) {
  let asking = false;
  let allowQuit = false;
  let cleaning = false;
  let cleaned = false;
  app.on("before-quit", event => {
    if (allowQuit || cleaned || !asking && !hasWork()) return;
    event.preventDefault();
    if (asking || cleaning) return;
    asking = true;
    void (async () => {
      try {
        const { response } = await dialog.showMessageBox({
          type: "warning",
          message: "Research is still running",
          detail: "Stop active work and quit Archimedes?",
          buttons: ["Keep running", "Stop and quit"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response !== 1) {
          // On Windows/Linux the last window has already closed by the time
          // this runs. Keep the active work reachable instead of leaving a
          // windowless process behind.
          restoreWindow?.();
          return;
        }
        allowQuit = true;
        app.quit();
      } catch (error) {
        console.warn("Could not confirm quitting:", error.message);
      } finally {
        allowQuit = false;
        asking = false;
      }
    })();
  });

  // The unsaved-editor guard can veto closing a window after before-quit.
  app.on("will-quit", event => {
    if (cleaned || !cleaning && !hasWork()) return;
    event.preventDefault();
    if (cleaning) return;
    cleaning = true;
    let timeout;
    void Promise.race([
      Promise.resolve().then(stopWork),
      new Promise(resolve => { timeout = setTimeout(resolve, timeoutMs); }),
    ]).catch(error => console.warn("Could not finish stopping active research:", error.message)).finally(() => {
      clearTimeout(timeout);
      cleaned = true;
      app.quit();
    });
  });
}

module.exports = { findActiveRun, hasActiveRun, listActiveRuns, registerActiveRun, installQuitGuard };
