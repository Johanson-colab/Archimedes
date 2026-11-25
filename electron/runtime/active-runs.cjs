const activeRuns = new Map();

function keyFor({ workspace, domain, id }) {
  return JSON.stringify([workspace, domain, id]);
}

function hasActiveRun(scope) {
  return activeRuns.has(keyFor(scope));
}

function findActiveRun(scope) {
  const entry = activeRuns.get(keyFor(scope));
  return entry && entry.ownerId === scope.ownerId ? entry.run : undefined;
}

function registerActiveRun(scope, run) {
  const key = keyFor(scope);
  if (activeRuns.has(key)) throw new Error("This run is already active.");
  const entry = { domain: scope.domain, ownerId: scope.ownerId, run };
  activeRuns.set(key, entry);
  return () => {
    if (activeRuns.get(key) === entry) activeRuns.delete(key);
  };
}

function listActiveRuns(domain) {
  return [...activeRuns.values()].filter(entry => !domain || entry.domain === domain).map(entry => entry.run);
}

function installQuitGuard({ app, dialog, hasWork, stopWork, timeoutMs = 2_000 }) {
  let pending = false;
  let confirmed = false;
  app.on("before-quit", event => {
    if (confirmed || !pending && !hasWork()) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
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
        if (response !== 1) return;
        let timeout;
        try {
          await Promise.race([
            Promise.resolve().then(stopWork),
            new Promise(resolve => { timeout = setTimeout(resolve, timeoutMs); }),
          ]);
        } catch (error) {
          console.warn("Could not finish stopping active research:", error.message);
        } finally {
          clearTimeout(timeout);
        }
        confirmed = true;
        app.quit();
      } catch (error) {
        console.warn("Could not confirm quitting:", error.message);
      } finally {
        pending = false;
      }
    })();
  });
}

module.exports = { findActiveRun, hasActiveRun, listActiveRuns, registerActiveRun, installQuitGuard };
