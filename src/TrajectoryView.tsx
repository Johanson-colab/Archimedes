import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, FileCode2, ListTree, Wrench } from "lucide-react";
import JsonCode from "./JsonCode";
import { useUISettings } from "./i18n";

type TrajectoryViewProps = {
  thread: ResearchThread | null;
  events: ResearchEvent[];
  provider?: string;
  model?: string;
  modeLabel: string;
  onCopy: (text: string) => Promise<void> | void;
  onOpenJourney: () => void;
};

function formatTime(value: string | undefined, language: "en" | "zh") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
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

export default function TrajectoryView({ thread, events, provider, model, modeLabel, onCopy, onOpenJourney }: TrajectoryViewProps) {
  const { language, t } = useUISettings();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const files = useMemo(() => {
    const next = new Set<string>();
    for (const event of events) collectFiles(event.payload, next);
    return next;
  }, [events]);
  const toolCalls = events.filter(isToolCall).length;
  const messages = events.filter((event) => event.type === "user_message" || event.type === "assistant_message").length;
  const allExpanded = events.length > 0 && events.every((event) => expanded.has(event.id));

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
    { label: t("Session"), value: thread?.title || "—" },
    { label: t("Session ID"), value: thread?.id || "—" },
    { label: t("Mode"), value: modeLabel || "—" },
    { label: t("Status"), value: thread?.status ? t(thread.status) : "—" },
    { label: t("Turns"), value: String(thread?.turn_count ?? 0) },
    { label: t("Messages"), value: String(messages) },
    { label: t("Events"), value: String(events.length) },
    { label: t("Tool calls"), value: String(toolCalls) },
    { label: t("Files touched"), value: String(files.size) },
    { label: t("Provider"), value: provider || "—" },
    { label: t("Model"), value: model || "—" },
    { label: t("Created"), value: formatTime(thread?.created_at, language) },
    { label: t("Updated"), value: formatTime(thread?.updated_at, language) },
  ];

  return <section className="trajectory-view" aria-label={t("Agent trajectory")}>
    <div className="trajectory-stats">
      {stats.map((stat) => <div className="trajectory-stat" key={stat.label}>
        <span>{stat.label}</span>
        <strong title={stat.value}>{stat.value}</strong>
      </div>)}
    </div>

    {thread?.context_summary && <div className="trajectory-section">
      <div className="trajectory-section-title">{t("Session summary")}</div>
      <div className="trajectory-summary">{thread.context_summary}</div>
    </div>}

    <div className="trajectory-section trajectory-raw">
      <div className="trajectory-section-head">
        <div><h3>{t("Raw events")}</h3></div>
        <div className="trajectory-head-actions">
          <button onClick={() => void copy(JSON.stringify(events, null, 2), "all")} title={t("Copy all raw events")}><Copy size={13} />{copied === "all" ? t("Copied") : t("Copy JSON")}</button>
          <button onClick={() => setExpanded(allExpanded ? new Set() : new Set(events.map((event) => event.id)))} title={allExpanded ? t("Collapse all events") : t("Expand all events")}>{allExpanded ? t("Collapse all") : t("Expand all")}</button>
        </div>
      </div>

      {events.length > 0 ? <div className="trajectory-event-list">
        {events.map((event) => {
          const open = expanded.has(event.id);
          const payload = payloadObject(event.payload);
          return <article className={open ? "trajectory-event open" : "trajectory-event"} key={event.id}>
            <button className="trajectory-event-head" onClick={() => toggle(event.id)} aria-expanded={open}>
              <span className="trajectory-event-icon">{isToolCall(event) ? <Wrench size={12} /> : event.type === "assistant_message" || event.type === "user_message" ? <FileCode2 size={12} /> : <ListTree size={12} />}</span>
              <span className="trajectory-event-copy"><strong>{event.type}</strong><small>#{event.sequence} · {event.id}</small></span>
              <span className="trajectory-event-time">{formatTime(event.created_at, language)}</span>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {open && <div className="trajectory-event-body">
              <div className="trajectory-event-meta">
                <span>{t("turn")} <code>{event.turn_id}</code></span>
                <button onClick={() => void copy(JSON.stringify(event, null, 2), event.id)} title={t("Copy this event")}><Copy size={12} />{copied === event.id ? t("Copied") : t("Copy")}</button>
              </div>
              <JsonCode value={event} />
              {payload && <div className="trajectory-payload-note"><Check size={12} />{t("Full payload includes {count} top-level fields.", { count: Object.keys(payload).length })}</div>}
            </div>}
          </article>;
        })}
      </div> : <div className="trajectory-empty">
        <ListTree size={20} />
        <strong>{t("No raw events yet")}</strong>
        <span>{t("Run a research turn to inspect the complete agent trajectory.")}</span>
        <button onClick={onOpenJourney}>{t("Open Journey")}</button>
      </div>}
    </div>
  </section>;
}
