import { useEffect, useRef, useState } from "react";
import LibraryView from "./LibraryView";
import ContextPicker, { ContextChips } from "./ContextPicker";
import TerminalPanel from "./TerminalPanel";
import { previewLibraryBridge } from "./library-preview";
import {
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Code2,
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
type Artifact = { name: string; kind: "artifact" | "experiment"; body: string };
type Modal = "artifact" | "evidence" | "search" | "settings" | "source" | null;
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

const DEFAULT_WORKSPACE = import.meta.env.VITE_DEFAULT_WORKSPACE ?? "";
const previewListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyExitListeners = new Set<(payload: { sessionId: string; exitCode: number; signal?: number }) => void>();
const previewAgentListeners = new Set<(payload: AgentEvent) => void>();
const previewPtySessions = new Map<string, { cwd: string; line: string; ready: boolean }>();
let previewWorkspace = DEFAULT_WORKSPACE || "Browser preview workspace";
const previewTasks: SavedTask[] = [];
const previewThreads: ResearchThreadDetail[] = [];
const previewCommands: WorkspaceSnapshot["commands"] = [];
const previewActions: AgentAction[] = [];

function previewSnapshot(): WorkspaceSnapshot {
  return {
    workspace: previewWorkspace,
    tasks: [...previewTasks].reverse(),
    threads: previewThreads.map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    commands: [...previewCommands].reverse(),
    actions: [...previewActions].reverse(),
  };
}

function emitPreviewAgentEvent(payload: AgentEvent) {
  for (const listener of previewAgentListeners) listener(payload);
}

const previewBridge = {
  ...previewLibraryBridge,
  chooseWorkspace: async () => DEFAULT_WORKSPACE || "Browser preview workspace",
  chooseContextPaths: async () => { throw new Error("Use the desktop app to choose local files and folders."); },
  listContextResources: async () => [],
  openWorkspace: async (workspacePath?: string) => {
    previewWorkspace = workspacePath || previewWorkspace;
    return previewSnapshot();
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
  runAgent: async ({ prompt, threadId, mode, contextItems }: { prompt: string; workspace: string; threadId?: string; mode: ResearchMode; contextItems?: ContextAttachment[] }) => {
    const now = new Date().toISOString();
    let thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      thread = { id: crypto.randomUUID(), title: prompt.slice(0, 72), mode, status: "running", context_summary: "", turn_count: 0, created_at: now, updated_at: now, last_turn_at: now, turns: [], messages: [] };
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
        payload: { path: "notes/agent-research-brief.md", content: "# Research brief\n\nThis artifact was proposed by the browser preview Agent.\n" },
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
  const [threads, setThreads] = useState<ResearchThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [researchMode, setResearchMode] = useState<ResearchMode>("idea-spark");
  const [contextItems, setContextItems] = useState<ContextAttachment[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([
    { name: "research-brief.md", kind: "artifact", body: "# Research brief\n\nFrame the open research question and link the evidence needed to answer it." },
    { name: "evidence-map.md", kind: "artifact", body: "# Evidence map\n\nTrack claims, source passages, and unresolved contradictions in the active literature set." },
    { name: "retrieval-gap.md", kind: "artifact", body: "# Retrieval gap\n\nIdentify where static retrieval budgets hide intermediate reasoning failures." },
    { name: "budget-ablation.yaml", kind: "experiment", body: "baseline: static-top-k\ntreatment: adaptive-budget\nmetrics: [accuracy, evidence_recall, tokens]" },
    { name: "metrics.py", kind: "experiment", body: "# Metrics entry point\n# Compute accuracy, evidence recall, token expenditure, and allocation entropy." },
  ]);
  const [selectedArtifact, setSelectedArtifact] = useState("evidence-map.md");
  const [papers, setPapers] = useState(initialPapers);
  const [modal, setModal] = useState<Modal>(null);
  const [artifactName, setArtifactName] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("retrieval budget reasoning");
  const [selectedSource, setSelectedSource] = useState("");
  const conversationEndRef = useRef<HTMLDivElement>(null);

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
      if (event.threadId) setRunningThreadId(event.threadId);
      if (event.type === "assistant_delta" && event.turnId && event.delta) {
        const streamId = `${event.turnId}:stream`;
        setMessages((current) => {
          const existing = current.find((message) => message.id === streamId);
          return existing
            ? current.map((message) => message.id === streamId ? { ...message, text: `${message.text}${event.delta}` } : message)
            : [...current, { id: streamId, role: "assistant", text: event.delta || "" }];
        });
        return;
      }
      if (event.type === "approval" && event.action) setPendingAction({ ...event.action, source: "agent" });
      const state = event.type === "complete" ? "done" : event.type === "configuration" || event.type === "failed" || event.type === "interrupted" ? "waiting" : "active";
      setEvents((current) => [...current.filter((item) => item.title !== event.title), { title: event.title, detail: event.detail, state }]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void loadWorkspace(DEFAULT_WORKSPACE);
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, agentBusy, pendingAction]);

  async function chooseWorkspace() {
    if (agentBusy) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) await loadWorkspace(selected);
  }

  async function loadWorkspace(workspacePath: string) {
    setWorkspaceReady(false);
    const snapshot = await desktopBridge.openWorkspace(workspacePath);
    setWorkspace(snapshot.workspace);
    setThreads(snapshot.threads);
    setWorkspaceReady(true);

    if (snapshot.threads.length) {
      const thread = await desktopBridge.getResearchThread(snapshot.threads[0].id, snapshot.workspace);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setActiveThreadId(thread.id);
      setResearchMode(thread.mode);
    } else {
      setMessages(initialMessages);
      setActiveThreadId(null);
    }

    const action = snapshot.actions.find((candidate) => candidate.status === "pending");
    setPendingAction(action ? { ...action, source: "agent" } : null);

  }

  function startNewTask() {
    if (agentBusy) return;
    setMainSection("chat");
    setActiveThreadId(null);
    setMessages(initialMessages);
    setPrompt("");
    setPendingAction(null);
    setContextItems([]);
  }

  async function openResearchThread(threadSummary: ResearchThread) {
    setMainSection("chat");
    const thread = await desktopBridge.getResearchThread(threadSummary.id, workspace);
    setActiveThreadId(thread.id);
    setMessages(thread.messages.length ? thread.messages : initialMessages);
    setResearchMode(thread.mode);
    const action = thread.turns.map((turn) => turn.task_id).filter(Boolean);
    setPendingAction((current) => current && action.includes(current.task_id) ? current : null);
  }

  async function submitPrompt() {
    const question = prompt.trim();
    if (!question || agentBusy) return;
    const submittedContext = contextItems;

    setPrompt("");
    setAgentBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    setEvents((current) => [
      ...current.filter((event) => event.title !== "Evidence synthesis"),
      { title: "Evidence synthesis", detail: "Reading workspace and knowledge context", state: "active" },
    ]);

    try {
      const result = await desktopBridge.runAgent({ prompt: question, workspace, threadId: activeThreadId || undefined, mode: researchMode, contextItems: submittedContext });
      setMessages(result.thread.messages.length ? result.thread.messages : initialMessages);
      setActiveThreadId(result.threadId);
      setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)]);
      setEvents((current) => current.map((event) => event.title === "Evidence synthesis" ? { ...event, detail: "Turn saved to this research thread", state: "done" } : event));
      const proposedAction = result.actions.find((action) => action.status === "pending");
      if (proposedAction) setPendingAction({ ...proposedAction, source: "agent" });
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

  async function runCommand(command: string) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand || runningSession) return;
    setTerminalOpen(true);
    try {
      const { sessionId } = await desktopBridge.runTerminal({ command: trimmedCommand, cwd: workspace });
      setRunningSession(sessionId);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `The command could not start: ${String(error)}` }]);
    }
  }

  function openArtifact(name: string) {
    setSelectedArtifact(name);
    setMainSection("artifacts");
  }

  function createArtifact() {
    const name = artifactName.trim();
    if (!name) return;
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;
    setArtifacts((current) => [...current, { name: normalizedName, kind: "artifact", body: `# ${normalizedName.replace(/\.md$/, "")}\n\nStart writing your research note here.` }]);
    setArtifactName("");
    setModal(null);
    openArtifact(normalizedName);
  }

  function updateArtifactBody(body: string) {
    setArtifacts((current) => current.map((artifact) => artifact.name === selectedArtifact ? { ...artifact, body } : artifact));
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
        await runCommand(action.payload.command);
      } else if (action.kind === "write" && action.payload.path) {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Approved and wrote ${action.payload.path}.` }]);
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
  const activeArtifact = artifacts.find((artifact) => artifact.name === selectedArtifact);
  const mainTitle = mainSection === "chat" ? activeThread?.title ?? "New research task" : mainSection === "library" ? "Literature library" : mainSection === "daily" ? "Daily papers" : "Artifacts";

  return (
    <main className="codex-shell">
      <aside className="codex-sidebar" aria-label="Archimedes navigation">
        <div className="codex-brand">
          <span className="codex-brand-mark"><Sparkles size={16} /></span>
          <strong>Archimedes</strong>
        </div>

        <button className="new-task-button" onClick={startNewTask} title="New task" disabled={agentBusy}>
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
            <Folder size={16} /><span>Artifacts</span><span className="nav-count">{artifacts.length}</span>
          </button>
        </section>

        <section className="sidebar-group recent-group">
          <div className="codex-sidebar-label">Recent</div>
          <div className="recent-task-list">
            {threads.slice(0, 8).map((thread) => (
              <button className={activeThreadId === thread.id && mainSection === "chat" ? "recent-task active" : "recent-task"} key={thread.id} onClick={() => void openResearchThread(thread)} title={thread.title} disabled={agentBusy}>
                <span>{thread.title}</span>
              </button>
            ))}
            {workspaceReady && threads.length === 0 && <div className="recent-empty">No research chats yet</div>}
          </div>
        </section>

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
            {mainSection === "chat" && <button className="quiet-icon-button" onClick={() => setModal("settings")} title="Agent settings"><Bot size={17} /></button>}
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
            />
          )}
          {(mainSection === "library" || mainSection === "daily") && <LibraryView bridge={desktopBridge} mode={mainSection} />}
          {mainSection === "artifacts" && (
            <ArtifactsView artifacts={artifacts} activeArtifact={activeArtifact} selectedArtifact={selectedArtifact} onOpenArtifact={openArtifact} onNewArtifact={() => setModal("artifact")} onChangeBody={updateArtifactBody} />
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
        onCreateArtifact={createArtifact}
        onAddEvidence={addEvidence}
      />
    </main>
  );
}

function ConversationView({ messages, events, prompt, workspace, agentBusy, canInterrupt, pendingAction, conversationEndRef, researchMode, contextItems, onPrompt, onSubmit, onInterrupt, onResearchMode, onAddContext, onRemoveContext, onSourceOpen, onApprove, onReject }: {
  messages: Message[];
  events: TimelineEvent[];
  prompt: string;
  workspace: string;
  agentBusy: boolean;
  canInterrupt: boolean;
  pendingAction: PendingAction | null;
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

        {agentBusy && <div className="conversation-running"><span className="assistant-mark"><Sparkles size={15} /></span><div><strong>{latestEvent?.title ?? "Archimedes is working"}</strong><small>{latestEvent?.detail ?? "Reading research context"}</small><div className="agent-typing"><span /><span /><span /></div></div></div>}

        {pendingAction && (
          <section className="conversation-approval">
            <div className="approval-icon">{pendingAction.kind === "write" ? <FileText size={16} /> : <SquareTerminal size={16} />}</div>
            <div className="approval-content">
              <span>{pendingAction.kind === "write" ? "File write requires approval" : "Command requires approval"}</span>
              <code>{pendingAction.kind === "write" ? pendingAction.payload.path : pendingAction.payload.command}</code>
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

function ArtifactsView({ artifacts, activeArtifact, selectedArtifact, onOpenArtifact, onNewArtifact, onChangeBody }: {
  artifacts: Artifact[];
  activeArtifact?: Artifact;
  selectedArtifact: string;
  onOpenArtifact: (name: string) => void;
  onNewArtifact: () => void;
  onChangeBody: (body: string) => void;
}) {
  return <div className="artifacts-page">
    <header className="artifacts-header">
      <div><span className="page-kicker">Knowledge</span><h1>Artifacts</h1><p>Research notes, paper drafts, experiment configs, and code attached to this workspace.</p></div>
      <button className="primary-button" onClick={onNewArtifact}><Plus size={15} />New artifact</button>
    </header>
    <div className="artifacts-workspace">
      <aside className="artifact-browser">
        <ArtifactGroup title="paper" icon={<FileText size={14} />} artifacts={artifacts.filter((artifact) => artifact.kind === "artifact")} selectedArtifact={selectedArtifact} onOpenArtifact={onOpenArtifact} />
        <ArtifactGroup title="code" icon={<Code2 size={14} />} artifacts={artifacts.filter((artifact) => artifact.kind === "experiment")} selectedArtifact={selectedArtifact} onOpenArtifact={onOpenArtifact} />
      </aside>
      <section className="artifact-editor">
        {activeArtifact ? <><div className="artifact-editor-header"><span>{activeArtifact.kind === "artifact" ? <FileText size={15} /> : <Code2 size={15} />}</span><strong>{activeArtifact.name}</strong><small>Local draft</small></div><textarea value={activeArtifact.body} onChange={(event) => onChangeBody(event.target.value)} spellCheck={false} aria-label={`Edit ${activeArtifact.name}`} /></> : <div className="artifact-empty">Choose an artifact to open it.</div>}
      </section>
    </div>
  </div>;
}

function ArtifactGroup({ title, icon, artifacts, selectedArtifact, onOpenArtifact }: { title: string; icon: React.ReactNode; artifacts: Artifact[]; selectedArtifact: string; onOpenArtifact: (name: string) => void }) {
  return <div className="artifact-group">
    <div className="artifact-group-title"><ChevronDown size={13} />{icon}<span>{title}</span></div>
    {artifacts.map((artifact) => <button className={artifact.name === selectedArtifact ? "artifact-browser-row active" : "artifact-browser-row"} key={artifact.name} onClick={() => onOpenArtifact(artifact.name)}><span>{artifact.kind === "artifact" ? <FileText size={14} /> : <Code2 size={14} />}</span><strong>{artifact.name}</strong></button>)}
  </div>;
}

function WorkspaceModal({ modal, artifactName, evidenceTitle, evidenceUrl, searchQuery, selectedSource, onArtifactName, onEvidenceTitle, onEvidenceUrl, onSearchQuery, onClose, onCreateArtifact, onAddEvidence }: { modal: Modal; artifactName: string; evidenceTitle: string; evidenceUrl: string; searchQuery: string; selectedSource: string; onArtifactName: (value: string) => void; onEvidenceTitle: (value: string) => void; onEvidenceUrl: (value: string) => void; onSearchQuery: (value: string) => void; onClose: () => void; onCreateArtifact: () => void; onAddEvidence: () => void }) {
  if (!modal) return null;
  const firstTerm = searchQuery.toLowerCase().trim().split(" ")[0];
  const previewResults = initialPapers.filter((paper) => !firstTerm || paper.title.toLowerCase().includes(firstTerm));
  const title = modal === "artifact" ? "New research artifact" : modal === "evidence" ? "Add evidence" : modal === "search" ? "Search research" : modal === "settings" ? "Agent settings" : "Source record";

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="workspace-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Archimedes workspace</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    {modal === "artifact" && <><p>Create a session draft, then select it from the left workspace tree.</p><label>Artifact name<input autoFocus value={artifactName} onChange={(event) => onArtifactName(event.target.value)} placeholder="literature-gap.md" onKeyDown={(event) => event.key === "Enter" && onCreateArtifact()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreateArtifact}><Plus size={14} />Create draft</button></div></>}
    {modal === "evidence" && <><p>Add a paper, dataset, or web source to the current evidence ledger.</p><label>Title<input autoFocus value={evidenceTitle} onChange={(event) => onEvidenceTitle(event.target.value)} placeholder="Paper or source title" /></label><label>URL or citation<input value={evidenceUrl} onChange={(event) => onEvidenceUrl(event.target.value)} placeholder="https://... or Author et al., 2025" onKeyDown={(event) => event.key === "Enter" && onAddEvidence()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add evidence</button></div></>}
    {modal === "search" && <><p>Search is a local preview catalogue for now; choose a result, then add it to the evidence ledger.</p><label>Research query<input autoFocus value={searchQuery} onChange={(event) => onSearchQuery(event.target.value)} /></label><div className="search-results">{previewResults.length ? previewResults.map((paper) => <button key={paper.title} className="search-result" onClick={() => { onEvidenceTitle(paper.title); onEvidenceUrl(`${paper.meta} · preview catalogue`); }}><Search size={15} /><span>{paper.title}</span><Plus size={14} /></button>) : <p>No local preview matches. Use Add evidence to enter a source manually.</p>}</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add selected</button></div></>}
    {modal === "settings" && <><p>Model credentials stay outside the renderer. Configure an OpenAI-compatible model in <code>.env.local</code>, then restart the desktop app.</p><div className="settings-list"><code>ARCHIMEDES_LLM_API_KEY</code><code>ARCHIMEDES_LLM_BASE_URL</code><code>ARCHIMEDES_LLM_MODEL</code></div><div className="modal-actions"><button className="primary-button" onClick={onClose}>Done</button></div></>}
    {modal === "source" && <><p><strong>{selectedSource}</strong></p><p>This is a linked-source detail placeholder. The next data layer will persist a citation, source URL, extracted passage, and its connection to a claim.</p><div className="modal-actions"><button className="primary-button" onClick={onClose}>Close record</button></div></>}
  </section></div>;
}

export default App;
