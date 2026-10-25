import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, BookOpenCheck, Check, ChevronDown, ChevronUp, FileSearch, FlaskConical, Lightbulb, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import { useUISettings } from "./i18n";

type ReviewAgentId = "related" | "method" | "experiments" | "limitations";
type ReviewStatus = "idle" | "working" | "complete" | "error";
type ReviewRun = { status: ReviewStatus; response: string; error: string; repaired?: boolean };
type ReviewPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;

const REVIEWERS: Array<{ id: ReviewAgentId; title: string; subtitle: string; icon: typeof FileSearch }> = [
  { id: "related", title: "Related work", subtitle: "Places the claimed contribution among its closest cited predecessors.", icon: FileSearch },
  { id: "method", title: "Method", subtitle: "Reconstructs the mechanism, assumptions, and implementation dependencies.", icon: ScanSearch },
  { id: "experiments", title: "Experiments", subtitle: "Tests whether the reported evidence is sufficient for each central claim.", icon: FlaskConical },
  { id: "limitations", title: "Limitations", subtitle: "Locates scope boundaries, failure modes, and the next falsification test.", icon: Lightbulb },
];

function initialRuns(): Record<ReviewAgentId, ReviewRun> {
  return Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "idle", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>;
}

function reviewError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "The review could not be completed.");
}

function snapshotFromResult(result: PaperReviewResult): PaperReviewSnapshot {
  return {
    specialists: result.specialists.map(({ id, title, status, response, error, repaired }) => ({ id, title, status, response, error, repaired })),
    supervisor: { verdict: result.supervisor.verdict, repairTargets: result.supervisor.repairTargets, reason: result.supervisor.reason },
    summary: { response: result.summary.response, ...(result.summary.error ? { error: result.summary.error } : {}) },
  };
}

