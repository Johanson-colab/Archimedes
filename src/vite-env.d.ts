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
    getResearchThread: (threadId: string, workspace?: string) => Promise<ResearchThreadDetail>;
    createResearchProject: (input: { name: string; description?: string }) => Promise<ResearchProject>;
    archiveResearchProject: (id: string, archived?: boolean) => Promise<{ archived: boolean }>;
    archiveResearchThread: (id: string, archived?: boolean) => Promise<ResearchThreadDetail>;
    getModelConfig: () => Promise<PublicModelConfig>;
    saveModelConfig: (input: ModelConfigInput) => Promise<PublicModelConfig>;
    testModelConfig: (input: ModelConfigInput) => Promise<ModelConnectionResult>;
    listLibraries: () => Promise<ResearchLibrary[]>;
    createLibrary: (input: { name: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    updateLibrary: (id: string, patch: { name?: string; description?: string; color?: string }) => Promise<ResearchLibrary>;
    deleteLibrary: (id: string) => Promise<{ deleted: boolean }>;
    listLibraryPapers: (libraryId: string, query?: string) => Promise<LibraryPaper[]>;
    searchAcademicPapers: (query: string, limit?: number) => Promise<AcademicSearchResult[]>;
    discoverDailyPapers: (input?: DailyDiscoveryOptions) => Promise<DailyDiscoveryResponse>;
    addLibraryPaper: (libraryId: string, paper: AcademicSearchResult) => Promise<LibraryPaper>;
    updateLibraryPaper: (paperId: string, patch: { title?: string; reading_status?: ReadingStatus; starred?: boolean; notes?: string; tags?: string[] }) => Promise<LibraryPaper>;
    removeLibraryPaper: (libraryId: string, paperId: string) => Promise<{ removed: boolean }>;
    saveTask: (task: { prompt: string; response: string; status?: string }) => Promise<SavedTask>;
    runAgent: (input: { prompt: string; workspace: string; threadId?: string; projectId?: string; mode: ResearchMode; contextItems?: ContextAttachment[] }) => Promise<AgentRunResult>;
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
type ResearchMode = "idea-spark" | "experiment-setup" | "paper-generation" | "paper-review";
type ContextAttachmentType = "file" | "folder" | "paper" | "plugin" | "skill";

interface ContextPaperMetadata {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  pdfUrl: string;
}

interface ContextAttachment {
  id: string;
  type: ContextAttachmentType;
  name: string;
  path?: string;
  detail?: string;
  paper?: ContextPaperMetadata;
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
}

type DailyDiscoveryMode = "latest" | "trending";
type DailyDiscoveryRange = "1d" | "3d" | "7d";

interface DailyDiscoveryOptions {
  mode?: DailyDiscoveryMode;
  range?: DailyDiscoveryRange;
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

interface LibraryPaper extends AcademicSearchResult {
  id: string;
  canonical_key: string;
  reading_status: ReadingStatus;
  starred: boolean;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

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

type ModelProviderId = "openai" | "deepseek" | "qwen" | "moonshot" | "openrouter" | "custom";

interface ModelConfigInput {
  provider: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
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

interface ResearchThreadDetail extends ResearchThread {
  turns: ResearchTurn[];
  messages: ResearchThreadMessage[];
  changeSets: WorkspaceChangeSet[];
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
