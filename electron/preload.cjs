const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  platform: process.platform,
  getInitialWorkspace: () => ipcRenderer.invoke("window:initial-workspace"),
  setTitleBarTheme: (theme) => ipcRenderer.invoke("window:set-titlebar-theme", theme),
  setUiZoom: (factor) => ipcRenderer.invoke("window:set-ui-zoom", factor),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  watchWorkspace: (workspace) => ipcRenderer.invoke("workspace:watch", workspace),
  revealWorkspace: (workspace) => ipcRenderer.invoke("workspace:reveal", workspace),
  chooseContextPaths: (kind, workspace) => ipcRenderer.invoke("context:choose-paths", { kind, workspace }),
  listContextResources: (kind, workspace) => ipcRenderer.invoke("context:list-resources", { kind, workspace }),
  listSkillCollections: (workspace) => ipcRenderer.invoke("skills:list-collections", { workspace }),
  listSkills: (workspace, collectionId = "") => ipcRenderer.invoke("skills:list", { workspace, collectionId }),
  readSkill: (workspace, skillId) => ipcRenderer.invoke("skills:read", { workspace, skillId }),
  openWorkspace: (workspacePath) => ipcRenderer.invoke("workspace:open", workspacePath),
  listWorkspaceFiles: (workspace, directory = "") => ipcRenderer.invoke("workspace:list-files", { workspace, directory }),
  readWorkspaceFile: (workspace, filePath) => ipcRenderer.invoke("workspace:read-file", { workspace, path: filePath }),
  writeWorkspaceFile: (workspace, filePath, content) => ipcRenderer.invoke("workspace:write-file", { workspace, path: filePath, content }),
  listLatexProjects: (workspace) => ipcRenderer.invoke("paper:list-projects", { workspace }),
  createLatexProject: (workspace, directory = "paper", template = "archimedes") => ipcRenderer.invoke("paper:create-project", { workspace, directory, template }),
  createLatexFile: (workspace, path) => ipcRenderer.invoke("paper:create-file", { workspace, path }),
  createLatexDirectory: (workspace, path) => ipcRenderer.invoke("paper:create-directory", { workspace, path }),
  importLatexFolder: (workspace) => ipcRenderer.invoke("paper:import-folder", { workspace }),
  compileLatexDocument: (workspace, path) => ipcRenderer.invoke("paper:compile", { workspace, path }),
  getResearchThread: (threadId, workspace) => ipcRenderer.invoke("research-thread:get", { threadId, workspace }),
  getResearchSnapshot: () => ipcRenderer.invoke("research:snapshot"),
  createResearchProject: (input) => ipcRenderer.invoke("research-project:create", input),
  renameResearchProject: (id, name) => ipcRenderer.invoke("research-project:rename", { id, name }),
  setResearchProjectWorkspace: (id, workspacePath) => ipcRenderer.invoke("research-project:set-workspace", { id, workspacePath }),
  archiveResearchProject: (id, archived = true) => ipcRenderer.invoke("research-project:archive", { id, archived }),
  deleteResearchProject: (id) => ipcRenderer.invoke("research-project:delete", { id }),
  archiveResearchThread: (id, archived = true) => ipcRenderer.invoke("research-thread:archive", { id, archived }),
  deleteResearchThread: (id) => ipcRenderer.invoke("research-thread:delete", { id }),
  getModelConfig: (role) => ipcRenderer.invoke("model-config:get", role),
  getModelCapabilities: (role) => ipcRenderer.invoke("model-config:capabilities", role),
  listProviderModels: (input, role) => ipcRenderer.invoke("model-config:list-models", input, role),
  saveModelConfig: (input, role) => ipcRenderer.invoke("model-config:save", input, role),
  testModelConfig: (input, role) => ipcRenderer.invoke("model-config:test", input, role),
  getWebSearchConfig: () => ipcRenderer.invoke("web-search:get-config"),
  saveWebSearchConfig: (input) => ipcRenderer.invoke("web-search:save-config", input),
  listLibraries: () => ipcRenderer.invoke("library:list"),
  createLibrary: (input) => ipcRenderer.invoke("library:create", input),
  updateLibrary: (id, patch) => ipcRenderer.invoke("library:update", { id, patch }),
  deleteLibrary: (id) => ipcRenderer.invoke("library:delete", id),
  listLibraryPapers: (libraryId, query = "") => ipcRenderer.invoke("library:list-papers", { libraryId, query }),
  searchAcademicPapers: (query, limit = 12) => ipcRenderer.invoke("library:search-external", { query, limit }),
  discoverDailyPapers: (input = {}) => ipcRenderer.invoke("library:discover-daily", input),
  getDailyFigure: (arxivId) => ipcRenderer.invoke("library:daily-figure", { arxivId }),
  deepSearchPapers: (input) => ipcRenderer.invoke("library:deep-search", input),
  getBenchmarkRadarData: () => ipcRenderer.invoke("benchmark-radar:get-data"),
  searchConferencePapers: (input) => ipcRenderer.invoke("library:search-conferences", input),
  addLibraryPaper: (libraryId, paper) => ipcRenderer.invoke("library:add-paper", { libraryId, paper }),
  updateLibraryPaper: (paperId, patch) => ipcRenderer.invoke("library:update-paper", { paperId, patch }),
  removeLibraryPaper: (libraryId, paperId) => ipcRenderer.invoke("library:remove-paper", { libraryId, paperId }),
  getLibraryPaperReader: (paperId, workspace) => ipcRenderer.invoke("library:get-reader", { paperId, workspace }),
  getLibraryPaperChatThread: (paperId, workspace) => ipcRenderer.invoke("library:get-paper-chat-thread", { paperId, workspace }),
  setLibraryPaperChatThread: (paperId, threadId, workspace) => ipcRenderer.invoke("library:set-paper-chat-thread", { paperId, threadId, workspace }),
  prepareLibraryPaperReader: (paperId, workspace) => ipcRenderer.invoke("library:prepare-reader", { paperId, workspace }),
  attachLibraryPaperPdf: (paperId, workspace) => ipcRenderer.invoke("library:attach-reader-pdf", { paperId, workspace }),
  findLibraryPaperPassages: (paperId, query, workspace) => ipcRenderer.invoke("library:find-passages", { paperId, query, workspace }),
  createLibraryPaperHighlight: (paperId, input, workspace) => ipcRenderer.invoke("library:create-highlight", { paperId, input, workspace }),
  deleteLibraryPaperHighlight: (id, workspace) => ipcRenderer.invoke("library:delete-highlight", { id, workspace }),
  translateLibraryPaperSelection: (text) => ipcRenderer.invoke("library:translate-selection", { text }),
  loadLibraryGithubRepository: (url) => ipcRenderer.invoke("library:load-github-repository", { url }),
  getLibraryGithubRepositoryCheckout: (url, workspace) => ipcRenderer.invoke("library:get-github-repository-checkout", { url, workspace }),
  cloneLibraryGithubRepository: (url, workspace) => ipcRenderer.invoke("library:clone-github-repository", { url, workspace }),
  listLibraryGithubRepositoryCheckout: (url, workspace, directory = "") => ipcRenderer.invoke("library:list-github-repository-checkout", { url, workspace, directory }),
  readLibraryGithubRepositoryCheckoutFile: (url, workspace, path) => ipcRenderer.invoke("library:read-github-repository-checkout-file", { url, workspace, path }),
  readClipboardText: () => ipcRenderer.invoke("clipboard:read-text"),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", { text }),
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  saveTask: (task) => ipcRenderer.invoke("task:save", task),
  runAgent: (input) => ipcRenderer.invoke("agent:run", input),
  runProactiveReply: (input) => ipcRenderer.invoke("proactive:reply", input),
  runProactiveObservation: (input) => ipcRenderer.invoke("proactive:observe", input),
  captureProactiveScreenshot: () => ipcRenderer.invoke("proactive:screenshot"),
  runPaperReview: (input) => ipcRenderer.invoke("paper-review:run", input),
  getPaperReview: (paperId, workspace) => ipcRenderer.invoke("paper-review:get", { paperId, workspace }),
  runPaperPresentation: (input) => ipcRenderer.invoke("paper-presentation:run", input),
  getPaperPresentation: (paperId, workspace) => ipcRenderer.invoke("paper-presentation:get", { paperId, workspace }),
  revealPaperPresentation: (paperId, workspace) => ipcRenderer.invoke("paper-presentation:reveal", { paperId, workspace }),
  cleanupPaperReviewRuns: (workspace) => ipcRenderer.invoke("paper-review:cleanup-internal-runs", { workspace }),
  interruptAgent: (threadId) => ipcRenderer.invoke("agent:interrupt", threadId),
  approveAgentAction: (actionId) => ipcRenderer.invoke("agent:approve-action", actionId),
  rejectAgentAction: (actionId) => ipcRenderer.invoke("agent:reject-action", actionId),
  runTerminal: (input) => ipcRenderer.invoke("terminal:run", input),
  stopTerminal: (sessionId) => ipcRenderer.invoke("terminal:stop", sessionId),
  getJourneySettings: () => ipcRenderer.invoke("journey:get-settings"),
  getWorkbenchSettings: () => ipcRenderer.invoke("workbench:get-settings"),
  saveWorkbenchSettings: (input) => ipcRenderer.invoke("workbench:save-settings", input),
  resetWorkbenchSettings: () => ipcRenderer.invoke("workbench:reset-settings"),
  getWorkbenchNote: (key) => ipcRenderer.invoke("workbench:get-note", key),
  saveWorkbenchNote: (key, content) => ipcRenderer.invoke("workbench:save-note", { key, content }),
  deleteWorkbenchNote: (key) => ipcRenderer.invoke("workbench:delete-note", key),
  saveJourneySettings: (input) => ipcRenderer.invoke("journey:save-settings", input),
  resetJourneySettings: () => ipcRenderer.invoke("journey:reset-settings"),
  getJourneySummary: (threadId) => ipcRenderer.invoke("journey:get-summary", threadId),
  summarizeJourney: (input) => ipcRenderer.invoke("journey:summarize", input),
  clearJourneySummary: (threadId) => ipcRenderer.invoke("journey:clear-summary", threadId),
  getTerminalSettings: () => ipcRenderer.invoke("terminal:get-settings"),
  saveTerminalSettings: (input) => ipcRenderer.invoke("terminal:save-settings", input),
  openExternalTerminal: (input) => ipcRenderer.invoke("terminal:open-external", input),
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
  onPaperReviewEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("paper-review:event", listener);
    return () => ipcRenderer.removeListener("paper-review:event", listener);
  },
  onPaperPresentationEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("paper-presentation:event", listener);
    return () => ipcRenderer.removeListener("paper-presentation:event", listener);
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
