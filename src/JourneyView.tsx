import { useMemo } from "react";
import { ArrowUpRight, Check, ChevronRight, Circle, FileCode2, ListTree, Wrench } from "lucide-react";
import { useUISettings } from "./i18n";

type JourneyViewProps = {
  thread: ResearchThread | null;
  events: ResearchEvent[];
  modeLabel: string;
  onOpenTrajectory: () => void;
};

function eventLabel(type: string, t: (key: string) => string) {
  switch (type) {
    case "user_message": return t("User request");
    case "assistant_message": return t("Answer");
    case "assistant_step": return t("Agent step");
    case "tool_call": return t("Tool call");
    case "tool_result":
    case "tool.result": return t("Tool result");
    case "source_evidence": return t("Source evidence");
    case "context_compacted": return t("Context compacted");
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
  const { t } = useUISettings();
  const derived = useMemo(() => {
    const hasUser = events.some((event) => event.type === "user_message");
    const hasTools = events.some((event) => event.type === "tool_call" || event.type === "tool_result" || event.type === "tool.result");
    const hasContext = hasTools || events.some((event) => event.type === "source_evidence" || event.type === "context_compacted");
    const hasSynthesis = events.some((event) => event.type === "assistant_step");
    const hasAnswer = events.some((event) => event.type === "assistant_message");
    const phases = [
      { label: t("Request"), done: hasUser, detail: t("Frame the task and success criteria") },
      { label: t("Context"), done: hasContext, detail: t("Read files, sources, and workspace state") },
      { label: t("Tools"), done: hasTools, detail: t("Run reads, edits, searches, and commands") },
      { label: t("Synthesis"), done: hasSynthesis, detail: t("Assemble evidence into a response") },
      { label: t("Answer"), done: hasAnswer, detail: t("Return the result with traceable steps") },
    ];
    const current = phases.findIndex((phase) => !phase.done);
    const doneCount = phases.filter((phase) => phase.done).length;
    const files = new Set<string>();
    for (const event of events) eventFiles(event.payload, files);
    const toolCalls = events.filter((event) => event.type === "tool_call" || event.type === "tool_result" || event.type === "tool.result").length;
    const errors = events.filter((event) => event.type.toLowerCase().includes("error") || (event.payload && typeof event.payload === "object" && "error" in event.payload));
    const milestones = [...events].reverse().filter((event) => event.type !== "assistant_step").slice(0, 5);
    return { phases, current, doneCount, files, toolCalls, errors, milestones };
  }, [events, t]);

  const progress = Math.round((derived.doneCount / derived.phases.length) * 100);

  return <section className="journey-view" aria-label={t("Agent journey")}>
    <div className="journey-intro">
      <div><span>{t("Journey")}</span><strong>{thread?.title || t("New research task")}</strong></div>
      <span className={derived.errors.length ? "journey-status attention" : "journey-status"}>{derived.errors.length ? t("Needs attention") : thread?.status === "running" ? t("Running") : t("On track")}</span>
    </div>

    <div className="journey-goal">
      <div className="journey-goal-head"><span>{t("Current goal")}</span><strong>{modeLabel}</strong></div>
      <p>{thread?.context_summary || t("A concise, derived view of what the agent has done and what comes next.")}</p>
      <div className="journey-progress"><i style={{ width: `${Math.max(progress, 4)}%` }} /></div>
      <div className="journey-progress-meta"><span>{t("{percent}% derived progress", { percent: progress })}</span><span>{t("{count} raw events", { count: events.length })}</span></div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title">{t("Phase map")}</div>
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
      <div className="journey-block-title">{t("Signals")}</div>
      <div className="journey-signals">
        <div><span>{t("Raw events")}</span><strong>{events.length}</strong></div>
        <div><span>{t("Tool calls")}</span><strong>{derived.toolCalls}</strong></div>
        <div><span>{t("Files touched")}</span><strong>{derived.files.size}</strong></div>
        <div><span>{t("Turns")}</span><strong>{thread?.turn_count ?? 0}</strong></div>
      </div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title-row"><span className="journey-block-title">{t("Recent milestones")}</span><button onClick={onOpenTrajectory}>{t("View raw")} <ArrowUpRight size={12} /></button></div>
      <div className="journey-milestones">
        {derived.milestones.length ? derived.milestones.map((event) => <button key={event.id} onClick={onOpenTrajectory}>
          <span className="journey-milestone-icon">{eventIcon(event.type)}</span>
          <span><strong>{eventLabel(event.type, t)}</strong><small>{t("from trajectory event #{sequence}", { sequence: event.sequence })}</small></span>
          <ChevronRight size={12} />
        </button>) : <div className="journey-empty"><Circle size={12} />{t("No milestones yet")}</div>}
      </div>
    </div>

    <div className="journey-block">
      <div className="journey-block-title">{t("Open risk")}</div>
      <div className={derived.errors.length ? "journey-note attention" : "journey-note"}>{derived.errors.length ? t("{count} errors recorded in the raw trajectory.", { count: derived.errors.length }) : t("No errors recorded in the current trajectory.")}</div>
    </div>

    <div className="journey-footer"><span>{t("Derived from {count} raw events", { count: events.length })}</span><button onClick={onOpenTrajectory}>{t("Open trajectory")} <ArrowUpRight size={12} /></button></div>
  </section>;
}
