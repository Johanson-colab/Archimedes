const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  openWorkspace: (workspacePath) => ipcRenderer.invoke("workspace:open", workspacePath),
  saveTask: (task) => ipcRenderer.invoke("task:save", task),
  runTerminal: (input) => ipcRenderer.invoke("terminal:run", input),
  stopTerminal: (sessionId) => ipcRenderer.invoke("terminal:stop", sessionId),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
});
