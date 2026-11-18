// Research data and run identities use the accepted window owner. Settings,
// dialogs and filesystem-only operations do not need to open its database.
function isWorkspaceDataChannel(channel) {
  if (channel === "agent:claim-approvals" || channel === "agent:interrupt") return false;
  if (/:(?:get|save|reset)-settings$/.test(channel)) return false;
  if (/^(?:window|app|auth|model-config|agent-backend|web-search|mcp|speech|sidebar|plugins|extensions|news|identity):/.test(channel)) return false;
  if (channel.startsWith("workspace:") && channel !== "workspace:open") return false;
  if (channel.startsWith("terminal:") && channel !== "terminal:run") return false;
  return true;
}

/** Each invocation retains the sender's store even after the window switches. */
function createWorkspaceIpc({ ipcMain, store, workspaceForEvent }) {
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        const root = workspaceForEvent(event, channel, args);
        if (!root) return handler(event, ...args);
        const selected = store.createWorkspaceStore(root);
        const captured = selected.captureStore();
        try {
          const result = selected.run(() => handler(event, ...args));
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
