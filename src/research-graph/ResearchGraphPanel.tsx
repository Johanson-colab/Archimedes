import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, History, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { useUISettings } from "../i18n";
import { layoutTree } from "./graphLayout";
import NodeInspector, { type ChildOption } from "./NodeInspector";
import ResearchGraphView from "./ResearchGraphView";
import type { ExperimentRun, ExperimentVerdict, ResearchEdgeKind, ResearchGraph, ResearchGraphUpdate, ResearchNodeKind } from "./types";

type Props = {
  projectId: string | null;
  threadId: string | null;
  projectName: string;
  threadTitle: string;
  hasThread: boolean;
  mode: string;
  workspace: string;
  version?: number;
  update?: ResearchGraphUpdate | null;
  onOpenThread: () => void;
  onCollapse: () => void;
};

const IDEA_STAGE_CHILD_OPTIONS: Record<ResearchNodeKind, ChildOption[]> = {
  question: [{ kind: "idea", edge: "generates", label: "Idea" }],
  idea: [{ kind: "idea", edge: "refines", label: "Idea" }],
  experiment: [],
  result: [],
  writing: [],
};

const EXPERIMENT_STAGE_CHILD_OPTIONS: Record<ResearchNodeKind, ChildOption[]> = {
  question: [{ kind: "idea", edge: "generates", label: "Idea" }],
  idea: [
    { kind: "experiment", edge: "tests", label: "Experiment" },
    { kind: "idea", edge: "refines", label: "Idea" },
  ],
  experiment: [{ kind: "experiment", edge: "extends", label: "Next round" }],
  result: [
    { kind: "writing", edge: "cite-after-create", label: "Writing" },
    { kind: "idea", edge: "informs", label: "Idea" },
  ],
  writing: [],
};

const IDEA_STAGE_EDGES = new Set(["generates", "refines"]);
const EXPERIMENT_STAGE_EDGES = new Set(["generates", "refines", "tests", "extends", "replicates", "produces"]);

