/// <reference types="vite/client" />

interface ResearchDeskBridge {
    chooseWorkspace: () => Promise<string | null>;
    openWorkspace: (workspacePath?: string) => Promise<WorkspaceSnapshot>;
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
    runAgent: (input: { prompt: string; workspace: string; mode: ResearchMode }) => Promise<AgentRunResult>;
    approveAgentAction: (actionId: string) => Promise<AgentAction>;
    rejectAgentAction: (actionId: string) => Promise<AgentAction>;
    runTerminal: (input: { command: string; cwd?: string }) => Promise<{ sessionId: string; commandRunId: string; workspace: string }>;
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

interface AgentAction {
  id: string;
  task_id: string;
  kind: "write" | "command";
  payload: { path?: string; content?: string; command?: string; cwd?: string };
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
}

interface AgentRunResult {
  taskId: string;
  response: string;
  status: string;
  actions: AgentAction[];
}

interface AgentEvent {
  type: "status" | "tool" | "complete" | "failed" | "configuration";
  title: string;
  detail: string;
}
