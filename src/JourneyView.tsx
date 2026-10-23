import { useMemo } from "react";
import { ArrowUpRight, Check, ChevronRight, Circle, FileCode2, ListTree, Wrench } from "lucide-react";

type JourneyViewProps = {
  thread: ResearchThread | null;
  events: ResearchEvent[];
  modeLabel: string;
  onOpenTrajectory: () => void;
};

function eventLabel(type: string) {
  switch (type) {
    case "user_message": return "User request";
    case "assistant_message": return "Answer";
    case "assistant_step": return "Agent step";
    case "tool_call": return "Tool call";
    case "tool_result":
    case "tool.result": return "Tool result";
    case "source_evidence": return "Source evidence";
    case "context_compacted": return "Context compacted";
    default: return type.replaceAll("_", " ");
  }
}

function eventIcon(type: string) {
  if (type === "tool_call" || type === "tool_result" || type === "tool.result") return <Wrench size={12} />;
  if (type === "assistant_message" || type === "user_message") return <FileCode2 size={12} />;
  return <ListTree size={12} />;
}

function eventFiles(payload: unknown, files: Set<string>) {
  if (Array.isArray(payload)) {
    for (const item of payload) eventFiles(item, files);
    return;
  }
  if (!payload || typeof payload !== "object") return;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if ((key === "path" || key === "file" || key === "filePath") && typeof value === "string") {
      files.add(value);
    } else if (key === "files" && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") files.add(item);
        else eventFiles(item, files);
      }
    } else {
      eventFiles(value, files);
    }
  }
}

export default function JourneyView({ thread, events, modeLabel, onOpenTrajectory }: JourneyViewProps) {
  const derived = useMemo(() => {
    const hasUser = events.some((event) => event.type === "user_message");
    const hasTools = events.some((event) => event.type === "tool_call" || event.type === "tool_result" || event.type === "tool.result");
    const hasContext = hasTools || events.some((event) => event.type === "source_evidence" || event.type === "context_compacted");
    const hasSynthesis = events.some((event) => event.type === "assistant_step");
    const hasAnswer = events.some((event) => event.type === "assistant_message");
    const phases = [
      { label: "Request", done: hasUser, detail: "Frame the task and success criteria" },
      { label: "Context", done: hasContext, detail: "Read files, sources, and workspace state" },
      { label: "Tools", done: hasTools, detail: "Run reads, edits, searches, and commands" },
      { label: "Synthesis", done: hasSynthesis, detail: "Assemble evidence into a response" },
      { label: "Answer", done: hasAnswer, detail: "Return the result with traceable steps" },
    ];
    const current = phases.findIndex((phase) => !phase.done);
    const doneCount = phases.filter((phase) => phase.done).length;
    const files = new Set<string>();
    for (const event of events) eventFiles(event.payload, files);
    const toolCalls = events.filter((event) => event.type === "tool_call" || event.type === "tool_result" || event.type === "tool.result").length;
    const errors = events.filter((event) => event.type.toLowerCase().includes("error") || (event.payload && typeof event.payload === "object" && "error" in event.payload));
    const milestones = [...events].reverse().filter((event) => event.type !== "assistant_step").slice(0, 5);
    return { phases, current, doneCount, files, toolCalls, errors, milestones };
  }, [events]);

  const progress = Math.round((derived.doneCount / derived.phases.length) * 100);

  return <section className="journey-view" aria-label="Agent journey">
    <div className="journey-intro">
      <div><span>Journey</span><strong>{thread?.title || "New research task"}</strong></div>
      <span className={derived.errors.length ? "journey-status attention" : "journey-status"}>{derived.errors.length ? "Needs attention" : thread?.status === "running" ? "Running" : "On track"}</span>
    </div>

    <div className="journey-goal">
      <div className="journey-goal-head"><span>Current goal</span><strong>{modeLabel}</strong></div>
      <p>{thread?.context_summary || "A concise, derived view of what the agent has done and what comes next."}</p>
      <div className="journey-progress"><i style={{ width: `${Math.max(progress, 4)}%` }} /></div>
      <div className="journey-progress-meta"><span>{progress}% derived progress</span><span>{events.length} raw events</span></div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title">Phase map</div>
      <div className="journey-phases">
        {derived.phases.map((phase, index) => {
          const state = phase.done ? "done" : index === derived.current ? "current" : "planned";
          return <div className={`journey-phase ${state}`} key={phase.label}>
            <span className="journey-phase-node">{phase.done ? <Check size={11} /> : index + 1}</span>
            <span><strong>{phase.label}</strong><small>{phase.detail}</small></span>
          </div>;
        })}
      </div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title">Signals</div>
      <div className="journey-signals">
        <div><span>Raw events</span><strong>{events.length}</strong></div>
        <div><span>Tool calls</span><strong>{derived.toolCalls}</strong></div>
        <div><span>Files touched</span><strong>{derived.files.size}</strong></div>
        <div><span>Turns</span><strong>{thread?.turn_count ?? 0}</strong></div>
      </div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title-row"><span className="journey-block-title">Recent milestones</span><button onClick={onOpenTrajectory}>View raw <ArrowUpRight size={12} /></button></div>
      <div className="journey-milestones">
        {derived.milestones.length ? derived.milestones.map((event) => <button key={event.id} onClick={onOpenTrajectory}>
          <span className="journey-milestone-icon">{eventIcon(event.type)}</span>
          <span><strong>{eventLabel(event.type)}</strong><small>from trajectory event #{event.sequence}</small></span>
          <ChevronRight size={12} />
        </button>) : <div className="journey-empty"><Circle size={12} />No milestones yet</div>}
      </div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title">Open risk</div>
      <div className={derived.errors.length ? "journey-note attention" : "journey-note"}>{derived.errors.length ? `${derived.errors.length} error${derived.errors.length === 1 ? "" : "s"} recorded in the raw trajectory.` : "No errors recorded in the current trajectory."}</div>
    </div>

    <div className="journey-footer"><span>Derived from {events.length} raw events</span><button onClick={onOpenTrajectory}>Open trajectory <ArrowUpRight size={12} /></button></div>
  </section>;
}
