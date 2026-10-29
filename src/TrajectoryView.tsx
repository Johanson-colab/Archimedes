import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, FileCode2, ListTree, Wrench } from "lucide-react";
import JsonCode from "./JsonCode";
import { eventOrdinal } from "./journeyEventState";
import { collectTouchedPaths } from "./evidencePaths";

type TrajectoryViewProps = {
  thread: ResearchThread | null;
  events: ResearchEvent[];
  provider?: string;
  model?: string;
  modeLabel: string;
  onCopy: (text: string) => Promise<void> | void;
  onOpenJourney: () => void;
  focusOrdinal?: number | null;
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

function isToolCall(event: ResearchEvent) {
  return event.type === "tool_call";
}

export default function TrajectoryView({ thread, events, provider, model, modeLabel, onCopy, onOpenJourney, focusOrdinal, onFocusApplied }: TrajectoryViewProps) {
  const PAGE_SIZE = 120;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [jumpToEnd, setJumpToEnd] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const focusAppliedRef = useRef(onFocusApplied);
  focusAppliedRef.current = onFocusApplied;
  const visibleEvents = Math.min(visibleCount, events.length);
  const files = useMemo(() => {
    const next = new Set<string>();
    for (const event of events) for (const path of collectTouchedPaths(event.payload)) next.add(path);
    return next;
  }, [events]);
  const toolCalls = events.filter(isToolCall).length;
  const messages = events.filter((event) => event.type === "user_message" || event.type === "assistant_message").length;
  const allExpanded = events.length > 0 && events.every((event) => expanded.has(event.id));

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpanded(new Set());
    setCopied("");
    const container = sectionRef.current;
    if (container) container.scrollTop = 0;
  }, [thread?.id]);

  useEffect(() => {
    if (focusOrdinal == null) return;
    const targetIndex = events.findIndex((event, index) => eventOrdinal(event, index) >= focusOrdinal);
    if (targetIndex < 0) { focusAppliedRef.current?.(); return; }
    const target = events[targetIndex];
    // The list renders progressively; make sure the focus target is mounted
    // before the reveal loop looks for it.
    setVisibleCount((current) => Math.max(current, Math.min(events.length, targetIndex + PAGE_SIZE)));
    setExpanded((current) => current.has(target.id) ? current : new Set(current).add(target.id));
  }, [events, focusOrdinal]);

  useEffect(() => {
    if (focusOrdinal == null) return;
    const targetIndex = events.findIndex((event, index) => eventOrdinal(event, index) >= focusOrdinal);
    if (targetIndex < 0) return;
    const targetOrdinal = eventOrdinal(events[targetIndex], targetIndex);
    let cancelled = false;
    let frame = 0;
    const reveal = (attempt = 0) => {
      if (cancelled) return;
      const container = sectionRef.current;
      const element = container?.querySelector<HTMLElement>(`[data-trajectory-ordinal="${targetOrdinal}"]`);
      if (!container || !element || container.clientHeight === 0) {
        // The target's body is rendered one commit after it is expanded, and
        // the workbench panel can still be hidden during the tab transition.
        if (attempt < 120) frame = requestAnimationFrame(() => reveal(attempt + 1));
        else focusAppliedRef.current?.();
        return;
      }
      const delta = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const desired = Math.max(0, container.scrollTop + delta - container.clientHeight / 2 + element.offsetHeight / 2);
      container.scrollTop = desired;
      if (Math.abs(container.scrollTop - desired) > 2 && attempt < 120) {
        frame = requestAnimationFrame(() => reveal(attempt + 1));
        return;
      }
      focusAppliedRef.current?.();
    };
    frame = requestAnimationFrame(() => reveal());
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [events, expanded, focusOrdinal]);

  // Progressive rendering: long coding traces can contain thousands of events,
  // so mount the first page and extend it when the sentinel comes into view.
  useEffect(() => {
    const node = sentinelRef.current;
    const root = sectionRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => Math.min(events.length, current + PAGE_SIZE));
      }
    }, { root, rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [events.length, visibleEvents]);

  useEffect(() => {
    if (!jumpToEnd) return;
    const frame = requestAnimationFrame(() => {
      const container = sectionRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      setJumpToEnd(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpToEnd, visibleEvents]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) {
      setExpanded(new Set());
      return;
    }
    // "Expand all" is an explicit request for the whole trace.
    setVisibleCount(events.length);
    setExpanded(new Set(events.map((event) => event.id)));
  }

  function jumpToLatest() {
    setVisibleCount(events.length);
    setJumpToEnd(true);
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
          {events.length > PAGE_SIZE && <button onClick={jumpToLatest} title="Load every event and scroll to the newest">Jump to latest</button>}
          <button onClick={toggleAll} title={allExpanded ? "Collapse all events" : "Expand all events"}>{allExpanded ? "Collapse all" : "Expand all"}</button>
        </div>
      </div>

      {events.length > 0 ? <div className="trajectory-event-list">
        {events.slice(0, visibleEvents).map((event, index) => {
          const open = expanded.has(event.id);
          const payload = payloadObject(event.payload);
          return <article className={open ? "trajectory-event open" : "trajectory-event"} key={event.id} data-trajectory-sequence={event.sequence} data-trajectory-ordinal={eventOrdinal(event, index)}>
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
        {visibleEvents < events.length && <div className="trajectory-more" ref={sentinelRef}>
          <span>Showing {visibleEvents} of {events.length} events</span>
          <button onClick={() => setVisibleCount(events.length)}>Show all events</button>
        </div>}
      </div> : <div className="trajectory-empty">
        <ListTree size={20} />
        <strong>No raw events yet</strong>
        <span>Run a research turn to inspect the complete agent trajectory.</span>
        <button onClick={onOpenJourney}>Open Journey</button>
      </div>}
    </div>
  </section>;
}
