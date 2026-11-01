/// <reference types="vite/client" />

type FigureForgeConnection = { provider: string; baseUrl?: string; apiKey?: string; model?: string };
interface ResearchDeskBridge {
    platform?: string;
    getInitialWorkspace: () => Promise<string | null>;
    getLocalIdentity: () => Promise<LocalIdentity>;
    getAuthState: () => Promise<AuthState>;
    signIn: (email: string, password: string) => Promise<AuthState>;
    signUp: (email: string, password: string, displayName?: string) => Promise<AuthState>;
    signOut: () => Promise<AuthState>;
    getAuthProviders: () => Promise<AuthProviders>;
    signInWithMagicLink: (email: string) => Promise<AuthState>;
    signUpAndConfirm: (email: string, password: string, displayName?: string) => Promise<AuthState>;
    signInWithOAuth: (provider: "google") => Promise<AuthState>;
    requestPasswordReset: (email: string) => Promise<AuthState & { recovery: boolean }>;
    updateCloudPassword: (password: string) => Promise<AuthState>;
    updateCloudProfile: (displayName: string) => Promise<AuthState>;
    resendConfirmation: (email: string) => Promise<AuthState>;
    getAuthAccessToken: () => Promise<string | null>;
    getCollaborationStatus: () => Promise<CollaborationStatus>;
    joinProjectPresence: (projectId: string, threadId?: string | null) => Promise<{ joined: boolean }>;
    updateProjectPresence: (threadId?: string | null) => Promise<{ updated: boolean }>;
    leaveProjectPresence: () => Promise<{ left: boolean }>;
    onPresenceUpdate: (callback: (members: PresenceMember[]) => void) => () => void;
    listCloudProjects: () => Promise<CloudProject[]>;
    publishProject: (projectId: string) => Promise<CloudProjectSyncResult>;
    syncCloudProject: (projectId: string) => Promise<CloudProjectSyncResult>;
    addCloudProjectMember: (projectId: string, email: string, role?: ProjectMember["role"]) => Promise<CloudProjectSyncResult>;
    updateCloudProjectMember: (projectId: string, userId: string, role: ProjectMember["role"]) => Promise<CloudProjectSyncResult>;
    removeCloudProjectMember: (projectId: string, userId: string) => Promise<CloudProjectSyncResult>;
    importCloudProject: (cloudProjectId: string) => Promise<CloudProjectSyncResult>;
    syncProjectLibraries: (projectId: string) => Promise<CloudLibrarySyncResult>;
    syncProjectAnnotations: (projectId: string) => Promise<CloudAnnotationSyncResult>;
    syncProjectThreads: (projectId: string) => Promise<CloudThreadSyncResult>;
    exportProject: (projectId: string) => Promise<Record<string, unknown>>;
    listRemoteAudit: (projectId: string) => Promise<Array<Record<string, unknown>>>;
    getSharedDocument: (projectId: string, key: string) => Promise<SharedDocument | null>;
    applySharedDocumentUpdate: (projectId: string, key: string, update: string) => Promise<SharedDocument>;
    listAgentRuns: (projectId: string) => Promise<SharedAgentRun[]>;
    startAgentRun: (projectId: string, threadId: string, contextManifest?: Record<string, unknown>) => Promise<SharedAgentRun>;
    joinAgentRun: (runId: string, role?: "co_prompt" | "observer") => Promise<SharedAgentRun>;
    enqueueAgentPrompt: (runId: string, body: string) => Promise<SharedAgentRun>;
    claimAgentPrompt: (runId: string) => Promise<SharedRunPrompt | null>;
    finishAgentRun: (runId: string, status: "paused" | "completed" | "failed" | "interrupted") => Promise<SharedAgentRun>;
    requestAgentAction: (projectId: string, action: Record<string, unknown>) => Promise<SharedRunAction>;
    resolveAgentAction: (actionId: string, approved: boolean) => Promise<{ resolved: boolean }>;
    createShareLink: (input: { projectId: string; resourceType?: "thread" | "paper" | "review"; resourceId: string; role?: "viewer" | "commenter"; expiresInDays?: number }) => Promise<CloudShareLink>;
    revokeShareLink: (shareId: string) => Promise<{ revoked: boolean }>;
    redeemShareLink: (token: string) => Promise<GuestShareSnapshot>;
    updateLocalIdentity: (patch: { displayName: string }) => Promise<LocalIdentity>;
    setTitleBarTheme?: (theme: "charcoal" | "paper") => Promise<void>;
    setUiZoom?: (factor: number) => Promise<number>;
    chooseWorkspace: () => Promise<string | null>;
    watchWorkspace: (workspace: string) => Promise<string>;
    revealWorkspace: (workspace: string) => Promise<{ opened: boolean }>;
    chooseContextPaths: (kind: "file" | "folder", workspace?: string) => Promise<ContextAttachment[]>;
    attachDroppedFiles: (files: File[]) => Promise<ContextAttachment[]>;
    attachRepositoryPath: (url: string, workspace: string, path: string) => Promise<ContextAttachment>;
    listContextResources: (kind: "plugin" | "skill", workspace?: string) => Promise<ContextAttachment[]>;
    listSkillCollections: (workspace?: string) => Promise<SkillCollection[]>;
    listSkills: (workspace?: string, collectionId?: string) => Promise<SkillSummary[]>;
    readSkill: (workspace: string | undefined, skillId: string) => Promise<SkillDetail>;
    listExtensionSources: () => Promise<ExtensionSource[]>;
    saveExtensionSources: (sources: ExtensionSource[]) => Promise<ExtensionSource[]>;
    resetExtensionSources: () => Promise<ExtensionSource[]>;
    listExtensions: (input: { workspace?: string; limit?: number; refresh?: boolean }) => Promise<ExtensionFeed>;
    previewExtension: (input: { id: string; workspace?: string }) => Promise<ExtensionPreview>;
    installExtension: (input: { id: string; workspace?: string; scope?: "workspace" | "global" }) => Promise<ExtensionInstallResult>;
    listInstalledExtensions: (workspace?: string) => Promise<{ skills: ContextAttachment[]; plugins: ContextAttachment[] }>;
    readExtensionFile: (path: string, workspace?: string) => Promise<{ filename: string; content: string }>;
    openWorkspace: (workspacePath?: string) => Promise<WorkspaceSnapshot>;
    listWorkspaceFiles: (workspace: string, directory?: string) => Promise<WorkspaceFileTree>;
    readWorkspaceFile: (workspace: string, filePath: string) => Promise<WorkspaceFilePreview>;
    listArtifacts: (threadId: string) => Promise<ResearchArtifact[]>;
    markArtifactsSeen: (threadId: string) => Promise<{ marked: number }>;
    countUnseenArtifacts: (threadId: string) => Promise<number>;
    deleteArtifact: (id: string) => Promise<{ deleted: boolean }>;
    writeWorkspaceFile: (workspace: string, filePath: string, content: string) => Promise<WorkspaceFilePreview>;
    listLatexProjects: (workspace: string) => Promise<LatexProjectSummary[]>;
    createLatexProject: (workspace: string, directory?: string, template?: string) => Promise<WorkspaceFilePreview>;
    createLatexFile: (workspace: string, path: string) => Promise<WorkspaceFilePreview>;
    createLatexDirectory: (workspace: string, path: string) => Promise<LatexDirectoryResult>;
    importLatexFolder: (workspace: string) => Promise<LatexImportResult>;
    compileLatexDocument: (workspace: string, path: string) => Promise<LatexCompileResult>;
    getResearchThread: (threadId: string, workspace?: string) => Promise<ResearchThreadDetail>;
    getResearchSnapshot: () => Promise<WorkspaceSnapshot>;
    createResearchProject: (input: { name: string; description?: string; workspacePath?: string }) => Promise<ResearchProject>;
    renameResearchProject: (id: string, name: string) => Promise<ResearchProject>;
    setResearchProjectWorkspace: (id: string, workspacePath: string) => Promise<ResearchProject>;
    archiveResearchProject: (id: string, archived?: boolean) => Promise<{ archived: boolean }>;
    deleteResearchProject: (id: string) => Promise<{ deleted: boolean }>;
    archiveResearchThread: (id: string, archived?: boolean) => Promise<ResearchThreadDetail>;
  setResearchThreadVisibility: (threadId: string, visibility: "project" | "private") => Promise<{ visibility: "project" | "private" }>;
  listProjectMembers: (projectId: string) => Promise<ProjectMember[]>;
  addProjectMember: (input: { projectId: string; userId: string; role?: ProjectMember["role"]; displayName?: string; email?: string }) => Promise<ProjectMember | null>;
  updateProjectMemberRole: (projectId: string, userId: string, role: ProjectMember["role"]) => Promise<ProjectMember | null>;
  removeProjectMember: (projectId: string, userId: string) => Promise<{ removed: boolean }>;
  listAuditEvents: (projectId?: string | null, limit?: number) => Promise<AuditEvent[]>;
  listComments: (input: { workspace?: string; projectId: string; resourceType: ResearchComment["resource_type"]; resourceId: string; includeResolved?: boolean }) => Promise<ResearchComment[]>;
  createComment: (input: { workspace?: string; projectId: string; resourceType: ResearchComment["resource_type"]; resourceId: string; body: string; parentId?: string | null; anchor?: Record<string, unknown> }) => Promise<ResearchComment | null>;
  resolveComment: (input: { workspace?: string; id: string; resolved?: boolean }) => Promise<ResearchComment | null>;
  deleteComment: (input: { workspace?: string; id: string }) => Promise<{ deleted: boolean }>;
  createResearchThreadSnapshot: (threadId: string) => Promise<{ id: string; thread_id: string; project_id: string; sequence: number; created_at: string; manifest: Record<string, unknown> }>;
  listResearchThreadSnapshots: (threadId: string) => Promise<Array<{ id: string; thread_id: string; project_id: string; owner_id: string; sequence: number; created_at: string }>>;
  getResearchThreadSnapshot: (snapshotId: string) => Promise<{ id: string; thread_id: string; project_id: string; sequence: number; created_at: string; manifest: Record<string, unknown> } | null>;
    deleteResearchThread: (id: string) => Promise<{ deleted: boolean }>;
    getModelConfig: (role?: ModelRole) => Promise<PublicModelConfig>;
    getModelCapabilities: (role?: ModelRole) => Promise<ModelCapabilities>;
    listProviderModels: (input: ModelCatalogInput, role?: ModelRole) => Promise<ModelCatalogResponse>;
    saveModelConfig: (input: ModelConfigInput, role?: ModelRole) => Promise<PublicModelConfig>;
    testModelConfig: (input: ModelConfigInput, role?: ModelRole) => Promise<ModelConnectionResult>;
    transcribeSpeech: (audio: ArrayBuffer, mimeType: string, language?: string) => Promise<{ text: string }>;
    requestMicrophoneAccess: () => Promise<boolean>;
    getWebSearchConfig: () => Promise<PublicWebSearchConfig>;
    saveWebSearchConfig: (input: { provider: WebSearchProviderId; apiKey: string }) => Promise<PublicWebSearchConfig>;
    listLibraries: (projectId?: string | null) => Promise<ResearchLibrary[]>;
    listLibraryProjects: () => Promise<LibraryProjectSummary[]>;
    createLibrary: (input: { projectId?: string | null; name: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    updateLibrary: (id: string, patch: { name?: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    deleteLibrary: (id: string) => Promise<{ deleted: boolean }>;
    listLibraryPapers: (libraryId: string, query?: string) => Promise<LibraryPaper[]>;
    searchAcademicPapers: (query: string, limit?: number) => Promise<AcademicSearchResult[]>;
    discoverDailyPapers: (input?: DailyDiscoveryOptions) => Promise<DailyDiscoveryResponse>;
    getDailyFigure?: (arxivId: string) => Promise<string>;
    listReproductions: () => Promise<Reproduction[]>;
    createReproduction: (input: ReproductionCreateInput) => Promise<Reproduction>;
    getReproduction: (id: string) => Promise<Reproduction | null>;
    updateReproduction: (id: string, patch: ReproductionPatch) => Promise<Reproduction>;
    deleteReproduction: (id: string) => Promise<boolean>;
    planReproduction: (id: string, workspace?: string) => Promise<Reproduction>;
    preflightReproduction: (id: string, workspace?: string) => Promise<ReproductionPreflight>;
    runReproduction: (id: string, workspace?: string) => Promise<Reproduction>;
    stopReproduction: (id: string) => Promise<boolean>;
    onReproductionPlanEvent?: (callback: (payload: { paperId?: string; type?: string; detail?: string }) => void) => () => void;
    onReproductionRunEvent?: (callback: (payload: {
      reproductionId?: string;
      runId?: string;
      type?: string;
      detail?: string;
      chunk?: string;
      status?: string;
      summary?: string;
      step?: { id?: string; title?: string; status?: ReproductionRunStepStatus; detail?: string; exit_code?: number | null; duration_ms?: number };
    }) => void) => () => void;
    deepSearchPapers: (input: DeepPaperSearchInput) => Promise<DeepPaperSearchResponse>;
    getBenchmarkRadarData: () => Promise<BenchmarkRadarData>;
    searchConferencePapers: (input: ConferenceSearchOptions) => Promise<ConferenceSearchResponse>;
    addLibraryPaper: (libraryId: string, paper: AcademicSearchResult) => Promise<LibraryPaper>;
    updateLibraryPaper: (paperId: string, patch: { title?: string; reading_status?: ReadingStatus; starred?: boolean; notes?: string; tags?: string[] }) => Promise<LibraryPaper>;
    removeLibraryPaper: (libraryId: string, paperId: string) => Promise<{ removed: boolean }>;
    getLibraryPaperReader: (paperId: string, workspace?: string, projectId?: string | null) => Promise<PaperReaderState>;
    getLibraryPaperChatThread: (paperId: string, workspace?: string, projectId?: string | null) => Promise<ResearchThreadDetail | null>;
    setLibraryPaperChatThread: (paperId: string, threadId: string, workspace?: string, projectId?: string | null) => Promise<ResearchThreadDetail | null>;
    prepareLibraryPaperReader: (paperId: string, workspace?: string, projectId?: string | null) => Promise<PaperReaderState>;
    attachLibraryPaperPdf: (paperId: string, workspace?: string, projectId?: string | null) => Promise<PaperReaderState>;
    findLibraryPaperPassages: (paperId: string, query: string, workspace?: string) => Promise<PaperPassage[]>;
    createLibraryPaperHighlight: (paperId: string, input: PaperHighlightInput, workspace?: string, projectId?: string | null) => Promise<PaperHighlight>;
    deleteLibraryPaperHighlight: (id: string, workspace?: string, projectId?: string | null) => Promise<{ deleted: boolean }>;
    translateLibraryPaperSelection: (text: string) => Promise<{ translation: string }>;
    loadLibraryGithubRepository: (url: string) => Promise<PaperRepositorySnapshot>;
    getLibraryGithubRepositoryCheckout: (url: string, workspace?: string) => Promise<RepositoryCheckout | null>;
    cloneLibraryGithubRepository: (url: string, workspace?: string) => Promise<RepositoryCheckout>;
    listLibraryGithubRepositoryCheckout: (url: string, workspace: string, directory?: string) => Promise<RepositoryCheckoutDirectory>;
    readLibraryGithubRepositoryCheckoutFile: (url: string, workspace: string, path: string) => Promise<RepositoryCheckoutFile>;
    resolveLibraryGithubRepositoryReference: (url: string, workspace: string, path: string) => Promise<{ status: "exact" | "unique" | "ambiguous" | "missing"; paths: string[] }>;
    readClipboardText: () => Promise<string>;
    writeClipboardText: (text: string) => Promise<void>;
    readClipboardImage: () => Promise<ContextImage | null>;
    saveTask: (task: { prompt: string; response: string; status?: string }) => Promise<SavedTask>;
    runAgent: (input: { prompt: string; workspace: string; threadId?: string; projectId?: string; visibility?: "project" | "private"; mode: ResearchMode; reasoningEffort?: ReasoningEffort; contextLength?: ContextLength; contextItems?: ContextAttachment[]; capabilities?: { write: "ask" | "deny"; command: "ask" | "deny" }; clientRunId?: string }) => Promise<AgentRunResult>;
    claimApprovals: (threadId: string, claimed: boolean) => Promise<{ claimed: boolean }>;
    runProactiveReply: (input: { prompt: string; context: Record<string, unknown> }) => Promise<{ text: string; model: string; provider: ModelProviderId }>;
    prepareFigurePlan: (input: { paperText: string; pdfData?: string; figureType: string; requirements: string; language: "en" | "zh"; connection?: FigureForgeConnection }) => Promise<{ plan: string; model: string; provider: string; source: "pdf" | "text" }>;
    analyzeFigureReferences: (input: { references: string[]; plan: string; model?: string; connection?: FigureForgeConnection }) => Promise<{ contract: import("./figureforge/design-contract.mjs").DesignContract; representative: number[]; imageRefs: number[] }>;
    generateFigureSvg: (input: { references: string[]; plan: string; guide: string; method: "direct" | "two-stage"; model?: string; aspect?: string; connection?: FigureForgeConnection }) => Promise<{ svg: string }>;
    generateFigureBitmap: (input: { references: string[]; plan: string; guide: string; method: "direct" | "two-stage"; model: string; aspect?: string; resolution?: string; connection?: FigureForgeConnection }) => Promise<{ image: string; requestedSize: string }>;
    reconstructFigure: (input: { image: string; width: number; height: number; model?: string; connection?: FigureForgeConnection }) => Promise<{ nodes: unknown[]; width: number; height: number }>;
    requestReconstructionEvidence: (input: { images: string[]; width: number; height: number; task: Record<string, unknown>; model?: string; connection?: FigureForgeConnection }) => Promise<Record<string, unknown>>;
    runProactiveObservation: (input: { context: Record<string, unknown>; screenshot?: { dataUrl: string; width: number; height: number } }) => Promise<ProactiveObservationResult | null>;
    captureProactiveScreenshot: () => Promise<{ dataUrl: string; width: number; height: number; bytes: number } | null>;
    runPaperReview: (input: PaperReviewInput) => Promise<PaperReviewResult>;
    getPaperReview: (paperId: string, workspace?: string, projectId?: string | null) => Promise<StoredPaperReview | null>;
    runPaperPresentation: (input: PaperPresentationInput) => Promise<StoredPaperPresentation>;
    getPaperPresentation: (paperId: string, workspace?: string, projectId?: string | null) => Promise<StoredPaperPresentation | null>;
    revealPaperPresentation: (paperId: string, workspace?: string, projectId?: string | null) => Promise<void>;
    onPaperPresentationEvent: (callback: (payload: PaperPresentationEvent) => void) => () => void;
    cleanupPaperReviewRuns: (workspace?: string) => Promise<{ threadIds: string[] }>;
    interruptAgent: (threadId: string) => Promise<{ interrupted: boolean }>;
    approveAgentAction: (actionId: string) => Promise<AgentAction>;
    rejectAgentAction: (actionId: string) => Promise<AgentAction>;
    runTerminal: (input: { command: string; cwd?: string; actionId?: string }) => Promise<{ sessionId: string; commandRunId: string; workspace: string }>;
    stopTerminal: (sessionId: string) => Promise<void>;
    getJourneySettings: () => Promise<JourneySettings>;
    getWorkbenchSettings: () => Promise<{ version: number; order: string[]; hidden: string[] }>;
    saveWorkbenchSettings: (input: { version?: number; order: string[]; hidden: string[] }) => Promise<{ version: number; order: string[]; hidden: string[] }>;
    resetWorkbenchSettings: () => Promise<{ version: number; order: string[]; hidden: string[] }>;
    getWorkbenchNote: (key: string) => Promise<{ content: string; updatedAt: string | null }>;
    saveWorkbenchNote: (key: string, content: string) => Promise<{ content: string; updatedAt: string | null }>;
    deleteWorkbenchNote: (key: string) => Promise<{ deleted: boolean }>;
    openExternalUrl: (url: string) => Promise<{ opened: boolean }>;
    saveJourneySettings: (input: Partial<JourneySettings>) => Promise<JourneySettings>;
    resetJourneySettings: () => Promise<JourneySettings>;
    getJourneySummary: (threadId: string) => Promise<JourneySummarySnapshot | null>;
    summarizeJourney: (input: JourneySummaryInput) => Promise<JourneySummarySnapshot | null>;
    clearJourneySummary: (threadId: string) => Promise<{ cleared: boolean }>;
    getTerminalSettings: () => Promise<TerminalSettings>;
    saveTerminalSettings: (input: Partial<TerminalSettings>) => Promise<TerminalSettings>;
    openExternalTerminal: (input: { cwd?: string; externalTerminal?: TerminalExternalTerminal }) => Promise<{ opened: boolean; app: string; error?: string }>;
    createTerminal: (input: { cwd?: string; cols?: number; rows?: number }) => Promise<TerminalSessionInfo>;
    readyTerminal: (sessionId: string) => Promise<void>;
    writeTerminal: (sessionId: string, data: string) => void;
    resizeTerminal: (sessionId: string, cols: number, rows: number) => void;
    closeTerminal: (sessionId: string) => Promise<void>;
    onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onPtyData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onPtyExit: (callback: (payload: { sessionId: string; exitCode: number; signal?: number }) => void) => () => void;
    onAgentEvent: (callback: (payload: AgentEvent) => void) => () => void;
    onPaperReviewEvent: (callback: (payload: PaperReviewEvent) => void) => () => void;
    onMenuNewChat: (callback: () => void) => () => void;
    onMenuOpenFolder: (callback: (workspace: string) => void) => () => void;
    onWorkspaceFilesChanged: (callback: (payload: { path: string }) => void) => () => void;
    onWorkspaceChangeSet: (callback: (changeSet: WorkspaceChangeSet) => void) => () => void;
}

interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  kind?: "text" | "markdown" | "pdf" | "image" | "binary";
  size?: number;
  modifiedAt?: string;
  children?: WorkspaceFileEntry[];
}

interface SkillCollection {
  id: string;
  name: string;
  description: string;
  skillCount: number;
}

interface SkillSummary {
  id: string;
  collectionId: string;
  collectionName: string;
  name: string;
  description: string;
  category: string;
  path: string;
}

interface SkillDetail extends SkillSummary {
  content: string;
}

type ExtensionType = "skill" | "mcp" | "plugin" | "source" | "automation";

type ExtensionSourceType = "archimedes" | "json" | "github" | "mcp" | "npm";

interface ExtensionSource {
  id: string;
  name: string;
  type: ExtensionSourceType;
  url: string;
  query?: string;
  token?: string;
  enabled: boolean;
  builtin?: boolean;
  count?: number;
  total?: number;
  lastSync?: string;
  error?: string;
}

interface ExtensionMarketplaceItem {
  id: string;
  canonicalId: string;
  name: string;
  type: ExtensionType;
  description: string;
  version: string;
  author: string;
  license: string;
  homepage: string;
  sourceUrl: string;
  permissions: string[];
  installs: number;
  size: number;
  updatedAt: string;
  source: string;
  sourceId: string;
  sourceType: ExtensionSourceType;
  files?: Array<{ path: string; content: string }>;
  config?: Record<string, unknown> | null;
  repo?: string;
  packageName?: string;
  installed?: boolean;
  installedVersion?: string;
  installedPath?: string;
  installedScope?: "workspace" | "global" | "";
  updateAvailable?: boolean;
}

interface ExtensionFeed {
  items: ExtensionMarketplaceItem[];
  total: number;
  sources: ExtensionSource[];
  syncedAt: string;
}

interface ExtensionPreview {
  id: string;
  filename: string;
  language: string;
  content: string;
  item: ExtensionMarketplaceItem;
}

interface ExtensionInstallResult {
  item: ExtensionMarketplaceItem;
  path: string;
  scope: "workspace" | "global";
}

interface WorkspaceFileTree {
  directory?: string;
  entries: WorkspaceFileEntry[];
  count: number;
  truncated: boolean;
}

interface ResearchArtifact {
  id: string;
  thread_id: string;
  turn_id: string | null;
  path: string;
  title: string;
  kind: "image" | "pdf" | "csv" | "json" | "markdown" | "html" | "svg" | "text" | "other";
  size_bytes: number;
  modified_at: string;
  version: number;
  source: "agent" | "run" | "change-set";
  created_at: string;
  updated_at: string;
  seen: boolean;
}

interface WorkspaceFilePreview {
  name: string;
  path: string;
  kind: "text" | "markdown" | "pdf" | "image" | "binary";
  size: number;
  modifiedAt: string;
  content?: string;
  previewUrl?: string;
}

interface LatexProjectSummary {
  path: string;
  title: string;
  main: boolean;
}

interface LatexTemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface LatexDirectoryResult {
  name: string;
  path: string;
  type: "directory";
}

interface LatexImportResult {
  canceled: boolean;
  name?: string;
  directory?: string;
  file_count?: number;
  total_bytes?: number;
  main_path?: string;
}

interface LatexCompileDiagnostic {
  line: number | null;
  message: string;
}

interface LatexCompileResult {
  ok: boolean;
  engine: string;
  source_path: string;
  pdf_path: string;
  preview_url?: string;
  duration_ms: number;
  diagnostics: LatexCompileDiagnostic[];
  log: string;
}

interface WorkspaceFileChange {
  path: string;
  status: "created" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

interface WorkspaceChangeSet {
  id: string;
  actionId: string;
  taskId: string;
  threadId?: string | null;
  turnId?: string;
  kind: "write" | "command";
  changes: WorkspaceFileChange[];
  createdAt: string;
}

interface TerminalSessionInfo {
  sessionId: string;
  workspace: string;
  shell: string;
  pid: number;
}

type TerminalShellProfile = "auto" | "pwsh" | "powershell" | "cmd" | "zsh" | "fish" | "bash" | "custom";
type TerminalExternalTerminal = "auto" | "windows-terminal" | "ghostty" | "wezterm" | "tabby" | "terminal" | "none";

type JourneyDefaultView = "story" | "outline";
type JourneyMapMode = "auto" | "always" | "off";
type JourneySummaryLength = "concise" | "standard" | "detailed";
type JourneySummaryModel = "current" | "economy";
type JourneyChapterDetection = "ai" | "turns";

interface JourneySummaryEpisodeInput {
  id: string;
  title: string;
  outcome: string;
  status: string;
  steps: number;
}

interface JourneySummaryChapterInput {
  id: string;
  title: string;
  summary: string;
  status: string;
  steps: number;
  episodes: JourneySummaryEpisodeInput[];
}

interface JourneySourceInput {
  id: string;
  title: string;
  url?: string;
  eventId: number;
}

type JourneyClaimStatus = "supported" | "open" | "contradicted";

interface JourneyClaim {
  id: string;
  text: string;
  status: JourneyClaimStatus;
  sourceIds: string[];
}

interface JourneySummaryInput {
  threadId: string;
  threadTitle: string;
  brief: string;
  coversTo: number;
  force?: boolean;
  sources?: JourneySourceInput[];
  chapters: JourneySummaryChapterInput[];
}

interface JourneySummaryEpisode {
  id: string;
  title: string;
  outcome: string;
}

interface JourneySummaryChapter {
  id: string;
  title: string;
  summary: string;
  episodes: JourneySummaryEpisode[];
}

interface JourneyChapterPlan {
  id: string;
  title: string;
  summary: string;
  chapterIds: string[];
}

interface JourneySummarySnapshot {
  threadId: string;
  brief: string;
  nextMove: string;
  coversTo: number;
  updatedAt: string;
  model: string;
  source: "ai" | "preview";
  summaryLength?: JourneySummaryLength;
  chapters: JourneySummaryChapter[];
  claims: JourneyClaim[];
  chapterPlan?: JourneyChapterPlan[];
}

interface JourneySettings {
  defaultView: JourneyDefaultView;
  mapMode: JourneyMapMode;
  mapChapters: number;
  mapSteps: number;
  sinceYouLeft: boolean;
  followLive: boolean;
  maxChapters: number;
  autoMerge: boolean;
  collapseCompleted: boolean;
  targetEpisodes: number;
  liveSummaries: boolean;
  episodeCadence: number;
  idleDelay: number;
  briefInterval: number;
  summaryLength: JourneySummaryLength;
  summaryModel: JourneySummaryModel;
  economyModel: string;
  updateOnTurnEnd: boolean;
  updateOnApproval: boolean;
  evidenceLedger: boolean;
  openClaims: boolean;
  maxPinned: number;
  chapterDetection: JourneyChapterDetection;
  summaryTokenBudget: number;
}

interface TerminalSettings {
  shell: TerminalShellProfile;
  customShell: string;
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  externalTerminal: TerminalExternalTerminal;
  onboarded: boolean;
  platform: string;
  detectedShell: string;
  detectedShellName: string;
  externalTerminalLabel: string;
}

interface Window {
  researchDesk: ResearchDeskBridge;
}

type ReadingStatus = "unread" | "reading" | "read";
type ResearchMode = "free-chat" | "idea-spark" | "experiment-setup" | "paper-generation" | "paper-review" | "deep-research";
type ReasoningEffort = "low" | "medium" | "high";
type ContextLength = "standard" | "extra-long";

interface ModelCapabilities {
  thinkingEfforts: ReasoningEffort[];
  contextLengths: ContextLength[];
  nativeThinking: boolean;
  contextCharacterLimits: Record<ContextLength, number>;
}

interface ResearchSource {
  url: string;
  title: string;
  startPage: number | null;
  endPage: number | null;
  excerpt?: string;
  query?: string;
  retrievedAt?: string;
}
type ContextAttachmentType = "file" | "folder" | "paper" | "repository" | "plugin" | "skill" | "image";

interface ContextImage {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  sizeBytes: number;
  width?: number;
  height?: number;
}

interface ContextPaperMetadata {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  pdfUrl: string;
}

interface PaperRepositoryFile {
  path: string;
  size: number;
  language: string;
  content: string;
}

interface PaperRepositorySnapshot {
  url: string;
  owner: string;
  repo: string;
  branch: string;
  description: string;
  homepage: string;
  language: string;
  stars: number;
  license: string;
  updated_at: string;
  retrieved_at: string;
  tree: Array<{ path: string; size: number }>;
  data_paths: string[];
  readme: string;
  files: PaperRepositoryFile[];
  audit?: boolean;
}

interface RepositoryCheckout {
  url: string;
  owner: string;
  repo: string;
  branch: string;
  commit: string;
  file_count: number;
  cloned_at: string;
}

interface RepositoryCheckoutEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  kind?: "text" | "markdown" | "binary";
  size?: number;
  modified_at?: string;
}

interface RepositoryCheckoutDirectory {
  directory: string;
  entries: RepositoryCheckoutEntry[];
  truncated: boolean;
}

interface RepositoryCheckoutFile {
  path: string;
  name: string;
  kind: "text" | "markdown" | "binary";
  size: number;
  modified_at: string;
  line_count: number;
  content: string;
}

interface ContextAttachment {
  id: string;
  type: ContextAttachmentType;
  name: string;
  path?: string;
  detail?: string;
  description?: string;
  size?: number;
  selection?: { startLine: number; endLine: number; excerpt: string };
  paper?: ContextPaperMetadata;
  repository?: PaperRepositorySnapshot;
  image?: ContextImage;
}

interface LibraryProjectSummary {
  project_id: string;
  name: string;
  library_count: number;
  paper_count: number;
}

interface ResearchLibrary {
  id: string;
  project_id?: string | null;
  name: string;
  description: string;
  color: string;
  cloud_library_id?: string | null;
  paper_count: number;
  created_at: string;
  updated_at: string;
}

interface AcademicSearchResult {
  external_id: string;
  s2_id: string;
  arxiv_id: string;
  doi: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  abstract: string;
  url: string;
  pdf_url: string;
  citation_count: number;
  source: string;
  conference?: ConferenceMetadata;
}

type ConferenceId = "icml" | "iclr" | "neurips" | "cvpr" | "iccv" | "eccv" | "acl" | "emnlp" | "aaai";
type ConferencePresentation = "oral" | "spotlight" | "poster" | "unknown";
interface ConferenceMetadata {
  id: ConferenceId;
  year: number;
  presentation: ConferencePresentation;
  decision: string;
  track: string;
  source_url: string;
  presentation_source_url: string;
  retrieved_at: string;
}
interface ConferenceSearchOptions {
  conference: ConferenceId;
  year: number;
  presentation?: ConferencePresentation | "all";
  query?: string;
  topic?: DailyDiscoveryTopic;
  offset?: number;
  limit?: number;
  forceRefresh?: boolean;
}
interface ConferenceSearchResponse {
  papers: DailyPaper[];
  total: number;
  catalog_total: number;
  presentation_counts: Record<ConferencePresentation, number>;
  options: ConferenceSearchOptions;
  sources: string[];
  status: "available" | "partial" | "not_published" | "not_held";
  warnings: string[];
  fetched_at: string;
  cached: boolean;
  stale: boolean;
  has_more: boolean;
}

type DailyDiscoveryMode = "latest" | "trending";
type DailyDiscoveryRange = "7d" | "30d" | "90d" | "all";
type DailyDiscoveryTopic = "all" | "ai4ai_rsi" | "gui_compute_use" | "coding_agents" | "reinforcement_learning" | "on_policy_distillation" | "robotics_vla" | "world_models" | "reasoning_test_time" | "interpretability" | "rag" | "multimodal" | "safety" | "science" | "efficient_inference" | "generative_models" | "vision_3d" | "speech_audio";

interface DailyDiscoveryOptions {
  mode?: DailyDiscoveryMode;
  range?: DailyDiscoveryRange;
  topic?: DailyDiscoveryTopic;
  categories?: string[];
  query?: string;
  limit?: number;
  forceRefresh?: boolean;
}

interface DailyPaper extends AcademicSearchResult {
  published_at: string;
  discovered_at: string;
  categories: string[];
  upvotes: number;
  github_url: string;
  github_stars: number;
}

type ReproductionStatus =
  | "draft" | "planned" | "queued" | "provisioning" | "running"
  | "diagnosing" | "checks-passed" | "verified" | "diverged" | "blocked" | "cancelled";

type ReproductionCheck =
  | { kind: "file_exists"; path: string }
  | { kind: "file_contains"; path: string; pattern: string }
  | { kind: "command"; command: string; expect: "exit_zero" }
  | { kind: "http"; url: string; status: number }
  | { kind: "manual"; reason: string };

interface ReproductionStep {
  id: string;
  title: string;
  detail: string;
  command: string;
  checkpoint: string;
  check: ReproductionCheck;
  source: string;
  blocked: string;
}

interface ReproductionClaim {
  id: string;
  statement: string;
  dataset: string;
  metric: string;
  expected: number | null;
  unit: string;
  tolerance: number;
  step: string;
  evidence: { page: number | null; table: string; row: string; column: string; quote: string };
}

interface ReproductionContract {
  version: number;
  summary: string;
  steps: ReproductionStep[];
  claims: ReproductionClaim[];
  entrypoint: { command: string; cwd: string; outputs: string[]; evidence: Array<{ path: string; line_count: number }>; unverified: string[] };
  environment: { python: string; cuda: string; install: string[]; system: string[]; source: string };
  repo: { url: string; commit: string };
  notes: string[];
  frozen_at: string | null;
}

interface Reproduction {
  id: string;
  paper_id: string | null;
  repo_url: string;
  title: string;
  status: ReproductionStatus;
  source: { kind?: string; paper_id?: string; repo_url?: string };
  contract: ReproductionContract | null;
  budget: { wallClockMin: number; gpuHours: number; maxFixAttempts: number };
  error: string;
  created_at: string;
  updated_at: string;
  run?: ReproductionRun | null;
}

type ReproductionCheckStatus = "passed" | "failed" | "needs-run" | "manual" | "blocked";

type ReproductionRunStepStatus = "pending" | "passed" | "failed" | "manual" | "blocked" | "stopped";

interface ReproductionRunStep {
  id: string;
  title: string;
  status: ReproductionRunStepStatus;
  detail: string;
  exit_code: number | null;
  duration_ms: number;
}

type ReproductionRunStatus = "running" | "verified" | "failed" | "blocked" | "manual" | "stopped" | "timeout" | "interrupted";

interface ReproductionRun {
  id: string;
  reproduction_id: string;
  status: ReproductionRunStatus;
  backend: string;
  image: string;
  steps: ReproductionRunStep[];
  log: string;
  error: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReproductionPreflight {
  commit: string;
  results: Array<{ id: string; status: ReproductionCheckStatus; detail: string }>;
}

interface ReproductionCreateInput { paperId?: string | null; repoUrl?: string; title?: string; budget?: Partial<Reproduction["budget"]> }
interface ReproductionPatch { title?: string; status?: ReproductionStatus; contract?: ReproductionContract | null; budget?: Partial<Reproduction["budget"]>; error?: string; repoUrl?: string }

interface DailyDiscoveryResponse {
  papers: DailyPaper[];
  providers: string[];
  options: Required<Omit<DailyDiscoveryOptions, "forceRefresh">>;
  fetched_at: string;
  cached: boolean;
  stale: boolean;
  warning?: string;
}

interface DeepPaperSearchInput {
  prompt: string;
  topic?: DailyDiscoveryTopic;
  limit?: number;
}

interface DeepPaperSearchPlan {
  research_problem: string;
  domains: string[];
  methods: string[];
  tasks: string[];
  must_include: string[];
  preferred: string[];
  exclude: string[];
  year_range: { start: number | null; end: number | null } | null;
  synonyms: string[];
  queries: string[];
}

interface DeepPaperSearchResult {
  paper: AcademicSearchResult;
  relevance: "strong" | "related" | "background";
  reason: string;
  matched_terms: string[];
}

interface DeepPaperSearchResponse {
  plan: DeepPaperSearchPlan;
  results: DeepPaperSearchResult[];
  providers: string[];
  fetched_at: string;
  warning?: string;
}

interface LibraryPaper extends AcademicSearchResult {
  id: string;
  canonical_key: string;
  reading_status: ReadingStatus;
  starred: boolean;
  notes: string;
  tags: string[];
  cloud_paper_id?: string | null;
  state_updated_at?: string | null;
  created_at: string;
  updated_at: string;
  github_url: string;
  github_stars: number;
}

interface PaperReaderAsset {
  paper_id: string;
  source_url: string;
  relative_path: string;
  sha256: string;
  status: "ready" | "failed" | "missing";
  error: string;
  size_bytes: number;
  page_count: number;
  truncated: boolean;
  warning: string;
  indexed_at: string;
  updated_at: string;
  preview_url?: string;
}

interface PaperReaderPage { page_number: number; text: string; }
interface PaperHighlight {
  id: string;
  paper_id: string;
  page_number: number;
  quote: string;
  start_offset: number | null;
  end_offset: number | null;
  note: string;
  color: "green" | "yellow" | "blue" | "pink" | "red";
  created_at: string;
  updated_at: string;
}
interface PaperHighlightInput {
  page_number: number;
  quote: string;
  start_offset?: number;
  end_offset?: number;
  note?: string;
  color?: "green" | "yellow" | "blue" | "pink" | "red";
}
interface PaperPassage { page_number: number; start_offset: number; end_offset: number; excerpt: string; }
interface PaperReaderState { asset: PaperReaderAsset | null; pages: PaperReaderPage[]; highlights: PaperHighlight[]; }

interface SavedTask {
  id: string;
  prompt: string;
  response: string;
  status: string;
  created_at: string;
}

interface WorkspaceSnapshot {
  workspace: string;
  tasks: SavedTask[];
  projects: ResearchProject[];
  archivedProjects: ResearchProject[];
  threads: ResearchThread[];
  archivedThreads: ResearchThread[];
  commands: Array<{
    id: string;
    command: string;
    cwd: string;
    status: string;
    output: string;
    exit_code: number | null;
    created_at: string;
    completed_at: string | null;
  }>;
  actions: AgentAction[];
}

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthProviders {
  email: boolean;
  google: boolean;
  magicLink?: boolean;
}

interface AuthState {
  configured: boolean;
  user: AuthUser | null;
  expiresAt: number;
  error: string;
  providers?: AuthProviders;
  needsConfirmation?: boolean;
}

interface LocalIdentity {
  version: 1;
  userId: string;
  displayName: string;
  deviceId: string;
  deviceName: string;
  createdAt: string;
  updatedAt: string;
}

interface CollaborationStatus {
  signedIn: boolean;
  user: { id: string; email: string; displayName: string } | null;
  baseUrl?: string;
  error?: string;
}

interface PresenceMember {
  key: string;
  userId: string;
  displayName: string;
  email: string;
  threadId: string | null;
  onlineAt: string;
}

interface CloudProject {
  id: string;
  org_id: string;
  owner_id: string;
  name: string;
  description: string;
  role: ProjectMember["role"] | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface CloudProjectSyncResult {
  project: ResearchProject;
  members: ProjectMember[];
  warnings?: string[];
}

interface CloudLibrarySyncResult {
  project: ResearchProject;
  libraries: ResearchLibrary[];
  warnings?: string[];
}

interface CloudAnnotationSyncResult {
  project: ResearchProject;
  warnings?: string[];
}

interface CloudThreadSyncResult {
  project: ResearchProject;
  warnings?: string[];
}

interface CloudShareLink {
  id: string;
  token: string;
  url: string;
  role: "viewer" | "commenter";
  expires_at: string;
}

interface SharedDocument {
  key: string;
  state: string;
  version: number;
  updated_at: string;
}

interface SharedRunParticipant {
  run_id: string;
  user_id: string;
  role: "driver" | "co_prompt" | "observer";
  joined_at: string;
}

interface SharedRunPrompt {
  id: string;
  project_id: string;
  run_id: string;
  author_id: string;
  body: string;
  status: "pending" | "consumed" | "rejected";
  created_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
}

interface SharedRunAction {
  id: string;
  project_id: string;
  run_id: string | null;
  turn_id: string | null;
  kind: "write" | "command";
  payload_json: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  approved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface SharedAgentRun {
  id: string;
  project_id: string;
  thread_id: string;
  driver_id: string;
  status: "running" | "paused" | "completed" | "failed" | "interrupted";
  context_manifest_json: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  participants: SharedRunParticipant[];
  actions: SharedRunAction[];
  prompts: SharedRunPrompt[];
}

interface GuestShareSnapshot {
  id: string;
  project_id: string;
  resource_type: string;
  resource_id: string;
  role: string;
  expires_at: string;
  thread?: Record<string, unknown>;
  turns?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  comments?: Array<Record<string, unknown>>;
}

interface ResearchProject {
  id: string;
  owner_id?: string | null;
  cloud_project_id?: string | null;
  name: string;
  description: string;
  workspace_path: string | null;
  chat_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  last_chat_at: string | null;
}

interface ProjectMember {
  project_id: string;
  user_id: string;
  role: "viewer" | "commenter" | "editor" | "admin" | "owner";
  source?: "local" | "cloud";
  joined_at: string;
  invited_by: string | null;
  display_name: string;
  email: string;
  avatar_color: string;
}

interface AuditEvent {
  id: string;
  project_id: string | null;
  actor_id: string;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ResearchComment {
  id: string;
  project_id: string;
  resource_type: "thread" | "paper" | "review" | "artifact";
  resource_id: string;
  parent_id: string | null;
  anchor_json: string;
  anchor: Record<string, unknown>;
  body: string;
  author_id: string;
  author_name: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResearchThread {
  id: string;
  project_id: string;
  owner_id?: string | null;
  visibility?: "project" | "private";
  title: string;
  mode: ResearchMode;
  status: string;
  context_summary: string;
  workspace_path: string | null;
  pending_actions?: number;
  turn_count: number;
  created_at: string;
  updated_at: string;
  last_turn_at: string;
  archived_at: string | null;
}

type ModelProviderId = "openai" | "anthropic" | "gemini" | "glm" | "minimax" | "deepseek" | "qwen" | "moonshot" | "openrouter" | "custom";
type WebSearchProviderId = "brave" | "tavily" | "exa" | "firecrawl";
interface PublicWebSearchConfig { provider: WebSearchProviderId; hasApiKey: boolean; configuredProviders: WebSearchProviderId[] }

type ModelRole = "agent" | "proactive";

interface ModelConfigInput {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Proactive only: drop the dedicated model and inherit the main Agent's. */
  useAgent?: boolean;
}

interface ModelCatalogInput {
  provider: ModelProviderId;
  baseUrl: string;
  apiKey?: string;
}

interface ModelCatalogResponse {
  models: string[];
  source: "live";
}

interface PublicModelConfig {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: "saved" | "environment" | "agent";
  role?: ModelRole;
  inheritedFromAgent?: boolean;
}

type ProactiveObservationAction =
  | { kind: "insert"; label: string; text: string }
  | { kind: "copy"; label: string; text: string }
  | { kind: "open"; label: string; target: "chat" | "library" | "daily" | "writing" | "files" };

interface ProactiveObservationResult {
  shouldSuggest: true;
  source: "search" | "selection" | "latex" | "citation" | "reader" | "repo" | "library" | "chat";
  title: string;
  whyNow: string;
  evidenceIds: string[];
  confidence: number;
  action: ProactiveObservationAction;
}

interface ModelConnectionResult {
  ok: boolean;
  latencyMs: number;
  resolvedModel: string;
}

interface ResearchThreadMessage {
  id: string;
  turn_id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ResearchSource[];
  created_at: string;
}

interface ResearchTurn {
  id: string;
  thread_id: string;
  task_id: string | null;
  mode: ResearchMode;
  user_message: string;
  assistant_message: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface ResearchEvent {
  id: string;
  turn_id: string;
  sequence: number;
  ordinal?: number;
  type: string;
  payload: unknown;
  created_at: string;
}

interface ResearchThreadDetail extends ResearchThread {
  turns: ResearchTurn[];
  messages: ResearchThreadMessage[];
  changeSets: WorkspaceChangeSet[];
  events?: ResearchEvent[];
}

interface AgentAction {
  id: string;
  task_id: string;
  kind: "write" | "command";
  payload: { path?: string; content?: string; command?: string; cwd?: string; change?: WorkspaceFileChange; changes?: WorkspaceFileChange[] };
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
}

interface AgentRunResult {
  threadId: string;
  turnId: string;
  taskId: string;
  response: string;
  status: string;
  actions: AgentAction[];
  thread: ResearchThreadDetail;
}

interface AgentEvent {
  type: "status" | "tool" | "artifact" | "approval" | "assistant_delta" | "complete" | "failed" | "configuration" | "interrupted";
  title: string;
  detail: string;
  threadId?: string;
  turnId?: string;
  delta?: string;
  clientRunId?: string;
  action?: AgentAction;
}

interface PaperReviewInput {
  paper: Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
  pageCount: number;
  workspace: string;
  projectId?: string | null;
  reasoningEffort?: ReasoningEffort;
  contextLength?: ContextLength;
  contextItems?: ContextAttachment[];
  clientRunId?: string;
}

interface PaperReviewAgentResult {
  id: "related" | "method" | "experiments" | "limitations";
  title: string;
  status: "complete" | "error";
  response: string;
  error: string;
  repaired: boolean;
  run: AgentRunResult | null;
}

interface PaperReviewResult {
  specialists: PaperReviewAgentResult[];
  supervisor: { verdict: "ready" | "repair"; repairTargets: string[]; reason: string; run: AgentRunResult | null };
  summary: { response: string; run: AgentRunResult } | null;
  error?: string;
  agentRuns: AgentRunResult[];
}

interface StoredPaperReview {
  specialists: Array<Pick<PaperReviewAgentResult, "id" | "title" | "status" | "response" | "error" | "repaired">>;
  audit: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

type PaperPresentationSection = "background" | "related_work" | "method" | "experiments" | "limitations";

type PaperPresentationLayout = "outline" | "editorial" | "figure-led" | "split" | "process" | "comparison" | "metrics" | "boundaries";

interface PaperPresentationVisualItem {
  label: string;
  value: string;
  detail: string;
}

interface PaperPresentationSlide {
  id?: string;
  section: PaperPresentationSection;
  layout?: PaperPresentationLayout;
  title: string;
  lead?: string;
  summary?: string;
  bullets: string[];
  takeaway: string;
  speaker_notes?: string;
  source?: {
    page: number;
    label: string;
    kind: "figure" | "table" | "diagram" | "text" | "page";
    figure: string;
    panel: string;
    focus: "full" | "top" | "middle" | "bottom" | "left" | "right";
    crop?: { x: number; y: number; width: number; height: number } | null;
  };
  visual?: {
    kind: "source" | "outline" | "process" | "comparison" | "metrics" | "boundaries";
    items: PaperPresentationVisualItem[];
  };
  page: number;
}

interface PaperPresentation {
  skill: { id: "paper-presentation" | string; name: string; description: string; version: number };
  title: string;
  subtitle: string;
  source_sufficiency?: "full-paper" | "partial-paper" | "review-grounded";
  generation_mode?: "review" | "paper";
  slides: PaperPresentationSlide[];
  artifact?: {
    kind: "pptd" | "pptx";
    pptd_path?: string;
    pptx_path: string;
    pdf_path: string;
    page_count: number;
    validation: "passed" | "rendered";
    renderer?: "native-pptx";
    preview_url?: string;
    missing?: boolean;
  };
}

interface StoredPaperPresentation extends PaperPresentation {
  source_review_updated_at: string;
  created_at: string;
  updated_at: string;
}

interface PaperPresentationInput {
  paper: Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
  pageCount: number;
  workspace: string;
  projectId?: string | null;
  reasoningEffort?: ReasoningEffort;
  contextLength?: ContextLength;
  contextItems?: ContextAttachment[];
  language?: "en" | "zh";
  sourceMode?: "review" | "paper";
  clientRunId?: string;
}

interface PaperPresentationEvent {
  paperId: string;
  clientRunId: string;
  detail: string;
  kind?: "page-ready";
  page?: {
    index: number;
    total: number;
    pdfPath: string;
    pptxPath: string;
    validation: "passed" | "rendered";
    preview_url: string;
  };
  presentation?: Pick<PaperPresentation, "title" | "subtitle" | "source_sufficiency" | "generation_mode" | "slides">;
}

interface PaperReviewEvent {
  type: "stage";
  stage: "specialists" | "specialist_started" | "specialist_complete" | "specialist_failed" | "supervisor" | "repair" | "summary" | "complete";
  reviewerId?: "related" | "method" | "experiments" | "limitations";
  title: string;
  detail: string;
  response?: string;
  clientRunId?: string;
}

interface BenchmarkRadarRecord {
  id: string;
  name: string;
  title: string;
  description: string;
  oneLine: string;
  releasedAt: string;
  readiness: string;
  area: string;
  primaryDomain: string;
  topics: string[];
  capabilities: string[];
  capabilityGroups: string[];
  directions: string[];
  authors: string[];
  publication: { status: string; venue: string };
  links: Record<string, string>;
  attention: { githubStars: number | null; hfPaperUpvotes: number | null; datasetDownloads: number | null };
  attentionScore: number | null;
  attentionRank: number | null;
  forecast: number | null;
}

interface BenchmarkRadarDirection {
  id: string;
  name: string;
  section: string;
  count: number;
}

interface BenchmarkRadarData {
  sourceRoot: string;
  updatedAt: string;
  radar: BenchmarkRadarRecord[];
  library: BenchmarkRadarRecord[];
  directions: BenchmarkRadarDirection[];
}
