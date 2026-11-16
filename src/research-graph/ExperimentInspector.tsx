import { useState } from "react";
import { FileText } from "lucide-react";
import { useUISettings } from "../i18n";
import type { ExperimentRun, ExperimentRunStatus, ResearchNode } from "./types";

type Props = {
  node: ResearchNode;
  runs: ExperimentRun[];
  onReadLog: (runId: string) => Promise<string>;
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
export default function ExperimentInspector({ node, runs, onReadLog }: Props) {
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
          {runs.slice().reverse().map((run) => <div
            className={`experiment-run-row status-${run.status}`}
            key={run.id}
            title={`${run.command}${run.commit_sha ? `\ncommit ${run.commit_sha.slice(0, 7)}` : ""}`}
          >
            <span className="experiment-run-status">{t(RUN_STATUS_LABELS[run.status])}</span>
            <span className="experiment-run-time">{timeLabel(run)}</span>
            {run.exit_code != null && <span className="experiment-run-exit">exit {run.exit_code}</span>}
            <button type="button" className="experiment-run-link" onClick={() => void readLog(run.id)} disabled={readingLog === run.id}>
              <FileText size={10} />
              {t("Run log")}
            </button>
          </div>)}
        </div>}
      {log && <pre className="experiment-run-log" title={runs.find((run) => run.id === log.runId)?.log_path || ""}>{log.text}</pre>}
    </details>
  </>;
}
