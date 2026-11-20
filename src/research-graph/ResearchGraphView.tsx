import type { CSSProperties, KeyboardEvent } from "react";
import { Activity, FileText, FlaskConical, HelpCircle, Lightbulb, GitMerge, type LucideIcon } from "lucide-react";
import { useUISettings } from "../i18n";
import { LINEAGE_EVENT_HEIGHT, LINEAGE_MARKER_Y, LINEAGE_ROW_HEIGHT, type LineageLayout } from "./graphLayout";
import type { ExperimentRun, ResearchNode, ResearchNodeKind } from "./types";

const KIND_ICONS: Record<ResearchNodeKind, LucideIcon> = { question: HelpCircle, idea: Lightbulb, experiment: FlaskConical, result: Activity, writing: FileText };
const KIND_LABELS: Record<ResearchNodeKind, string> = { question: "Question", idea: "Idea", experiment: "Experiment", result: "Result", writing: "Writing" };
const RUN_LABELS: Record<string, string> = { started: "Run started", starting: "Run starting", running: "Run running", succeeded: "Run succeeded", failed: "Run failed", cancelled: "Run cancelled" };
const ACTIVITY_LABELS: Record<string, string> = { started: "Activity started", completed: "Activity completed", failed: "Activity failed", note: "Activity note" };
const TONES = ["var(--accent)", "var(--analysis-series-3)", "var(--analysis-series-1)", "var(--analysis-series-5)", "var(--analysis-series-2)"];
const tone = (lane: number) => TONES[lane % TONES.length];

export type RunPathEvent = { id: string; runId?: string; number?: number; status: string; time: string; title?: string; source?: "agent_reported" | "summary" };
type Props = { pathEvents?: RunPathEvent[]; layout: LineageLayout; selectedId: string | null; focusedId: string | null; runsByNode: Map<string, ExperimentRun[]>; onSelect: (nodeId: string) => void };

export function lineageAncestors(layout: LineageLayout, selectedId: string | null): Set<string> {
  const ancestors = new Set<string>();
  const pending = selectedId ? [selectedId] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    for (const item of layout.edges) if (!item.feedback && item.toId === id && item.fromId) pending.push(item.fromId);
  }
  return ancestors;
}

function nodeState(node: ResearchNode, latest?: ExperimentRun) {
  if (node.archived || node.status === "retracted") return "retired";
  if (latest) return latest.status;
  return node.status;
}

