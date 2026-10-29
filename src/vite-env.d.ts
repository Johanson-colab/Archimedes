/// <reference types="vite/client" />

interface ResearchDeskBridge {
    platform?: string;
    getInitialWorkspace: () => Promise<string | null>;
    setTitleBarTheme?: (theme: "charcoal" | "paper") => Promise<void>;
    setUiZoom?: (factor: number) => Promise<number>;
    chooseWorkspace: () => Promise<string | null>;
    watchWorkspace: (workspace: string) => Promise<string>;
    revealWorkspace: (workspace: string) => Promise<{ opened: boolean }>;
    chooseContextPaths: (kind: "file" | "folder", workspace?: string) => Promise<ContextAttachment[]>;
    listContextResources: (kind: "plugin" | "skill", workspace?: string) => Promise<ContextAttachment[]>;
    listSkillCollections: (workspace?: string) => Promise<SkillCollection[]>;
    listSkills: (workspace?: string, collectionId?: string) => Promise<SkillSummary[]>;
    readSkill: (workspace: string | undefined, skillId: string) => Promise<SkillDetail>;
    openWorkspace: (workspacePath?: string) => Promise<WorkspaceSnapshot>;
    listWorkspaceFiles: (workspace: string, directory?: string) => Promise<WorkspaceFileTree>;
    readWorkspaceFile: (workspace: string, filePath: string) => Promise<WorkspaceFilePreview>;
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
    deleteResearchThread: (id: string) => Promise<{ deleted: boolean }>;
    getModelConfig: (role?: ModelRole) => Promise<PublicModelConfig>;
    getModelCapabilities: (role?: ModelRole) => Promise<ModelCapabilities>;
    listProviderModels: (input: ModelCatalogInput, role?: ModelRole) => Promise<ModelCatalogResponse>;
    saveModelConfig: (input: ModelConfigInput, role?: ModelRole) => Promise<PublicModelConfig>;
    testModelConfig: (input: ModelConfigInput, role?: ModelRole) => Promise<ModelConnectionResult>;
    getWebSearchConfig: () => Promise<PublicWebSearchConfig>;
    saveWebSearchConfig: (input: { provider: WebSearchProviderId; apiKey: string }) => Promise<PublicWebSearchConfig>;
    listLibraries: () => Promise<ResearchLibrary[]>;
    createLibrary: (input: { name: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    updateLibrary: (id: string, patch: { name?: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    deleteLibrary: (id: string) => Promise<{ deleted: boolean }>;
    listLibraryPapers: (libraryId: string, query?: string) => Promise<LibraryPaper[]>;
    searchAcademicPapers: (query: string, limit?: number) => Promise<AcademicSearchResult[]>;
    discoverDailyPapers: (input?: DailyDiscoveryOptions) => Promise<DailyDiscoveryResponse>;
    deepSearchPapers: (input: DeepPaperSearchInput) => Promise<DeepPaperSearchResponse>;
    getBenchmarkRadarData: () => Promise<BenchmarkRadarData>;
    searchConferencePapers: (input: ConferenceSearchOptions) => Promise<ConferenceSearchResponse>;
    addLibraryPaper: (libraryId: string, paper: AcademicSearchResult) => Promise<LibraryPaper>;
    updateLibraryPaper: (paperId: string, patch: { title?: string; reading_status?: ReadingStatus; starred?: boolean; notes?: string; tags?: string[] }) => Promise<LibraryPaper>;
    removeLibraryPaper: (libraryId: string, paperId: string) => Promise<{ removed: boolean }>;
    getLibraryPaperReader: (paperId: string, workspace?: string) => Promise<PaperReaderState>;
    getLibraryPaperChatThread: (paperId: string, workspace?: string) => Promise<ResearchThreadDetail | null>;
    setLibraryPaperChatThread: (paperId: string, threadId: string, workspace?: string) => Promise<ResearchThreadDetail | null>;
    prepareLibraryPaperReader: (paperId: string, workspace?: string) => Promise<PaperReaderState>;
    attachLibraryPaperPdf: (paperId: string, workspace?: string) => Promise<PaperReaderState>;
    findLibraryPaperPassages: (paperId: string, query: string, workspace?: string) => Promise<PaperPassage[]>;
    createLibraryPaperHighlight: (paperId: string, input: PaperHighlightInput, workspace?: string) => Promise<PaperHighlight>;
    deleteLibraryPaperHighlight: (id: string, workspace?: string) => Promise<{ deleted: boolean }>;
    translateLibraryPaperSelection: (text: string) => Promise<{ translation: string }>;
    loadLibraryGithubRepository: (url: string) => Promise<PaperRepositorySnapshot>;
    getLibraryGithubRepositoryCheckout: (url: string, workspace?: string) => Promise<RepositoryCheckout | null>;
    cloneLibraryGithubRepository: (url: string, workspace?: string) => Promise<RepositoryCheckout>;
    listLibraryGithubRepositoryCheckout: (url: string, workspace: string, directory?: string) => Promise<RepositoryCheckoutDirectory>;
    readLibraryGithubRepositoryCheckoutFile: (url: string, workspace: string, path: string) => Promise<RepositoryCheckoutFile>;
    readClipboardText: () => Promise<string>;
    writeClipboardText: (text: string) => Promise<void>;
    readClipboardImage: () => Promise<ContextImage | null>;
    saveTask: (task: { prompt: string; response: string; status?: string }) => Promise<SavedTask>;
    runAgent: (input: { prompt: string; workspace: string; threadId?: string; projectId?: string; mode: ResearchMode; reasoningEffort?: ReasoningEffort; contextLength?: ContextLength; contextItems?: ContextAttachment[]; clientRunId?: string }) => Promise<AgentRunResult>;
    runProactiveReply: (input: { prompt: string; context: Record<string, unknown> }) => Promise<{ text: string; model: string; provider: ModelProviderId }>;
    runProactiveObservation: (input: { context: Record<string, unknown>; screenshot?: { dataUrl: string; width: number; height: number } }) => Promise<ProactiveObservationResult | null>;
    captureProactiveScreenshot: () => Promise<{ dataUrl: string; width: number; height: number; bytes: number } | null>;
    runPaperReview: (input: PaperReviewInput) => Promise<PaperReviewResult>;
    getPaperReview: (paperId: string, workspace?: string) => Promise<StoredPaperReview | null>;
    runPaperPresentation: (input: PaperPresentationInput) => Promise<StoredPaperPresentation>;
    getPaperPresentation: (paperId: string, workspace?: string) => Promise<StoredPaperPresentation | null>;
    revealPaperPresentation: (paperId: string, workspace?: string) => Promise<void>;
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

interface WorkspaceFileTree {
  directory?: string;
  entries: WorkspaceFileEntry[];
  count: number;
  truncated: boolean;
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
  paper?: ContextPaperMetadata;
  repository?: PaperRepositorySnapshot;
  image?: ContextImage;
}

interface ResearchLibrary {
  id: string;
  name: string;
  description: string;
  color: string;
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
  thumbnail: string;
  upvotes: number;
  github_url: string;
  github_stars: number;
}

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

interface ResearchProject {
  id: string;
  name: string;
  description: string;
  workspace_path: string | null;
  chat_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  last_chat_at: string | null;
}

interface ResearchThread {
  id: string;
  project_id: string;
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
  | { kind: "open"; label: string; target: "chat" | "library" | "daily" | "writing" | "artifacts" };

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
  type: "status" | "tool" | "approval" | "assistant_delta" | "complete" | "failed" | "configuration" | "interrupted";
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
