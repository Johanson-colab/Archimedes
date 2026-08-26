import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LibraryView from "./LibraryView";
import ContextPicker, { ContextChips } from "./ContextPicker";
import ModelSettingsModal from "./ModelSettingsModal";
import ProjectSidebar, { NewProjectModal } from "./ProjectSidebar";
import TerminalPanel from "./TerminalPanel";
import { previewLibraryBridge } from "./library-preview";
import {
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FlaskConical,
  Lightbulb,
  PanelBottom,
  FilePenLine,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  ShieldCheck,
  ScanSearch,
  Sparkles,
  Square,
  SquareTerminal,
  X,
} from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
};

type TimelineEvent = {
  title: string;
  detail: string;
  state: "done" | "active" | "waiting";
};

type PendingAction = AgentAction & { source: "agent" | "manual" };
type Modal = "artifact" | "evidence" | "search" | "source" | null;
type ResearchMode = "idea-spark" | "experiment-setup" | "paper-generation" | "paper-review";

const researchModes: Array<{ id: ResearchMode; label: string; description: string; icon: React.ReactNode; placeholder: string }> = [
  { id: "idea-spark", label: "Idea spark", description: "Find gaps and form testable research ideas", icon: <Lightbulb size={15} />, placeholder: "Describe a topic, observation, or open question..." },
  { id: "experiment-setup", label: "Experiment setup", description: "Design experiments, baselines, and metrics", icon: <FlaskConical size={15} />, placeholder: "Describe the hypothesis or experiment you want to build..." },
  { id: "paper-generation", label: "Paper writing", description: "Plan and draft an evidence-grounded paper", icon: <FilePenLine size={15} />, placeholder: "What section or argument would you like to write?" },
  { id: "paper-review", label: "Paper review", description: "Critique claims, methods, and presentation", icon: <ScanSearch size={15} />, placeholder: "What paper or draft would you like to review?" },
];

const initialPapers = [
  { title: "Evidence-aware retrieval for long-context reasoning", meta: "Rao et al. · 2025", score: "94%" },
  { title: "Measuring retrieval budget in agentic systems", meta: "Kim et al. · 2024", score: "88%" },
  { title: "Grounded reasoning under noisy observations", meta: "Alvarez et al. · 2025", score: "81%" },
];

const initialEvents: TimelineEvent[] = [
  { title: "Research brief indexed", detail: "12 papers · 38 evidence spans", state: "done" },
  { title: "Gap analysis", detail: "Comparing retrieval budget controls", state: "done" },
  { title: "Experiment plan", detail: "Waiting for your approval", state: "waiting" },
];

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "What would you like to research? I can search your knowledge base, compare papers, plan experiments, and prepare workspace changes for your approval.",
  },
];

