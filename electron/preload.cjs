const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("researchDesk", {
  platform: process.platform,
  getInitialWorkspace: () => ipcRenderer.invoke("window:initial-workspace"),
  getLocalIdentity: () => ipcRenderer.invoke("identity:get"),
  getAuthState: () => ipcRenderer.invoke("auth:get-state"),
  signIn: (email, password) => ipcRenderer.invoke("auth:sign-in", { email, password }),
  signUp: (email, password, displayName) => ipcRenderer.invoke("auth:sign-up", { email, password, displayName }),
  signOut: () => ipcRenderer.invoke("auth:sign-out"),
  getAuthProviders: () => ipcRenderer.invoke("auth:providers"),
  signInWithMagicLink: (email) => ipcRenderer.invoke("auth:magic-link", { email }),
  signUpAndConfirm: (email, password, displayName) => ipcRenderer.invoke("auth:sign-up-flow", { email, password, displayName }),
  signInWithOAuth: (provider) => ipcRenderer.invoke("auth:oauth", { provider }),
  requestPasswordReset: (email) => ipcRenderer.invoke("auth:reset-password", { email }),
  updateCloudPassword: (password) => ipcRenderer.invoke("auth:update-password", { password }),
  updateCloudProfile: (displayName) => ipcRenderer.invoke("auth:update-profile", { displayName }),
  resendConfirmation: (email) => ipcRenderer.invoke("auth:resend-confirmation", { email }),
  getAuthAccessToken: () => ipcRenderer.invoke("auth:access-token"),
  joinProjectPresence: (projectId, threadId = null) => ipcRenderer.invoke("presence:join", { projectId, threadId }),
  updateProjectPresence: (threadId = null) => ipcRenderer.invoke("presence:update", { threadId }),
  leaveProjectPresence: () => ipcRenderer.invoke("presence:leave"),
  onPresenceUpdate: (callback) => {
    const listener = (_event, members) => callback(members);
    ipcRenderer.on("presence:update", listener);
    return () => ipcRenderer.removeListener("presence:update", listener);
  },
  updateLocalIdentity: (patch) => ipcRenderer.invoke("identity:update", patch),
  setTitleBarTheme: (theme) => ipcRenderer.invoke("window:set-titlebar-theme", theme),
  setUiZoom: (factor) => ipcRenderer.invoke("window:set-ui-zoom", factor),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  watchWorkspace: (workspace) => ipcRenderer.invoke("workspace:watch", workspace),
  revealWorkspace: (workspace) => ipcRenderer.invoke("workspace:reveal", workspace),
  chooseContextPaths: (kind, workspace) => ipcRenderer.invoke("context:choose-paths", { kind, workspace }),
  attachDroppedFiles: (files) => {
    const paths = Array.from(files, (file) => webUtils.getPathForFile(file));
    if (!paths.length || paths.some((p) => !p)) return Promise.reject(new Error("Could not read the dropped files. Drag files or folders from the system file manager."));
    return ipcRenderer.invoke("context:attach-dropped-paths", paths);
  },
  attachRepositoryPath: (url, workspace, path) => ipcRenderer.invoke("context:attach-repository-path", { url, workspace, path }),
  listContextResources: (kind, workspace) => ipcRenderer.invoke("context:list-resources", { kind, workspace }),
  listSkillCollections: (workspace) => ipcRenderer.invoke("skills:list-collections", { workspace }),
  listSkills: (workspace, collectionId = "") => ipcRenderer.invoke("skills:list", { workspace, collectionId }),
  readSkill: (workspace, skillId) => ipcRenderer.invoke("skills:read", { workspace, skillId }),
  listExtensionSources: () => ipcRenderer.invoke("extensions:sources-list"),
  saveExtensionSources: (sources) => ipcRenderer.invoke("extensions:sources-save", sources),
  resetExtensionSources: () => ipcRenderer.invoke("extensions:sources-reset"),
  listExtensions: (input = {}) => ipcRenderer.invoke("extensions:list", input),
  previewExtension: (input = {}) => ipcRenderer.invoke("extensions:preview", input),
  installExtension: (input = {}) => ipcRenderer.invoke("extensions:install", input),
  listInstalledExtensions: (workspace) => ipcRenderer.invoke("extensions:list-installed", { workspace }),
  readExtensionFile: (path, workspace) => ipcRenderer.invoke("extensions:read-local", { path, workspace }),
  openWorkspace: (workspacePath) => ipcRenderer.invoke("workspace:open", workspacePath),
  listWorkspaceFiles: (workspace, directory = "") => ipcRenderer.invoke("workspace:list-files", { workspace, directory }),
  readWorkspaceFile: (workspace, filePath) => ipcRenderer.invoke("workspace:read-file", { workspace, path: filePath }),
  writeWorkspaceFile: (workspace, filePath, content) => ipcRenderer.invoke("workspace:write-file", { workspace, path: filePath, content }),
  listArtifacts: (threadId) => ipcRenderer.invoke("artifacts:list", { threadId }),
  markArtifactsSeen: (threadId) => ipcRenderer.invoke("artifacts:mark-seen", { threadId }),
  countUnseenArtifacts: (threadId) => ipcRenderer.invoke("artifacts:unseen-count", { threadId }),
  deleteArtifact: (id) => ipcRenderer.invoke("artifacts:delete", id),
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
  setResearchThreadVisibility: (threadId, visibility) => ipcRenderer.invoke("research-thread:set-visibility", { threadId, visibility }),
  listProjectMembers: (projectId) => ipcRenderer.invoke("project:list-members", { projectId }),
  addProjectMember: (input) => ipcRenderer.invoke("project:add-member", input),
  updateProjectMemberRole: (projectId, userId, role) => ipcRenderer.invoke("project:update-member", { projectId, userId, role }),
  removeProjectMember: (projectId, userId) => ipcRenderer.invoke("project:remove-member", { projectId, userId }),
  getCollaborationStatus: () => ipcRenderer.invoke("collab:status"),
  listCloudProjects: () => ipcRenderer.invoke("collab:list-projects"),
  publishProject: (projectId) => ipcRenderer.invoke("collab:publish-project", { projectId }),
  syncCloudProject: (projectId) => ipcRenderer.invoke("collab:sync-project", { projectId }),
  addCloudProjectMember: (projectId, email, role = "viewer") => ipcRenderer.invoke("collab:add-member", { projectId, email, role }),
  updateCloudProjectMember: (projectId, userId, role) => ipcRenderer.invoke("collab:update-member", { projectId, userId, role }),
  removeCloudProjectMember: (projectId, userId) => ipcRenderer.invoke("collab:remove-member", { projectId, userId }),
  importCloudProject: (cloudProjectId) => ipcRenderer.invoke("collab:import-project", { cloudProjectId }),
  syncProjectLibraries: (projectId) => ipcRenderer.invoke("collab:sync-libraries", { projectId }),
  syncProjectAnnotations: (projectId) => ipcRenderer.invoke("collab:sync-annotations", { projectId }),
  syncProjectThreads: (projectId) => ipcRenderer.invoke("collab:sync-threads", { projectId }),
  exportProject: (projectId) => ipcRenderer.invoke("collab:export-project", { projectId }),
  listRemoteAudit: (projectId) => ipcRenderer.invoke("collab:list-remote-audit", { projectId }),
  getSharedDocument: (projectId, key) => ipcRenderer.invoke("collab:get-shared-document", { projectId, key }),
  applySharedDocumentUpdate: (projectId, key, update) => ipcRenderer.invoke("collab:apply-shared-document", { projectId, key, update }),
  listAgentRuns: (projectId) => ipcRenderer.invoke("collab:list-agent-runs", { projectId }),
  startAgentRun: (projectId, threadId, contextManifest) => ipcRenderer.invoke("collab:start-agent-run", { projectId, threadId, contextManifest }),
  joinAgentRun: (runId, role = "observer") => ipcRenderer.invoke("collab:join-agent-run", { runId, role }),
  enqueueAgentPrompt: (runId, body) => ipcRenderer.invoke("collab:enqueue-agent-prompt", { runId, body }),
  claimAgentPrompt: (runId) => ipcRenderer.invoke("collab:claim-agent-prompt", { runId }),
  finishAgentRun: (runId, status) => ipcRenderer.invoke("collab:finish-agent-run", { runId, status }),
  requestAgentAction: (projectId, action) => ipcRenderer.invoke("collab:request-agent-action", { projectId, action }),
  resolveAgentAction: (actionId, approved) => ipcRenderer.invoke("collab:resolve-agent-action", { actionId, approved }),
  createShareLink: (input) => ipcRenderer.invoke("collab:create-share-link", input),
  revokeShareLink: (shareId) => ipcRenderer.invoke("collab:revoke-share-link", { shareId }),
  redeemShareLink: (token) => ipcRenderer.invoke("collab:redeem-share-link", { token }),
  listAuditEvents: (projectId, limit = 100) => ipcRenderer.invoke("audit:list", { projectId, limit }),
  listComments: (input) => ipcRenderer.invoke("comments:list", input),
  createComment: (input) => ipcRenderer.invoke("comments:create", input),
  resolveComment: (input) => ipcRenderer.invoke("comments:resolve", input),
  deleteComment: (input) => ipcRenderer.invoke("comments:delete", input),
  createResearchThreadSnapshot: (threadId) => ipcRenderer.invoke("research-thread:create-snapshot", { threadId }),
  listResearchThreadSnapshots: (threadId) => ipcRenderer.invoke("research-thread:list-snapshots", { threadId }),
  getResearchThreadSnapshot: (snapshotId) => ipcRenderer.invoke("research-thread:get-snapshot", snapshotId),
  deleteResearchThread: (id) => ipcRenderer.invoke("research-thread:delete", { id }),
  getModelConfig: (role) => ipcRenderer.invoke("model-config:get", role),
  getModelCapabilities: (role) => ipcRenderer.invoke("model-config:capabilities", role),
  listProviderModels: (input, role) => ipcRenderer.invoke("model-config:list-models", input, role),
  saveModelConfig: (input, role) => ipcRenderer.invoke("model-config:save", input, role),
  testModelConfig: (input, role) => ipcRenderer.invoke("model-config:test", input, role),
  transcribeSpeech: (audio, mimeType, language) => ipcRenderer.invoke("speech:transcribe", { audio, mimeType, language }),
  requestMicrophoneAccess: () => ipcRenderer.invoke("speech:request-permission"),
  getWebSearchConfig: () => ipcRenderer.invoke("web-search:get-config"),
  saveWebSearchConfig: (input) => ipcRenderer.invoke("web-search:save-config", input),
  listLibraries: (projectId) => ipcRenderer.invoke("library:list", { projectId }),
  listLibraryProjects: () => ipcRenderer.invoke("library:list-projects"),
  createLibrary: (input) => ipcRenderer.invoke("library:create", input),
  updateLibrary: (id, patch) => ipcRenderer.invoke("library:update", { id, patch }),
  deleteLibrary: (id) => ipcRenderer.invoke("library:delete", id),
  listLibraryPapers: (libraryId, query = "") => ipcRenderer.invoke("library:list-papers", { libraryId, query }),
  searchAcademicPapers: (query, limit = 12) => ipcRenderer.invoke("library:search-external", { query, limit }),
  discoverDailyPapers: (input = {}) => ipcRenderer.invoke("library:discover-daily", input),
  getDailyFigure: (arxivId) => ipcRenderer.invoke("library:daily-figure", { arxivId }),
  listReproductions: () => ipcRenderer.invoke("reproduction:list"),
  createReproduction: (input) => ipcRenderer.invoke("reproduction:create", input),
  getReproduction: (id) => ipcRenderer.invoke("reproduction:get", { id }),
  updateReproduction: (id, patch) => ipcRenderer.invoke("reproduction:update", { id, patch }),
  deleteReproduction: (id) => ipcRenderer.invoke("reproduction:delete", { id }),
  planReproduction: (id, workspace) => ipcRenderer.invoke("reproduction:plan", { id, workspace }),
  deepSearchPapers: (input) => ipcRenderer.invoke("library:deep-search", input),
  getBenchmarkRadarData: () => ipcRenderer.invoke("benchmark-radar:get-data"),
  searchConferencePapers: (input) => ipcRenderer.invoke("library:search-conferences", input),
  addLibraryPaper: (libraryId, paper) => ipcRenderer.invoke("library:add-paper", { libraryId, paper }),
  updateLibraryPaper: (paperId, patch) => ipcRenderer.invoke("library:update-paper", { paperId, patch }),
  removeLibraryPaper: (libraryId, paperId) => ipcRenderer.invoke("library:remove-paper", { libraryId, paperId }),
  getLibraryPaperReader: (paperId, workspace, projectId) => ipcRenderer.invoke("library:get-reader", { paperId, workspace, projectId }),
  getLibraryPaperChatThread: (paperId, workspace, projectId) => ipcRenderer.invoke("library:get-paper-chat-thread", { paperId, workspace, projectId }),
  setLibraryPaperChatThread: (paperId, threadId, workspace, projectId) => ipcRenderer.invoke("library:set-paper-chat-thread", { paperId, threadId, workspace, projectId }),
  prepareLibraryPaperReader: (paperId, workspace, projectId) => ipcRenderer.invoke("library:prepare-reader", { paperId, workspace, projectId }),
  attachLibraryPaperPdf: (paperId, workspace, projectId) => ipcRenderer.invoke("library:attach-reader-pdf", { paperId, workspace, projectId }),
  findLibraryPaperPassages: (paperId, query, workspace) => ipcRenderer.invoke("library:find-passages", { paperId, query, workspace }),
  createLibraryPaperHighlight: (paperId, input, workspace, projectId) => ipcRenderer.invoke("library:create-highlight", { paperId, input, workspace, projectId }),
  deleteLibraryPaperHighlight: (id, workspace, projectId) => ipcRenderer.invoke("library:delete-highlight", { id, workspace, projectId }),
  translateLibraryPaperSelection: (text) => ipcRenderer.invoke("library:translate-selection", { text }),
  loadLibraryGithubRepository: (url) => ipcRenderer.invoke("library:load-github-repository", { url }),
  getLibraryGithubRepositoryCheckout: (url, workspace) => ipcRenderer.invoke("library:get-github-repository-checkout", { url, workspace }),
  cloneLibraryGithubRepository: (url, workspace) => ipcRenderer.invoke("library:clone-github-repository", { url, workspace }),
  listLibraryGithubRepositoryCheckout: (url, workspace, directory = "") => ipcRenderer.invoke("library:list-github-repository-checkout", { url, workspace, directory }),
  readLibraryGithubRepositoryCheckoutFile: (url, workspace, path) => ipcRenderer.invoke("library:read-github-repository-checkout-file", { url, workspace, path }),
  resolveLibraryGithubRepositoryReference: (url, workspace, path) => ipcRenderer.invoke("library:resolve-github-repository-reference", { url, workspace, path }),
  readClipboardText: () => ipcRenderer.invoke("clipboard:read-text"),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", { text }),
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  saveTask: (task) => ipcRenderer.invoke("task:save", task),
  runAgent: (input) => ipcRenderer.invoke("agent:run", input),
  runProactiveReply: (input) => ipcRenderer.invoke("proactive:reply", input),
  runProactiveObservation: (input) => ipcRenderer.invoke("proactive:observe", input),
  captureProactiveScreenshot: () => ipcRenderer.invoke("proactive:screenshot"),
  runPaperReview: (input) => ipcRenderer.invoke("paper-review:run", input),
  getPaperReview: (paperId, workspace, projectId) => ipcRenderer.invoke("paper-review:get", { paperId, workspace, projectId }),
  runPaperPresentation: (input) => ipcRenderer.invoke("paper-presentation:run", input),
  getPaperPresentation: (paperId, workspace, projectId) => ipcRenderer.invoke("paper-presentation:get", { paperId, workspace, projectId }),
  revealPaperPresentation: (paperId, workspace, projectId) => ipcRenderer.invoke("paper-presentation:reveal", { paperId, workspace, projectId }),
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
  openExternalUrl: (url) => ipcRenderer.invoke("app:open-external", url),
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
  onReproductionPlanEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("reproduction:plan-event", listener);
    return () => ipcRenderer.removeListener("reproduction:plan-event", listener);
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
