const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  chooseContextPaths: (kind, workspace) => ipcRenderer.invoke("context:choose-paths", { kind, workspace }),
  listContextResources: (kind, workspace) => ipcRenderer.invoke("context:list-resources", { kind, workspace }),
  openWorkspace: (workspacePath) => ipcRenderer.invoke("workspace:open", workspacePath),
  listLibraries: () => ipcRenderer.invoke("library:list"),
  createLibrary: (input) => ipcRenderer.invoke("library:create", input),
  updateLibrary: (id, patch) => ipcRenderer.invoke("library:update", { id, patch }),
  deleteLibrary: (id) => ipcRenderer.invoke("library:delete", id),
  listLibraryPapers: (libraryId, query = "") => ipcRenderer.invoke("library:list-papers", { libraryId, query }),
  searchAcademicPapers: (query, limit = 12) => ipcRenderer.invoke("library:search-external", { query, limit }),
  discoverDailyPapers: (input = {}) => ipcRenderer.invoke("library:discover-daily", input),
  addLibraryPaper: (libraryId, paper) => ipcRenderer.invoke("library:add-paper", { libraryId, paper }),
  updateLibraryPaper: (paperId, patch) => ipcRenderer.invoke("library:update-paper", { paperId, patch }),
  removeLibraryPaper: (libraryId, paperId) => ipcRenderer.invoke("library:remove-paper", { libraryId, paperId }),
  saveTask: (task) => ipcRenderer.invoke("task:save", task),
  runAgent: (input) => ipcRenderer.invoke("agent:run", input),
  approveAgentAction: (actionId) => ipcRenderer.invoke("agent:approve-action", actionId),
  rejectAgentAction: (actionId) => ipcRenderer.invoke("agent:reject-action", actionId),
  runTerminal: (input) => ipcRenderer.invoke("terminal:run", input),
  stopTerminal: (sessionId) => ipcRenderer.invoke("terminal:stop", sessionId),
  createTerminal: (input) => ipcRenderer.invoke("terminal:create", input),
  readyTerminal: (sessionId) => ipcRenderer.invoke("terminal:ready", sessionId),
  writeTerminal: (sessionId, data) => ipcRenderer.send("terminal:write", { sessionId, data }),
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.send("terminal:resize", { sessionId, cols, rows }),
  closeTerminal: (sessionId) => ipcRenderer.invoke("terminal:close", sessionId),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onPtyData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:pty-data", listener);
    return () => ipcRenderer.removeListener("terminal:pty-data", listener);
  },
  onPtyExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:pty-exit", listener);
    return () => ipcRenderer.removeListener("terminal:pty-exit", listener);
  },
  onAgentEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
});
