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

module.exports = { createWorkspaceIpc };