export default function ResearchGraphPanel({
  projectId,
  threadId,
  projectName,
  threadTitle,
  hasThread,
  mode,
  workspace,
  version = 0,
  update = null,
  onOpenThread,
  onCollapse,
}: Props) {
  const { t } = useUISettings();
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
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
  const [viewStage, setViewStage] = useState<"ideas" | "experiments">(mode === "experiment-setup" ? "experiments" : "ideas");

  useEffect(() => {
    setViewStage(mode === "experiment-setup" ? "experiments" : "ideas");
  }, [mode]);

  const ideaStage = viewStage === "ideas";
  const allowedEdgeKinds = ideaStage ? IDEA_STAGE_EDGES : EXPERIMENT_STAGE_EDGES;
  const childOptionsByKind = ideaStage ? IDEA_STAGE_CHILD_OPTIONS : EXPERIMENT_STAGE_CHILD_OPTIONS;

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
    window.researchDesk.listResearchGraph({ projectId, threadId, includeArchived: false })
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

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  const stageNodes = useMemo(() => {
    if (!graph) return [];
    if (ideaStage) return graph.nodes.filter((node) => node.kind === "question" || node.kind === "idea");
    return graph.nodes.filter((node) => node.kind !== "writing");
  }, [graph, ideaStage]);
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
    const nodes = showHistory ? stageNodes : stageNodes.filter((node) => node.status !== "retracted");
    const visibleIds = new Set(nodes.map((node) => node.id));
    return layoutTree({
      ...graph,
      nodes,
      edges: graph.edges.filter((edge) =>
        allowedEdgeKinds.has(edge.kind)
        && visibleIds.has(edge.from_node)
        && visibleIds.has(edge.to_node)),
    });
  }, [graph, stageNodes, showHistory, allowedEdgeKinds]);
  const selectedNode = stageNodes.find((node) => node.id === selectedId && (showHistory || node.status !== "retracted")) ?? null;
  const retractedCount = stageNodes.filter((node) => node.status === "retracted").length;
  const visibleNodeCount = showHistory ? stageNodes.length : stageNodes.length - retractedCount;
  const hasExperiments = graph?.nodes.some((node) => node.kind === "experiment") ?? false;
  const childOptions = selectedNode && selectedNode.status !== "retracted" ? childOptionsByKind[selectedNode.kind] : [];

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
    if (!projectId || !threadId || !title || busy || !window.researchDesk?.createResearchNode) return;
    setBusy(true);
    setError("");
    try {
      const node = await window.researchDesk.createResearchNode({
        projectId,
        threadId,
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
    if (!projectId || !threadId || !selectedNode || busy || !window.researchDesk?.createResearchNode) return;
    setBusy(true);
    setError("");
    try {
      let child;
      if (option.edge === "cite-after-create") {
        child = await window.researchDesk.createResearchNode({
          projectId,
          threadId,
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
        const parents: Array<{ nodeId: string; kind: ResearchEdgeKind }> = [{ nodeId: selectedNode.id, kind: option.edge }];
        if (option.edge === "extends" && selectedNode.kind === "experiment") {
          for (const edge of graph?.edges ?? []) {
            if (edge.to_node !== selectedNode.id || edge.kind !== "tests") continue;
            if (!parents.some((parent) => parent.nodeId === edge.from_node && parent.kind === "tests")) {
              parents.push({ nodeId: edge.from_node, kind: "tests" });
            }
          }
        }
        const parentRun = option.edge === "extends"
          ? (runsByNode.get(selectedNode.id) ?? []).find((run) => run.status === "succeeded")
          : null;
        child = await window.researchDesk.createResearchNode({
          projectId,
          threadId,
          kind: option.kind,
          title,
          content: parentRun ? { runCommand: parentRun.command } : {},
          parents,
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

  const updateNodePlan = async (content: Record<string, unknown>) => {
    if (!selectedNode || !window.researchDesk?.reviseResearchNode) return;
    setError("");
    try {
      await window.researchDesk.reviseResearchNode({ nodeId: selectedNode.id, content });
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the experiment plan."));
      throw cause;
    }
  };

  const startExperiment = async (command: string) => {
    if (!projectId || !threadId || !selectedNode || !workspace || !window.researchDesk?.startExperimentRun) return;
    setError("");
    try {
      const run = await window.researchDesk.startExperimentRun({
        projectId,
        threadId,
        nodeId: selectedNode.id,
        command,
        workspace,
      });
      setRuns((current) => [...current.filter((item) => item.id !== run.id), run]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not start the experiment run."));
      throw cause;
    }
  };

  const cancelExperiment = async (runId: string) => {
    if (!window.researchDesk?.cancelExperimentRun) return;
    setError("");
    try {
      const run = await window.researchDesk.cancelExperimentRun(runId);
      setRuns((current) => current.map((item) => item.id === run.id ? run : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not cancel the experiment run."));
      throw cause;
    }
  };

  const createResult = async (run: ExperimentRun, verdict: ExperimentVerdict, reasoning: string) => {
    if (!window.researchDesk?.createResultFromRun) return;
    setError("");
    try {
      const result = await window.researchDesk.createResultFromRun({ runId: run.id, verdict, reasoning });
      setSelectedId(result.id);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not create the result."));
      throw cause;
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
    {(hasExperiments || mode === "experiment-setup") && <div className="research-graph-stage-switch" role="group" aria-label={t("Research graph stage")}>
      <button type="button" className={viewStage === "ideas" ? "active" : ""} aria-pressed={viewStage === "ideas"} onClick={() => setViewStage("ideas")}>{t("Ideas")}</button>
      <button type="button" className={viewStage === "experiments" ? "active" : ""} aria-pressed={viewStage === "experiments"} onClick={() => setViewStage("experiments")}>{t("Experiments")}</button>
    </div>}
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
        {layout ? <ResearchGraphView layout={layout} selectedId={selectedId} runsByNode={runsByNode} onSelect={setSelectedId} /> : null}
      </div>
      {selectedNode ? <NodeInspector
        node={selectedNode}
        childOptions={childOptions}
        busy={busy}
        experiment={selectedNode.kind === "experiment" ? {
          runs: runsByNode.get(selectedNode.id) ?? [],
          onSavePlan: updateNodePlan,
          onStartRun: startExperiment,
          onCancelRun: cancelExperiment,
          onCreateResult: createResult,
          onReadLog: readExperimentLog,
        } : undefined}
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
