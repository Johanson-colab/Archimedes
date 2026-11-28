// Research data and run identities use the accepted window owner. Settings,
// dialogs and filesystem-only operations do not need to open its database.
function isWorkspaceDataChannel(channel) {
  if (channel === "agent:claim-approvals" || channel === "agent:interrupt") return false;
  if (/:(?:get|save|reset)-settings$/.test(channel)) return false;
  if (/^(?:window|app|auth|model-config|agent-backend|web-search|environment|mcp|speech|sidebar|plugins|extensions|news|identity):/.test(channel)) return false;
  if (channel.startsWith("workspace:") && channel !== "workspace:open") return false;
  if (channel.startsWith("terminal:") && channel !== "terminal:run") return false;
  return true;
}

/** Each invocation retains the sender's store even after the window switches. */
function createWorkspaceIpc({ ipcMain, store, workspaceForEvent, prepareOpen }) {
  const displayedStores = new WeakMap();
  const openingRequests = new WeakMap();
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        const opening = channel === "workspace:open";
        const request = opening && prepareOpen ? {} : null;
        if (request) openingRequests.set(event.sender, request);
        const root = workspaceForEvent(event, channel, args);
        if (!root) return handler(event, ...args);
        const selected = store.createWorkspaceStore(root, { allowReplacement: opening });
        const displayed = displayedStores.get(event.sender);
        if (!opening && displayed && displayed !== selected) {
          throw new Error("The workspace database was replaced. Reopen the folder to load the new data.");
        }
        const captured = selected.captureStore();
        if (request) {
          return selected.run(async () => {
            await prepareOpen();
            if (openingRequests.get(event.sender) !== request || event.sender.isDestroyed()) {
              throw new Error("The workspace open request is no longer current.");
            }
            const result = handler(event, ...args);
            displayedStores.set(event.sender, selected);
            return result;
          }).finally(captured.release);
        }
        try {
          const result = selected.run(() => handler(event, ...args));
          if (opening) displayedStores.set(event.sender, selected);
          if (result && typeof result.then === "function") return Promise.resolve(result).finally(captured.release);
          captured.release();
          return result;
        } catch (error) { captured.release(); throw error; }
      });
    },
    on: (...args) => ipcMain.on(...args),
  };
}

module.exports = { createWorkspaceIpc, isWorkspaceDataChannel };
