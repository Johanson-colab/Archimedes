import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Beaker,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  Lightbulb,
  PanelBottom,
  PenLine,
  Play,
  Plus,
  Scale,
  Search,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
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
    text: "我已经整理了当前研究问题的证据脉络。现有文献普遍报告最终准确率，但很少隔离检索预算如何影响推理质量。",
    sources: ["Rao et al., §4.2", "Kim et al., Table 3"],
  },
];

const DEFAULT_WORKSPACE = import.meta.env.VITE_DEFAULT_WORKSPACE ?? "";
const previewListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewAgentListeners = new Set<(payload: AgentEvent) => void>();
let previewWorkspace = DEFAULT_WORKSPACE || "Browser preview workspace";
const previewTasks: SavedTask[] = [];
const previewCommands: WorkspaceSnapshot["commands"] = [];
const previewActions: AgentAction[] = [];

function previewSnapshot(): WorkspaceSnapshot {
  return { workspace: previewWorkspace, tasks: [...previewTasks].reverse(), commands: [...previewCommands].reverse(), actions: [...previewActions].reverse() };
}

function emitPreviewAgentEvent(payload: AgentEvent) {
  for (const listener of previewAgentListeners) listener(payload);
}

const previewBridge = {
  chooseWorkspace: async () => DEFAULT_WORKSPACE || "Browser preview workspace",
  openWorkspace: async (workspacePath?: string) => {
    previewWorkspace = workspacePath || previewWorkspace;
    return previewSnapshot();
  },
  saveTask: async ({ prompt, response, status = "completed" }: { prompt: string; response: string; status?: string }) => {
    const task = { id: crypto.randomUUID(), prompt, response, status, created_at: new Date().toISOString() };
    previewTasks.push(task);
    return task;
  },
  runAgent: async ({ prompt }: { prompt: string; workspace: string }) => {
    emitPreviewAgentEvent({ type: "status", title: "Research task started", detail: "Browser preview Agent" });
    const actions: AgentAction[] = [];
    if (/(write|draft|note|生成|写入)/i.test(prompt)) {
      const action: AgentAction = {
        id: crypto.randomUUID(), task_id: crypto.randomUUID(), kind: "write",
        payload: { path: "notes/agent-research-brief.md", content: "# Research brief\n\nThis artifact was proposed by the browser preview Agent.\n" },
        status: "pending", created_at: new Date().toISOString(), resolved_at: null,
      };
      previewActions.push(action);
      actions.push(action);
      emitPreviewAgentEvent({ type: "tool", title: "write artifact", detail: "Prepared a draft for approval" });
    }
    const response = "Preview Agent: I reviewed the active research workspace and framed the request as an evidence-backed next step. In the desktop app, this same request will use your configured model and restricted workspace tools.";
    const task = { id: crypto.randomUUID(), prompt, response, status: "completed", created_at: new Date().toISOString() };
    previewTasks.push(task);
    emitPreviewAgentEvent({ type: "complete", title: "Research task complete", detail: `${actions.length} approval item${actions.length === 1 ? "" : "s"}` });
    return { taskId: task.id, response, status: "completed", actions };
  },
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
  onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => {
    previewListeners.add(callback);
    return () => previewListeners.delete(callback);
  },
  onAgentEvent: (callback: (payload: AgentEvent) => void) => {
    previewAgentListeners.add(callback);
    return () => previewAgentListeners.delete(callback);
  },
};

const desktopBridge = window.researchDesk ?? previewBridge;

