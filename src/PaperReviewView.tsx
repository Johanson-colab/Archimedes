import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Dialog } from "./Dialog";
import { SettingsChoiceGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { Tab, Tabs } from "./Tabs";
import { StateView } from "./StateView";
import { useUISettings } from "./i18n";

type ReviewTab = "review" | "reviewers" | "evidence";
type SourceKind = "library" | "arxiv" | "pdf";

const PROVIDER_PRESETS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com/v1",
  moonshot: "https://api.moonshot.cn/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  openrouter: "https://openrouter.ai/api/v1",
  custom: "",
};

function formatDate(value: string, language: "en" | "zh" = "en") {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

function riskTone(risk: string) {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "ok";
}

function decisionLabel(t: (key: string) => string, value: string) {
  const key = String(value || "").trim();
  return key ? t(key) : "";
}

function FindingList({ items, empty }: { items: PaperReviewFinding[]; empty: string }) {
  if (!items.length) return <p className="pra-muted">{empty}</p>;
  return <ul className="pra-list">
    {items.map((item, index) => <li key={`${item.text}-${index}`}>
      <span className="pra-finding-text">{item.text}</span>
      {item.page ? <span className="pra-page-badge">p. {item.page}</span> : null}
      {item.severity ? <span className={`pra-severity ${item.severity}`}>{item.severity}</span> : null}
      {item.quote ? <q className="pra-quote">{item.quote}</q> : null}
    </li>)}
  </ul>;
}

function ScoreSummary({ review, venue }: { review: PaperReviewFinal; venue?: PaperReviewVenueSummary }) {
  const { t } = useUISettings();
  return <div className="pra-score-summary">
    <span className="pra-score-main">{review.overallScore}<small>/{venue?.overall.max ?? "?"}</small></span>
    <strong>{decisionLabel(t, review.decision)}</strong>
    {review.expectedOutcome ? <span className="pra-score-outcome">{review.expectedOutcome}</span> : null}
    <span className="pra-score-spacer" />
    <span className="pra-score-fact">{t("Confidence")} {review.confidence}/{venue?.confidence.max ?? "?"}</span>
    <span className="pra-score-fact">{t("Agreement")} {Math.round(review.reviewerAgreement * 100)}%</span>
    <span className={`pra-score-fact tone-${riskTone(review.deskRejectRisk)}`}>{t("Desk reject")} {review.deskRejectRisk}</span>
  </div>;
}

function ReviewerCard({ reviewer, tags, venue }: {
  reviewer: PaperReviewReviewer;
  tags: string[];
  venue?: PaperReviewVenueSummary;
}) {
  const { t } = useUISettings();
  if (reviewer.status !== "complete") return <article className="pra-reviewer failed">
    <header><b>{t("Score")} {reviewer.targetScore}</b><span>{reviewer.error}</span></header>
  </article>;
  return <details className="pra-reviewer">
    <summary>
      <span className="pra-reviewer-score">{t("Score")} {reviewer.targetScore} · {decisionLabel(t, reviewer.targetLabel)}</span>
      {tags.map((tag) => <span key={tag} className="pra-tag">{t(tag)}</span>)}
      <span className="pra-reviewer-summary">{reviewer.summary || t("No summary recorded.")}</span>
    </summary>
    <div className="pra-reviewer-body">
      {reviewer.justification ? <p className="pra-reviewer-justification">{reviewer.justification}</p> : null}
      <section className="pra-doc-section"><h3>{t("Strengths")}</h3><FindingList items={reviewer.strengths} empty={t("No strengths recorded.")} /></section>
      <section className="pra-doc-section"><h3>{t("Weaknesses")}</h3><FindingList items={reviewer.weaknesses} empty={t("No weaknesses recorded.")} /></section>
      <section className="pra-doc-section"><h3>{t("Questions")}</h3><FindingList items={reviewer.questions} empty={t("No questions recorded.")} /></section>
      <section className="pra-doc-section"><h3>{t("Limitations")}</h3><FindingList items={reviewer.limitations} empty={t("No limitations recorded.")} /></section>
      {reviewer.evidence.length ? <section className="pra-doc-section">
        <h3>{t("Evidence")}</h3>
        <ul className="pra-list">
          {reviewer.evidence.map((entry, index) => <li key={`${entry.quote}-${index}`}>{entry.page ? <span className="pra-page-badge">p. {entry.page}</span> : null}{entry.quote}</li>)}
        </ul>
      </section> : null}
    </div>
  </details>;
}

function HistoryList({ runs, selectedId, onSelect, onDelete }: {
  runs: PaperReviewRunSummary[];
  selectedId: string;
  onSelect: (run: PaperReviewRunSummary) => void;
  onDelete: (run: PaperReviewRunSummary) => void;
}) {
  const { t, language } = useUISettings();
  return <section className="pra-history">
    <header><h2>{t("History")}</h2><span>{runs.length}</span></header>
    {!runs.length ? <p className="pra-muted">{t("No runs yet.")}</p> : <div className="pra-history-list">
      {runs.map((run) => <div key={run.id} className={`pra-history-item${run.id === selectedId ? " active" : ""}`}>
        <button type="button" className="pra-history-main" onClick={() => onSelect(run)}>
          <span className="pra-history-title">{run.paperTitle || t("Untitled paper")}</span>
          <span className="pra-history-meta">{run.venueId} · {formatDate(run.finishedAt || run.createdAt, language)} · {run.status === "complete" && run.overallScore !== null ? `${run.overallScore} · ${run.decision ? decisionLabel(t, run.decision) : t("review")}` : run.status}</span>
        </button>
        <button type="button" className="pra-history-delete" onClick={() => onDelete(run)}>{t("Delete run")}</button>
      </div>)}
    </div>}
  </section>;
}

export default function PaperReviewView({ bridge, workspace, projectId, active }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId: string | null;
  active: boolean;
}) {
  const { t, language } = useUISettings();
  const [settings, setSettings] = useState<PublicPaperReviewSettings | null>(null);
  const [venues, setVenues] = useState<PaperReviewVenueSummary[]>([]);
  const [papers, setPapers] = useState<PaperReviewPaperSummary[]>([]);
  const [runs, setRuns] = useState<PaperReviewRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PaperReviewRunSummary | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>("library");
  const [paperId, setPaperId] = useState("");
  const [arxivInput, setArxivInput] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [venueId, setVenueId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PaperReviewProgress | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ReviewTab>("review");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<PublicPaperReviewSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const activeRunRef = useRef("");
  const runningRef = useRef(false);

  const refreshRuns = useCallback(async () => {
    const rows = await bridge.listPaperReviewRuns({ projectId: projectId ?? undefined, limit: 60 });
    setRuns(rows);
    return rows;
  }, [bridge, projectId]);

  const loadRun = useCallback(async (runId: string) => {
    const full = await bridge.getPaperReviewRun(runId);
    if (!full) return null;
    setSelectedRun(full);
    return full;
  }, [bridge]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSettings, nextVenues, nextPapers, nextRuns] = await Promise.all([
        bridge.getPaperReviewSettings(),
        bridge.listPaperReviewVenues(),
        bridge.listPaperReviewPapers({ workspace, projectId: projectId ?? undefined }).catch(() => []),
        bridge.listPaperReviewRuns({ projectId: projectId ?? undefined, limit: 60 }).catch(() => []),
      ]);
      setSettings(nextSettings);
      setVenues(nextVenues);
      setPapers(nextPapers);
      setRuns(nextRuns);
      setVenueId((current) => current || nextSettings.defaultVenueId || nextVenues[0]?.id || "");
      setPaperId((current) => current || nextPapers[0]?.id || "");
      const first = nextRuns[0];
      if (first) await loadRun(first.id);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [bridge, loadRun, projectId, workspace]);

  useEffect(() => {
    if (!active) return;
    void bootstrap();
  }, [active, bootstrap]);

  useEffect(() => {
    if (!selectedRun || selectedRun.sourceKind !== "library" || !papers.length) return;
    const match = papers.find((paper) => paper.title === selectedRun.paperTitle);
    if (match) setPaperId(match.id);
  }, [papers, selectedRun]);

  useEffect(() => {
    const unsubscribe = bridge.onPaperReviewProgress((payload) => {
      if (payload.runId) {
        if (!activeRunRef.current) activeRunRef.current = payload.runId;
        if (payload.runId !== activeRunRef.current) return;
      }
      if (!runningRef.current && payload.type !== "complete" && payload.type !== "error" && payload.type !== "cancelled") return;
      setProgress(payload);
      if (payload.type === "prepared") void refreshRuns();
      if (payload.type === "complete" || payload.type === "error" || payload.type === "cancelled") {
        runningRef.current = false;
        setRunning(false);
        const runId = payload.runId || activeRunRef.current;
        if (payload.type === "error") setError(payload.detail || "The review failed.");
        if (payload.type === "cancelled") setNotice(t("The review was cancelled."));
        if (runId) {
          void loadRun(runId);
          void refreshRuns();
        }
      }
    });
    return unsubscribe;
  }, [bridge, loadRun, refreshRuns, t]);

  async function choosePdf() {
    try {
      const chosen = await bridge.choosePaperReviewPdf();
      if (chosen) {
        setPdfPath(chosen);
        setSourceKind("pdf");
        setError("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function startReview() {
    if (running) return;
    setError("");
    setNotice("");
    setProgress(null);
    if (sourceKind === "library" && !paperId) {
      setError(t("Choose a Library paper first."));
      return;
    }
    if (sourceKind === "arxiv" && !arxivInput.trim()) {
      setError(t("Enter an arXiv ID or URL."));
      return;
    }
    if (sourceKind === "pdf" && !pdfPath) {
      setError(t("Choose a PDF first."));
      return;
    }
    const source: PaperReviewSource = sourceKind === "library"
      ? { kind: "library", paperId }
      : sourceKind === "arxiv"
        ? { kind: "arxiv", value: arxivInput.trim() }
        : { kind: "pdf", filePath: pdfPath };
    activeRunRef.current = "";
    runningRef.current = true;
    setRunning(true);
    setTab("review");
    try {
      const created = await bridge.createPaperReviewRun({ source, venueId, workspace, projectId: projectId ?? undefined });
      if (!activeRunRef.current) {
        activeRunRef.current = created.runId;
        setProgress({ runId: created.runId, type: "progress", stage: "started", progress: 2, detail: t("Preparing the paper…") });
      }
      void refreshRuns();
    } catch (cause) {
      runningRef.current = false;
      setRunning(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function cancelReview() {
    if (!activeRunRef.current) return;
    try {
      await bridge.cancelPaperReviewRun(activeRunRef.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function exportReview() {
    if (!selectedRun) return;
    setExporting(true);
    try {
      const result = await bridge.exportPaperReviewRun(selectedRun.id);
      if (result.saved) setNotice(t("Exported to {path}", { path: result.path }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  }

  async function removeRun(run: PaperReviewRunSummary) {
    if (!window.confirm(t("Delete this review run? This cannot be undone."))) return;
    try {
      await bridge.deletePaperReviewRun(run.id);
      const rows = await refreshRuns();
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        if (rows[0]) await loadRun(rows[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function selectRun(run: PaperReviewRunSummary) {
    try { await loadRun(run.id); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  function openSettings() {
    if (!settings) return;
    setDraft(structuredClone(settings));
    setSettingsOpen(true);
  }

  async function saveSettings() {
    if (!draft) return;
    try {
      const next = await bridge.savePaperReviewSettings({
        defaultVenueId: draft.defaultVenueId,
        concurrency: draft.concurrency,
        model: draft.model,
      });
      setSettings(next);
      setVenueId((current) => current || next.defaultVenueId);
      setSettingsOpen(false);
      setNotice(t("Settings saved."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const venue = useMemo(() => venues.find((entry) => entry.id === (selectedRun?.venueId || venueId)), [selectedRun?.venueId, venueId, venues]);
  const result = selectedRun?.result || null;
  const review = result?.review || null;
  const activeModel = settings?.model.mode === "custom"
    ? `${settings.model.provider}/${settings.model.model || "—"}`
    : settings?.agentModel
      ? `${settings.agentModel.provider}/${settings.agentModel.model}`
      : "—";
  const canRun = !running && Boolean(venueId) && (
    (sourceKind === "library" && Boolean(paperId)) ||
    (sourceKind === "arxiv" && Boolean(arxivInput.trim())) ||
    (sourceKind === "pdf" && Boolean(pdfPath))
  );

  if (loading && !settings) {
    return <main className="pra-page"><StateView tone="loading" title={t("Loading Paper review…")} /></main>;
  }

  return <main className="pra-page">
    <header className="pra-header">
      <h1>{selectedRun ? selectedRun.paperTitle || result?.document?.title || t("Untitled paper") : t("New simulated review")}</h1>
      {selectedRun ? <span className={`pra-status ${selectedRun.status}`}>{selectedRun.status}</span> : null}
      <div className="pra-header-actions">
        {selectedRun ? <button type="button" className="secondary-button" onClick={() => void exportReview()} disabled={exporting || !result}>{exporting ? t("Exporting…") : t("Export")}</button> : null}
        <button type="button" className="secondary-button" onClick={openSettings}>{t("Settings")}</button>
      </div>
    </header>

    <section className="pra-compose">
      <div className="pra-compose-row">
        <Tabs value={sourceKind} onChange={(value) => setSourceKind(value as SourceKind)} label={t("Paper source")} variant="segmented" className="pra-source-tabs">
          <Tab value="library">{t("Library")}</Tab>
          <Tab value="arxiv">arXiv</Tab>
          <Tab value="pdf">PDF</Tab>
        </Tabs>
        {sourceKind === "library" ? <select className="pra-source-select" value={paperId} onChange={(event) => setPaperId(event.target.value)} disabled={running} aria-label={t("Library paper")}>
          {!papers.length ? <option value="">{t("No Library papers found")}</option> : null}
          {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}{paper.year ? ` (${paper.year})` : ""}{paper.libraryName ? ` · ${paper.libraryName}` : ""}</option>)}
        </select> : null}
        {sourceKind === "arxiv" ? <input className="pra-source-select" value={arxivInput} onChange={(event) => setArxivInput(event.target.value)} placeholder="2511.05421 or https://arxiv.org/abs/2511.05421" disabled={running} aria-label={t("arXiv ID or URL")} /> : null}
        {sourceKind === "pdf" ? <div className="pra-pdf-picker">
          <button type="button" className="secondary-button" onClick={() => void choosePdf()} disabled={running}>{t("Choose PDF")}</button>
          <span className="pra-muted">{pdfPath ? pdfPath.split(/[\\/]/).at(-1) : t("No PDF chosen")}</span>
        </div> : null}
        <select className="pra-venue-select" value={venueId} onChange={(event) => setVenueId(event.target.value)} disabled={running} aria-label={t("Venue")}>
          {venues.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
        </select>
        <button type="button" className="primary-button" onClick={() => void startReview()} disabled={!canRun}>
          {running ? <LoaderCircle className="spin" size={14} /> : null}
          {running ? t("Reviewing…") : t("Run simulated review")}
        </button>
      </div>
      <div className="pra-compose-foot">
        <span>{t("Model")}: <b>{activeModel}</b></span>
        <span className="pra-muted">{t("Text is sent only to the selected provider.")}</span>
        {running ? <button type="button" className="pra-link" onClick={() => void cancelReview()}>{t("Cancel run")}</button> : null}
      </div>
      {running && progress ? <div className="pra-progress">
        <div className="pra-progress-head"><span>{progress.detail || t("Working…")}</span><b>{Math.round(progress.progress || 0)}%</b></div>
        <div className="pra-progress-track"><i style={{ width: `${Math.max(2, Math.round(progress.progress || 0))}%` }} /></div>
      </div> : null}
    </section>

    {error ? <div className="pra-notice error">{error}</div> : null}
    {notice ? <div className="pra-notice">{notice}</div> : null}

    {!selectedRun ? <StateView
      tone="empty"
      title={t("No review selected")}
      description={t("Choose a paper and venue above, then run a simulated review. Results stay on this machine.")}
    /> : <article className="pra-doc">
      <header className="pra-doc-head">
        <p className="pra-meta">{venue?.displayName || selectedRun.venueId} · pack {selectedRun.venueVersion} · {selectedRun.model.provider}/{selectedRun.model.model} · {formatDate(selectedRun.finishedAt || selectedRun.createdAt, language)}</p>
        <span className="pra-simulated">{t("Simulated review")}</span>
      </header>

      {!result ? <StateView
        tone={selectedRun.status === "error" ? "error" : selectedRun.status === "cancelled" ? "empty" : "loading"}
        title={selectedRun.status === "error" ? t("The review failed") : selectedRun.status === "cancelled" ? t("The review was cancelled.") : t("The review is running")}
        description={selectedRun.error || (selectedRun.status === "cancelled" ? t("Start a new run when you are ready.") : t("Progress events will update this page."))}
      /> : null}

      {result?.gate?.status === "failed" ? <div className="pra-gate">
        <b>{t("Preflight gate stopped this review")}</b>
        <p>{result.gate.reason}</p>
        {result.preflight?.warnings?.length ? <ul className="pra-list">{result.preflight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      </div> : null}

      {result && review ? <>
        <ScoreSummary review={review} venue={venue} />
        <div className="pra-dimensions">
          {review.subdimensions.map((dimension) => <div key={dimension.id} className="pra-dimension-row">
            <span className="pra-dimension-label">{dimension.label}</span>
            <b className="pra-dimension-score">{dimension.score}</b>
            <span className="pra-dimension-reason">{dimension.reason}</span>
          </div>)}
        </div>
        {result.localPool?.percentile !== null && result.localPool?.percentile !== undefined ? <p className="pra-pool">{t("Local pool: {percentile}th percentile across {samples} runs in this venue.", { percentile: String(result.localPool.percentile), samples: String(result.localPool.samples) })} <span>{t("Not an acceptance probability.")}</span></p> : null}

        <Tabs value={tab} onChange={(value) => setTab(value as ReviewTab)} label={t("Paper review result")} variant="segmented" className="pra-result-tabs">
          <Tab value="review">{t("Review")}</Tab>
          <Tab value="reviewers">{t("Reviewers")}</Tab>
          <Tab value="evidence">{t("Evidence")}</Tab>
        </Tabs>

        {tab === "review" ? <div className="pra-doc-body">
          <section className="pra-doc-section"><h3>{t("Summary")}</h3><p>{review.summary || t("No summary recorded.")}</p></section>
          <section className="pra-doc-section"><h3>{t("Strengths")}</h3><FindingList items={review.strengths} empty={t("No strengths recorded.")} /></section>
          <section className="pra-doc-section"><h3>{t("Weaknesses")}</h3><FindingList items={review.weaknesses} empty={t("No weaknesses recorded.")} /></section>
          <section className="pra-doc-section"><h3>{t("Questions")}</h3><FindingList items={review.questions} empty={t("No questions recorded.")} /></section>
          <section className="pra-doc-section"><h3>{t("Limitations")}</h3><FindingList items={review.limitations} empty={t("No limitations recorded.")} /></section>
          {review.metaReview ? <section className="pra-doc-section"><h3>{t("Meta-review")}</h3><p>{review.metaReview}</p></section> : null}
          {review.reviewerDisagreement.length ? <section className="pra-doc-section"><h3>{t("Reviewer disagreement")}</h3><ul className="pra-list">{review.reviewerDisagreement.map((entry) => <li key={entry}>{entry}</li>)}</ul></section> : null}
          {review.consistencyNotes.length ? <section className="pra-doc-section"><h3>{t("Calibration notes")}</h3><ul className="pra-list">{review.consistencyNotes.map((entry) => <li key={entry}>{entry}</li>)}</ul></section> : null}
        </div> : null}

        {tab === "reviewers" ? <div className="pra-reviewers">
          {result.selection?.rationale ? <p className="pra-muted">{result.selection.rationale}</p> : null}
          {result.reviewers.map((reviewer) => {
            const tags: string[] = [];
            if (result.selection?.bestJustified === reviewer.index) tags.push("Best justified");
            if (result.selection?.optimistic === reviewer.index) tags.push("Optimistic");
            if (result.selection?.critical === reviewer.index) tags.push("Critical");
            return <ReviewerCard key={reviewer.index} reviewer={reviewer} tags={tags} venue={venue} />;
          })}
        </div> : null}

        {tab === "evidence" ? <div className="pra-doc-body">
          {result.paperCard ? <>
            <section className="pra-doc-section"><h3>{t("Paper card")}</h3><p>{result.paperCard.summary}</p>
              <div className="pra-meta-list">
                <span>{t("Topic")}: {result.paperCard.topic || "—"}</span>
                <span>{t("Quality gate")}: {result.paperCard.qualityGate}</span>
                <span>{t("Injection risk")}: {result.paperCard.promptInjectionRisk}</span>
                <span>{t("Page coverage")}: {result.paperCard.pageCoverage || "—"}</span>
              </div>
            </section>
            <section className="pra-doc-section"><h3>{t("Contributions")}</h3>{result.paperCard.contributions.length ? <ul className="pra-list">{result.paperCard.contributions.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="pra-muted">{t("None extracted.")}</p>}</section>
            <section className="pra-doc-section"><h3>{t("Limitations")}</h3>{result.paperCard.limitations.length ? <ul className="pra-list">{result.paperCard.limitations.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="pra-muted">{t("None extracted.")}</p>}</section>
            <section className="pra-doc-section"><h3>{t("Claims and evidence")}</h3>
              <div className="pra-claims">
                {result.paperCard.claims.map((claim, index) => <div key={`${claim.claim}-${index}`} className={`pra-claim ${claim.status}`}>
                  <p><b>{claim.claim}</b> <span>{claim.page ? `p. ${claim.page}` : "page unknown"} · {claim.status}</span></p>
                  {claim.evidence ? <p className="pra-muted">{claim.evidence}</p> : null}
                </div>)}
                {!result.paperCard.claims.length ? <p className="pra-muted">{t("No claims extracted.")}</p> : null}
              </div>
            </section>
            <section className="pra-doc-section"><h3>{t("Method")}</h3><p>{result.paperCard.method || "—"}</p></section>
            <section className="pra-doc-section"><h3>{t("Experiments")}</h3><p>{result.paperCard.experiments || "—"}</p></section>
          </> : <p className="pra-muted">{t("No paper card is available for this run.")}</p>}
          <section className="pra-doc-section"><h3>{t("Preflight")}</h3>
            <div className="pra-meta-list">
              <span>{t("Pages")}: {result.preflight.pageCount} ({result.preflight.pagesWithText} readable)</span>
              <span>{t("Text")}: {result.preflight.textChars.toLocaleString()} chars</span>
              <span>{t("Desk reject")}: {result.preflight.deskRejectRisk}</span>
              <span>{t("Injection signals")}: {result.preflight.injectionSignals.length}</span>
            </div>
            {result.preflight.warnings.length ? <ul className="pra-list">{result.preflight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          </section>
          <section className="pra-doc-section"><h3>{t("Audit trail")}</h3>
            <ol className="pra-trace">{result.trace.map((entry, index) => <li key={`${entry.stage}-${index}`}><b>{entry.stage}</b><span>{entry.detail}</span><em>{formatDate(entry.at, language)}</em></li>)}</ol>
          </section>
        </div> : null}
      </> : null}
    </article>}

    <HistoryList runs={runs} selectedId={selectedRun?.id || ""} onSelect={(run) => void selectRun(run)} onDelete={(run) => void removeRun(run)} />

    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} size="md" ariaLabel={t("Paper review settings")} className="pra-settings-dialog">
      {draft ? <div className="pra-settings">
        <h2>{t("Paper review settings")}</h2>
        <SettingsSection title={t("Defaults")}>
          <SettingsRow title={t("Default venue")} stacked>
            <select className="pra-select" value={draft.defaultVenueId} onChange={(event) => setDraft({ ...draft, defaultVenueId: event.target.value })}>
              {venues.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
            </select>
          </SettingsRow>
          <SettingsRow title={t("Reviewer concurrency")} description={t("How many score-conditioned reviewers run at once.")}>
            <input className="pra-number" type="number" min={1} max={8} value={draft.concurrency} onChange={(event) => setDraft({ ...draft, concurrency: Math.min(8, Math.max(1, Number(event.target.value) || 1)) })} />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title={t("Model")}>
          <SettingsRow title={t("Review model")} description={t("The main agent model is the default. A custom provider is optional.")} stacked>
            <SettingsChoiceGroup
              value={draft.model.mode}
              label={t("Review model")}
              onChange={(mode) => setDraft({ ...draft, model: { ...draft.model, mode } })}
              options={[
                { value: "agent", label: t("Main agent model") },
                { value: "custom", label: t("Custom provider") },
              ]}
            />
          </SettingsRow>
          {draft.model.mode === "agent" ? <>
            <p className="pra-settings-note">{t("Using {provider}/{model} from the main agent configuration.", { provider: settings?.agentModel.provider || "—", model: settings?.agentModel.model || "—" })}</p>
            {!settings?.agentModel.hasApiKey ? <p className="pra-settings-note warning">{t("The main agent has no API key yet. Configure Settings → Models or choose a custom provider.")}</p> : null}
          </> : <>
            <SettingsRow title={t("Provider")} stacked>
              <select className="pra-select" value={draft.model.provider} onChange={(event) => {
                const provider = event.target.value as ModelProviderId;
                const preset = PROVIDER_PRESETS[provider] || "";
                setDraft({ ...draft, model: { ...draft.model, provider, baseUrl: preset } });
              }}>
                {Object.keys(PROVIDER_PRESETS).map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </select>
            </SettingsRow>
            <SettingsRow title={t("Base URL")} stacked>
              <input className="pra-input" value={draft.model.baseUrl} onChange={(event) => setDraft({ ...draft, model: { ...draft.model, baseUrl: event.target.value } })} />
            </SettingsRow>
            <SettingsRow title={t("Model")} stacked>
              <input className="pra-input" value={draft.model.model} onChange={(event) => setDraft({ ...draft, model: { ...draft.model, model: event.target.value } })} placeholder="gpt-4.1 or deepseek-chat" />
            </SettingsRow>
            <SettingsRow title={t("API key")} description={draft.model.configured && !draft.model.apiKey ? t("Configured — leave blank to keep the saved key.") : t("Stored locally in paper-review-settings.json.")} stacked>
              <input className="pra-input" type="password" value={draft.model.apiKey} onChange={(event) => setDraft({ ...draft, model: { ...draft.model, apiKey: event.target.value } })} />
            </SettingsRow>
          </>}
        </SettingsSection>
        <p className="pra-settings-note">{t("Runs are local. The paper text is sent to the selected model provider only when you start a review.")}</p>
        <div className="pra-settings-actions">
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>{t("Cancel")}</button>
          <button type="button" className="primary-button" onClick={() => void saveSettings()}>{t("Save settings")}</button>
        </div>
      </div> : null}
    </Dialog>
  </main>;
}
