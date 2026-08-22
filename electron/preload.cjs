const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  runTerminal: (input) => ipcRenderer.invoke("terminal:run", input),
  stopTerminal: (sessionId) => ipcRenderer.invoke("terminal:stop", sessionId),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
});
