import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, FileCode2, ListTree, Wrench } from "lucide-react";
import JsonCode from "./JsonCode";

type TrajectoryViewProps = {
  thread: ResearchThread | null;
  events: ResearchEvent[];
  provider?: string;
  model?: string;
  modeLabel: string;
  onCopy: (text: string) => Promise<void> | void;
  onOpenJourney: () => void;
  focusSequence?: number | null;
  onFocusApplied?: () => void;
};

function formatTime(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function payloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function collectFiles(payload: unknown, files: Set<string>) {
  if (Array.isArray(payload)) {
    for (const item of payload) collectFiles(item, files);
    return;
  }
  if (!payload || typeof payload !== "object") return;
  const record = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if ((key === "path" || key === "file" || key === "filePath" || key === "filename") && typeof value === "string") files.add(value);
    else if (key === "files" && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") files.add(item);
        else collectFiles(item, files);
      }
    } else collectFiles(value, files);
  }
}

function isToolCall(event: ResearchEvent) {
  return event.type === "tool_call" || event.type === "tool.result" || event.type === "tool_result";
}

export default function TrajectoryView({ thread, events, provider, model, modeLabel, onCopy, onOpenJourney, focusSequence, onFocusApplied }: TrajectoryViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const sectionRef = useRef<HTMLElement | null>(null);
  const focusAppliedRef = useRef(onFocusApplied);
  focusAppliedRef.current = onFocusApplied;
  const files = useMemo(() => {
    const next = new Set<string>();
    for (const event of events) collectFiles(event.payload, next);
    return next;
  }, [events]);
  const toolCalls = events.filter(isToolCall).length;
  const messages = events.filter((event) => event.type === "user_message" || event.type === "assistant_message").length;
  const allExpanded = events.length > 0 && events.every((event) => expanded.has(event.id));

  useEffect(() => {
    if (focusSequence == null) return;
    const target = events.find((event) => event.sequence >= focusSequence);
    if (!target) { focusAppliedRef.current?.(); return; }
    setExpanded((current) => current.has(target.id) ? current : new Set(current).add(target.id));
    const timer = window.setTimeout(() => {
      sectionRef.current?.querySelector<HTMLElement>(`[data-trajectory-sequence="${target.sequence}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      focusAppliedRef.current?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [events, focusSequence]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copy(text: string, label: string) {
    await onCopy(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const stats = [
    { label: "Session", value: thread?.title || "—" },
    { label: "Session ID", value: thread?.id || "—" },
    { label: "Mode", value: modeLabel || "—" },
    { label: "Status", value: thread?.status || "—" },
    { label: "Turns", value: String(thread?.turn_count ?? 0) },
    { label: "Messages", value: String(messages) },
    { label: "Events", value: String(events.length) },
    { label: "Tool calls", value: String(toolCalls) },
    { label: "Files touched", value: String(files.size) },
    { label: "Provider", value: provider || "—" },
    { label: "Model", value: model || "—" },
    { label: "Created", value: formatTime(thread?.created_at) },
    { label: "Updated", value: formatTime(thread?.updated_at) },
  ];

  return <section className="trajectory-view" aria-label="Agent trajectory" ref={sectionRef}>
    <div className="trajectory-stats">
      {stats.map((stat) => <div className="trajectory-stat" key={stat.label}>
        <span>{stat.label}</span>
        <strong title={stat.value}>{stat.value}</strong>
      </div>)}
    </div>

    {thread?.context_summary && <div className="trajectory-section">
      <div className="trajectory-section-title">Session summary</div>
      <div className="trajectory-summary">{thread.context_summary}</div>
    </div>}

    <div className="trajectory-section trajectory-raw">
      <div className="trajectory-section-head">
        <div><h3>Raw events</h3></div>
        <div className="trajectory-head-actions">
          <button onClick={() => void copy(JSON.stringify(events, null, 2), "all")} title="Copy all raw events"><Copy size={13} />{copied === "all" ? "Copied" : "Copy JSON"}</button>
          <button onClick={() => setExpanded(allExpanded ? new Set() : new Set(events.map((event) => event.id)))} title={allExpanded ? "Collapse all events" : "Expand all events"}>{allExpanded ? "Collapse all" : "Expand all"}</button>
        </div>
      </div>

      {events.length > 0 ? <div className="trajectory-event-list">
        {events.map((event) => {
          const open = expanded.has(event.id);
          const payload = payloadObject(event.payload);
          return <article className={open ? "trajectory-event open" : "trajectory-event"} key={event.id} data-trajectory-sequence={event.sequence}>
            <button className="trajectory-event-head" onClick={() => toggle(event.id)} aria-expanded={open}>
              <span className="trajectory-event-icon">{isToolCall(event) ? <Wrench size={12} /> : event.type === "assistant_message" || event.type === "user_message" ? <FileCode2 size={12} /> : <ListTree size={12} />}</span>
              <span className="trajectory-event-copy"><strong>{event.type}</strong><small>#{event.sequence} · {event.id}</small></span>
              <span className="trajectory-event-time">{formatTime(event.created_at)}</span>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {open && <div className="trajectory-event-body">
              <div className="trajectory-event-meta">
                <span>turn <code>{event.turn_id}</code></span>
                <button onClick={() => void copy(JSON.stringify(event, null, 2), event.id)} title="Copy this event"><Copy size={12} />{copied === event.id ? "Copied" : "Copy"}</button>
              </div>
              <JsonCode value={event} />
              {payload && <div className="trajectory-payload-note"><Check size={12} />Full payload includes {Object.keys(payload).length} top-level fields.</div>}
            </div>}
          </article>;
        })}
      </div> : <div className="trajectory-empty">
        <ListTree size={20} />
        <strong>No raw events yet</strong>
        <span>Run a research turn to inspect the complete agent trajectory.</span>
        <button onClick={onOpenJourney}>Open Journey</button>
      </div>}
    </div>
  </section>;
}
