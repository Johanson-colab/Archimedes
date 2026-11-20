import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, History, Maximize2, Minimize2, PanelRight, Pin, RefreshCw, X } from "lucide-react";
import { useUISettings } from "../i18n";
import { Dialog } from "../Dialog";
import { layoutLineage } from "./graphLayout";
import NodeInspector from "./NodeInspector";
import ResearchGraphView from "./ResearchGraphView";
import type { RunPathEvent } from "./ResearchGraphView";
import type { ExperimentActivity, ExperimentRun, ResearchGraph, ResearchGraphUpdate } from "./types";

type Props = {
  projectId: string | null;
  threadId: string | null;
  projectName: string;
  threadTitle: string;
  hasThread: boolean;
  mode: string;
  workspace?: string;
  extractionPending?: boolean;
  version?: number;
  update?: ResearchGraphUpdate | null;
  pinned?: boolean;
  threadInactive?: boolean;
  onTogglePin?: () => void;
  onOpenThread: () => void;
  onCollapse: () => void;
};

export default function ResearchGraphPanel({
  projectId,
  threadId,
  projectName,
  threadTitle,
  hasThread,
  workspace,
  extractionPending = false,
  version = 0,
  update = null,
  pinned = false,
  threadInactive = false,
  onTogglePin,
  onOpenThread,
  onCollapse,
}: Props) {
  const { t } = useUISettings();
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [activities, setActivities] = useState<ExperimentActivity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [failedTurns, setFailedTurns] = useState<string[]>([]);
  const [extractionChecked, setExtractionChecked] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => { setGraph(null); setRuns([]); setActivities([]); setSelectedId(null); setFocusedId(null); setInspectorOpen(false); }, [projectId, threadId]);

  useEffect(() => {
    setFailedTurns([]); setExtractionChecked(false); setRetryError("");
    if (!threadId || !window.researchDesk?.getResearchThread) return;
    let cancelled = false;
    window.researchDesk.getResearchThread(threadId, workspace).then((thread) => {
      if (cancelled) return;
      const latest = new Map<string, string>();
      for (const event of thread.events || []) if (["graph_failed", "graph_checked", "graph_applied"].includes(event.type)) latest.set(event.turn_id, event.type);
      setFailedTurns([...latest.entries()].filter(([, type]) => type === "graph_failed").map(([id]) => id).reverse());
      setExtractionChecked([...latest.values()].at(-1) === "graph_checked");
    }).catch(() => { if (!cancelled) setRetryError(t("Could not load graph extraction status.")); });
    return () => { cancelled = true; };
  }, [threadId, workspace, version, refreshKey, t]);

  useEffect(() => {
    if (!projectId || !threadId) {
      setGraph(null);
      setSelectedId(null);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    if (!window.researchDesk?.listResearchGraph) {
      setGraph({ projectId, threadId, nodes: [], edges: [] });
      setLoading(false);
      return;
    }
    window.researchDesk.listResearchGraph({ projectId, threadId, includeArchived: true })
      .then((next) => {
        if (cancelled) return;
        setGraph(next);
        setSelectedId((current) => (
          current && next.nodes.some((node) => node.id === current)
            ? current
            : next.nodes.find((node) => node.status !== "retracted")?.id ?? next.nodes[0]?.id ?? null
        ));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t("Could not load the research graph."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, threadId, refreshKey, version, t]);

  useEffect(() => {
    if (!projectId || !threadId) {
      setRuns([]);
      return;
    }
    if (!window.researchDesk?.listExperimentRuns) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    window.researchDesk.listExperimentRuns({ projectId, threadId })
      .then((next) => {
        if (!cancelled) setRuns(next);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => { cancelled = true; };
  }, [projectId, threadId, refreshKey, version]);

  useEffect(() => {
    if (!projectId || !threadId || !window.researchDesk?.listExperimentActivities) { setActivities([]); return; }
    let cancelled = false;
    window.researchDesk.listExperimentActivities({ projectId, threadId })
      .then((next) => { if (!cancelled) setActivities(next); })
      .catch((cause: unknown) => { if (!cancelled) { setActivities([]); setError(cause instanceof Error ? cause.message : t("Could not load experiment activity.")); } });
    return () => { cancelled = true; };
  }, [projectId, threadId, refreshKey, version, t]);

  useEffect(() => {
    if (!threadId) return;
    const unsubscribe = window.researchDesk?.onExperimentRunUpdate?.((run) => {
      if (run.thread_id !== threadId) return;
      setRuns((current) => {
        const next = current.filter((item) => item.id !== run.id);
        next.push(run);
        next.sort((left, right) => left.created_at.localeCompare(right.created_at));
        return next;
      });
    });
    return unsubscribe;
  }, [threadId]);

  const stageNodes = graph?.nodes ?? [];
  const runsByNode = useMemo(() => {
    const map = new Map<string, ExperimentRun[]>();
    for (const run of runs) {
      const list = map.get(run.node_id) ?? [];
      list.push(run);
      map.set(run.node_id, list);
    }
    for (const list of map.values()) list.sort((left, right) => left.created_at.localeCompare(right.created_at));
    return map;
  }, [runs]);
  const pathEvents = useMemo<RunPathEvent[]>(() => {
    if (!focusedId || !graph?.nodes.some((node) => node.id === focusedId && node.kind === "experiment")) return [];
    const all = runsByNode.get(focusedId) || [];
    const runEvents = all.slice(-5).flatMap((run, index) => {
      const number = all.length - Math.min(all.length, 5) + index + 1;
      const events: RunPathEvent[] = [];
      if (run.started_at) events.push({ id: `${run.id}-start`, runId: run.id, number, status: "started", time: run.started_at });
      if (["succeeded", "failed", "cancelled"].includes(run.status)) events.push({ id: `${run.id}-end`, runId: run.id, number, status: run.status, time: run.ended_at || run.created_at });
      if (!events.length) events.push({ id: `${run.id}-pending`, runId: run.id, number, status: run.status, time: run.created_at });
      return events;
    });
    const reported: RunPathEvent[] = activities.filter((item) => item.node_id === focusedId).map((item) => ({ id: item.id, status: item.status, time: item.created_at, title: item.title, source: "agent_reported" }));
    const combined = [...runEvents, ...reported].sort((left, right) => left.time.localeCompare(right.time));
    const truncated = all.length > 5 || combined.length > 20;
    const recent = combined.slice(-20);
    return truncated ? [{ id: "older-hidden", status: "note", time: recent[0]?.time || "", source: "summary" as const }, ...recent] : recent;
  }, [focusedId, graph, runsByNode, activities]);
  const layout = useMemo(() => {
    if (!graph) return null;
    const nodes = showHistory ? stageNodes : stageNodes.filter((node) => node.status !== "retracted" && !node.archived);
    const visibleIds = new Set(nodes.map((node) => node.id));
    return layoutLineage({
      ...graph,
      nodes,
      edges: graph.edges.filter((edge) =>
        visibleIds.has(edge.from_node)
        && visibleIds.has(edge.to_node)),
    }, focusedId && pathEvents.length ? new Map([[focusedId, pathEvents.length]]) : new Map());
  }, [graph, stageNodes, showHistory, focusedId, pathEvents]);
  const selectedNode = layout?.nodes.find(({ node }) => node.id === selectedId)?.node ?? layout?.nodes[0]?.node ?? null;
  const visibleFocusId = layout?.nodes.some(({ node }) => node.id === focusedId) ? focusedId : null;
  const retractedCount = stageNodes.filter((node) => node.status === "retracted" || node.archived).length;
  const visibleNodeCount = showHistory ? stageNodes.length : stageNodes.length - retractedCount;

  const refresh = () => setRefreshKey((key) => key + 1);

  const retryExtraction = async () => {
    if (!threadId || !failedTurns[0] || retrying || !window.researchDesk?.retryResearchGraphExtraction) return;
    setRetrying(true); setRetryError("");
    try {
      const result = await window.researchDesk.retryResearchGraphExtraction({ threadId, turnId: failedTurns[0] });
      if (!result.ok) setRetryError(t("Graph extraction failed. Try again."));
      refresh();
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : t("Graph extraction failed. Try again."));
    } finally { setRetrying(false); }
  };

  const undoUpdate = async () => {
    if (!update || undoing || !window.researchDesk?.archiveResearchNode) return;
    setUndoing(true);
    setError("");
    try {
      for (const nodeId of update.createdNodeIds) {
        await window.researchDesk.archiveResearchNode(nodeId, "Undo automatic research graph update");
      }
      for (const item of update.superseded ?? []) {
        await window.researchDesk.setResearchNodeStatus?.(item.nodeId, item.previousStatus, "Undo automatic research graph update");
      }
      setSelectedId(null);
      setFocusedId(null);
      setDismissedUpdate(update.turnId);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not undo the research graph update."));
    } finally {
      setUndoing(false);
    }
  };

  const readExperimentLog = async (runId: string) => {
    if (!window.researchDesk?.readExperimentRunLog) return "";
    setError("");
    try {
      const log = await window.researchDesk.readExperimentRunLog(runId);
      return log.text;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not read the run log."));
      return "";
    }
  };

  const actions = <>
    {onTogglePin && <button
      className={pinned ? "agent-path-icon on" : "agent-path-icon"}
      onClick={onTogglePin}
      title={t(pinned ? "Unpin this session" : "Pin this session")}
      aria-label={t(pinned ? "Unpin this session" : "Pin this session")}
      aria-pressed={pinned}
      disabled={!hasThread && !pinned}
    ><Pin size={12} /></button>}
    <button className={inspectorOpen ? "agent-path-icon on" : "agent-path-icon"} onClick={() => setInspectorOpen(value => !value)} aria-label={t(inspectorOpen ? "Hide node details" : "Show node details")} title={t(inspectorOpen ? "Hide node details" : "Show node details")} aria-pressed={inspectorOpen}><PanelRight size={13} /></button>
    {retractedCount > 0 && <button
      className={showHistory ? "agent-path-icon on" : "agent-path-icon"}
      onClick={() => setShowHistory((value) => !value)}
      title={t(showHistory ? "Hide history" : "Show history")}
      aria-label={`${t(showHistory ? "Hide history" : "Show history")} (${retractedCount})`}
      aria-pressed={showHistory}
    >
      <History size={12} />
    </button>}
    <button
      className="agent-path-icon"
      onClick={refresh}
      title={t("Refresh graph")}
      aria-label={t("Refresh graph")}
      disabled={!projectId || loading}
    >
      <RefreshCw size={12} />
    </button>
    <button
      className="agent-path-icon"
      onClick={() => { setExpanded(value => !value); setInspectorOpen(!expanded); }}
      title={t(expanded ? "Collapse graph" : "Expand graph")}
      aria-label={t(expanded ? "Collapse graph" : "Expand graph")}
    >
      {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
    </button>
    <button
      className="agent-path-icon"
      onClick={onOpenThread}
      title={t("Open session")}
      aria-label={t("Open session")}
      disabled={!hasThread}
    >
      <ArrowUpRight size={12} />
    </button>
    <button className="agent-path-icon" onClick={onCollapse} title={t("Close Research path")} aria-label={t("Close Research path")}>
      <X size={12} />
    </button>
  </>;

  const content = <div className={expanded ? "research-graph-content expanded" : "research-graph-content"}>
    {(extractionPending || retrying || failedTurns.length > 0 || retryError || extractionChecked) && <div className="research-graph-extraction" role="status" aria-live="polite">
      <span>{retrying || extractionPending ? t("Updating research graph…") : retryError || (failedTurns.length ? t("Graph extraction failed. Try again.") : t("Graph checked; no new nodes."))}{!retrying && !extractionPending && failedTurns.length > 1 ? ` · ${failedTurns.length}` : ""}</span>
      {!retrying && !extractionPending && failedTurns.length > 0 && <button type="button" onClick={() => void retryExtraction()}>{t("Retry extraction")}</button>}
    </div>}
    {update && update.projectId === projectId && update.threadId === threadId && update.nodeCount + update.edgeCount + (update.superseded?.length ?? 0) > 0 && dismissedUpdate !== update.turnId && (
      <div className="research-graph-update" role="status" aria-live="polite">
        <span>{t("Research graph updated")} · +{update.nodeCount} {t("nodes")} · +{update.edgeCount} {t("edges")}{update.superseded?.length ? ` · ${update.superseded.length} ${t("previous ideas moved to history")}` : ""}</span>
        {(update.createdNodeIds.length > 0 || (update.superseded?.length ?? 0) > 0) && <button type="button" disabled={undoing} onClick={() => void undoUpdate()}>{t(undoing ? "Undoing…" : "Undo")}</button>}
        <button type="button" className="research-graph-update-dismiss" onClick={() => setDismissedUpdate(update.turnId)} aria-label={t("Dismiss")} title={t("Dismiss")}><X size={11} /></button>
      </div>
    )}
    {!projectId ? <div className="research-graph-empty">{t("No project selected")}</div> : !threadId ? (
      <div className="research-graph-empty">
        <strong>{t("No active session")}</strong>
        <p>{t("Start a research conversation to build its graph.")}</p>
      </div>
    ) : graph && graph.nodes.length === 0 ? (
      <div className="research-graph-empty">
        <strong>{t("No research graph yet")}</strong>
        <p>{t("Start a Research conversation. The graph builds automatically from the conversation.")}</p>
      </div>
    ) : <>
      <div className={`research-graph-workspace${inspectorOpen && selectedNode ? " has-inspector" : ""}`}>
      <div className="research-graph-body">
        {loading && !graph ? <span className="research-graph-loading">{t("Refresh graph")}…</span> : null}
        {layout ? <ResearchGraphView layout={layout} selectedId={selectedNode?.id ?? null} focusedId={visibleFocusId} runsByNode={runsByNode} pathEvents={pathEvents} onSelect={(id) => { setSelectedId(id); setFocusedId(current => current === id ? null : id); setInspectorOpen(true); }} /> : null}
      </div>
      {selectedNode && inspectorOpen ? <NodeInspector
        key={selectedNode.id}
        node={selectedNode}
        connections={(graph?.edges ?? []).flatMap(edge => {
          const incoming = edge.to_node === selectedNode.id;
          if (!incoming && edge.from_node !== selectedNode.id) return [];
          const related = graph?.nodes.find(node => node.id === (incoming ? edge.from_node : edge.to_node));
          return related ? [{ nodeId: related.id, title: related.title, relation: edge.kind, revisionId: incoming ? edge.from_revision : edge.to_revision, incoming }] : [];
        })}
        onSelectNode={id => {
          if (graph?.nodes.some(node => node.id === id && (node.archived || node.status === "retracted"))) setShowHistory(true);
          setSelectedId(id);
          setFocusedId(id);
        }}
        experiment={selectedNode.kind === "experiment" ? {
          runs: runsByNode.get(selectedNode.id) ?? [],
          onReadLog: readExperimentLog,
        } : undefined}
      /> : null}
      </div>
    </>}
    {error ? <div className="research-graph-error">{error}</div> : null}
  </div>;

  if (expanded) {
    return <Dialog open onClose={() => setExpanded(false)} size="full" className="research-graph-expanded" ariaLabel={t("Research graph")}>
      <header className="research-graph-expanded-head">
        <span className="research-graph-expanded-title">
          <i aria-hidden="true" />
          {t("Research graph")}
        </span>
        <span className="agent-path-project" title={threadTitle}>{projectName}</span>
        {hasThread && <span className="research-graph-session" title={threadTitle}>{threadTitle}</span>}
        {pinned && <span className="agent-path-pin-state inactive" title={threadInactive ? threadTitle : undefined}>{t("Pinned")}</span>}
        <span className="agent-path-count">{visibleNodeCount}</span>
        <div className="agent-path-actions">{actions}</div>
      </header>
      {content}
    </Dialog>;
  }

  return <div className="agent-path-panel research-graph-panel dock-panel">
    <header className="agent-path-head dock-panel-head">
      <span className="agent-path-project" title={threadTitle}>
        <i aria-hidden="true" />
        {projectName}
      </span>
      {hasThread && <span className="research-graph-session" title={threadTitle}>{threadTitle}</span>}
      {pinned && <span className="agent-path-pin-state inactive" title={threadInactive ? threadTitle : undefined}>{t("Pinned")}</span>}
      <span className="agent-path-count">{visibleNodeCount}</span>
      <div className="agent-path-actions">{actions}</div>
    </header>
    {content}
  </div>;
}
