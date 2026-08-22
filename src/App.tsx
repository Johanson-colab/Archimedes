import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Beaker,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  FileText,
  FolderOpen,
  Lightbulb,
  PanelBottom,
  Play,
  Plus,
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

const papers = [
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
let previewWorkspace = DEFAULT_WORKSPACE || "Browser preview workspace";
const previewTasks: SavedTask[] = [];
const previewCommands: WorkspaceSnapshot["commands"] = [];

function previewSnapshot(): WorkspaceSnapshot {
  return { workspace: previewWorkspace, tasks: [...previewTasks].reverse(), commands: [...previewCommands].reverse() };
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
  const [pendingCommand, setPendingCommand] = useState<string | null>("git status --short");
  const [terminalInput, setTerminalInput] = useState("git status --short");
  const [terminalLog, setTerminalLog] = useState("Axiom terminal ready.\n");
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const terminalRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const unsubscribe = desktopBridge.onTerminalData(({ sessionId, data }) => {
      setTerminalLog((current) => current + data);
      if (sessionId === runningSession && data.includes("[process exited")) setRunningSession(null);
    });
    return unsubscribe;
  }, [runningSession]);

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
  }

  function submitPrompt() {
    const question = prompt.trim();
    if (!question || agentBusy) return;

    setPrompt("");
    setAgentBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: question }]);
    setEvents((current) => [
      ...current.filter((event) => event.title !== "Evidence synthesis"),
      { title: "Evidence synthesis", detail: "Reading attached research context", state: "active" },
    ]);

    window.setTimeout(() => {
      const response = "我会把这个问题收敛成可验证的假设：在固定总 token 预算下，比较静态检索和自适应检索对长上下文推理的影响。实验应记录每步检索量、引用证据和最终任务指标，而不仅仅看最终准确率。";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: response,
          sources: ["Rao et al., §4.2", "Kim et al., Table 3", "Current research brief"],
        },
      ]);
      setEvents((current) =>
        current.map((event) =>
          event.title === "Evidence synthesis"
            ? { ...event, detail: "3 sources linked to the hypothesis", state: "done" }
            : event,
        ),
      );
      setPendingCommand("git status --short");
      setAgentBusy(false);
      void desktopBridge.saveTask({ prompt: question, response }).then(() => setSavedTaskCount((count) => count + 1));
    }, 850);
  }

  async function runCommand(command: string) {
    setTerminalLog((current) => `${current}\n$ ${command}\n`);
    setPendingCommand(null);
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
          <button className="icon-button" title="New research artifact"><Plus size={17} /></button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="sidebar" aria-label="Research navigation">
          <div className="sidebar-label">Research space</div>
          <button className="project-row active"><CircleDot size={15} /><span>Long-context retrieval</span></button>
          <div className="tree-section">
            <div className="tree-heading"><ChevronDown size={14} />Artifacts</div>
            <button className="tree-row"><FileText size={14} /><span>research-brief.md</span></button>
            <button className="tree-row selected"><BookOpen size={14} /><span>evidence-map.md</span></button>
            <button className="tree-row"><Lightbulb size={14} /><span>retrieval-gap.md</span></button>
          </div>
          <div className="tree-section">
            <div className="tree-heading"><ChevronDown size={14} />Experiments</div>
            <button className="tree-row"><Beaker size={14} /><span>budget-ablation.yaml</span></button>
            <button className="tree-row"><Code2 size={14} /><span>metrics.py</span></button>
          </div>
          <div className="sidebar-bottom">
            <button className="sidebar-command"><Search size={15} /><span>Search research</span></button>
            <button className="sidebar-command"><SquareTerminal size={15} /><span>Open terminal</span></button>
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

          {activeView === "evidence" && <EvidenceView />}
          {activeView === "draft" && <DraftView />}
          {activeView === "plan" && <PlanView />}
        </section>

        <aside className="agent-pane" aria-label="Research agent">
          <div className="agent-header">
            <div className="agent-title"><span className="agent-avatar"><Bot size={17} /></span><div><strong>Research agent</strong><span>Evidence-aware</span></div></div>
            <button className="icon-button" title="Agent settings"><ChevronRight size={17} /></button>
          </div>

          <div className="context-strip"><ShieldCheck size={14} />12 papers · 38 evidence spans · 2 files attached</div>

          <div className="message-list">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-role">{message.role === "assistant" ? "Research agent" : "You"}</div>
                <p>{message.text}</p>
                {message.sources && <div className="source-chips">{message.sources.map((source) => <button key={source}>{source}</button>)}</div>}
              </article>
            ))}
            {agentBusy && <div className="agent-typing"><span /><span /><span /></div>}
          </div>

          {pendingCommand && (
            <section className="approval-card">
              <div className="approval-icon"><SquareTerminal size={16} /></div>
              <div className="approval-content">
                <span>Command requires approval</span>
                <code>{pendingCommand}</code>
                <p>Runs in the selected workspace and records its output.</p>
                <div className="approval-actions">
                  <button className="secondary-button" onClick={() => setPendingCommand(null)}><X size={14} />Dismiss</button>
                  <button className="primary-button" onClick={() => runCommand(pendingCommand)}><Play size={14} />Run</button>
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
        <div className="terminal-command"><span>$</span><input value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && terminalInput.trim()) setPendingCommand(terminalInput.trim()); }} aria-label="Terminal command" /><button className="icon-button" title="Review command" onClick={() => terminalInput.trim() && setPendingCommand(terminalInput.trim())}><ArrowUp size={16} /></button></div>
      </section>
    </main>
  );
}

