import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AlertTriangle, BookOpenCheck, Check, ChevronDown, ChevronUp, FileSearch, FlaskConical, Lightbulb, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import PaperPresentationDeck from "./PaperPresentationDeck";

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

function isReviewAgentId(value: string | undefined): value is ReviewAgentId {
  return REVIEWERS.some((reviewer) => reviewer.id === value);
}

function initialRuns(): Record<ReviewAgentId, ReviewRun> {
  return Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "idle", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>;
}

function reviewError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "The review could not be completed.");
}

/**
 * Models often emit TeX delimiters from the paper itself (`\(...\)` and
 * `\[...\]`) instead of the dollar delimiters remark-math expects. Convert
 * prose and math while leaving fenced and inline code untouched.
 */
function normalizeReviewMath(value: string) {
  let fenced = false;
  return String(value || "").replace(/\r\n?/g, "\n").split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return line.split(/(`+[^`]*`+)/g).map((part, index) => index % 2 ? part : part
      .replace(/\\\[/g, () => "$$")
      .replace(/\\\]/g, () => "$$")
      .replace(/\\\(/g, () => "$")
      .replace(/\\\)/g, () => "$")).join("");
  }).join("\n");
}

function ReviewMarkdown({ content, className = "" }: { content: string; className?: string }) {
  return <div className={`paper-review-markdown${className ? ` ${className}` : ""}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
    >{normalizeReviewMath(content)}</ReactMarkdown>
  </div>;
}

export default function PaperReviewWorkbench({ bridge, workspace, projectId, paper, pageCount, ready, pdfUrl = "", onInternalReviewThreadsDeleted }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paper: ReviewPaper;
  pageCount: number;
  ready: boolean;
  pdfUrl?: string;
  onInternalReviewThreadsDeleted?: (threadIds: string[]) => void;
}) {
  const [view, setView] = useState<"review" | "presentation">("review");
  const [runs, setRuns] = useState<Record<ReviewAgentId, ReviewRun>>(initialRuns);
  const [summary, setSummary] = useState<ReviewRun>({ status: "idle", response: "", error: "" });
  const [audit, setAudit] = useState("The evidence audit will check citations, overclaims, and disagreements before synthesis.");
  const [stage, setStage] = useState("Ready for a source-grounded review.");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<ReviewAgentId>>(new Set());
  const [reviewUpdatedAt, setReviewUpdatedAt] = useState("");
  const runIdRef = useRef<string | null>(null);
  const restoreIdRef = useRef(0);

  const paperContext = useMemo<ContextAttachment[]>(() => [{
    id: `paper:${paper.id}`,
    type: "paper",
    name: paper.title,
    detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`,
    paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url },
  }], [paper]);

  useEffect(() => bridge.onPaperReviewEvent((event) => {
    if (!runIdRef.current || event.clientRunId !== runIdRef.current) return;
    setStage(event.detail);
    if (isReviewAgentId(event.reviewerId) && event.stage === "specialist_complete" && event.response) {
      setRuns((current) => ({ ...current, [event.reviewerId!]: { status: "complete", response: event.response!, error: "" } }));
    }
    if (isReviewAgentId(event.reviewerId) && event.stage === "specialist_failed") {
      setRuns((current) => ({ ...current, [event.reviewerId!]: { status: "error", response: "", error: event.detail } }));
    }
    if (event.stage === "supervisor" || event.stage === "repair") setAudit(event.detail);
  }), [bridge]);

  useEffect(() => {
    let mounted = true;
    void bridge.cleanupPaperReviewRuns(workspace).then(({ threadIds }) => {
      if (mounted && threadIds.length) onInternalReviewThreadsDeleted?.(threadIds);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [bridge, onInternalReviewThreadsDeleted, workspace]);

  useEffect(() => {
    let mounted = true;
    const restoreId = ++restoreIdRef.current;
    setView("review");
    setReviewUpdatedAt("");
    void bridge.getPaperReview(paper.id, workspace, projectId).then((saved) => {
      if (!mounted || restoreId !== restoreIdRef.current || runIdRef.current || !saved) return;
      const restoredRuns = initialRuns();
      for (const report of saved.specialists) {
        if (!isReviewAgentId(report.id)) continue;
        restoredRuns[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      }
      setRuns(restoredRuns);
      setAudit(saved.audit || "The saved evidence audit did not include a written rationale.");
      setSummary({ status: "complete", response: saved.summary, error: "" });
      setReviewUpdatedAt(saved.updated_at);
      setStage("Saved review restored. Run the review again to replace it.");
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [bridge, paper.id, workspace]);

  const visibleRuns = summary.status === "error"
    ? Object.fromEntries(REVIEWERS.map((reviewer) => {
      const run = runs[reviewer.id];
      return [reviewer.id, run.status === "working"
        ? { status: "error" as const, response: "", error: `Review stopped before this reading completed. ${summary.error}` }
        : run];
    })) as Record<ReviewAgentId, ReviewRun>
    : runs;
  const completeCount = REVIEWERS.filter((reviewer) => visibleRuns[reviewer.id].status === "complete").length;
  const errorCount = REVIEWERS.filter((reviewer) => visibleRuns[reviewer.id].status === "error").length;
  const independentReadingStatus = completeCount || errorCount
    ? [completeCount ? `${completeCount} completed` : "", errorCount ? `${errorCount} failed` : ""].filter(Boolean).join(" · ")
    : running ? "In progress" : "Awaiting run";
  const reviewAvailable = Boolean(reviewUpdatedAt || summary.status === "complete");

  async function runReview() {
    if (running || !workspace || !ready) return;
    const clientRunId = crypto.randomUUID();
    runIdRef.current = clientRunId;
    setRunning(true);
    setExpanded(new Set());
    setStage("Four independent readings are starting from the indexed original PDF.");
    setAudit("The evidence audit will begin after the independent readings finish.");
    setRuns(Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "working", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>);
    setSummary({ status: "working", response: "", error: "" });

    try {
      const result = await bridge.runPaperReview({ paper, pageCount, workspace, projectId, reasoningEffort: "high", contextLength: "extra-long", contextItems: paperContext, clientRunId });
      const nextRuns = initialRuns();
      for (const report of result.specialists) nextRuns[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      setRuns(nextRuns);
      if (result.error || !result.summary) {
        const message = result.error || "The review ended before a research memorandum could be written.";
        setAudit(result.supervisor.reason);
        setSummary({ status: "error", response: "", error: message });
        setStage(message);
        return;
      }
      setAudit(result.supervisor.repairTargets.length
        ? `${result.supervisor.reason} A targeted repair was completed for ${result.supervisor.repairTargets.join(" and ")}.`
        : result.supervisor.reason);
      setSummary({ status: "complete", response: result.summary.response, error: "" });
      setStage("The review memorandum is ready. Open any reading to inspect its evidence trail.");
      const saved = await bridge.getPaperReview(paper.id, workspace, projectId);
      if (saved) setReviewUpdatedAt(saved.updated_at);
    } catch (error) {
      const message = reviewError(error);
      setRuns((current) => Object.fromEntries(REVIEWERS.map((reviewer) => {
        const run = current[reviewer.id];
        return [reviewer.id, run.status === "working"
          ? { status: "error" as const, response: "", error: `Review stopped before this reading completed. ${message}` }
          : run];
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

  return <div className={`paper-review-shell${view === "presentation" ? " presentation-active" : ""}`}>
    <nav className="paper-review-view-switch" aria-label="Review output">
      <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>Text review</button>
      <button className={view === "presentation" ? "active" : ""} onClick={() => setView("presentation")} disabled={!reviewAvailable}>Presentation</button>
      <span>Two independent outputs from one saved review</span>
    </nav>

    {view === "presentation" ? <PaperPresentationDeck bridge={bridge} workspace={workspace} projectId={projectId} paper={paper} pageCount={pageCount} pdfUrl={pdfUrl} reviewReady={reviewAvailable} reviewUpdatedAt={reviewUpdatedAt} /> : <main className="paper-review-workbench">
      <header className="paper-review-heading">
        <div><p className="paper-review-kicker">Evidence review</p><h1>Read the paper against its own record.</h1><p className="paper-review-intro">Four independent readings are audited for evidence before one concise research memorandum is written.</p></div>
        <button className="paper-review-run" onClick={() => void runReview()} disabled={running || !ready || !workspace}>{running ? <LoaderCircle className="spin" size={16} /> : completeCount || errorCount || summary.status === "complete" ? <RefreshCw size={16} /> : <Sparkles size={16} />}{running ? "Reviewing" : completeCount || errorCount || summary.status === "complete" ? "Review again" : "Run review"}</button>
      </header>

      {!ready && <div className="paper-review-notice"><AlertTriangle size={17} /><div><strong>Prepare the paper first</strong><span>The review agents need the locally indexed PDF so their findings can point back to the original pages.</span></div></div>}
      {!workspace && <div className="paper-review-notice"><AlertTriangle size={17} /><div><strong>Choose a workspace first</strong><span>A workspace keeps this review and its supporting source reads inside Archimedes.</span></div></div>}

      <section className="paper-review-route" aria-label="Review process">
        <div data-step="01"><span>Independent readings</span><strong>{independentReadingStatus}</strong></div>
        <div data-step="02"><span>Evidence audit</span><strong>{running ? "Checking" : summary.status === "complete" ? "Completed" : summary.status === "error" ? "Not completed" : "Pending"}</strong></div>
        <div data-step="03"><span>Research memorandum</span><strong>{summary.status === "complete" ? "Ready" : running ? "Drafting" : summary.status === "error" ? "Failed" : "Pending"}</strong></div>
      </section>

      <section className="paper-review-readings" aria-label="Specialist readings">
        {REVIEWERS.map((reviewer, index) => {
          const run = visibleRuns[reviewer.id];
          const Icon = reviewer.icon;
          const isExpanded = expanded.has(reviewer.id);
          return <article className={`paper-review-reading ${reviewer.id} ${run.status}${isExpanded ? " expanded" : ""}`} data-index={String(index + 1).padStart(2, "0")} key={reviewer.id}>
            <header><span className="paper-review-reading-icon"><Icon size={19} strokeWidth={1.7} /></span><div><h2>{reviewer.title}</h2><p>{reviewer.subtitle}</p></div><span className={`paper-review-status ${run.status}`} aria-label={run.status}>{run.status === "working" ? <LoaderCircle className="spin" size={14} /> : run.status === "complete" ? <Check size={15} /> : run.status === "error" ? <AlertTriangle size={15} /> : null}</span></header>
            {run.status === "idle" && <p className="paper-review-reading-copy">Waiting for the complete PDF review to begin.</p>}
            {run.status === "working" && <p className="paper-review-reading-copy">Reading source pages and preparing a page-cited assessment…</p>}
            {run.status === "error" && <p className="paper-review-reading-error">{run.error}</p>}
            {run.status === "complete" && <><button className="paper-review-expand" onClick={() => toggleExpanded(reviewer.id)} aria-expanded={isExpanded}><span>{run.repaired ? "Read repaired evidence note" : "Read evidence note"}</span>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>{isExpanded && <ReviewMarkdown content={run.response} />}</>}
          </article>;
        })}
      </section>

      <section className={summary.status === "complete" ? "paper-review-audit complete" : "paper-review-audit"}><div className="paper-review-audit-mark"><BookOpenCheck size={19} strokeWidth={1.65} /></div><div><h2>Evidence audit</h2><p>{audit}</p></div></section>

      <section className={`paper-review-summary ${summary.status}`}>
        <header><div><p className="paper-review-kicker">Research memorandum</p><h2>One note, with the uncertainty left in.</h2></div>{summary.status === "working" && <span><LoaderCircle className="spin" size={14} />{stage}</span>}</header>
        {summary.status === "idle" && <p>Run the review to collect independent readings before Archimedes writes the final memorandum.</p>}
        {summary.status === "working" && <p>{stage}</p>}
        {summary.status === "error" && <p className="paper-review-summary-error">{summary.error}</p>}
        {summary.status === "complete" && <ReviewMarkdown content={summary.response} className="paper-review-final-note" />}
      </section>
    </main>}
  </div>;
}
