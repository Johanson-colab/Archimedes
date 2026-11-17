import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, History, Maximize2, Minimize2, PanelRight, Pin, RefreshCw, X } from "lucide-react";
import { useUISettings } from "../i18n";
import { Dialog } from "../Dialog";
import { layoutLineage } from "./graphLayout";
import NodeInspector from "./NodeInspector";
import ResearchGraphView from "./ResearchGraphView";
import type { ExperimentRun, ResearchGraph, ResearchGraphUpdate } from "./types";

type Props = {
  projectId: string | null;
  threadId: string | null;
  projectName: string;
  threadTitle: string;
  hasThread: boolean;
  mode: string;
  version?: number;
  update?: ResearchGraphUpdate | null;
  pinned?: boolean;
  threadInactive?: boolean;
  onTogglePin?: () => void;
  onOpenThread: () => void;
  onCollapse: () => void;
};

const IDEA_STAGE_EDGES = new Set(["generates", "refines", "merges"]);

export default function ResearchGraphPanel({
  projectId,
  threadId,
  projectName,
  threadTitle,
  hasThread,
  mode,
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
  const [viewStage, setViewStage] = useState<"ideas" | "experiments" | "all">(mode === "experiment-setup" ? "experiments" : "ideas");

  useEffect(() => { setGraph(null); setRuns([]); setSelectedId(null); setFocusedId(null); setInspectorOpen(false); }, [projectId, threadId]);

  useEffect(() => {
    setViewStage(mode === "experiment-setup" ? "experiments" : "ideas");
  }, [mode]);

  const ideaStage = viewStage === "ideas";

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

  const stageNodes = useMemo(() => {
    if (!graph) return [];
    if (ideaStage) return graph.nodes.filter((node) => node.kind === "question" || node.kind === "idea");
    return viewStage === "all" ? graph.nodes : graph.nodes.filter((node) => node.kind !== "writing");
  }, [graph, ideaStage, viewStage]);
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
  const layout = useMemo(() => {
    if (!graph) return null;
    const nodes = showHistory ? stageNodes : stageNodes.filter((node) => node.status !== "retracted" && !node.archived);
    const visibleIds = new Set(nodes.map((node) => node.id));
    return layoutLineage({
      ...graph,
      nodes,
      edges: graph.edges.filter((edge) =>
        (!ideaStage || IDEA_STAGE_EDGES.has(edge.kind))
        && visibleIds.has(edge.from_node)
        && visibleIds.has(edge.to_node)),
    });
  }, [graph, stageNodes, showHistory, ideaStage]);
  const selectedNode = layout?.nodes.find(({ node }) => node.id === selectedId)?.node ?? layout?.nodes[0]?.node ?? null;
  const visibleFocusId = layout?.nodes.some(({ node }) => node.id === focusedId) ? focusedId : null;
  const retractedCount = stageNodes.filter((node) => node.status === "retracted" || node.archived).length;
  const visibleNodeCount = showHistory ? stageNodes.length : stageNodes.length - retractedCount;
  const hasExperiments = graph?.nodes.some((node) => node.kind === "experiment") ?? false;

  const refresh = () => setRefreshKey((key) => key + 1);

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
    {(graph?.nodes.length || hasExperiments || mode === "experiment-setup") ? <div className="research-graph-stage-switch" role="group" aria-label={t("Research graph stage")}>
      <button type="button" className={viewStage === "ideas" ? "active" : ""} aria-pressed={viewStage === "ideas"} onClick={() => setViewStage("ideas")}>{t("Ideas")}</button>
      <button type="button" className={viewStage === "experiments" ? "active" : ""} aria-pressed={viewStage === "experiments"} onClick={() => setViewStage("experiments")}>{t("Experiments")}</button>
      <button type="button" className={viewStage === "all" ? "active" : ""} aria-pressed={viewStage === "all"} onClick={() => setViewStage("all")}>{t("All activity")}</button>
    </div> : null}
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
        {layout ? <ResearchGraphView layout={layout} selectedId={selectedNode?.id ?? null} focusedId={visibleFocusId} runsByNode={runsByNode} onSelect={(id) => { setSelectedId(id); setFocusedId(current => current === id ? null : id); setInspectorOpen(true); }} /> : null}
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
          setViewStage("all");
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