function EvidenceView() {
  return <div className="evidence-view">
    <section className="claim-panel">
      <div className="panel-kicker"><Lightbulb size={15} />Candidate gap</div>
      <h2>Retrieval budgets are often treated as a fixed hyperparameter instead of a reasoning decision.</h2>
      <p>Across the current reading set, final accuracy is usually reported without exposing how retrieval volume changes at each intermediate reasoning step.</p>
      <div className="claim-footer"><span><Check size={14} />Grounded in 3 sources</span><button>Open claim record <ChevronRight size={14} /></button></div>
    </section>
    <section className="evidence-grid">
      <div className="section-heading"><div><span className="eyebrow">Linked sources</span><h2>Evidence ledger</h2></div><button className="outline-button"><Plus size={14} />Add evidence</button></div>
      <div className="paper-list">
        {papers.map((paper, index) => <article className="paper-row" key={paper.title}><div className="paper-index">0{index + 1}</div><div className="paper-copy"><h3>{paper.title}</h3><p>{paper.meta}</p><blockquote>“Evaluation focuses on aggregate task outcomes rather than allocation behavior during intermediate reasoning.”</blockquote></div><div className="relevance"><span>Relevance</span><strong>{paper.score}</strong></div></article>)}
      </div>
    </section>
  </div>;
}

function DraftView() {
  return <section className="document-view"><div className="document-meta">drafts/method.md · autosaved</div><h2>Adaptive retrieval allocation</h2><p>We study retrieval as a budget allocation policy over a multi-step reasoning trace. Instead of setting a single top-k value for an entire task, the policy allocates evidence requests according to the uncertainty of each intermediate step.</p><h3>Claim trace</h3><div className="inline-citation"><BookOpen size={15} />This framing is motivated by evidence gaps identified in the active literature set.<button>3 linked sources</button></div><p>The evaluation records task accuracy, evidence recall, token expenditure, and allocation entropy for every completed run.</p></section>;
}

function PlanView() {
  return <section className="plan-view"><div className="section-heading"><div><span className="eyebrow">Experiment</span><h2>Budget allocation ablation</h2></div><span className="status-label"><Clock3 size={14} />Awaiting approval</span></div><div className="plan-table"><div><span>Baseline</span><strong>Static top-k retrieval</strong></div><div><span>Treatment</span><strong>Adaptive budget policy</strong></div><div><span>Metrics</span><strong>Accuracy · evidence recall · tokens</strong></div><div><span>Artifacts</span><strong>trace.jsonl · metrics.csv · plot.png</strong></div></div><button className="primary-button"><Play size={15} />Review execution</button></section>;
}

export default App;
