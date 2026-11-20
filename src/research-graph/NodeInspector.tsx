import { useEffect, useRef, useState } from "react";
import { GitCommitHorizontal, History } from "lucide-react";
import { useUISettings } from "../i18n";
import ExperimentInspector from "./ExperimentInspector";
import type { ExperimentRun, ResearchNode, ResearchRevision } from "./types";

export type ExperimentInspectorActions = { runs: ExperimentRun[]; onReadLog: (runId: string) => Promise<string> };
export type NodeConnection = { nodeId: string; title: string; relation: string; revisionId: string; incoming: boolean };
type Props = { node: ResearchNode; experiment?: ExperimentInspectorActions; connections?: NodeConnection[]; onSelectNode?: (id: string) => void };
const STATUS_LABELS: Record<string, string> = { draft: "Draft", active: "Active", retracted: "Retracted" };
const FIELD_LABELS: Record<string, string> = {
  question: "Question", hypothesis: "Hypothesis", prediction: "Prediction", falsification: "Falsification", evidence: "Evidence", interpretation: "Interpretation", reasoning: "Reasoning", verdict: "Verdict", metrics: "Experiment metrics", source: "Source", text: "Writing", content: "Content", baseline: "Experiment baseline", method: "Experiment method", stopCriteria: "Experiment stop criteria", runId: "Run", command: "Command", exitCode: "Exit code", commitSha: "Git commit", commit: "Git commit", logPath: "Log path", logTail: "Run log", note: "Notes", plan: "Experiment plan",
};
function ContentFields({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { t } = useUISettings();
  if (value == null) return null;
  if (Array.isArray(value)) return <ul className="research-node-list">{value.slice(0, 30).map((item, index) => <li key={index}><ContentFields value={item} depth={depth + 1} /></li>)}</ul>;
  if (typeof value === "object" && depth < 4) return <dl className="research-node-fields">{Object.entries(value).slice(0, 30).map(([key, item]) => <div key={key}><dt>{t(FIELD_LABELS[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "))}</dt><dd><ContentFields value={item} depth={depth + 1} /></dd></div>)}</dl>;
  return <span>{(typeof value === "object" ? JSON.stringify(value) : String(value)).slice(0, 6000)}</span>;
}

/** Readable, read-only research content, with genuine persisted revision history. */
export default function NodeInspector({ node, experiment, connections = [], onSelectNode }: Props) {
  const { t } = useUISettings();
  const [history, setHistory] = useState<ResearchRevision[] | null>(null);
  const [revision, setRevision] = useState<ResearchRevision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const identity = useRef("");
  identity.current = `${node.id}:${node.current_revision_id}`;
  useEffect(() => { setRevision(null); setHistory(null); setError(""); setLoading(false); }, [node.id, node.current_revision_id]);
  const shown = revision ?? node.current_revision;
  const historical = shown?.id !== node.current_revision_id;
  const content = shown?.content ?? {};
  const source = (content.evidence as { source?: unknown } | undefined)?.source;
  const loadHistory = async () => {
    if (loading || history) return;
    setLoading(true); setError("");
    const expected = identity.current;
    try {
      const next = await window.researchDesk?.getResearchNodeHistory?.(node.id);
      if (expected === identity.current) setHistory((next ?? (node.current_revision ? [node.current_revision] : [])).slice().reverse());
    } catch (cause) { if (expected === identity.current) setError(cause instanceof Error ? cause.message : t("Could not load node history.")); }
    finally { if (expected === identity.current) setLoading(false); }
  };
  return <aside className={`research-graph-inspector${node.kind === "experiment" ? " experiment" : ""}`} aria-label={t("Node details")}>
    <div className="research-graph-inspector-head"><strong>{node.title}</strong><span>{t(node.archived ? "Archived" : STATUS_LABELS[node.status] || node.status)}</span></div>
    {node.summary && <p className="research-graph-summary">{node.summary}</p>}
    <div className="research-node-provenance">
      <span><GitCommitHorizontal size={13} />{t(historical ? "Historical revision" : "Current revision")} <code>{shown?.id.slice(0, 8) || "—"}</code></span>
      {shown?.source_turn_id && <span>{t("Source turn")} <code>{shown.source_turn_id.slice(0, 8)}</code></span>}
      {shown?.git_commit && <span>{t("Git commit")} <code>{shown.git_commit.slice(0, 7)}</code></span>}
      {typeof source === "string" && <span className={`research-evidence-source source-${source}`}>{t(source === "run" ? "Recorded run evidence" : source === "conversation" ? "Reported in conversation" : "Source")}</span>}
    </div>
    {node.kind === "experiment" && experiment && !historical ? <ExperimentInspector key={node.id} node={node} runs={experiment.runs} onReadLog={experiment.onReadLog} connections={connections} /> : <ContentFields value={content} />}
    {connections.length > 0 && <section className="research-node-connections" aria-label={t("Connections")}>
      <h3>{t("Connections")}</h3>
      {connections.map((item, index) => <button key={`${item.nodeId}:${item.relation}:${index}`} type="button" onClick={() => onSelectNode?.(item.nodeId)} disabled={!onSelectNode}>
        <span className="research-connection-relation">{item.incoming ? "←" : "→"} {t(item.relation)}</span>
        <strong>{item.title}</strong><code title={t("Pinned revision")}>{item.revisionId.slice(0, 8)}</code>
      </button>)}
    </section>}
    <details key={node.current_revision_id} className="research-node-history" onToggle={event => { if (event.currentTarget.open) void loadHistory(); }}>
      <summary><History size={13} />{t("Revision history")}{history && <span>{history.length}</span>}</summary>
      {loading && <p className="experiment-hint">{t("Loading…")}</p>}
      {error && <p role="alert">{error}</p>}
      {history?.map((item, index) => <button key={item.id} type="button" className={shown?.id === item.id ? "active" : ""} aria-pressed={shown?.id === item.id} onClick={() => setRevision(item)}>
        <span>{t("Revision")} {history.length - index}</span><code>{item.id.slice(0, 8)}</code><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
      </button>)}
    </details>
    <details className="research-graph-content-details"><summary>{t("Raw data")}</summary><pre className="research-graph-content-json">{JSON.stringify(content, null, 2)}</pre></details>
  </aside>;
}