export default function PaperReviewWorkbench({ bridge, workspace, projectId, paper, pageCount, ready, onInternalReviewThreadsDeleted }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paper: ReviewPaper;
  pageCount: number;
  ready: boolean;
  onInternalReviewThreadsDeleted?: (threadIds: string[]) => void;
}) {
  const { language, t } = useUISettings();
  const [runs, setRuns] = useState<Record<ReviewAgentId, ReviewRun>>(initialRuns);
  const [summary, setSummary] = useState<ReviewRun>({ status: "idle", response: "", error: "" });
  const [audit, setAudit] = useState(() => t("The evidence audit will check citations, overclaims, and disagreements before synthesis."));
  const [stage, setStage] = useState(() => t("Ready for a source-grounded review."));
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<ReviewAgentId>>(new Set());
  const runIdRef = useRef<string | null>(null);

  const paperContext = useMemo<ContextAttachment[]>(() => [{
    id: `paper:${paper.id}`,
    type: "paper",
    name: paper.title,
    detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`,
    paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url },
  }], [paper]);

  useEffect(() => bridge.onPaperReviewEvent((event) => {
    if (!runIdRef.current || event.clientRunId !== runIdRef.current) return;
    const localizedStage = event.stage === "specialists" ? t("Related work, method, experiments, and limitations are reading the source in parallel.")
      : event.stage === "specialist_started" ? t("Checking the original PDF for page-cited evidence.")
          : event.stage === "specialist_complete" ? t("An independent evidence note is ready.")
            : event.stage === "specialist_failed" ? event.detail
          : event.stage === "supervisor" ? t("Checking citations, overclaims, and conflicts before synthesis.")
            : event.stage === "repair" ? t("Targeted specialist notes are being checked against the PDF again.")
              : event.stage === "summary" ? t("Combining audited evidence while retaining uncertainty and disagreements.")
                : event.stage === "complete" ? t("The evidence-audited review is ready to read.")
                  : event.detail;
    setStage(localizedStage);
    if (event.stage === "supervisor" || event.stage === "repair") setAudit(localizedStage);
    if (event.stage === "specialist_failed" && event.reviewerId) {
      setRuns((current) => ({
        ...current,
        [event.reviewerId!]: { status: "error", response: "", error: event.detail || t("This reading could not be completed. Try again after checking the model connection." ) },
      }));
    }
  }), [bridge, t]);

  useEffect(() => {
    let active = true;
    setRuns(initialRuns());
    setSummary({ status: "idle", response: "", error: "" });
    void bridge.getLibraryPaperReview(paper.id, workspace).then((saved) => {
      if (!active || !saved || runIdRef.current) return;
      const restored = initialRuns();
      for (const report of saved.specialists) {
        restored[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      }
      setRuns(restored);
      setAudit(saved.supervisor.reason || t("The evidence audit will check citations, overclaims, and disagreements before synthesis."));
      if (saved.summary.error) {
        setSummary({ status: "error", response: "", error: saved.summary.error });
        setStage(saved.summary.error);
      } else if (saved.summary.response) {
        setSummary({ status: "complete", response: saved.summary.response, error: "" });
        setStage(t("The review memorandum is ready. Open any reading to inspect its evidence trail."));
      }
    }).catch(() => {
      // A missing or older workspace has no saved review yet.
    });
    return () => { active = false; };
  }, [bridge, paper.id, t, workspace]);

  useEffect(() => {
    if (!running && summary.status === "idle") {
      setAudit(t("The evidence audit will check citations, overclaims, and disagreements before synthesis."));
      setStage(t("Ready for a source-grounded review."));
    }
  }, [language, running, summary.status, t]);

  useEffect(() => {
    let mounted = true;
    void bridge.cleanupPaperReviewRuns(workspace).then(({ threadIds }) => {
      if (mounted && threadIds.length) onInternalReviewThreadsDeleted?.(threadIds);
    }).catch(() => {
      // Cleanup is best-effort: a review can still run even if no legacy rows exist.
    });
    return () => { mounted = false; };
  }, [bridge, onInternalReviewThreadsDeleted, workspace]);

  const completeCount = REVIEWERS.filter((reviewer) => runs[reviewer.id].status === "complete").length;
  const errorCount = REVIEWERS.filter((reviewer) => runs[reviewer.id].status === "error").length;

  async function runReview() {
    if (running || !workspace || !ready) return;
    const clientRunId = crypto.randomUUID();
    runIdRef.current = clientRunId;
    setRunning(true);
    setExpanded(new Set());
    setStage(t("Four independent readings are starting from the indexed original PDF."));
    setAudit(t("The evidence audit will begin after the independent readings finish."));
    setRuns(Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "working", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>);
    setSummary({ status: "working", response: "", error: "" });

    try {
      const result = await bridge.runPaperReview({
        paper,
        pageCount,
        workspace,
        projectId,
        reasoningEffort: "high",
        contextLength: "extra-long",
        contextItems: paperContext,
        clientRunId,
        language,
      });
      const nextRuns = initialRuns();
      for (const report of result.specialists) {
        nextRuns[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      }
      setRuns(nextRuns);
      try { await bridge.setLibraryPaperReview(paper.id, snapshotFromResult(result), workspace); }
      catch (saveError) { setStage(reviewError(saveError)); }
      if (result.summary.error) {
        setAudit(result.supervisor.reason);
        setSummary({ status: "error", response: "", error: result.summary.error });
        setStage(result.summary.error);
        return;
      }
      setAudit(result.supervisor.repairTargets.length
        ? t("{reason} A targeted repair was completed for {targets}.", { reason: result.supervisor.reason, targets: result.supervisor.repairTargets.map((id) => t(REVIEWERS.find((reviewer) => reviewer.id === id)?.title || id)).join(t(" and ")) })
        : result.supervisor.reason);
      setSummary({ status: "complete", response: result.summary.response, error: "" });
      setStage(t("The review memorandum is ready. Open any reading to inspect its evidence trail."));
    } catch (error) {
      const message = reviewError(error);
      setRuns((current) => Object.fromEntries(REVIEWERS.map((reviewer) => {
        const existing = current[reviewer.id];
        return [reviewer.id, existing.status === "working"
          ? { status: "error", response: "", error: message }
          : existing];
      })) as Record<ReviewAgentId, ReviewRun>);
      setSummary({ status: "error", response: "", error: message });
      setStage(message);
    } finally {
      setRunning(false);
      runIdRef.current = null;
    }
  }

  function toggleExpanded(id: ReviewAgentId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <main className="paper-review-workbench">
    <header className="paper-review-heading">
      <div>
        <p className="paper-review-kicker">{t("Evidence review")}</p>
        <h1>{t("Read the paper against its own record.")}</h1>
        <p className="paper-review-intro">{t("Four independent readings are audited for evidence before one concise research memorandum is written.")}</p>
      </div>
      <button className="paper-review-run" onClick={() => void runReview()} disabled={running || !ready || !workspace}>
        {running ? <LoaderCircle className="spin" size={16} /> : completeCount || errorCount || summary.status === "complete" ? <RefreshCw size={16} /> : <Sparkles size={16} />}
        {running ? t("Reviewing") : completeCount || errorCount || summary.status === "complete" ? t("Review again") : t("Run review")}
      </button>
    </header>

    {!ready && <div className="paper-review-notice"><AlertTriangle size={17} /><div><strong>{t("Prepare the paper first")}</strong><span>{t("The review agents need the locally indexed PDF so their findings can point back to the original pages.")}</span></div></div>}
    {!workspace && <div className="paper-review-notice"><AlertTriangle size={17} /><div><strong>{t("Choose a workspace first")}</strong><span>{t("A workspace keeps this review and its supporting source reads inside Archimedes.")}</span></div></div>}

    <section className="paper-review-route" aria-label={t("Review process")}>
      <div><span>{t("Independent readings")}</span><strong>{completeCount || (running ? t("In progress") : t("Awaiting run"))}</strong></div>
      <div><span>{t("Evidence audit")}</span><strong>{running ? t("Checking") : summary.status === "complete" ? t("Completed") : t("Pending")}</strong></div>
      <div><span>{t("Research memorandum")}</span><strong>{summary.status === "complete" ? t("Ready") : running ? t("Drafting") : t("Pending")}</strong></div>
    </section>

    <section className="paper-review-readings" aria-label={t("Specialist readings")}>
      {REVIEWERS.map((reviewer) => {
        const run = runs[reviewer.id];
        const Icon = reviewer.icon;
        const isExpanded = expanded.has(reviewer.id);
        return <article className={`paper-review-reading ${run.status}`} key={reviewer.id}>
          <header>
            <Icon size={19} strokeWidth={1.7} />
            <div><h2>{t(reviewer.title)}</h2><p>{t(reviewer.subtitle)}</p></div>
            <span className={`paper-review-status ${run.status}`} aria-label={t(run.status === "idle" ? "Idle" : run.status === "working" ? "Working" : run.status === "complete" ? "Completed" : "Error")}>{run.status === "working" ? <LoaderCircle className="spin" size={14} /> : run.status === "complete" ? <Check size={15} /> : run.status === "error" ? <AlertTriangle size={15} /> : null}</span>
          </header>
          {run.status === "idle" && <p className="paper-review-reading-copy">{t("Waiting for the complete PDF review to begin.")}</p>}
          {run.status === "working" && <p className="paper-review-reading-copy">{t("Reading source pages and preparing a page-cited assessment…")}</p>}
          {run.status === "error" && <p className="paper-review-reading-error">{run.error}</p>}
          {run.status === "complete" && <>
            <button className="paper-review-expand" onClick={() => toggleExpanded(reviewer.id)} aria-expanded={isExpanded}>
              <span>{run.repaired ? t("Read repaired evidence note") : t("Read evidence note")}</span>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {isExpanded && <div className="paper-review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{run.response}</ReactMarkdown></div>}
          </>}
        </article>;
      })}
    </section>

    <section className={summary.status === "complete" ? "paper-review-audit complete" : "paper-review-audit"}>
      <div className="paper-review-audit-mark"><BookOpenCheck size={19} strokeWidth={1.65} /></div>
      <div><h2>{t("Evidence audit")}</h2><p>{audit}</p></div>
    </section>

    <section className={`paper-review-summary ${summary.status}`}>
      <header><div><p className="paper-review-kicker">{t("Research memorandum")}</p><h2>{t("One note, with the uncertainty left in.")}</h2></div>{summary.status === "working" && <span><LoaderCircle className="spin" size={14} />{stage}</span>}</header>
      {summary.status === "idle" && <p>{t("Run the review to collect independent readings before Archimedes writes the final memorandum.")}</p>}
      {summary.status === "working" && <p>{stage}</p>}
      {summary.status === "error" && <p className="paper-review-summary-error">{summary.error}</p>}
      {summary.status === "complete" && <div className="paper-review-markdown paper-review-final-note"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.response}</ReactMarkdown></div>}
    </section>
  </main>;
}