export default function ResearchGraphView({ layout, selectedId, focusedId, runsByNode, pathEvents = [], onSelect }: Props) {
  const { t } = useUISettings();
  const ancestors = lineageAncestors(layout, focusedId);
  const focused = Boolean(focusedId && layout.nodes.some(({ node }) => node.id === focusedId));
  const edgeOnPath = (item: LineageLayout["edges"][number]) => !item.feedback && Boolean(item.fromId && item.toId && ancestors.has(item.fromId) && ancestors.has(item.toId));
  const renderEdge = ({ edge, path, feedback, fromId, toId, lane = 0 }: LineageLayout["edges"][number]) => {
    const onPath = !feedback && Boolean(fromId && toId && ancestors.has(fromId) && ancestors.has(toId));
    return <path key={edge.id} d={path} className={`research-graph-edge kind-${edge.kind}${feedback ? " feedback" : ""}${onPath ? " on-path" : focused ? " unrelated" : ""}`}
      style={{ "--branch-color": tone(lane) } as CSSProperties} />;
  };
  const renderMarker = ({ node, x, y, lane }: LineageLayout["nodes"][number]) => {
    const selected = node.id === selectedId;
    const state = nodeState(node, runsByNode.get(node.id)?.at(-1));
    return <g key={node.id} className={`research-lineage-marker kind-${node.kind} state-${state}${selected ? " selected" : ""}${focused ? ancestors.has(node.id) ? " on-path" : " unrelated" : ""}`} style={{ "--branch-color": tone(lane) } as CSSProperties} transform={`translate(${x},${y + LINEAGE_MARKER_Y})`}>
      {selected && <circle className="research-lineage-halo" r={11} />}
      {node.kind === "question" && <circle className="research-lineage-dot" r={6} />}
      {node.kind === "idea" && <path className="research-lineage-dot" d="M 0 -6 L 6 0 L 0 6 L -6 0 Z" />}
      {node.kind === "experiment" && <rect className="research-lineage-dot" x={-5.5} y={-5.5} width={11} height={11} rx={2} />}
      {node.kind === "result" && <path className="research-lineage-dot" d="M -3 -5.5 L 3 -5.5 L 6 0 L 3 5.5 L -3 5.5 L -6 0 Z" />}
      {node.kind === "writing" && <path className="research-lineage-dot" d="M -5 -6 L 2 -6 L 5 -3 L 5 6 L -5 6 Z" />}
      {state === "failed" && <path className="research-lineage-glyph" d="M -2 -2 L 2 2 M 2 -2 L -2 2" />}
      {state === "succeeded" && <path className="research-lineage-glyph" d="M -2 0 L 0 2 L 3 -2" />}
    </g>;
  };
  const focusedNode = layout.nodes.find(({ node }) => node.id === focusedId && node.kind === "experiment");
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(".research-graph-node")];
    const current = buttons.indexOf(event.currentTarget);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    buttons[index]?.focus();
  };
  return <div className="research-graph-canvas research-lineage" aria-label={t("Research lineage")} style={{ minWidth: layout.width, height: layout.height }}>
    {layout.nodes.map(({ node, y, lane }) => {
      const Icon = KIND_ICONS[node.kind];
      const selected = node.id === selectedId;
      const nodeRuns = runsByNode.get(node.id) ?? [];
      const latest = nodeRuns.at(-1);
      const state = nodeState(node, latest);
      const mergeCount = layout.edges.filter(item => item.edge.kind === "merges" && item.toId === node.id).length;
      const label = node.archived ? "Archived" : node.status === "retracted" ? "Retracted" : latest ? RUN_LABELS[latest.status] : node.kind === "experiment" ? "Not run" : node.status === "active" ? "Active" : "Draft";
      return <button key={node.id} type="button" className={`research-graph-node kind-${node.kind} state-${state}${selected ? " selected" : ""}${focused ? ancestors.has(node.id) ? " on-path" : " unrelated" : ""}${node.archived ? " archived" : ""}${node.status === "retracted" ? " status-retracted" : ""}`}
        style={{ top: y, height: LINEAGE_ROW_HEIGHT, paddingLeft: layout.railWidth + 8, "--branch-color": tone(lane) } as CSSProperties}
        onClick={() => onSelect(node.id)} onKeyDown={navigate} aria-pressed={selected} title={node.title}>
        <span className="research-graph-node-copy">
          <span className="research-graph-node-title">{node.title}</span>
          <span className="research-lineage-meta"><Icon size={12} aria-hidden="true" /><span>{t(KIND_LABELS[node.kind])}</span>
            {node.current_revision_id && <code title={t("Revision")}>{node.current_revision_id.slice(0, 8)}</code>}
            {mergeCount > 1 && <span className="research-lineage-merge"><GitMerge size={12} />{t("Merged")} · {mergeCount}</span>}
            {nodeRuns.length > 0 && <span className="research-graph-node-runs">{nodeRuns.length} {t("runs")}</span>}
            {latest?.commit_sha && <code title={t("Git commit")}>{latest.commit_sha.slice(0, 7)}</code>}
          </span>
        </span>
        <span className={`research-lineage-state state-${state}`}>{t(label)}</span>
      </button>;
    })}
    {focusedNode && pathEvents.map((event, index) => <div key={event.id} className={`research-path-event status-${event.status}`}
      style={{ top: focusedNode.y + LINEAGE_ROW_HEIGHT + index * LINEAGE_EVENT_HEIGHT, height: LINEAGE_EVENT_HEIGHT, paddingLeft: layout.railWidth + 8 }}>
      {event.source === "summary" ? <span>{t("Older activity hidden")}</span> : event.source === "agent_reported" ? <><span className="research-path-event-title" title={event.title}>{event.title}</span><span className="research-path-event-source">{t(ACTIVITY_LABELS[event.status] || event.status)} · {t("Agent-reported")}</span></> : <><span>{t("Run")} {event.number}</span><span>{t(RUN_LABELS[event.status] || event.status)}</span></>}
      {event.source !== "summary" && <time>{new Date(event.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>}
    </div>)}
    <svg className="research-graph-edges" width={layout.railWidth} height={layout.height} viewBox={`0 0 ${layout.railWidth} ${layout.height}`} aria-hidden="true">
      {layout.edges.filter(item => !edgeOnPath(item)).map(renderEdge)}
      {layout.nodes.filter(({ node }) => !ancestors.has(node.id)).map(renderMarker)}
      {layout.edges.filter(edgeOnPath).map(renderEdge)}
      {focusedNode && pathEvents.length > 0 && <g className="research-path-events" style={{ "--branch-color": tone(focusedNode.lane) } as CSSProperties}>
        <path d={`M ${focusedNode.x} ${focusedNode.y + LINEAGE_MARKER_Y + 6} L ${focusedNode.x} ${focusedNode.y + LINEAGE_ROW_HEIGHT + (pathEvents.length - 1) * LINEAGE_EVENT_HEIGHT + LINEAGE_EVENT_HEIGHT / 2}`} />
        {pathEvents.map((event, index) => <circle key={event.id} className={`research-path-event-dot status-${event.status}`} cx={focusedNode.x} cy={focusedNode.y + LINEAGE_ROW_HEIGHT + index * LINEAGE_EVENT_HEIGHT + LINEAGE_EVENT_HEIGHT / 2} r={4} />)}
      </g>}
      {layout.nodes.filter(({ node }) => ancestors.has(node.id)).map(renderMarker)}
    </svg>
  </div>;
}
