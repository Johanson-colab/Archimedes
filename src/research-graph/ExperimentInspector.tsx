import { useEffect, useState, type FormEvent } from "react";
import { CircleStop, FileText, Play } from "lucide-react";
import { useUISettings } from "../i18n";
import type { ExperimentRun, ExperimentRunStatus, ExperimentVerdict, ResearchNode } from "./types";

type Props = {
  node: ResearchNode;
  runs: ExperimentRun[];
  busy: boolean;
  onSavePlan: (content: Record<string, unknown>) => Promise<void>;
  onStartRun: (command: string) => Promise<void>;
  onCancelRun: (runId: string) => Promise<void>;
  onCreateResult: (run: ExperimentRun, verdict: ExperimentVerdict, reasoning: string) => Promise<void>;
  onReadLog: (runId: string) => Promise<string>;
};

const VERDICTS: Array<{ value: ExperimentVerdict; label: string }> = [
  { value: "supports", label: "Supports" },
  { value: "contradicts", label: "Contradicts" },
  { value: "inconclusive", label: "Inconclusive" },
];

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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ExperimentInspector({
  node,
  runs,
  busy,
  onSavePlan,
  onStartRun,
  onCancelRun,
  onCreateResult,
  onReadLog,
}: Props) {
  const { t } = useUISettings();
  const content = node.current_revision?.content ?? {};
  const [hypothesis, setHypothesis] = useState("");
  const [baseline, setBaseline] = useState("");
  const [method, setMethod] = useState("");
  const [metrics, setMetrics] = useState("");
  const [stopCriteria, setStopCriteria] = useState("");
  const [runCommand, setRunCommand] = useState("");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [resultRunId, setResultRunId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<ExperimentVerdict>("inconclusive");
  const [reasoning, setReasoning] = useState("");
  const [creatingResult, setCreatingResult] = useState(false);
  const [log, setLog] = useState<{ runId: string; text: string } | null>(null);
  const [readingLog, setReadingLog] = useState<string | null>(null);

  useEffect(() => {
    const next = node.current_revision?.content ?? {};
    setHypothesis(text(next.hypothesis) || text(next.plan));
    setBaseline(text(next.baseline));
    setMethod(text(next.method));
    setMetrics(metricsValue(next.metrics));
    setStopCriteria(text(next.stopCriteria));
    setRunCommand(text(next.runCommand));
    setResultRunId(null);
    setReasoning("");
    setLog(null);
  }, [node.id, node.current_revision_id]);

  const activeRun = runs.find((run) => run.status === "starting" || run.status === "running") ?? null;
  const answerRun = runs.find((run) => run.status === "succeeded") ?? null;
  const latestRun = runs.at(-1) ?? null;
  const completed = Boolean(answerRun);
  const planLocked = completed || Boolean(activeRun);
  const displayCommand = answerRun?.command ?? (runCommand || latestRun?.command || "");

  const savePlan = async () => {
    if (saving || planLocked) return;
    setSaving(true);
    try {
      await onSavePlan({
        ...content,
        hypothesis: hypothesis.trim(),
        baseline: baseline.trim(),
        method: method.trim(),
        metrics: metrics.split(",").map((item) => item.trim()).filter(Boolean),
        stopCriteria: stopCriteria.trim(),
        runCommand: runCommand.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    if (starting || activeRun || !displayCommand.trim()) return;
    setStarting(true);
    try {
      await onStartRun(displayCommand.trim());
    } finally {
      setStarting(false);
    }
  };

  const cancel = async (runId: string) => {
    if (cancelling) return;
    setCancelling(runId);
    try {
      await onCancelRun(runId);
    } finally {
      setCancelling(null);
    }
  };

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

  const createResult = async (event: FormEvent) => {
    event.preventDefault();
    const run = runs.find((item) => item.id === resultRunId);
    if (!run || creatingResult) return;
    setCreatingResult(true);
    try {
      await onCreateResult(run, verdict, reasoning.trim());
      setResultRunId(null);
      setReasoning("");
    } finally {
      setCreatingResult(false);
    }
  };

  return <>
    <details className="experiment-section" open>
      <summary>{t("Experiment plan")}</summary>
      {completed && <p className="experiment-hint">{t("This experiment is frozen after a successful run. Create a next round to change it.")}</p>}
      {!completed && activeRun && <p className="experiment-hint">{t("Wait for the active run to finish before changing the experiment plan.")}</p>}
      <label className="experiment-field">
        <span>{t("Experiment hypothesis")}</span>
        <textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} rows={2} disabled={planLocked || saving} />
      </label>
      <label className="experiment-field">
        <span>{t("Experiment baseline")}</span>
        <input value={baseline} onChange={(event) => setBaseline(event.target.value)} disabled={planLocked || saving} />
      </label>
      <label className="experiment-field">
        <span>{t("Experiment method")}</span>
        <textarea value={method} onChange={(event) => setMethod(event.target.value)} rows={2} disabled={planLocked || saving} />
      </label>
      <label className="experiment-field">
        <span>{t("Experiment metrics")}</span>
        <input value={metrics} onChange={(event) => setMetrics(event.target.value)} placeholder="accuracy, loss" disabled={planLocked || saving} />
      </label>
      <label className="experiment-field">
        <span>{t("Experiment stop criteria")}</span>
        <input value={stopCriteria} onChange={(event) => setStopCriteria(event.target.value)} disabled={planLocked || saving} />
      </label>
      <button type="button" className="experiment-save" onClick={() => void savePlan()} disabled={planLocked || saving || busy}>
        {t("Save plan")}
      </button>
    </details>

    <details className="experiment-section" open>
      <summary>{t("Experiment runs")}</summary>
      <div className="experiment-run-command">
        <input
          value={displayCommand}
          onChange={(event) => setRunCommand(event.target.value)}
          placeholder={t("Experiment command")}
          readOnly={Boolean(answerRun) || Boolean(activeRun)}
          disabled={starting}
          aria-label={t("Experiment command")}
        />
        {activeRun ? (
          <button type="button" className="experiment-run-button stop" onClick={() => void cancel(activeRun.id)} disabled={Boolean(cancelling)}>
            <CircleStop size={11} />
            {t("Stop run")}
          </button>
        ) : (
          <button type="button" className="experiment-run-button" onClick={() => void start()} disabled={starting || !displayCommand.trim() || busy}>
            <Play size={11} />
            {t(completed ? "Run again" : "Run experiment")}
          </button>
        )}
      </div>
      {runs.length === 0 && <p className="experiment-hint">{t("No experiment runs yet.")}</p>}
      <div className="experiment-run-list">
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
          {run.status === "succeeded" && <button type="button" className="experiment-run-link" onClick={() => setResultRunId(run.id)}>
            {t("Create result")}
          </button>}
        </div>)}
      </div>
      {log && <pre className="experiment-run-log" title={runs.find((run) => run.id === log.runId)?.log_path || ""}>{log.text}</pre>}
    </details>

    {resultRunId && <form className="experiment-result-form" onSubmit={(event) => void createResult(event)}>
      <span className="experiment-result-title">{t("Create result from run")}</span>
      <div className="experiment-result-row">
        <select aria-label={t("Create result from run")} value={verdict} onChange={(event) => setVerdict(event.target.value as ExperimentVerdict)} disabled={creatingResult}>
          {VERDICTS.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
        </select>
        <button type="submit" disabled={creatingResult}>{t("Create result")}</button>
      </div>
      <textarea
        value={reasoning}
        onChange={(event) => setReasoning(event.target.value)}
        placeholder={t("What does the run show?")}
        aria-label={t("What does the run show?")}
        rows={3}
        disabled={creatingResult}
      />
    </form>}
  </>;
}
