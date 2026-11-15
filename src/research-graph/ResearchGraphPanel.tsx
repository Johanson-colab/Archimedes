import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, History, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { useUISettings } from "../i18n";
import { layoutGraph } from "./graphLayout";
import NodeInspector, { type ChildOption } from "./NodeInspector";
import ResearchGraphView from "./ResearchGraphView";
import type { ResearchGraph, ResearchGraphUpdate, ResearchNodeKind } from "./types";

type Props = {
  projectId: string | null;
  projectName: string;
  threadTitle: string;
  hasThread: boolean;
  version?: number;
  update?: ResearchGraphUpdate | null;
  onOpenThread: () => void;
  onCollapse: () => void;
};

const CHILD_OPTIONS: Record<ResearchNodeKind, ChildOption[]> = {
  question: [{ kind: "idea", edge: "generates", label: "Idea" }],
  idea: [
    { kind: "experiment", edge: "tests", label: "Experiment" },
    { kind: "idea", edge: "refines", label: "Idea" },
  ],
  experiment: [{ kind: "result", edge: "produces", label: "Result" }],
  result: [
    { kind: "writing", edge: "cite-after-create", label: "Writing" },
    { kind: "idea", edge: "informs", label: "Idea" },
  ],
  writing: [],
};

export default function ResearchGraphPanel({
  projectId,
  projectName,
  threadTitle,
  hasThread,
  version = 0,
  update = null,
  onOpenThread,
  onCollapse,
}: Props) {
  const { t } = useUISettings();
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setGraph(null);
      setSelectedId(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    if (!window.researchDesk?.listResearchGraph) {
      setGraph({ projectId, nodes: [], edges: [] });
      setLoading(false);
      return;
    }
    window.researchDesk.listResearchGraph({ projectId, includeArchived: false })
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
  }, [projectId, refreshKey, version, t]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  const layout = useMemo(() => {
    if (!graph) return null;
    const nodes = showHistory ? graph.nodes : graph.nodes.filter((node) => node.status !== "retracted");
    const visibleIds = new Set(nodes.map((node) => node.id));
    return layoutGraph({ ...graph, nodes, edges: graph.edges.filter((edge) => visibleIds.has(edge.from_node) && visibleIds.has(edge.to_node)) });
  }, [graph, showHistory]);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedId && (showHistory || node.status !== "retracted")) ?? null;
  const retractedCount = graph?.nodes.filter((node) => node.status === "retracted").length ?? 0;
  const visibleNodeCount = graph ? (showHistory ? graph.nodes.length : graph.nodes.length - retractedCount) : 0;
  const childOptions = selectedNode && selectedNode.status !== "retracted" ? CHILD_OPTIONS[selectedNode.kind] : [];

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
      setDismissedUpdate(update.turnId);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not undo the research graph update."));
    } finally {
      setUndoing(false);
    }
  };

  const createQuestion = async () => {
    const title = question.trim();
    if (!projectId || !title || busy || !window.researchDesk?.createResearchNode) return;
    setBusy(true);
    setError("");
    try {
      const node = await window.researchDesk.createResearchNode({
        projectId,
        kind: "question",
        status: "active",
        title,
        content: { question: title },
      });
      setQuestion("");
      setSelectedId(node.id);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not create the research node."));
    } finally {
      setBusy(false);
    }
  };

  const createChild = async (option: ChildOption, title: string) => {
    if (!projectId || !selectedNode || busy || !window.researchDesk?.createResearchNode) return;
    setBusy(true);
    setError("");
    try {
      let child;
      if (option.edge === "cite-after-create") {
        child = await window.researchDesk.createResearchNode({
          projectId,
          kind: option.kind,
          title,
          content: {},
        });
        await window.researchDesk.linkResearchNodes({
          fromNodeId: child.id,
          toNodeId: selectedNode.id,
          kind: "cites",
        });
      } else {
        child = await window.researchDesk.createResearchNode({
          projectId,
          kind: option.kind,
          title,
          content: {},
          parents: [{ nodeId: selectedNode.id, kind: option.edge }],
        });
      }
      setSelectedId(child.id);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not create the research node."));
    } finally {
      setBusy(false);
    }
  };

  const actions = <>
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
      onClick={() => setExpanded((value) => !value)}
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
    {update && update.projectId === projectId && update.nodeCount + update.edgeCount > 0 && dismissedUpdate !== update.turnId && (
      <div className="research-graph-update" role="status" aria-live="polite">
        <span>{t("Research graph updated")} · +{update.nodeCount} {t("nodes")} · +{update.edgeCount} {t("edges")}{update.superseded?.length ? ` · ${update.superseded.length} ${t("previous ideas moved to history")}` : ""}</span>
        {(update.createdNodeIds.length > 0 || (update.superseded?.length ?? 0) > 0) && <button type="button" disabled={undoing} onClick={() => void undoUpdate()}>{t(undoing ? "Undoing…" : "Undo")}</button>}
        <button type="button" className="research-graph-update-dismiss" onClick={() => setDismissedUpdate(update.turnId)} aria-label={t("Dismiss")} title={t("Dismiss")}><X size={11} /></button>
      </div>
    )}
    {!projectId ? <div className="research-graph-empty">{t("No project selected")}</div> : graph && graph.nodes.length === 0 ? (
      <div className="research-graph-empty">
        <strong>{t("No research graph yet")}</strong>
        <p>{t("Start with a question")}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createQuestion();
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("Question")}
            aria-label={t("Question")}
            maxLength={200}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !question.trim()}>{t("Create question")}</button>
        </form>
      </div>
    ) : <>
      <div className="research-graph-body">
        {loading && !graph ? <span className="research-graph-loading">{t("Refresh graph")}…</span> : null}
        {layout ? <ResearchGraphView layout={layout} selectedId={selectedId} onSelect={setSelectedId} /> : null}
      </div>
      {selectedNode ? <NodeInspector
        node={selectedNode}
        childOptions={childOptions}
        busy={busy}
        onCreateChild={createChild}
      /> : null}
    </>}
    {error ? <div className="research-graph-error">{error}</div> : null}
  </div>;

  if (expanded) {
    return createPortal(<div className="research-graph-expanded" role="dialog" aria-modal="true" aria-label={t("Research graph")}>
      <header className="research-graph-expanded-head">
        <span className="research-graph-expanded-title">
          <i aria-hidden="true" />
          {t("Research graph")}
        </span>
        <span className="agent-path-project" title={threadTitle}>{projectName}</span>
        <span className="agent-path-count">{visibleNodeCount}</span>
        <div className="agent-path-actions">{actions}</div>
      </header>
      {content}
    </div>, document.body);
  }

  return <div className="agent-path-panel research-graph-panel dock-panel">
    <header className="agent-path-head dock-panel-head">
      <span className="agent-path-project" title={threadTitle}>
        <i aria-hidden="true" />
        {projectName}
      </span>
      <span className="agent-path-count">{visibleNodeCount}</span>
      <div className="agent-path-actions">{actions}</div>
    </header>
    {content}
  </div>;
}
