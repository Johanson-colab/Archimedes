/// <reference types="vite/client" />

interface ResearchDeskBridge {
    getInitialWorkspace: () => Promise<string | null>;
    chooseWorkspace: () => Promise<string | null>;
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
    createResearchProject: (input: { name: string; description?: string }) => Promise<ResearchProject>;
    renameResearchProject: (id: string, name: string) => Promise<ResearchProject>;
    archiveResearchProject: (id: string, archived?: boolean) => Promise<{ archived: boolean }>;
    deleteResearchProject: (id: string) => Promise<{ deleted: boolean }>;
    archiveResearchThread: (id: string, archived?: boolean) => Promise<ResearchThreadDetail>;
    deleteResearchThread: (id: string) => Promise<{ deleted: boolean }>;
    getModelConfig: () => Promise<PublicModelConfig>;
    getModelCapabilities: () => Promise<ModelCapabilities>;
    listProviderModels: (input: ModelCatalogInput) => Promise<ModelCatalogResponse>;
    saveModelConfig: (input: ModelConfigInput) => Promise<PublicModelConfig>;
    testModelConfig: (input: ModelConfigInput) => Promise<ModelConnectionResult>;
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
    runAgent: (input: { prompt: string; workspace: string; threadId?: string; projectId?: string; mode: ResearchMode; reasoningEffort?: ReasoningEffort; contextLength?: ContextLength; contextItems?: ContextAttachment[] }) => Promise<AgentRunResult>;
    interruptAgent: (threadId: string) => Promise<{ interrupted: boolean }>;
    approveAgentAction: (actionId: string) => Promise<AgentAction>;
    rejectAgentAction: (actionId: string) => Promise<AgentAction>;
    runTerminal: (input: { command: string; cwd?: string; actionId?: string }) => Promise<{ sessionId: string; commandRunId: string; workspace: string }>;
    stopTerminal: (sessionId: string) => Promise<void>;
    createTerminal: (input: { cwd?: string; cols?: number; rows?: number }) => Promise<TerminalSessionInfo>;
    readyTerminal: (sessionId: string) => Promise<void>;
    writeTerminal: (sessionId: string, data: string) => void;
    resizeTerminal: (sessionId: string, cols: number, rows: number) => void;
    closeTerminal: (sessionId: string) => Promise<void>;
    onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onPtyData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onPtyExit: (callback: (payload: { sessionId: string; exitCode: number; signal?: number }) => void) => () => void;
    onAgentEvent: (callback: (payload: AgentEvent) => void) => () => void;
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
type DailyDiscoveryRange = "7d" | "30d" | "90d";
type DailyDiscoveryTopic = "all" | "ai4ai_rsi" | "gui_compute_use" | "coding_agents" | "reinforcement_learning" | "on_policy_distillation" | "robotics_vla" | "world_models" | "reasoning_test_time" | "interpretability" | "rag" | "multimodal" | "safety" | "science";

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
  turn_count: number;
  created_at: string;
  updated_at: string;
  last_turn_at: string;
  archived_at: string | null;
}

type ModelProviderId = "openai" | "anthropic" | "gemini" | "glm" | "minimax" | "deepseek" | "qwen" | "moonshot" | "openrouter" | "custom";
type WebSearchProviderId = "brave" | "tavily" | "exa" | "firecrawl";
interface PublicWebSearchConfig { provider: WebSearchProviderId; hasApiKey: boolean; configuredProviders: WebSearchProviderId[] }

interface ModelConfigInput {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
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
  source: "saved" | "environment";
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
  action?: AgentAction;
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
