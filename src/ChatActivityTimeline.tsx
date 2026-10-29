import { useMemo, useState } from "react";
import { AlertCircle, BookOpen, Check, ChevronDown, FileCode2, Search, SquareTerminal, Wrench } from "lucide-react";
import { useUISettings } from "./i18n";
import { eventFailedAnswer } from "./journeyEventState";

type ActivityEvent = {
  title: string;
  detail: string;
  state: "done" | "active" | "waiting";
};

type ActivityKind = "read" | "search" | "run" | "edit" | "other";

type ChatStep = {
  id: string;
  kind: ActivityKind;
  label: string;
  detail: string;
  full?: string;
  status: "done" | "running" | "waiting" | "error";
};

const KIND_ICON = {
  read: BookOpen,
  search: Search,
  run: SquareTerminal,
  edit: FileCode2,
  other: Wrench,
};

function kindForTool(name: string): ActivityKind {
  if (/search|find/.test(name)) return "search";
  if (/read|list|browser|open_web|inspect/.test(name)) return "read";
  if (/write|edit|patch|replace|create_file|file_change/.test(name)) return "edit";
  if (/command|terminal|run|bash|shell|exec/.test(name)) return "run";
  return "other";
}

function kindForText(text: string): ActivityKind {
  const value = text.toLowerCase();
  if (/search|find/.test(value)) return "search";
  if (/read|list|browse|inspect/.test(value)) return "read";
  if (/write|edit|patch/.test(value)) return "edit";
  if (/run|command|terminal/.test(value)) return "run";
  return "other";
}

function titleCase(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toolDetail(name: string, args: Record<string, unknown>) {
  const first = (keys: string[]) => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length) return value.filter((item) => typeof item === "string").join(", ");
    }
    return "";
  };
  if (name === "search_academic_papers") return first(["query"]);
  if (name === "web_search") return first(["query", "queries"]);
  if (name === "write_artifact") return first(["path", "file_path", "file"]);
  if (name === "propose_command") return first(["command"]);
  if (name === "find_in_page" || name === "find_in_pdf") return first(["query", "url"]);
  if (name === "read_public_pdf" || name === "read_attached_paper_pdf" || name === "read_found_paper_pdf") return first(["url", "paper_id", "attached_paper_id"]);
  if (name === "read_workspace_file" || name === "read_attached_file") return first(["path", "file_path", "file", "attached_file_id"]);
  if (name === "read_attached_repository_file") return first(["path", "file_path", "file"]);
  if (name === "search_attached_repository") return first(["query"]);
  if (name === "open_web_page" || name === "browser_use") return first(["url", "query", "action"]);
  return first(["query", "path", "file_path", "command", "url", "paper_id", "attached_paper_id"]);
}

function resultSummary(content: unknown) {
  if (typeof content !== "string" || !content.trim()) return "";
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    if (typeof data.error === "string") return data.error.slice(0, 160);
    if (Array.isArray(data.papers)) return `${data.papers.length} papers`;
    if (Array.isArray(data.results)) return `${data.results.length} results`;
    if (Array.isArray(data.matches)) return `${data.matches.length} matches`;
    if (typeof data.text === "string") return data.text.replace(/\s+/g, " ").slice(0, 160);
  } catch {
    // Fall through to a compact plain-text preview.
  }
  return content.replace(/\s+/g, " ").slice(0, 160);
}

function liveSteps(events: ActivityEvent[], busy: boolean): ChatStep[] {
  return events.map((event, index) => ({
    id: `live:${index}`,
    kind: kindForText(event.title),
    label: titleCase(event.title),
    detail: event.detail,
    status: !busy && event.state === "active"
      ? "done"
      : event.state === "active" ? "running" : event.state === "waiting" ? "waiting" : "done",
  }));
}

function rawSteps(events: ResearchEvent[], busy: boolean): { steps: ChatStep[]; sources: number } {
  const lastTurnId = events.at(-1)?.turn_id;
  const turnEvents = events.filter((event) => event.turn_id === lastTurnId);
  const calls = new Map<string, ChatStep>();
  let sources = 0;

  for (const event of turnEvents) {
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    if (event.type === "source_evidence") sources += 1;
    if (event.type === "tool_call") {
      const name = typeof payload.name === "string" ? payload.name : "tool";
      const args = payload.arguments && typeof payload.arguments === "object" ? payload.arguments as Record<string, unknown> : {};
      const id = typeof payload.call_id === "string" ? payload.call_id : `${event.id}:call`;
      calls.set(id, {
        id,
        kind: kindForTool(name),
        label: titleCase(name.replaceAll("_", " ")),
        detail: toolDetail(name, args),
        status: busy ? "running" : "done",
      });
    }
    if (event.type === "tool_result") {
      const id = typeof payload.call_id === "string" ? payload.call_id : "";
      const step = calls.get(id);
      if (step) {
        step.full = resultSummary(payload.content);
        step.status = step.full && /error/i.test(step.full) ? "error" : "done";
      }
    }
  }

  return { steps: Array.from(calls.values()), sources };
}

