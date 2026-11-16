import { useUISettings } from "../i18n";
import ExperimentInspector from "./ExperimentInspector";
import type { ExperimentRun, ResearchNode } from "./types";

export type ExperimentInspectorActions = {
  runs: ExperimentRun[];
  onReadLog: (runId: string) => Promise<string>;
};

type Props = {
  node: ResearchNode;
  experiment?: ExperimentInspectorActions;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  retracted: "Retracted",
};

/**
 * Read-only node view. The model creates and updates graph nodes from the main
 * conversation; this inspector never asks the user to author graph content.
 */
export default function NodeInspector({ node, experiment }: Props) {
  const { t } = useUISettings();
  const content = node.current_revision?.content ?? {};

  return <div className={`research-graph-inspector${node.kind === "experiment" ? " experiment" : ""}`}>
    <div className="research-graph-inspector-head">
      <strong>{node.title}</strong>
      <span>{t(STATUS_LABELS[node.status] || node.status)}</span>
    </div>
    {node.summary && <p className="research-graph-summary">{node.summary}</p>}
    {node.kind === "experiment" && experiment
      ? <ExperimentInspector node={node} runs={experiment.runs} onReadLog={experiment.onReadLog} />
      : <details className="research-graph-content-details" open>
        <summary>{t("Content")}</summary>
        <pre className="research-graph-content-json">{JSON.stringify(content, null, 2)}</pre>
      </details>}
  </div>;
}
