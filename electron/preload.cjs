const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  getInitialWorkspace: () => ipcRenderer.invoke("window:initial-workspace"),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  chooseContextPaths: (kind, workspace) => ipcRenderer.invoke("context:choose-paths", { kind, workspace }),
  listContextResources: (kind, workspace) => ipcRenderer.invoke("context:list-resources", { kind, workspace }),
  listSkillCollections: (workspace) => ipcRenderer.invoke("skills:list-collections", { workspace }),
  listSkills: (workspace, collectionId = "") => ipcRenderer.invoke("skills:list", { workspace, collectionId }),
  readSkill: (workspace, skillId) => ipcRenderer.invoke("skills:read", { workspace, skillId }),
  openWorkspace: (workspacePath) => ipcRenderer.invoke("workspace:open", workspacePath),
  listWorkspaceFiles: (workspace, directory = "") => ipcRenderer.invoke("workspace:list-files", { workspace, directory }),
  readWorkspaceFile: (workspace, filePath) => ipcRenderer.invoke("workspace:read-file", { workspace, path: filePath }),
  writeWorkspaceFile: (workspace, filePath, content) => ipcRenderer.invoke("workspace:write-file", { workspace, path: filePath, content }),
  getResearchThread: (threadId, workspace) => ipcRenderer.invoke("research-thread:get", { threadId, workspace }),
  createResearchProject: (input) => ipcRenderer.invoke("research-project:create", input),
  renameResearchProject: (id, name) => ipcRenderer.invoke("research-project:rename", { id, name }),
  archiveResearchProject: (id, archived = true) => ipcRenderer.invoke("research-project:archive", { id, archived }),
  archiveResearchThread: (id, archived = true) => ipcRenderer.invoke("research-thread:archive", { id, archived }),
  getModelConfig: () => ipcRenderer.invoke("model-config:get"),
  saveModelConfig: (input) => ipcRenderer.invoke("model-config:save", input),
  testModelConfig: (input) => ipcRenderer.invoke("model-config:test", input),
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
  interruptAgent: (threadId) => ipcRenderer.invoke("agent:interrupt", threadId),
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
  onMenuNewChat: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:new-chat", listener);
    return () => ipcRenderer.removeListener("menu:new-chat", listener);
  },
  onMenuOpenFolder: (callback) => {
    const listener = (_event, workspace) => callback(workspace);
    ipcRenderer.on("menu:open-folder", listener);
    return () => ipcRenderer.removeListener("menu:open-folder", listener);
  },
  onWorkspaceFilesChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace:files-changed", listener);
    return () => ipcRenderer.removeListener("workspace:files-changed", listener);
  },
  onWorkspaceChangeSet: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace:change-set", listener);
    return () => ipcRenderer.removeListener("workspace:change-set", listener);
  },
});
