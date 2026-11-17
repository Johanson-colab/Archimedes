import { useState } from "react";
import { FileText } from "lucide-react";
import { useUISettings } from "../i18n";
import type { ExperimentRun, ExperimentRunStatus, ResearchNode } from "./types";

type Props = {
  node: ResearchNode;
  runs: ExperimentRun[];
  onReadLog: (runId: string) => Promise<string>;
  connections?: Array<{ nodeId: string; title: string }>;
};

const RUN_STATUS_LABELS: Record<ExperimentRunStatus, string> = {
  starting: "Run starting",
  running: "Run running",
  succeeded: "Run succeeded",
  failed: "Run failed",
  cancelled: "Run cancelled",
};

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function metricsValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return text(value);
}

function timeLabel(run: ExperimentRun): string {
  const value = run.started_at || run.created_at;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Read-only experiment view. The graph is authored by the model from the main
 * conversation; this inspector only shows what the model recorded and the
 * evidence it produced.
 */
export default function ExperimentInspector({ node, runs, onReadLog, connections = [] }: Props) {
  const { t } = useUISettings();
  const content = node.current_revision?.content ?? {};
  const [log, setLog] = useState<{ runId: string; text: string } | null>(null);
  const [readingLog, setReadingLog] = useState<string | null>(null);

  const fields = [
    { label: "Experiment hypothesis", value: text(content.hypothesis) || text(content.plan) },
    { label: "Experiment baseline", value: text(content.baseline) },
    { label: "Experiment method", value: text(content.method) },
    { label: "Experiment metrics", value: metricsValue(content.metrics) },
    { label: "Experiment stop criteria", value: text(content.stopCriteria) },
  ].filter((field) => field.value);

  const readLog = async (runId: string) => {
    if (log?.runId === runId) {
      setLog(null);
      return;
    }
    setReadingLog(runId);
    try {
      setLog({ runId, text: await onReadLog(runId) });
    } finally {
      setReadingLog(null);
    }
  };

  return <>
    <details className="experiment-section" open>
      <summary>{t("Experiment plan")}</summary>
      {fields.length === 0
        ? <p className="experiment-hint">{t("The agent will fill this plan from the conversation.")}</p>
        : fields.map((field) => <div className="experiment-plan-row" key={field.label}>
          <span>{t(field.label)}</span>
          <p>{field.value}</p>
        </div>)}
    </details>

    <details className="experiment-section" open>
      <summary>{t("Experiment runs")}</summary>
      {runs.length === 0
        ? <p className="experiment-hint">{t("The agent has not run this experiment yet.")}</p>
        : <div className="experiment-run-list">
          {runs.slice().reverse().map((run, index) => {
            const source = run.provenance;
            const snapshot = source?.codeSnapshot;
            return <details className="experiment-run-entry" key={run.id}>
              <summary className={`experiment-run-row status-${run.status}`}>
                <span className="experiment-run-number">{t("Run")} {runs.length - index}</span>
                <span className="experiment-run-status">{t(RUN_STATUS_LABELS[run.status])}</span>
                <span className="experiment-run-time">{timeLabel(run)}</span>
                {run.exit_code != null && <span className="experiment-run-exit">{t("Exit code")} {run.exit_code}</span>}
              </summary>
              <div className="experiment-run-details">
                <div className="experiment-plan-row"><span>{t("Command")}</span><p className="experiment-run-code">{run.command}</p></div>
                <div className="experiment-plan-row"><span>{t("Working directory")}</span><p className="experiment-run-code">{run.cwd}</p></div>
                <div className="experiment-plan-row"><span>{t("Experiment revision")}</span><p className="experiment-run-code">{source?.experimentRevisionId || t("Not recorded")}</p></div>
                <div className="experiment-plan-row"><span>{t("Source ideas")}</span>{source?.ideas?.length
                  ? source.ideas.map((idea, ideaIndex) => <p key={`${idea.nodeId}-${idea.revisionId}-${ideaIndex}`}>{connections.find(item => item.nodeId === idea.nodeId)?.title || idea.nodeId} <code title={idea.revisionId}>{idea.revisionId?.slice(0, 8) || "—"}</code></p>)
                  : <p>{t("Not recorded")}</p>}</div>
                {source?.workspace?.parentRunId && <div className="experiment-plan-row"><span>{t("Parent run")}</span><p className="experiment-run-code">{source.workspace.parentRunId}</p></div>}
                <div className="experiment-plan-row"><span>{t("Git branch")}</span><p className="experiment-run-code">{source?.workspace?.branchName || t("Not recorded")}</p></div>
                <div className="experiment-plan-row"><span>{t("Git commit")}</span><p className="experiment-run-code">{run.commit_sha || t("Not recorded")}</p></div>
                <div className="experiment-plan-row"><span>{t("Code snapshot")}</span><p>{snapshot ? t("Snapshot recorded") : t("Not recorded")}</p></div>
                {snapshot && <>
                  <div className="experiment-plan-row"><span>{t("Snapshot path")}</span><p className="experiment-run-code">{snapshot.path}</p></div>
                  <div className="experiment-plan-row"><span>SHA-256</span><p className="experiment-run-code">{snapshot.sha256}</p></div>
                  <p className="experiment-hint">{t("Snapshot excludes ignored files, submodule contents, export-ignored files, data and runtime environment; Git LFS files may be pointers.")}</p>
                </>}
                {run.evidence?.map((report, reportIndex) => <details className="experiment-evidence-report" key={report.id}>
                  <summary>{t("Reported evidence")} {reportIndex + 1}</summary>
                  <p className="experiment-hint">{t("Values are agent-reported; file references may change after registration.")}</p>
                  {Object.entries(report.metrics).map(([name, value]) => <div className="experiment-plan-row" key={name}><span>{name}</span><p className="experiment-run-code">{String(value)}</p></div>)}
                  {report.artifacts.length > 0 && <div className="experiment-plan-row"><span>{t("Run workspace")}</span><p className="experiment-run-code">{run.provenance?.workspace?.root || run.cwd}</p></div>}
                  {report.artifacts.map((file, fileIndex) => <div className="experiment-plan-row" key={`${file.path}-${fileIndex}`}>
                    <span>{t("Referenced file")} · {file.sizeBytes} B</span><p className="experiment-run-code">{file.path}</p>
                    <span>SHA-256</span><p className="experiment-run-code">{file.sha256}</p>
                  </div>)}
                </details>)}
                {run.error && <div className="experiment-plan-row"><span>{t("Run error")}</span><p>{run.error}</p></div>}
                <button type="button" className="experiment-run-link" onClick={() => void readLog(run.id)} disabled={readingLog === run.id}>
                  <FileText size={12} />{t("Run log")}
                </button>
                {log?.runId === run.id && <pre className="experiment-run-log" title={run.log_path || ""}>{log.text}</pre>}
              </div>
            </details>;
          })}
        </div>}
    </details>
  </>;
}