function upsertChangeSet(current: WorkspaceChangeSet[], incoming: WorkspaceChangeSet) {
  return [...current.filter((changeSet) => changeSet.id !== incoming.id), incoming]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

const DEFAULT_WORKSPACE = import.meta.env.VITE_DEFAULT_WORKSPACE ?? "";
const previewListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyExitListeners = new Set<(payload: { sessionId: string; exitCode: number; signal?: number }) => void>();
const previewAgentListeners = new Set<(payload: AgentEvent) => void>();
const previewWorkspaceListeners = new Set<(payload: { path: string }) => void>();
const previewChangeSetListeners = new Set<(payload: WorkspaceChangeSet) => void>();
const previewPtySessions = new Map<string, { cwd: string; line: string; ready: boolean }>();
let previewWorkspace = DEFAULT_WORKSPACE || "Browser preview workspace";
const previewTasks: SavedTask[] = [];
const previewProjects: ResearchProject[] = [{ id: "preview-general", name: "General", description: "Default research project", chat_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null, last_chat_at: null }];
const previewThreads: ResearchThreadDetail[] = [];
const previewArchivedThreads: ResearchThreadDetail[] = [];
const previewCommands: WorkspaceSnapshot["commands"] = [];
const previewActions: AgentAction[] = [];

function previewSnapshot(): WorkspaceSnapshot {
  return {
    workspace: previewWorkspace,
    tasks: [...previewTasks].reverse(),
    projects: structuredClone(previewProjects),
    threads: previewThreads.map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    archivedThreads: previewArchivedThreads.map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    commands: [...previewCommands].reverse(),
    actions: [...previewActions].reverse(),
  };
}

function emitPreviewAgentEvent(payload: AgentEvent) {
  for (const listener of previewAgentListeners) listener(payload);
}

const previewBridge = {
  ...previewLibraryBridge,
  getInitialWorkspace: async () => null,
  chooseWorkspace: async () => DEFAULT_WORKSPACE || "Browser preview workspace",
  chooseContextPaths: async () => { throw new Error("Use the desktop app to choose local files and folders."); },
  listContextResources: async () => [],
  openWorkspace: async (workspacePath?: string) => {
    previewWorkspace = workspacePath || previewWorkspace;
    return previewSnapshot();
  },
  listWorkspaceFiles: async () => ({
    count: 4,
    truncated: false,
    entries: [
      { name: "notes", path: "notes", type: "directory" as const, children: [{ name: "research-brief.md", path: "notes/research-brief.md", type: "file" as const, kind: "markdown" as const, size: 92, modifiedAt: new Date().toISOString() }] },
      { name: "src", path: "src", type: "directory" as const, children: [{ name: "experiment.py", path: "src/experiment.py", type: "file" as const, kind: "text" as const, size: 54, modifiedAt: new Date().toISOString() }] },
    ],
  }),
  readWorkspaceFile: async (_workspace: string, filePath: string) => ({
    name: filePath.split("/").at(-1) || filePath,
    path: filePath,
    kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const,
    size: 92,
    modifiedAt: new Date().toISOString(),
    content: filePath.endsWith(".md") ? "# Research brief\n\nBrowser preview of the active workspace." : "def run_experiment():\n    return {\"status\": \"ready\"}\n",
  }),
  writeWorkspaceFile: async (_workspace: string, filePath: string, content: string) => {
    for (const listener of previewWorkspaceListeners) listener({ path: filePath });
    return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const, size: content.length, modifiedAt: new Date().toISOString(), content };
  },
  getResearchThread: async (threadId: string) => {
    const thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("Research thread not found.");
    return structuredClone(thread);
  },
  saveTask: async ({ prompt, response, status = "completed" }: { prompt: string; response: string; status?: string }) => {
    const task = { id: crypto.randomUUID(), prompt, response, status, created_at: new Date().toISOString() };
    previewTasks.push(task);
    return task;
  },
  createResearchProject: async ({ name, description = "" }: { name: string; description?: string }) => {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), name, description, chat_count: 0, created_at: now, updated_at: now, archived_at: null, last_chat_at: null };
    previewProjects.unshift(project);
    return structuredClone(project);
  },
  archiveResearchProject: async (id: string, archived = true) => ({ archived: Boolean(id && archived) }),
  archiveResearchThread: async (id: string, archived = true) => {
    const source = archived ? previewThreads : previewArchivedThreads;
    const target = archived ? previewArchivedThreads : previewThreads;
    const index = source.findIndex((thread) => thread.id === id);
    if (index < 0) throw new Error("Research thread not found.");
    const [thread] = source.splice(index, 1);
    thread.archived_at = archived ? new Date().toISOString() : null;
    target.unshift(thread);
    return structuredClone(thread);
  },
  getModelConfig: async () => ({ provider: "custom" as ModelProviderId, baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", hasApiKey: false, source: "environment" as const }),
  saveModelConfig: async ({ provider, baseUrl, model }: ModelConfigInput) => ({ provider, baseUrl, model, hasApiKey: true, source: "saved" as const }),
  testModelConfig: async ({ model }: ModelConfigInput) => ({ ok: true, latencyMs: 184, resolvedModel: model }),
  runAgent: async ({ prompt, threadId, projectId, mode, contextItems }: { prompt: string; workspace: string; threadId?: string; projectId?: string; mode: ResearchMode; contextItems?: ContextAttachment[] }) => {
    const now = new Date().toISOString();
    let thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      const resolvedProjectId = projectId || previewProjects[0]?.id || "preview-general";
      thread = { id: crypto.randomUUID(), project_id: resolvedProjectId, title: prompt.slice(0, 72), mode, status: "running", context_summary: "", turn_count: 0, created_at: now, updated_at: now, last_turn_at: now, archived_at: null, turns: [], messages: [], changeSets: [] };
      previewThreads.unshift(thread);
    }
    const turnId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    thread.messages.push({ id: `${turnId}:user`, turn_id: turnId, role: "user", text: prompt, created_at: now });
    emitPreviewAgentEvent({ type: "status", threadId: thread.id, turnId, title: "Research turn started", detail: "Browser preview Agent" });
    const actions: AgentAction[] = [];
    if (/(write|draft|note|生成|写入)/i.test(prompt)) {
      const action: AgentAction = {
        id: crypto.randomUUID(), task_id: taskId, kind: "write",
        payload: {
          path: "notes/agent-research-brief.md",
          content: "# Research brief\n\nThis artifact was proposed by the browser preview Agent.\n",
          change: { path: "notes/agent-research-brief.md", status: "created", additions: 3, deletions: 0 },
        },
        status: "pending", created_at: new Date().toISOString(), resolved_at: null,
      };
      previewActions.push(action);
      actions.push(action);
      emitPreviewAgentEvent({ type: "tool", threadId: thread.id, turnId, title: "write artifact", detail: "Prepared a draft for approval" });
    }
    const selectedMode = researchModes.find((candidate) => candidate.id === mode)?.label ?? "Research";
    const contextNote = contextItems?.length ? ` I received ${contextItems.length} attached context item${contextItems.length === 1 ? "" : "s"}.` : "";
    const response = `Preview Agent (${selectedMode}): I reviewed the active research workspace and framed the request as an evidence-backed next step.${contextNote} In the desktop app, this same request will use your configured model and restricted workspace tools.`;
    emitPreviewAgentEvent({ type: "assistant_delta", threadId: thread.id, turnId, title: "Writing response", detail: "Streaming model output", delta: response });
    const completedAt = new Date().toISOString();
    const task = { id: taskId, prompt, response, status: "completed", created_at: now };
    previewTasks.push(task);
    thread.turns.push({ id: turnId, thread_id: thread.id, task_id: taskId, mode, user_message: prompt, assistant_message: response, status: "completed", created_at: now, completed_at: completedAt });
    thread.messages.push({ id: `${turnId}:assistant`, turn_id: turnId, role: "assistant", text: response, created_at: completedAt });
    thread.mode = mode;
    thread.status = "idle";
    thread.turn_count = thread.turns.length;
    thread.updated_at = completedAt;
    thread.last_turn_at = completedAt;
    emitPreviewAgentEvent({ type: "complete", threadId: thread.id, turnId, title: "Research turn complete", detail: `${actions.length} approval item${actions.length === 1 ? "" : "s"}` });
    return { threadId: thread.id, turnId, taskId: task.id, response, status: "completed", actions, thread: structuredClone(thread) };
  },
  interruptAgent: async () => ({ interrupted: true }),
  approveAgentAction: async (actionId: string) => {
    const action = previewActions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("Agent action not found.");
    action.status = "approved";
    action.resolved_at = new Date().toISOString();
    if (action.payload.change) {
      const thread = previewThreads.find((candidate) => candidate.turns.some((turn) => turn.task_id === action.task_id));
      const changeSet: WorkspaceChangeSet = { id: action.id, actionId: action.id, taskId: action.task_id, threadId: thread?.id, kind: action.kind, changes: [action.payload.change], createdAt: action.created_at };
      if (thread) thread.changeSets.push(changeSet);
      for (const listener of previewChangeSetListeners) listener(changeSet);
    }
    return action;
  },
  rejectAgentAction: async (actionId: string) => {
    const action = previewActions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("Agent action not found.");
    action.status = "rejected";
    action.resolved_at = new Date().toISOString();
    return action;
  },
  runTerminal: async ({ command }: { command: string; cwd?: string }) => {
    const sessionId = crypto.randomUUID();
    const commandRunId = crypto.randomUUID();
    previewCommands.push({ id: commandRunId, command, cwd: previewWorkspace, status: "completed", output: "", exit_code: 0, created_at: new Date().toISOString(), completed_at: new Date().toISOString() });
    window.setTimeout(() => {
      for (const listener of previewListeners) {
        listener({ sessionId, data: `[browser preview] Command approved: ${command}\n[process exited with code 0]\n` });
      }
    }, 260);
    return { sessionId, commandRunId, workspace: previewWorkspace };
  },
  stopTerminal: async (sessionId: string) => {
    for (const listener of previewListeners) listener({ sessionId, data: "[process stopped]\n" });
  },
  createTerminal: async ({ cwd }: { cwd?: string; cols?: number; rows?: number }) => {
    const sessionId = crypto.randomUUID();
    previewPtySessions.set(sessionId, { cwd: cwd || previewWorkspace, line: "", ready: false });
    return { sessionId, workspace: cwd || previewWorkspace, shell: "zsh", pid: 0 };
  },
  readyTerminal: async (sessionId: string) => {
    const session = previewPtySessions.get(sessionId);
    if (!session || session.ready) return;
    session.ready = true;
    const folder = session.cwd.split("/").filter(Boolean).at(-1) || "workspace";
    for (const listener of previewPtyListeners) listener({ sessionId, data: `\x1b[32m${folder}\x1b[0m % ` });
  },
  writeTerminal: (sessionId: string, data: string) => {
    const session = previewPtySessions.get(sessionId);
    if (!session) return;
    if (data === "\r") {
      const command = session.line.trim();
      const output = command ? `\r\n\x1b[90m[browser preview]\x1b[0m ${command}\r\n` : "\r\n";
      session.line = "";
      for (const listener of previewPtyListeners) listener({ sessionId, data: `${output}\x1b[32marchimedes\x1b[0m % ` });
      return;
    }
    if (data === "\u007f") {
      session.line = session.line.slice(0, -1);
      for (const listener of previewPtyListeners) listener({ sessionId, data: "\b \b" });
      return;
    }
    if (data === "\t") return;
    session.line += data;
    for (const listener of previewPtyListeners) listener({ sessionId, data });
  },
  resizeTerminal: (_sessionId: string, _cols: number, _rows: number) => undefined,
  closeTerminal: async (sessionId: string) => {
    if (!previewPtySessions.delete(sessionId)) return;
    for (const listener of previewPtyExitListeners) listener({ sessionId, exitCode: 0 });
  },
  onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => {
    previewListeners.add(callback);
    return () => previewListeners.delete(callback);
  },
  onPtyData: (callback: (payload: { sessionId: string; data: string }) => void) => {
    previewPtyListeners.add(callback);
    return () => previewPtyListeners.delete(callback);
  },
  onPtyExit: (callback: (payload: { sessionId: string; exitCode: number; signal?: number }) => void) => {
    previewPtyExitListeners.add(callback);
    return () => previewPtyExitListeners.delete(callback);
  },
  onAgentEvent: (callback: (payload: AgentEvent) => void) => {
    previewAgentListeners.add(callback);
    return () => previewAgentListeners.delete(callback);
  },
  onMenuNewChat: () => () => undefined,
  onMenuOpenFolder: () => () => undefined,
  onWorkspaceFilesChanged: (callback: (payload: { path: string }) => void) => {
    previewWorkspaceListeners.add(callback);
    return () => previewWorkspaceListeners.delete(callback);
  },
  onWorkspaceChangeSet: (callback: (payload: WorkspaceChangeSet) => void) => {
    previewChangeSetListeners.add(callback);
    return () => previewChangeSetListeners.delete(callback);
  },
};