function App() {
  const [activeView, setActiveView] = useState<"evidence" | "draft" | "plan">("evidence");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [prompt, setPrompt] = useState("");
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [savedTaskCount, setSavedTaskCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [terminalInput, setTerminalInput] = useState("git status --short");
  const [terminalLog, setTerminalLog] = useState("Axiom terminal ready.\n");
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
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
  const [activeWorkflow, setActiveWorkflow] = useState("idea-generation");
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const unsubscribe = desktopBridge.onTerminalData(({ sessionId, data }) => {
      setTerminalLog((current) => current + data);
      if (sessionId === runningSession && data.includes("[process exited")) setRunningSession(null);
    });
    return unsubscribe;
  }, [runningSession]);

  useEffect(() => {
    const unsubscribe = desktopBridge.onAgentEvent((event) => {
      const state = event.type === "complete" ? "done" : event.type === "configuration" || event.type === "failed" ? "waiting" : "active";
      setEvents((current) => [...current.filter((item) => item.title !== event.title), { title: event.title, detail: event.detail, state }]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void loadWorkspace(DEFAULT_WORKSPACE);
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [terminalLog]);

  async function chooseWorkspace() {
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) await loadWorkspace(selected);
  }

  async function loadWorkspace(workspacePath: string) {
    setWorkspaceReady(false);
    const snapshot = await desktopBridge.openWorkspace(workspacePath);
    setWorkspace(snapshot.workspace);
    setSavedTaskCount(snapshot.tasks.length);
    setWorkspaceReady(true);

    if (snapshot.tasks.length) {
      const restoredMessages = [...snapshot.tasks].reverse().flatMap((task) => [
        { id: `${task.id}-prompt`, role: "user" as const, text: task.prompt },
        { id: `${task.id}-response`, role: "assistant" as const, text: task.response },
      ]);
      setMessages([...initialMessages, ...restoredMessages]);
    }

    if (snapshot.commands.length) {
      const previousOutput = [...snapshot.commands].reverse()
        .slice(-5)
        .map((run) => `$ ${run.command}\n${run.output}`)
        .join("\n");
      if (previousOutput) setTerminalLog(`Axiom terminal history\n\n${previousOutput}\n`);
    }

    const action = snapshot.actions.find((candidate) => candidate.status === "pending");
    setPendingAction(action ? { ...action, source: "agent" } : null);
  }

  async function submitPrompt() {
    const question = prompt.trim();
    if (!question || agentBusy) return;

    setPrompt("");
    setAgentBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    setEvents((current) => [
      ...current.filter((event) => event.title !== "Evidence synthesis"),
      { title: "Evidence synthesis", detail: "Reading attached research context", state: "active" },
    ]);

    try {
      const result = await desktopBridge.runAgent({ prompt: question, workspace });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.response,
        },
      ]);
      setEvents((current) =>
        current.map((event) =>
          event.title === "Evidence synthesis"
            ? { ...event, detail: result.status === "completed" ? "Task record saved" : "Task saved with follow-up needed", state: result.status === "completed" ? "done" : "waiting" }
            : event,
        ),
      );
      const proposedAction = result.actions.find((action) => action.status === "pending");
      if (proposedAction) setPendingAction({ ...proposedAction, source: "agent" });
      setSavedTaskCount((count) => count + 1);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Axiom could not start this task: ${String(error)}` }]);
    } finally {
      setAgentBusy(false);
    }
  }

  async function runCommand(command: string) {
    setTerminalLog((current) => `${current}\n$ ${command}\n`);
    try {
      const { sessionId } = await desktopBridge.runTerminal({ command, cwd: workspace });
      setRunningSession(sessionId);
      setEvents((current) => [
        ...current.filter((event) => event.title !== "Workspace check"),
        { title: "Workspace check", detail: command, state: "active" },
      ]);
    } catch (error) {
      setTerminalLog((current) => `${current}[could not start] ${String(error)}\n`);
    }
  }

  function requestCommandApproval(command: string) {
    setPendingAction({
      id: crypto.randomUUID(), task_id: "manual", kind: "command", payload: { command, cwd: workspace },
      status: "pending", created_at: new Date().toISOString(), resolved_at: null, source: "manual",
    });
  }

  function openArtifact(name: string) {
    setSelectedArtifact(name);
    setActiveView("draft");
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

  function addEvidence(title = evidenceTitle, url = evidenceUrl) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setPapers((current) => [...current, { title: trimmedTitle, meta: url.trim() || "Manually added source", score: "New" }]);
    setEvidenceTitle("");
    setEvidenceUrl("");
    setModal(null);
  }

  function focusTerminal() {
    document.querySelector(".terminal-pane")?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.setTimeout(() => terminalInputRef.current?.focus(), 240);
  }

  function reviewExecution() {
    requestCommandApproval("python -m experiments.run --config budget-ablation.yaml");
    setEvents((current) => [...current.filter((event) => event.title !== "Experiment execution"), { title: "Experiment execution", detail: "Command prepared for your approval", state: "waiting" }]);
  }

  function startWorkflow(stage: string) {
    setActiveWorkflow(stage);
    if (stage === "idea-generation") {
      setPrompt("Generate several research ideas grounded in the active evidence ledger.");
    } else if (stage === "idea-review") {
      setPrompt("Review the active research idea for novelty, feasibility, operability, and impact.");
    } else if (stage === "experiment") {
      setActiveView("plan");
    } else if (stage === "writing") {
      openArtifact("research-brief.md");
    } else if (stage === "review") {
      setPrompt("Review the active manuscript like a strict conference reviewer and list actionable revisions.");
    }
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span>Axiom</div>
        <button className="workspace-picker" onClick={chooseWorkspace} title="Choose workspace">
          <FolderOpen size={15} />
          <span>{workspace}</span>
          <ChevronDown size={14} />
        </button>
        <div className="topbar-actions">
          <span className="sync-state"><span className="status-dot" />{workspaceReady ? `${savedTaskCount} saved task${savedTaskCount === 1 ? "" : "s"}` : "Opening workspace"}</span>
          <button className="icon-button" onClick={() => setModal("artifact")} title="New research artifact"><Plus size={17} /></button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="sidebar" aria-label="Research navigation">
          <div className="sidebar-section">
            <div className="sidebar-label">Knowledge</div>
            <button className="project-row active"><CircleDot size={15} /><span>Adaptive retrieval</span></button>
            <button className="sidebar-command" onClick={() => setModal("search")}><BookOpen size={15} /><span>Literature library</span></button>
            <button className="sidebar-command" onClick={() => { setSearchQuery(""); setModal("search"); }}><CalendarDays size={15} /><span>Daily papers</span></button>
          </div>
          <div className="tree-section">
            <div className="tree-heading"><ChevronDown size={14} />Artifacts</div>
            <div className="artifact-paper">
              <div className="artifact-paper-title"><FolderOpen size={14} /><span>adaptive-retrieval</span></div>
              <div className="artifact-folder">
                <div className="artifact-folder-title"><ChevronDown size={13} /><Folder size={14} /><span>paper</span></div>
                {artifacts.filter((artifact) => artifact.kind === "artifact").map((artifact) => <button className={selectedArtifact === artifact.name ? "tree-row artifact-file selected" : "tree-row artifact-file"} key={artifact.name} onClick={() => openArtifact(artifact.name)}><FileText size={14} /><span>{artifact.name}</span></button>)}
              </div>
              <div className="artifact-folder">
                <div className="artifact-folder-title"><ChevronDown size={13} /><Folder size={14} /><span>code</span></div>
                {artifacts.filter((artifact) => artifact.kind === "experiment").map((artifact) => <button className={selectedArtifact === artifact.name ? "tree-row artifact-file selected" : "tree-row artifact-file"} key={artifact.name} onClick={() => openArtifact(artifact.name)}><Code2 size={14} /><span>{artifact.name}</span></button>)}
              </div>
            </div>
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-label">Research workflow</div>
            <button className={activeWorkflow === "idea-generation" ? "workflow-step active" : "workflow-step"} onClick={() => startWorkflow("idea-generation")}><span>01</span><Lightbulb size={15} />Idea generation</button>
            <button className={activeWorkflow === "idea-review" ? "workflow-step active" : "workflow-step"} onClick={() => startWorkflow("idea-review")}><span>02</span><Scale size={15} />Idea review</button>
            <button className={activeWorkflow === "experiment" ? "workflow-step active" : "workflow-step"} onClick={() => startWorkflow("experiment")}><span>03</span><Beaker size={15} />Experiment setup</button>
            <button className={activeWorkflow === "writing" ? "workflow-step active" : "workflow-step"} onClick={() => startWorkflow("writing")}><span>04</span><PenLine size={15} />Paper writing</button>
            <button className={activeWorkflow === "review" ? "workflow-step active" : "workflow-step"} onClick={() => startWorkflow("review")}><span>05</span><FileCheck2 size={15} />Paper review</button>
            <button className="sidebar-command terminal-shortcut" onClick={focusTerminal}><SquareTerminal size={15} /><span>Open terminal</span></button>
          </div>
        </aside>

        <section className="content-pane">
          <div className="content-header">
            <div className="question-heading">
              <div className="eyebrow"><span className="research-id">RAG-042</span> Research question</div>
              <h1>How should retrieval budget be allocated during long-context reasoning?</h1>
              <div className="question-meta"><span>Updated 8 min ago</span><span>12 linked papers</span><span>38 evidence spans</span></div>
            </div>
            <div className="view-tabs" role="tablist">
              <button className={activeView === "evidence" ? "tab active" : "tab"} onClick={() => setActiveView("evidence")}>Evidence</button>
              <button className={activeView === "draft" ? "tab active" : "tab"} onClick={() => setActiveView("draft")}>Draft</button>
              <button className={activeView === "plan" ? "tab active" : "tab"} onClick={() => setActiveView("plan")}>Plan</button>
            </div>
          </div>

          <div className="research-summary">
            <div><span>Core claim</span><strong>Adaptive allocation over static top-k</strong></div>
            <div><span>Open question</span><strong>When does extra retrieval stop helping?</strong></div>
            <div><span>Next gate</span><strong className="pending-text">Approve baseline run</strong></div>
          </div>

          {activeView === "evidence" && <EvidenceView papers={papers} onAddEvidence={() => setModal("evidence")} onSourceOpen={setSelectedSource} />}
          {activeView === "draft" && <DraftView artifact={artifacts.find((artifact) => artifact.name === selectedArtifact)} onSourceOpen={setSelectedSource} />}
          {activeView === "plan" && <PlanView onReviewExecution={reviewExecution} />}
        </section>

        <aside className="agent-pane" aria-label="Research agent">
          <div className="agent-header">
            <div className="agent-title"><span className="agent-avatar"><Bot size={17} /></span><div><strong>Research agent</strong><span>Evidence-aware</span></div></div>
            <button className="icon-button" onClick={() => setModal("settings")} title="Agent settings"><ChevronRight size={17} /></button>
          </div>

          <div className="context-strip"><ShieldCheck size={14} />12 papers · 38 evidence spans · 2 files attached</div>
          <div className="agent-activity">
            {events.slice(-3).map((event) => <div className={`activity-item ${event.state}`} key={`${event.title}-${event.detail}`}><span /><div><strong>{event.title}</strong><small>{event.detail}</small></div></div>)}
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-role">{message.role === "assistant" ? "Research agent" : "You"}</div>
                <p>{message.text}</p>
                {message.sources && <div className="source-chips">{message.sources.map((source) => <button key={source} onClick={() => setSelectedSource(source)}>{source}</button>)}</div>}
              </article>
            ))}
            {agentBusy && <div className="agent-typing"><span /><span /><span /></div>}
          </div>

          {pendingAction && (
            <section className="approval-card">
              <div className="approval-icon">{pendingAction.kind === "write" ? <FileText size={16} /> : <SquareTerminal size={16} />}</div>
              <div className="approval-content">
                <span>{pendingAction.kind === "write" ? "File write requires approval" : "Command requires approval"}</span>
                <code>{pendingAction.kind === "write" ? pendingAction.payload.path : pendingAction.payload.command}</code>
                {pendingAction.kind === "write" && pendingAction.payload.content && <pre className="proposal-preview">{pendingAction.payload.content.slice(0, 260)}</pre>}
                <p>{pendingAction.kind === "write" ? "Writes this artifact into the selected workspace." : "Runs in the selected workspace and records its output."}</p>
                <div className="approval-actions">
                  <button className="secondary-button" onClick={() => void rejectPendingAction()}><X size={14} />Dismiss</button>
                  <button className="primary-button" onClick={() => void approvePendingAction()}>{pendingAction.kind === "write" ? <Check size={14} /> : <Play size={14} />}{pendingAction.kind === "write" ? "Apply" : "Run"}</button>
                </div>
              </div>
            </section>
          )}

          <div className="composer">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder="Ask about the research workspace"
              rows={3}
            />
            <div className="composer-footer"><span><Plus size={14} />Attach context</span><button className="send-button" onClick={submitPrompt} disabled={!prompt.trim() || agentBusy} title="Send"><SendHorizontal size={16} /></button></div>
          </div>
        </aside>
      </section>

      <section className="terminal-pane">
          <div className="terminal-header"><div><PanelBottom size={15} />Terminal <span>Workspace session</span></div><div className="terminal-actions"><button className="icon-button" title="Clear terminal" onClick={() => setTerminalLog("")}>Clear</button>{runningSession && <button className="icon-button danger" title="Stop process" onClick={() => desktopBridge.stopTerminal(runningSession)}><X size={15} /></button>}</div></div>
        <pre className="terminal-output" ref={terminalRef}>{terminalLog}</pre>
        <div className="terminal-command"><span>$</span><input ref={terminalInputRef} value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && terminalInput.trim()) requestCommandApproval(terminalInput.trim()); }} aria-label="Terminal command" /><button className="icon-button" title="Review command" onClick={() => terminalInput.trim() && requestCommandApproval(terminalInput.trim())}><ArrowUp size={16} /></button></div>
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

function EvidenceView({ papers, onAddEvidence, onSourceOpen }: { papers: typeof initialPapers; onAddEvidence: () => void; onSourceOpen: (source: string) => void }) {
  return <div className="evidence-view">
    <section className="claim-panel">
      <div className="panel-kicker"><Lightbulb size={15} />Candidate gap</div>
      <h2>Retrieval budgets are often treated as a fixed hyperparameter instead of a reasoning decision.</h2>
      <p>Across the current reading set, final accuracy is usually reported without exposing how retrieval volume changes at each intermediate reasoning step.</p>
      <div className="claim-footer"><span><Check size={14} />Grounded in 3 sources</span><button onClick={() => onSourceOpen("Candidate gap claim record")}>Open claim record <ChevronRight size={14} /></button></div>
    </section>
    <section className="evidence-grid">
      <div className="section-heading"><div><span className="eyebrow">Linked sources</span><h2>Evidence ledger</h2></div><button className="outline-button" onClick={onAddEvidence}><Plus size={14} />Add evidence</button></div>
      <div className="paper-list">
        {papers.map((paper, index) => <article className="paper-row" key={paper.title}><div className="paper-index">0{index + 1}</div><div className="paper-copy"><h3>{paper.title}</h3><p>{paper.meta}</p><blockquote>“Evaluation focuses on aggregate task outcomes rather than allocation behavior during intermediate reasoning.”</blockquote></div><div className="relevance"><span>Relevance</span><strong>{paper.score}</strong></div></article>)}
      </div>
    </section>
  </div>;
}

function DraftView({ artifact, onSourceOpen }: { artifact?: Artifact; onSourceOpen: (source: string) => void }) {
  return <section className="document-view"><div className="document-meta">{artifact?.kind === "experiment" ? "experiments" : "drafts"}/{artifact?.name ?? "method.md"} · local draft</div><h2>{artifact?.name?.replace(/\.(md|yaml|py)$/, "") ?? "Adaptive retrieval allocation"}</h2><p>{artifact?.body ?? "Select an artifact from the workspace to inspect its local draft."}</p><h3>Claim trace</h3><div className="inline-citation"><BookOpen size={15} />This framing is motivated by evidence gaps identified in the active literature set.<button onClick={() => onSourceOpen("3 linked sources")}>3 linked sources</button></div><p>Browser preview keeps this draft in the current session. In the desktop build, artifact creation will be routed through the same approval boundary before it writes to disk.</p></section>;
}

function PlanView({ onReviewExecution }: { onReviewExecution: () => void }) {
  return <section className="plan-view"><div className="section-heading"><div><span className="eyebrow">Experiment</span><h2>Budget allocation ablation</h2></div><span className="status-label"><Clock3 size={14} />Awaiting approval</span></div><div className="plan-table"><div><span>Baseline</span><strong>Static top-k retrieval</strong></div><div><span>Treatment</span><strong>Adaptive budget policy</strong></div><div><span>Metrics</span><strong>Accuracy · evidence recall · tokens</strong></div><div><span>Artifacts</span><strong>trace.jsonl · metrics.csv · plot.png</strong></div></div><button className="primary-button" onClick={onReviewExecution}><Play size={15} />Review execution</button></section>;
}

function WorkspaceModal({ modal, artifactName, evidenceTitle, evidenceUrl, searchQuery, selectedSource, onArtifactName, onEvidenceTitle, onEvidenceUrl, onSearchQuery, onClose, onCreateArtifact, onAddEvidence }: { modal: Modal; artifactName: string; evidenceTitle: string; evidenceUrl: string; searchQuery: string; selectedSource: string; onArtifactName: (value: string) => void; onEvidenceTitle: (value: string) => void; onEvidenceUrl: (value: string) => void; onSearchQuery: (value: string) => void; onClose: () => void; onCreateArtifact: () => void; onAddEvidence: () => void }) {
  if (!modal) return null;
  const firstTerm = searchQuery.toLowerCase().trim().split(" ")[0];
  const previewResults = initialPapers.filter((paper) => !firstTerm || paper.title.toLowerCase().includes(firstTerm));
  const title = modal === "artifact" ? "New research artifact" : modal === "evidence" ? "Add evidence" : modal === "search" ? "Search research" : modal === "settings" ? "Agent settings" : "Source record";

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="workspace-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Axiom workspace</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    {modal === "artifact" && <><p>Create a session draft, then select it from the left workspace tree.</p><label>Artifact name<input autoFocus value={artifactName} onChange={(event) => onArtifactName(event.target.value)} placeholder="literature-gap.md" onKeyDown={(event) => event.key === "Enter" && onCreateArtifact()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreateArtifact}><Plus size={14} />Create draft</button></div></>}
    {modal === "evidence" && <><p>Add a paper, dataset, or web source to the current evidence ledger.</p><label>Title<input autoFocus value={evidenceTitle} onChange={(event) => onEvidenceTitle(event.target.value)} placeholder="Paper or source title" /></label><label>URL or citation<input value={evidenceUrl} onChange={(event) => onEvidenceUrl(event.target.value)} placeholder="https://... or Author et al., 2025" onKeyDown={(event) => event.key === "Enter" && onAddEvidence()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add evidence</button></div></>}
    {modal === "search" && <><p>Search is a local preview catalogue for now; choose a result, then add it to the evidence ledger.</p><label>Research query<input autoFocus value={searchQuery} onChange={(event) => onSearchQuery(event.target.value)} /></label><div className="search-results">{previewResults.length ? previewResults.map((paper) => <button key={paper.title} className="search-result" onClick={() => { onEvidenceTitle(paper.title); onEvidenceUrl(`${paper.meta} · preview catalogue`); }}><Search size={15} /><span>{paper.title}</span><Plus size={14} /></button>) : <p>No local preview matches. Use Add evidence to enter a source manually.</p>}</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add selected</button></div></>}
    {modal === "settings" && <><p>Model credentials stay outside the renderer. Configure an OpenAI-compatible model in <code>.env.local</code>, then restart the desktop app.</p><div className="settings-list"><code>AXIOM_LLM_API_KEY</code><code>AXIOM_LLM_BASE_URL</code><code>AXIOM_LLM_MODEL</code></div><div className="modal-actions"><button className="primary-button" onClick={onClose}>Done</button></div></>}
    {modal === "source" && <><p><strong>{selectedSource}</strong></p><p>This is a linked-source detail placeholder. The next data layer will persist a citation, source URL, extracted passage, and its connection to a claim.</p><div className="modal-actions"><button className="primary-button" onClick={onClose}>Close record</button></div></>}
  </section></div>;
}

export default App;