function summaryFor(steps: ChatStep[]) {
  const counts = new Map<ActivityKind, number>();
  for (const step of steps) counts.set(step.kind, (counts.get(step.kind) ?? 0) + 1);
  const labels: Array<[ActivityKind, string, string]> = [
    ["search", "search", "searches"],
    ["read", "read", "reads"],
    ["run", "command", "commands"],
    ["edit", "edit", "edits"],
    ["other", "step", "steps"],
  ];
  const parts = labels
    .filter(([kind]) => counts.get(kind))
    .map(([kind, one, many]) => `${counts.get(kind)} ${counts.get(kind) === 1 ? one : many}`);
  return parts.join(" · ");
}

export default function ChatActivityTimeline({
  events,
  rawEvents,
  busy,
  interrupting,
}: {
  events: ActivityEvent[];
  rawEvents: ResearchEvent[];
  busy: boolean;
  interrupting: boolean;
}) {
  const { chatVerbosity, t } = useUISettings();
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const live = useMemo(() => liveSteps(events, busy), [busy, events]);
  const raw = useMemo(() => rawSteps(rawEvents, busy), [busy, rawEvents]);
  const steps = events.length ? live : raw.steps;
  const sources = events.length ? 0 : raw.sources;
  const summary = summaryFor(steps);
  const latest = [...steps].reverse().find((step) => step.status === "running") ?? steps.at(-1);
  const visible = chatVerbosity === "high" || showAll ? steps : steps.slice(0, 4);
  const stepCountLabel = t(steps.length === 1 ? "{count} step" : "{count} steps", { count: steps.length });
  const lastAnswer = [...rawEvents].reverse().find((event) => event.type === "assistant_message");
  const failed = !busy && Boolean(lastAnswer && eventFailedAnswer(lastAnswer));

  if (!steps.length && !busy) return null;

  const status = busy && <div className="chat-activity-status" aria-live="polite">
    <span className="chat-activity-dot" aria-hidden="true" />
    <strong>{interrupting ? t("Stopping task") : t("Working")}</strong>
    {latest && <span className="chat-activity-status-detail">{latest.label}{latest.detail ? ` · ${latest.detail}` : ""}</span>}
  </div>;

  if (chatVerbosity === "low") {
    return <section className="chat-activity chat-activity-low">
      {status}
      {(summary || !busy) && <div className="chat-activity-low-summary">
        <span className="chat-activity-low-plus">+</span>
        {summary || t("Reading research context")}
      </div>}
    </section>;
  }

  return <section className="chat-activity">
    {status}
    <div className={open ? "chat-activity-card open" : "chat-activity-card"}>
      <button className="chat-activity-head" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="chat-activity-title">{t("Agent activity")}</span>
        <span className="chat-activity-meta">{stepCountLabel}{summary ? ` · ${summary}` : ""}</span>
        <ChevronDown className="chat-activity-chevron" size={14} />
      </button>
      {open && <div className="chat-activity-steps">
        {visible.map((step) => {
          const Icon = KIND_ICON[step.kind];
          return <div className={`chat-activity-step ${step.status}`} key={step.id}>
            <span className="chat-activity-step-icon"><Icon size={13} /></span>
            <span className="chat-activity-step-label">{step.label}</span>
            <span className="chat-activity-step-detail" title={step.full || step.detail}>{step.detail || step.full || "—"}</span>
            <span className="chat-activity-step-state" aria-label={step.status}>
              {step.status === "running" ? <span className="chat-activity-pulse" /> : step.status === "waiting" ? <span className="chat-activity-wait" /> : step.status === "error" ? <span className="chat-activity-error">!</span> : <Check size={11} />}
            </span>
            {chatVerbosity === "high" && step.full && <span className="chat-activity-step-full">{step.full}</span>}
          </div>;
        })}
        {chatVerbosity === "medium" && steps.length > 4 && <button className="chat-activity-more" onClick={() => setShowAll((current) => !current)}>
          {showAll ? t("Show less") : t("Show {count} more", { count: steps.length - 4 })}
        </button>}
      </div>}
      {!busy && <div className={`chat-activity-footer${failed ? " failed" : ""}`}>
        {failed ? <AlertCircle size={11} /> : <Check size={11} />}
        <strong>{failed ? t("Stopped with an error") : t("Completed")}</strong>
        <span className="chat-activity-footer-sep">·</span>
        <span>{stepCountLabel}</span>
        {sources > 0 && <><span className="chat-activity-footer-sep">·</span><span>{t("{count} sources", { count: sources })}</span></>}
      </div>}
    </div>
  </section>;
}