const desktopBridge: ResearchDeskBridge = window.researchDesk ?? previewBridge;

type MainSection = "chat" | "library" | "daily" | "artifacts";

function App() {
  const [mainSection, setMainSection] = useState<MainSection>("chat");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [prompt, setPrompt] = useState("");
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [threads, setThreads] = useState<ResearchThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ResearchThread[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [researchMode, setResearchMode] = useState<ResearchMode>("idea-spark");
  const [contextItems, setContextItems] = useState<ContextAttachment[]>([]);
  const [fileTree, setFileTree] = useState<WorkspaceFileTree>({ entries: [], count: 0, truncated: false });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFilePreview | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [changeSets, setChangeSets] = useState<WorkspaceChangeSet[]>([]);
  const [papers, setPapers] = useState(initialPapers);
  const [modal, setModal] = useState<Modal>(null);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [activeModelConfig, setActiveModelConfig] = useState<PublicModelConfig | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [artifactName, setArtifactName] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("retrieval budget reasoning");
  const [selectedSource, setSelectedSource] = useState("");
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const threadOpenRequestRef = useRef(0);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    const unsubscribe = desktopBridge.onTerminalData(({ sessionId, data }) => {
      if (sessionId === runningSession && (data.includes("[process exited") || data.includes("[process stopped]"))) {
        setRunningSession(null);
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "The approved command finished and its output was recorded in the workspace history." }]);
      }
    });
    return unsubscribe;
  }, [runningSession]);

  useEffect(() => {
    const unsubscribe = desktopBridge.onAgentEvent((event) => {
      if (event.threadId) {
        setRunningThreadId(event.threadId);
        if (!activeThreadIdRef.current) {
          activeThreadIdRef.current = event.threadId;
          setActiveThreadId(event.threadId);
        }
      }
      if (event.type === "assistant_delta" && event.turnId && event.delta) {
        if (event.threadId && activeThreadIdRef.current !== event.threadId) return;
        const streamId = `${event.turnId}:stream`;
        setMessages((current) => {
          const existing = current.find((message) => message.id === streamId);
          return existing
            ? current.map((message) => message.id === streamId ? { ...message, text: `${message.text}${event.delta}` } : message)
            : [...current, { id: streamId, role: "assistant", text: event.delta || "" }];
        });
        return;
      }
      if (event.type === "approval" && event.action && (!event.threadId || activeThreadIdRef.current === event.threadId)) {
        setPendingAction({ ...event.action, source: "agent" });
      }
      const state = event.type === "complete" ? "done" : event.type === "configuration" || event.type === "failed" || event.type === "interrupted" ? "waiting" : "active";
      setEvents((current) => [...current.filter((item) => item.title !== event.title), { title: event.title, detail: event.detail, state }]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribeFiles = desktopBridge.onWorkspaceFilesChanged(() => {
      if (workspace) void refreshWorkspaceFiles();
    });
    const unsubscribeChanges = desktopBridge.onWorkspaceChangeSet((changeSet) => {
      if (!changeSet.threadId || activeThreadIdRef.current === changeSet.threadId) {
        setChangeSets((current) => upsertChangeSet(current, changeSet));
      }
      if (workspace) void refreshWorkspaceFiles();
    });
    return () => {
      unsubscribeFiles();
      unsubscribeChanges();
    };
  }, [workspace, selectedFilePath]);

  useEffect(() => {
    void desktopBridge.getInitialWorkspace().then((initialWorkspace) => loadWorkspace(initialWorkspace ?? DEFAULT_WORKSPACE));
    void desktopBridge.getModelConfig().then(setActiveModelConfig).catch(() => setActiveModelConfig(null));
  }, []);

  useEffect(() => {
    const unsubscribeNewChat = desktopBridge.onMenuNewChat(() => startNewTask());
    const unsubscribeOpenFolder = desktopBridge.onMenuOpenFolder((selectedWorkspace) => {
      if (!agentBusy) void loadWorkspace(selectedWorkspace);
    });
    return () => {
      unsubscribeNewChat();
      unsubscribeOpenFolder();
    };
  }, [activeProjectId, agentBusy]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, agentBusy, pendingAction, changeSets]);

  async function chooseWorkspace() {
    if (agentBusy) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) await loadWorkspace(selected);
  }

  async function loadWorkspace(workspacePath: string) {
    setWorkspaceReady(false);
    const snapshot = await desktopBridge.openWorkspace(workspacePath);
    setWorkspace(snapshot.workspace);
    setProjects(snapshot.projects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads ?? []);
    const nextTree = await desktopBridge.listWorkspaceFiles(snapshot.workspace);
    setFileTree(nextTree);
    setSelectedFilePath(null);
    setSelectedFile(null);
    setFileError("");
    setWorkspaceReady(true);

    if (snapshot.threads.length) {
      const thread = await desktopBridge.getResearchThread(snapshot.threads[0].id, snapshot.workspace);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setActiveThreadId(thread.id);
      setActiveProjectId(thread.project_id);
      setResearchMode(thread.mode);
      setChangeSets(thread.changeSets ?? []);
    } else {
      setMessages(initialMessages);
      setActiveThreadId(null);
      setActiveProjectId(snapshot.projects?.[0]?.id ?? null);
      setChangeSets([]);
    }

    const action = snapshot.actions.find((candidate) => candidate.status === "pending");
    setPendingAction(action ? { ...action, source: "agent" } : null);

  }

  async function refreshWorkspaceFiles() {
    if (!workspace) return;
    const nextTree = await desktopBridge.listWorkspaceFiles(workspace);
    setFileTree(nextTree);
    if (selectedFilePath) {
      try {
        setSelectedFile(await desktopBridge.readWorkspaceFile(workspace, selectedFilePath));
        setFileError("");
      } catch {
        setSelectedFile(null);
        setSelectedFilePath(null);
      }
    }
  }

  function startNewTask(projectId = activeProjectId) {
    if (agentBusy) return;
    setMainSection("chat");
    if (projectId) setActiveProjectId(projectId);
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setMessages(initialMessages);
    setPrompt("");
    setPendingAction(null);
    setContextItems([]);
    setChangeSets([]);
  }

  async function openResearchThread(threadSummary: ResearchThread) {
    setMainSection("chat");
    activeThreadIdRef.current = threadSummary.id;
    setActiveThreadId(threadSummary.id);
    setActiveProjectId(threadSummary.project_id);
    const requestId = ++threadOpenRequestRef.current;
    try {
      const thread = await desktopBridge.getResearchThread(threadSummary.id, workspace);
      if (requestId !== threadOpenRequestRef.current) return;
      activeThreadIdRef.current = thread.id;
      setActiveThreadId(thread.id);
      setActiveProjectId(thread.project_id);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setResearchMode(thread.mode);
      setChangeSets(thread.changeSets ?? []);
      const action = thread.turns.map((turn) => turn.task_id).filter(Boolean);
      setPendingAction((current) => current && action.includes(current.task_id) ? current : null);
    } catch (error) {
      if (requestId !== threadOpenRequestRef.current) return;
      setMessages([{ id: crypto.randomUUID(), role: "assistant", text: `Could not open this research chat: ${String(error)}` }]);
      setChangeSets([]);
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name || agentBusy) return;
    const project = await desktopBridge.createResearchProject({ name });
    setProjects((current) => [project, ...current]);
    setNewProjectName("");
    setNewProjectOpen(false);
    startNewTask(project.id);
  }

  async function archiveThread(thread: ResearchThread, archived: boolean) {
    if (agentBusy) return;
    await desktopBridge.archiveResearchThread(thread.id, archived);
    const snapshot = await desktopBridge.openWorkspace(workspace);
    setProjects(snapshot.projects);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads);
    if (archived && activeThreadId === thread.id) {
      const next = snapshot.threads.find((candidate) => candidate.project_id === thread.project_id);
      if (next) await openResearchThread(next); else startNewTask(thread.project_id);
    }
  }

  async function submitPrompt() {
    const question = prompt.trim();
    if (!question || agentBusy) return;
    const submittedContext = contextItems;
    const submittedThreadId = activeThreadIdRef.current;

    setPrompt("");
    setAgentBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    setEvents((current) => [
      ...current.filter((event) => event.title !== "Evidence synthesis"),
      { title: "Evidence synthesis", detail: "Reading workspace and knowledge context", state: "active" },
    ]);

    try {
      const result = await desktopBridge.runAgent({ prompt: question, workspace, threadId: activeThreadId || undefined, projectId: activeProjectId || undefined, mode: researchMode, contextItems: submittedContext });
      setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)]);
      const stillViewingSubmittedThread = activeThreadIdRef.current === result.threadId
        || (submittedThreadId === null && activeThreadIdRef.current === null);
      if (stillViewingSubmittedThread) {
        activeThreadIdRef.current = result.threadId;
        setMessages(result.thread.messages.length ? result.thread.messages : initialMessages);
        setActiveThreadId(result.threadId);
        setActiveProjectId(result.thread.project_id);
        setChangeSets(result.thread.changeSets ?? []);
        setEvents((current) => current.map((event) => event.title === "Evidence synthesis" ? { ...event, detail: "Turn saved to this research thread", state: "done" } : event));
        const proposedAction = result.actions.find((action) => action.status === "pending");
        if (proposedAction) setPendingAction({ ...proposedAction, source: "agent" });
      }
      setContextItems((current) => current.filter((item) => !submittedContext.some((submitted) => submitted.id === item.id)));
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Archimedes could not start this task: ${String(error)}` }]);
    } finally {
      setAgentBusy(false);
      setRunningThreadId(null);
    }
  }

  async function interruptResearchTurn() {
    if (!runningThreadId) return;
    await desktopBridge.interruptAgent(runningThreadId);
  }

  async function runCommand(command: string, actionId?: string) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand || runningSession) return;
    setTerminalOpen(true);
    try {
      const { sessionId } = await desktopBridge.runTerminal({ command: trimmedCommand, cwd: workspace, actionId });
      setRunningSession(sessionId);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `The command could not start: ${String(error)}` }]);
    }
  }

  async function openArtifact(filePath: string) {
    setMainSection("artifacts");
    setSelectedFilePath(filePath);
    setFileLoading(true);
    setFileError("");
    try {
      setSelectedFile(await desktopBridge.readWorkspaceFile(workspace, filePath));
    } catch (error) {
      setSelectedFile(null);
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setFileLoading(false);
    }
  }

  async function createArtifact() {
    const name = artifactName.trim();
    if (!name) return;
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;
    await desktopBridge.writeWorkspaceFile(workspace, normalizedName, `# ${normalizedName.split("/").at(-1)?.replace(/\.md$/, "")}\n\n`);
    setArtifactName("");
    setModal(null);
    await refreshWorkspaceFiles();
    await openArtifact(normalizedName);
  }

  function addEvidence(title = evidenceTitle, url = evidenceUrl) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setPapers((current) => [...current, { title: trimmedTitle, meta: url.trim() || "Manually added source", score: "New" }]);
    setEvidenceTitle("");
    setEvidenceUrl("");
    setModal(null);
  }

  async function approvePendingAction() {
    const action = pendingAction;
    if (!action) return;
    try {
      if (action.source === "agent") await desktopBridge.approveAgentAction(action.id);
      setPendingAction(null);
      if (action.kind === "command" && action.payload.command) {
        await runCommand(action.payload.command, action.id);
      } else if (action.kind === "write" && action.payload.path) {
        await refreshWorkspaceFiles();
      }
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Could not approve this action: ${String(error)}` }]);
    }
  }

  async function rejectPendingAction() {
    const action = pendingAction;
    if (!action) return;
    if (action.source === "agent") await desktopBridge.rejectAgentAction(action.id);
    setPendingAction(null);
  }

  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const mainTitle = mainSection === "chat" ? activeThread?.title ?? "New research task" : mainSection === "library" ? "Literature library" : mainSection === "daily" ? "Daily papers" : "Artifacts";

  return (
    <main className="codex-shell">
      <aside className="codex-sidebar" aria-label="Archimedes navigation">
        <div className="codex-brand">
          <span className="codex-brand-mark"><Sparkles size={16} /></span>
          <strong>Archimedes</strong>
        </div>

        <button className="new-task-button" onClick={() => startNewTask()} title="New task" disabled={agentBusy}>
          <PenLine size={16} />
          <span>New task</span>
        </button>

        <nav className="sidebar-nav" aria-label="Primary">
          <button className={mainSection === "chat" ? "codex-nav-item active" : "codex-nav-item"} onClick={() => setMainSection("chat")} title="Research chat">
            <Bot size={16} /><span>Research chat</span>
          </button>
          <button className="codex-nav-item" onClick={() => setModal("search")} title="Search knowledge">
            <Search size={16} /><span>Search</span>
          </button>
        </nav>

        <section className="sidebar-group knowledge-group">
          <div className="codex-sidebar-label">Knowledge</div>
          <button className={mainSection === "library" ? "codex-nav-item active" : "codex-nav-item"} onClick={() => setMainSection("library")} title="Literature library">
            <BookOpen size={16} /><span>Literature library</span>
          </button>
          <button className={mainSection === "daily" ? "codex-nav-item active" : "codex-nav-item"} onClick={() => setMainSection("daily")} title="Daily papers">
            <CalendarDays size={16} /><span>Daily papers</span>
          </button>
          <button className={mainSection === "artifacts" ? "codex-nav-item active" : "codex-nav-item"} onClick={() => setMainSection("artifacts")} title="Artifacts">
            <Folder size={16} /><span>Artifacts</span><span className="nav-count">{fileTree.count}</span>
          </button>
        </section>

        <ProjectSidebar
          projects={projects}
          threads={threads}
          archivedThreads={archivedThreads}
          activeProjectId={activeProjectId}
          activeThreadId={activeThreadId}
          disabled={agentBusy}
          onNewProject={() => setNewProjectOpen(true)}
          onNewChat={(projectId) => startNewTask(projectId)}
          onOpenThread={(thread) => void openResearchThread(thread)}
          onArchiveThread={(thread, archived) => void archiveThread(thread, archived)}
        />

        <div className="sidebar-workspace">
          <button className="workspace-button" onClick={chooseWorkspace} title="Choose workspace" disabled={agentBusy}>
            <span className="workspace-icon"><FolderOpen size={15} /></span>
            <span className="workspace-copy"><strong>{workspace ? workspace.split("/").filter(Boolean).at(-1) : "Choose workspace"}</strong><small>{workspaceReady ? `${threads.length} research chats` : "Opening workspace"}</small></span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>

      <section className={terminalOpen ? "codex-main panel-open" : "codex-main"} style={{ "--terminal-height": `${terminalHeight}px` } as React.CSSProperties}>
        <header className="main-toolbar">
          <div className="conversation-title"><strong>{mainTitle}</strong><span>{workspaceReady ? "Workspace connected" : "Opening workspace"}</span></div>
          <div className="main-toolbar-actions">
            {mainSection === "chat" && <button className="model-provider-button" onClick={() => setModelSettingsOpen(true)} title={`Model providers${activeModelConfig?.model ? ` · ${activeModelConfig.model}` : ""}`}><Bot size={16} /><span>{activeModelConfig?.model || "Choose model"}</span></button>}
            <button className={terminalOpen ? "quiet-icon-button active" : "quiet-icon-button"} onClick={() => setTerminalOpen((open) => !open)} title={terminalOpen ? "Hide bottom panel" : "Show bottom panel"} aria-pressed={terminalOpen}>
              <PanelBottom size={18} />
            </button>
          </div>
        </header>

        <div className={mainSection === "chat" ? "main-view chat-main" : "main-view knowledge-main"}>
          {mainSection === "chat" && (
            <ConversationView
              messages={messages}
              events={events}
              prompt={prompt}
              workspace={workspace}
              agentBusy={agentBusy}
              pendingAction={pendingAction}
              changeSets={changeSets}
              conversationEndRef={conversationEndRef}
              onPrompt={setPrompt}
              onSubmit={() => void submitPrompt()}
              onInterrupt={() => void interruptResearchTurn()}
              canInterrupt={Boolean(runningThreadId)}
              researchMode={researchMode}
              onResearchMode={setResearchMode}
              contextItems={contextItems}
              onAddContext={(added) => setContextItems((current) => [...current, ...added.filter((item) => !current.some((candidate) => candidate.id === item.id))].slice(0, 12))}
              onRemoveContext={(id) => setContextItems((current) => current.filter((item) => item.id !== id))}
              onSourceOpen={setSelectedSource}
              onApprove={() => void approvePendingAction()}
              onReject={() => void rejectPendingAction()}
              onOpenFile={(filePath) => void openArtifact(filePath)}
            />
          )}
          {(mainSection === "library" || mainSection === "daily") && <LibraryView bridge={desktopBridge} mode={mainSection} />}
          {mainSection === "artifacts" && (
            <ArtifactsView workspace={workspace} tree={fileTree} selectedPath={selectedFilePath} file={selectedFile} loading={fileLoading} error={fileError} onOpenFile={(filePath) => void openArtifact(filePath)} onRefresh={() => void refreshWorkspaceFiles()} onNewArtifact={() => setModal("artifact")} />
          )}
        </div>

        <TerminalPanel bridge={desktopBridge} open={terminalOpen} workspace={workspace} height={terminalHeight} onHeightChange={setTerminalHeight} onClose={() => setTerminalOpen(false)} />
      </section>

      <WorkspaceModal
        modal={modal ?? (selectedSource ? "source" : null)}
        artifactName={artifactName}
        evidenceTitle={evidenceTitle}
        evidenceUrl={evidenceUrl}
        searchQuery={searchQuery}
        selectedSource={selectedSource}
        onArtifactName={setArtifactName}
        onEvidenceTitle={setEvidenceTitle}
        onEvidenceUrl={setEvidenceUrl}
        onSearchQuery={setSearchQuery}
        onClose={() => { setModal(null); setSelectedSource(""); }}
        onCreateArtifact={() => void createArtifact()}
        onAddEvidence={addEvidence}
      />
      <ModelSettingsModal bridge={desktopBridge} open={modelSettingsOpen} onClose={() => setModelSettingsOpen(false)} onSaved={setActiveModelConfig} />
      <NewProjectModal open={newProjectOpen} name={newProjectName} onName={setNewProjectName} onClose={() => { setNewProjectOpen(false); setNewProjectName(""); }} onCreate={() => void createProject()} />
    </main>
  );
}

function ConversationView({ messages, events, prompt, workspace, agentBusy, canInterrupt, pendingAction, changeSets, conversationEndRef, researchMode, contextItems, onPrompt, onSubmit, onInterrupt, onResearchMode, onAddContext, onRemoveContext, onSourceOpen, onApprove, onReject, onOpenFile }: {
  messages: Message[];
  events: TimelineEvent[];
  prompt: string;
  workspace: string;
  agentBusy: boolean;
  canInterrupt: boolean;
  pendingAction: PendingAction | null;
  changeSets: WorkspaceChangeSet[];
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  researchMode: ResearchMode;
  contextItems: ContextAttachment[];
  onPrompt: (value: string) => void;
  onSubmit: () => void;
  onInterrupt: () => void;
  onResearchMode: (mode: ResearchMode) => void;
  onAddContext: (items: ContextAttachment[]) => void;
  onRemoveContext: (id: string) => void;
  onSourceOpen: (source: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenFile: (filePath: string) => void;
}) {
  const latestEvent = events.at(-1);
  const activeMode = researchModes.find((mode) => mode.id === researchMode) ?? researchModes[0];
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) setModeMenuOpen(false);
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [modeMenuOpen]);

  return <div className="conversation-layout">
    <div className="conversation-scroll">
      <div className="conversation-thread">
        {messages.map((message) => (
          <article className={`conversation-message ${message.role}`} key={message.id}>
            {message.role === "assistant" && <span className="assistant-mark"><Sparkles size={15} /></span>}
            <div className="conversation-message-copy">
              <div className="conversation-message-role">{message.role === "assistant" ? "Archimedes" : "You"}</div>
              <p>{message.text}</p>
              {message.sources && <div className="source-chips">{message.sources.map((source) => <button key={source} onClick={() => onSourceOpen(source)}>{source}</button>)}</div>}
            </div>
          </article>
        ))}

        {changeSets.map((changeSet) => <WorkspaceChangesCard key={changeSet.id} changeSet={changeSet} onOpenFile={onOpenFile} />)}

        {agentBusy && <div className="conversation-running"><span className="assistant-mark"><Sparkles size={15} /></span><div><strong>{latestEvent?.title ?? "Archimedes is working"}</strong><small>{latestEvent?.detail ?? "Reading research context"}</small><div className="agent-typing"><span /><span /><span /></div></div></div>}

        {pendingAction && (
          <section className="conversation-approval">
            <div className="approval-icon">{pendingAction.kind === "write" ? <FileText size={16} /> : <SquareTerminal size={16} />}</div>
            <div className="approval-content">
              <span>{pendingAction.kind === "write" ? "File write requires approval" : "Command requires approval"}</span>
              <code>{pendingAction.kind === "write" ? pendingAction.payload.path : pendingAction.payload.command}</code>
              {pendingAction.payload.change && <div className="approval-diff-stats"><span>+{pendingAction.payload.change.additions}</span><span>-{pendingAction.payload.change.deletions}</span></div>}
              {pendingAction.kind === "write" && pendingAction.payload.content && <pre className="proposal-preview">{pendingAction.payload.content.slice(0, 260)}</pre>}
              <p>{pendingAction.kind === "write" ? "This will write a file inside the selected workspace." : "This will run in the selected workspace and record its output."}</p>
              <div className="approval-actions">
                <button className="secondary-button" onClick={onReject}><X size={14} />Dismiss</button>
                <button className="primary-button" onClick={onApprove}>{pendingAction.kind === "write" ? <Check size={14} /> : <Play size={14} />}{pendingAction.kind === "write" ? "Apply" : "Run"}</button>
              </div>
            </div>
          </section>
        )}
        <div ref={conversationEndRef} />
      </div>
    </div>

    <div className="conversation-composer-wrap">
      <div className="conversation-composer">
        <textarea value={prompt} onChange={(event) => onPrompt(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }} placeholder={activeMode.placeholder} rows={3} />
        <ContextChips items={contextItems} onRemove={onRemoveContext} />
        <div className="conversation-composer-footer">
          <ContextPicker bridge={desktopBridge} workspace={workspace} items={contextItems} onAdd={onAddContext} />
          <div className="research-mode-picker" ref={modeMenuRef}>
            <button className={modeMenuOpen ? "composer-tool mode-trigger active" : "composer-tool mode-trigger"} onClick={() => setModeMenuOpen((open) => !open)} title="Choose research mode" aria-haspopup="menu" aria-expanded={modeMenuOpen}>
              {activeMode.icon}<span>{activeMode.label}</span><ChevronDown size={13} />
            </button>
            {modeMenuOpen && <div className="research-mode-menu" role="menu" aria-label="Research mode">
              <div className="research-mode-menu-label">Research mode</div>
              {researchModes.map((mode) => <button key={mode.id} className={mode.id === researchMode ? "research-mode-option selected" : "research-mode-option"} role="menuitemradio" aria-checked={mode.id === researchMode} onClick={() => { onResearchMode(mode.id); setModeMenuOpen(false); }}>
                <span className="research-mode-icon">{mode.icon}</span>
                <span className="research-mode-copy"><strong>{mode.label}</strong><small>{mode.description}</small></span>
                {mode.id === researchMode && <Check size={14} />}
              </button>)}
            </div>}
          </div>
          <div className="composer-context"><ShieldCheck size={13} /><span>{workspace ? workspace.split("/").filter(Boolean).at(-1) : "No workspace"}</span></div>
          <button className="conversation-send" onClick={agentBusy ? onInterrupt : onSubmit} disabled={agentBusy ? !canInterrupt : !prompt.trim()} title={agentBusy ? "Stop" : "Send"}>
            {agentBusy ? <Square size={14} fill="currentColor" /> : <SendHorizontal size={16} />}
          </button>
        </div>
      </div>
      <p className="composer-note">Archimedes can make mistakes. Review sources and workspace changes.</p>
    </div>
  </div>;
}

function WorkspaceChangesCard({ changeSet, onOpenFile }: { changeSet: WorkspaceChangeSet; onOpenFile: (filePath: string) => void }) {
  const [expanded, setExpanded] = useState(changeSet.changes.length <= 4);
  const visible = expanded ? changeSet.changes : changeSet.changes.slice(0, 3);
  const additions = changeSet.changes.reduce((total, change) => total + change.additions, 0);
  const deletions = changeSet.changes.reduce((total, change) => total + change.deletions, 0);
  return <section className="workspace-change-card">
    <header>
      <span className="change-card-icon"><FileCode2 size={17} /></span>
      <div><strong>Edited {changeSet.changes.length} {changeSet.changes.length === 1 ? "file" : "files"}</strong><small><span>+{additions}</span><span>-{deletions}</span></small></div>
    </header>
    <div className="change-file-list">
      {visible.map((change) => <button key={change.path} disabled={change.status === "deleted"} onClick={() => onOpenFile(change.path)} title={change.status === "deleted" ? "Deleted file" : `Open ${change.path}`}>
        <span>{change.path}</span>
        <small className={`change-status ${change.status}`}>{change.status}</small>
        <em>+{change.additions}</em><i>-{change.deletions}</i>
      </button>)}
    </div>
    {changeSet.changes.length > 3 && <button className="change-card-expand" onClick={() => setExpanded((current) => !current)}>{expanded ? "Show less" : `Show ${changeSet.changes.length - 3} more`}<ChevronDown size={14} /></button>}
  </section>;
}

function workspaceFileIcon(entry: Pick<WorkspaceFileEntry, "type" | "kind">) {
  if (entry.type === "directory") return <Folder size={14} />;
  if (entry.kind === "pdf" || entry.kind === "markdown") return <FileText size={14} />;
  if (entry.kind === "image") return <FileImage size={14} />;
  if (entry.kind === "text") return <FileCode2 size={14} />;
  return <File size={14} />;
}

function WorkspaceTreeNode({ entry, depth, expanded, selectedPath, onToggle, onOpenFile }: {
  entry: WorkspaceFileEntry;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
}) {
  const isDirectory = entry.type === "directory";
  const isExpanded = isDirectory && expanded.has(entry.path);
  return <div className="workspace-tree-node">
    <button className={entry.path === selectedPath ? "workspace-tree-row active" : "workspace-tree-row"} style={{ paddingLeft: `${8 + depth * 15}px` }} onClick={() => isDirectory ? onToggle(entry.path) : onOpenFile(entry.path)} title={entry.path}>
      <span className="tree-disclosure">{isDirectory ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
      <span className="tree-file-icon">{workspaceFileIcon(entry)}</span>
      <strong>{entry.name}</strong>
    </button>
    {isExpanded && entry.children?.map((child) => <WorkspaceTreeNode key={child.path} entry={child} depth={depth + 1} expanded={expanded} selectedPath={selectedPath} onToggle={onToggle} onOpenFile={onOpenFile} />)}
  </div>;
}

function FilePreview({ file, loading, error }: { file: WorkspaceFilePreview | null; loading: boolean; error: string }) {
  const [markdownMode, setMarkdownMode] = useState<"preview" | "source">("preview");
  useEffect(() => setMarkdownMode("preview"), [file?.path]);

  if (loading) return <div className="artifact-empty"><RefreshCw className="spin" size={18} />Loading file...</div>;
  if (error) return <div className="artifact-empty error"><FileText size={22} /><strong>Could not open this file</strong><span>{error}</span></div>;
  if (!file) return <div className="artifact-empty"><FolderOpen size={24} /><strong>Select a file from the workspace</strong><span>Code, Markdown, PDF, and images can be previewed here.</span></div>;

  return <section className="artifact-editor">
    <div className="artifact-editor-header">
      <span>{workspaceFileIcon({ type: "file", kind: file.kind })}</span>
      <strong>{file.path}</strong>
      <small>{formatFileSize(file.size)}</small>
      {file.kind === "markdown" && <div className="artifact-view-toggle"><button className={markdownMode === "preview" ? "active" : ""} onClick={() => setMarkdownMode("preview")}>Preview</button><button className={markdownMode === "source" ? "active" : ""} onClick={() => setMarkdownMode("source")}>Source</button></div>}
    </div>
    <div className="artifact-preview-surface">
      {file.kind === "markdown" && markdownMode === "preview" && <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content || ""}</ReactMarkdown></article>}
      {(file.kind === "text" || (file.kind === "markdown" && markdownMode === "source")) && <CodePreview content={file.content || ""} />}
      {file.kind === "pdf" && file.previewUrl && <iframe className="pdf-preview" src={file.previewUrl} title={file.name} />}
      {file.kind === "image" && file.previewUrl && <div className="image-preview"><img src={file.previewUrl} alt={file.name} /></div>}
      {file.kind === "binary" && <div className="artifact-empty"><File size={24} /><strong>Binary preview is unavailable</strong><span>{file.name} is still available in the workspace.</span></div>}
    </div>
  </section>;
}

function CodePreview({ content }: { content: string }) {
  return <pre className="code-preview">{content.split("\n").map((line, index) => <span className="code-line" key={`${index}:${line.slice(0, 20)}`}><i>{index + 1}</i><code>{line || " "}</code></span>)}</pre>;
}

function formatFileSize(size: number) {
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function ArtifactsView({ workspace, tree, selectedPath, file, loading, error, onOpenFile, onRefresh, onNewArtifact }: {
  workspace: string;
  tree: WorkspaceFileTree;
  selectedPath: string | null;
  file: WorkspaceFilePreview | null;
  loading: boolean;
  error: string;
  onOpenFile: (filePath: string) => void;
  onRefresh: () => void;
  onNewArtifact: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const workspaceName = workspace.split("/").filter(Boolean).at(-1) || "Workspace";
  useEffect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split("/");
    setExpanded((current) => {
      const next = new Set(current);
      for (let index = 1; index < parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
      return next;
    });
  }, [selectedPath]);
  const toggleDirectory = (filePath: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
    return next;
  });

  return <div className="artifacts-page">
    <header className="artifacts-header">
      <div><span className="page-kicker">Workspace</span><h1>Artifacts</h1><p>Browse the active folder and inspect files created or changed by Archimedes.</p></div>
      <div className="artifacts-header-actions"><button className="secondary-button" onClick={onRefresh} title="Refresh workspace files"><RefreshCw size={14} />Refresh</button><button className="primary-button" onClick={onNewArtifact}><Plus size={15} />New file</button></div>
    </header>
    <div className="artifacts-workspace">
      <aside className="artifact-browser">
        <div className="artifact-browser-title"><FolderOpen size={14} /><strong>{workspaceName}</strong><span>{tree.count}</span></div>
        {tree.entries.map((entry) => <WorkspaceTreeNode key={entry.path} entry={entry} depth={0} expanded={expanded} selectedPath={selectedPath} onToggle={toggleDirectory} onOpenFile={onOpenFile} />)}
        {!tree.entries.length && <p className="artifact-browser-empty">This workspace has no visible files.</p>}
        {tree.truncated && <p className="artifact-browser-empty">Large workspace: showing the first 5,000 entries.</p>}
      </aside>
      <FilePreview file={file} loading={loading} error={error} />
    </div>
  </div>;
}

function WorkspaceModal({ modal, artifactName, evidenceTitle, evidenceUrl, searchQuery, selectedSource, onArtifactName, onEvidenceTitle, onEvidenceUrl, onSearchQuery, onClose, onCreateArtifact, onAddEvidence }: { modal: Modal; artifactName: string; evidenceTitle: string; evidenceUrl: string; searchQuery: string; selectedSource: string; onArtifactName: (value: string) => void; onEvidenceTitle: (value: string) => void; onEvidenceUrl: (value: string) => void; onSearchQuery: (value: string) => void; onClose: () => void; onCreateArtifact: () => void; onAddEvidence: () => void }) {
  if (!modal) return null;
  const firstTerm = searchQuery.toLowerCase().trim().split(" ")[0];
  const previewResults = initialPapers.filter((paper) => !firstTerm || paper.title.toLowerCase().includes(firstTerm));
  const title = modal === "artifact" ? "New research artifact" : modal === "evidence" ? "Add evidence" : modal === "search" ? "Search research" : "Source record";

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="workspace-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Archimedes workspace</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    {modal === "artifact" && <><p>Create a session draft, then select it from the left workspace tree.</p><label>Artifact name<input autoFocus value={artifactName} onChange={(event) => onArtifactName(event.target.value)} placeholder="literature-gap.md" onKeyDown={(event) => event.key === "Enter" && onCreateArtifact()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreateArtifact}><Plus size={14} />Create draft</button></div></>}
    {modal === "evidence" && <><p>Add a paper, dataset, or web source to the current evidence ledger.</p><label>Title<input autoFocus value={evidenceTitle} onChange={(event) => onEvidenceTitle(event.target.value)} placeholder="Paper or source title" /></label><label>URL or citation<input value={evidenceUrl} onChange={(event) => onEvidenceUrl(event.target.value)} placeholder="https://... or Author et al., 2025" onKeyDown={(event) => event.key === "Enter" && onAddEvidence()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add evidence</button></div></>}
    {modal === "search" && <><p>Search is a local preview catalogue for now; choose a result, then add it to the evidence ledger.</p><label>Research query<input autoFocus value={searchQuery} onChange={(event) => onSearchQuery(event.target.value)} /></label><div className="search-results">{previewResults.length ? previewResults.map((paper) => <button key={paper.title} className="search-result" onClick={() => { onEvidenceTitle(paper.title); onEvidenceUrl(`${paper.meta} · preview catalogue`); }}><Search size={15} /><span>{paper.title}</span><Plus size={14} /></button>) : <p>No local preview matches. Use Add evidence to enter a source manually.</p>}</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add selected</button></div></>}
    {modal === "source" && <><p><strong>{selectedSource}</strong></p><p>This is a linked-source detail placeholder. The next data layer will persist a citation, source URL, extracted passage, and its connection to a claim.</p><div className="modal-actions"><button className="primary-button" onClick={onClose}>Close record</button></div></>}
  </section></div>;
}

export default App;
