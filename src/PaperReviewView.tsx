import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Download, FileText, Gauge, History, Link2,
  LoaderCircle, Play, Settings2, ShieldAlert, Trash2, Upload, XCircle,
} from "lucide-react";
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

function formatDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

function scoreLabel(venue: PaperReviewVenueSummary | undefined, score: number | null | undefined) {
  if (!venue || score === null || score === undefined) return "";
  const rounded = Math.round(Number(score));
  return venue.overall && rounded >= venue.overall.min && rounded <= venue.overall.max ? String(rounded) : String(score);
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
  return <ul className="pra-findings">
    {items.map((item, index) => <li key={`${item.text}-${index}`}>
      <span>{item.text}</span>
      {item.page ? <span className="pra-page-badge">p. {item.page}</span> : null}
      {item.quote ? <q className="pra-quote">{item.quote}</q> : null}
      {item.severity ? <span className={`pra-severity ${item.severity}`}>{item.severity}</span> : null}
    </li>)}
  </ul>;
}

function ScoreGrid({ review, venue }: { review: PaperReviewFinal; venue?: PaperReviewVenueSummary }) {
  const { t } = useUISettings();
  return <div className="pra-scores">
    <div className="pra-score-hero">
      <span className="pra-score-value">{review.overallScore}<small>/{venue?.overall.max ?? "?"}</small></span>
      <div>
        <strong>{decisionLabel(t, review.decision)}</strong>
        <p>{review.expectedOutcome || t("Simulated outcome")}</p>
      </div>
    </div>
    <dl className="pra-score-facts">
      <div><dt>{t("Confidence")}</dt><dd>{review.confidence}/{venue?.confidence.max ?? "?"}</dd></div>
      <div><dt>{t("Calibrated")}</dt><dd>{review.calibratedScore}/100</dd></div>
      <div><dt>{t("Agreement")}</dt><dd>{Math.round(review.reviewerAgreement * 100)}%</dd></div>
      <div><dt>{t("Desk reject")}</dt><dd className={`tone-${riskTone(review.deskRejectRisk)}`}>{review.deskRejectRisk}</dd></div>
    </dl>
    <div className="pra-dimensions">
      {review.subdimensions.map((dimension) => <div key={dimension.id} className="pra-dimension">
        <div><span>{dimension.label}</span><b>{dimension.score}</b></div>
        <p>{dimension.reason}</p>
      </div>)}
    </div>
  </div>;
}

function ReviewerCard({ reviewer, tags, venue }: {
  reviewer: PaperReviewReviewer;
  tags: string[];
  venue?: PaperReviewVenueSummary;
}) {
  const { t } = useUISettings();
  const [open, setOpen] = useState(false);
  if (reviewer.status !== "complete") return <article className="pra-reviewer failed">
    <header><b>{t("Score")} {reviewer.targetScore}</b><span>{reviewer.error}</span></header>
  </article>;
  return <article className={`pra-reviewer${tags.length ? " selected" : ""}`}>
    <header>
      <div>
        <b>{t("Score")} {scoreLabel(venue, reviewer.targetScore)}</b>
        <span>{decisionLabel(t, reviewer.targetLabel)}</span>
      </div>
      <div className="pra-reviewer-tags">
        {tags.map((tag) => <span key={tag} className={`pra-tag ${tag.toLowerCase().replace(/\s+/g, "-")}`}>{t(tag)}</span>)}
      </div>
      <button type="button" className="quiet-icon-button" onClick={() => setOpen((value) => !value)} title={open ? t("Collapse review") : t("Expand review")}>
        {open ? <XCircle size={14} /> : <FileText size={14} />}
      </button>
    </header>
    <p className="pra-reviewer-summary">{reviewer.summary || t("No summary recorded.")}</p>
    {open ? <div className="pra-reviewer-body">
      <p>{reviewer.justification}</p>
      <div className="pra-reviewer-columns">
        <div><h4>{t("Strengths")}</h4><FindingList items={reviewer.strengths} empty={t("No strengths recorded.")} /></div>
        <div><h4>{t("Weaknesses")}</h4><FindingList items={reviewer.weaknesses} empty={t("No weaknesses recorded.")} /></div>
      </div>
      <div className="pra-reviewer-columns">
        <div><h4>{t("Questions")}</h4><FindingList items={reviewer.questions} empty={t("No questions recorded.")} /></div>
        <div><h4>{t("Limitations")}</h4><FindingList items={reviewer.limitations} empty={t("No limitations recorded.")} /></div>
      </div>
      {reviewer.evidence.length ? <div className="pra-evidence">
        <h4>{t("Evidence")}</h4>
        {reviewer.evidence.map((entry, index) => <p key={`${entry.quote}-${index}`}>{entry.page ? `p. ${entry.page} · ` : ""}{entry.quote}</p>)}
      </div> : null}
    </div> : null}
  </article>;
}

function RunList({ runs, selectedId, onSelect, onDelete }: {
  runs: PaperReviewRunSummary[];
  selectedId: string;
  onSelect: (run: PaperReviewRunSummary) => void;
  onDelete: (run: PaperReviewRunSummary) => void;
}) {
  const { t } = useUISettings();
  return <aside className="pra-history">
    <header><History size={14} /><b>{t("History")}</b><span>{runs.length}</span></header>
    {!runs.length ? <p className="pra-muted">{t("No runs yet.")}</p> : <div className="pra-history-list">
      {runs.map((run) => <div key={run.id} className={`pra-history-item${run.id === selectedId ? " active" : ""}`}>
        <button type="button" onClick={() => onSelect(run)}>
          <span className="pra-history-title">{run.paperTitle || t("Untitled paper")}</span>
          <span className="pra-history-meta">{run.venueId} · {formatDate(run.finishedAt || run.createdAt)}</span>
          <span className={`pra-history-status ${run.status}`}>
            {run.status === "complete" ? (run.overallScore !== null ? `${run.overallScore} · ${run.decision ? decisionLabel(t, run.decision) : t("review")}` : t("Gate result")) : run.status}
          </span>
        </button>
        <button type="button" className="pra-history-delete" title={t("Delete run")} aria-label={t("Delete run")} onClick={() => onDelete(run)}><Trash2 size={12} /></button>
      </div>)}
    </div>}
  </aside>;
}

export default function PaperReviewView({ bridge, workspace, projectId, active }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId: string | null;
  active: boolean;
}) {
  const { t } = useUISettings();
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
    return <main className="pra-page"><StateView tone="loading" icon={<LoaderCircle className="spin" size={20} />} title={t("Loading Paper review…")} /></main>;
  }

  return <main className="pra-page">
    <header className="pra-head">
      <div className="pra-heading">
        <span className="pra-mark"><ClipboardCheck size={17} /></span>
        <div>
          <h1>{t("Paper review")}</h1>
          <p>{t("A venue-faithful simulated review, grounded in the paper's own pages.")}</p>
        </div>
      </div>
      <span className="pra-simulated"><ShieldAlert size={12} />{t("Simulated review")}</span>
      <button type="button" className="quiet-icon-button" title={t("Paper review settings")} aria-label={t("Paper review settings")} onClick={openSettings}><Settings2 size={16} /></button>
    </header>

    <section className="pra-setup">
      <div className="pra-setup-main">
        <div className="pra-source-tabs">
          <Tabs value={sourceKind} onChange={(value) => setSourceKind(value as SourceKind)} label={t("Paper source")} variant="segmented">
            <Tab value="library" icon={<FileText size={13} />}>{t("Library")}</Tab>
            <Tab value="arxiv" icon={<Link2 size={13} />}>{t("arXiv")}</Tab>
            <Tab value="pdf" icon={<Upload size={13} />}>{t("PDF")}</Tab>
          </Tabs>
        </div>
        <div className="pra-source-row">
          {sourceKind === "library" ? <label className="pra-field grow">
            <span>{t("Library paper")}</span>
            <select value={paperId} onChange={(event) => setPaperId(event.target.value)} disabled={running}>
              {!papers.length ? <option value="">{t("No Library papers found")}</option> : null}
              {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}{paper.year ? ` (${paper.year})` : ""}{paper.libraryName ? ` · ${paper.libraryName}` : ""}</option>)}
            </select>
          </label> : null}
          {sourceKind === "arxiv" ? <label className="pra-field grow">
            <span>{t("arXiv ID or URL")}</span>
            <input value={arxivInput} onChange={(event) => setArxivInput(event.target.value)} placeholder="2511.05421 or https://arxiv.org/abs/2511.05421" disabled={running} />
          </label> : null}
          {sourceKind === "pdf" ? <div className="pra-field grow">
            <span>{t("Local PDF")}</span>
            <div className="pra-pdf-picker">
              <button type="button" className="secondary-button" onClick={() => void choosePdf()} disabled={running}><Upload size={13} />{t("Choose PDF")}</button>
              <span className="pra-muted">{pdfPath ? pdfPath.split(/[\\/]/).at(-1) : t("No PDF chosen")}</span>
            </div>
          </div> : null}
          <label className="pra-field venue">
            <span>{t("Venue")}</span>
            <select value={venueId} onChange={(event) => setVenueId(event.target.value)} disabled={running}>
              {venues.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
            </select>
          </label>
        </div>
        <div className="pra-run-row">
          <span className="pra-model">{t("Model")}: <b>{activeModel}</b></span>
          <span className="pra-muted">{t("Paper text is sent only to this provider.")}</span>
          <span className="pra-run-spacer" />
          {running ? <button type="button" className="secondary-button" onClick={() => void cancelReview()}>{t("Cancel run")}</button> : null}
          <button type="button" className="primary-button" onClick={() => void startReview()} disabled={!canRun}>
            {running ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
            {running ? t("Reviewing…") : t("Run simulated review")}
          </button>
        </div>
        {running && progress ? <div className="pra-progress">
          <div className="pra-progress-head">
            <span>{progress.detail || t("Working…")}</span>
            <b>{Math.round(progress.progress || 0)}%</b>
          </div>
          <div className="pra-progress-track"><i style={{ width: `${Math.max(2, Math.round(progress.progress || 0))}%` }} /></div>
        </div> : null}
      </div>
    </section>

    {error ? <div className="pra-notice error"><AlertTriangle size={14} /><span>{error}</span></div> : null}
    {notice ? <div className="pra-notice"><CheckCircle2 size={14} /><span>{notice}</span></div> : null}

    <div className="pra-layout">
      <section className="pra-result">
        {!selectedRun ? <StateView
          tone="empty"
          icon={<Gauge size={20} />}
          title={t("No review selected")}
          description={t("Choose a paper and venue above, then run a simulated review. Results stay on this machine.")}
        /> : <>
          <header className="pra-result-head">
            <div>
              <h2>{selectedRun.paperTitle || result?.document?.title || "Untitled paper"}</h2>
              <p>{venue?.displayName || selectedRun.venueId} · pack {selectedRun.venueVersion} · {selectedRun.model.provider}/{selectedRun.model.model}</p>
            </div>
            <span className={`pra-status ${selectedRun.status}`}>{selectedRun.status}</span>
            <button type="button" className="secondary-button" onClick={() => void exportReview()} disabled={exporting || !result}>
              {exporting ? <LoaderCircle className="spin" size={13} /> : <Download size={13} />}{t("Export Markdown")}
            </button>
          </header>

          {!result ? <StateView
            tone={selectedRun.status === "error" ? "error" : selectedRun.status === "cancelled" ? "empty" : "loading"}
            icon={selectedRun.status === "error" || selectedRun.status === "cancelled" ? <XCircle size={18} /> : <LoaderCircle className="spin" size={18} />}
            title={selectedRun.status === "error" ? t("The review failed") : selectedRun.status === "cancelled" ? t("The review was cancelled.") : t("The review is running")}
            description={selectedRun.error || (selectedRun.status === "cancelled" ? t("Start a new run when you are ready.") : t("Progress events will update this page."))}
          /> : null}

          {result?.gate?.status === "failed" ? <div className="pra-gate">
            <AlertTriangle size={18} />
            <div>
              <b>{t("Preflight gate stopped this review")}</b>
              <p>{result.gate.reason}</p>
              {result.preflight?.warnings?.length ? <ul>{result.preflight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            </div>
          </div> : null}

          {result && review ? <>
            <Tabs value={tab} onChange={(value) => setTab(value as ReviewTab)} label={t("Paper review result")} variant="segmented" className="pra-result-tabs">
              <Tab value="review">{t("Review")}</Tab>
              <Tab value="reviewers">{t("Reviewers")}</Tab>
              <Tab value="evidence">{t("Evidence")}</Tab>
            </Tabs>

            {tab === "review" ? <div className="pra-review">
              <ScoreGrid review={review} venue={venue} />
              {result.localPool?.percentile !== null && result.localPool?.percentile !== undefined ? <div className="pra-pool">
                <Gauge size={14} />
                <span>{t("Local pool: {percentile}th percentile across {samples} runs in this venue.", { percentile: String(result.localPool.percentile), samples: String(result.localPool.samples) })}</span>
                <em>{t("Not an acceptance probability.")}</em>
              </div> : null}
              <section className="pra-section">
                <h3>{t("Summary")}</h3>
                <p>{review.summary || t("No summary recorded.")}</p>
              </section>
              <div className="pra-split">
                <section className="pra-section"><h3>{t("Strengths")}</h3><FindingList items={review.strengths} empty={t("No strengths recorded.")} /></section>
                <section className="pra-section"><h3>{t("Weaknesses")}</h3><FindingList items={review.weaknesses} empty={t("No weaknesses recorded.")} /></section>
              </div>
              <div className="pra-split">
                <section className="pra-section"><h3>{t("Questions")}</h3><FindingList items={review.questions} empty={t("No questions recorded.")} /></section>
                <section className="pra-section"><h3>{t("Limitations")}</h3><FindingList items={review.limitations} empty={t("No limitations recorded.")} /></section>
              </div>
              {review.metaReview ? <section className="pra-section"><h3>{t("Meta-review")}</h3><p>{review.metaReview}</p></section> : null}
              {review.reviewerDisagreement.length ? <section className="pra-section"><h3>{t("Reviewer disagreement")}</h3><ul className="pra-plain-list">{review.reviewerDisagreement.map((entry) => <li key={entry}>{entry}</li>)}</ul></section> : null}
              {review.consistencyNotes.length ? <section className="pra-section"><h3>{t("Calibration notes")}</h3><ul className="pra-plain-list">{review.consistencyNotes.map((entry) => <li key={entry}>{entry}</li>)}</ul></section> : null}
            </div> : null}

            {tab === "reviewers" ? <div className="pra-reviewers">
              <div className="pra-reviewers-head">
                <h3>{t("Score-conditioned reviewers")}</h3>
                <p>{t("Each reviewer was asked to write the most defensible review for one point on the venue scale. The selector then chose the best-justified, optimistic and critical perspectives.")}</p>
                {result.selection?.rationale ? <p className="pra-muted">{result.selection.rationale}</p> : null}
              </div>
              {result.reviewers.map((reviewer) => {
                const tags: string[] = [];
                if (result.selection?.bestJustified === reviewer.index) tags.push("Best justified");
                if (result.selection?.optimistic === reviewer.index) tags.push("Optimistic");
                if (result.selection?.critical === reviewer.index) tags.push("Critical");
                return <ReviewerCard key={reviewer.index} reviewer={reviewer} tags={tags} venue={venue} />;
              })}
            </div> : null}

            {tab === "evidence" ? <div className="pra-evidence-tab">
              {result.paperCard ? <>
                <section className="pra-section">
                  <h3>{t("Paper card")}</h3>
                  <p>{result.paperCard.summary}</p>
                  <dl className="pra-card-facts">
                    <div><dt>{t("Topic")}</dt><dd>{result.paperCard.topic || "—"}</dd></div>
                    <div><dt>{t("Quality gate")}</dt><dd>{result.paperCard.qualityGate}</dd></div>
                    <div><dt>{t("Injection risk")}</dt><dd>{result.paperCard.promptInjectionRisk}</dd></div>
                    <div><dt>{t("Page coverage")}</dt><dd>{result.paperCard.pageCoverage || "—"}</dd></div>
                  </dl>
                </section>
                <div className="pra-split">
                  <section className="pra-section"><h3>{t("Contributions")}</h3>{result.paperCard.contributions.length ? <ul className="pra-plain-list">{result.paperCard.contributions.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="pra-muted">{t("None extracted.")}</p>}</section>
                  <section className="pra-section"><h3>{t("Limitations")}</h3>{result.paperCard.limitations.length ? <ul className="pra-plain-list">{result.paperCard.limitations.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <p className="pra-muted">{t("None extracted.")}</p>}</section>
                </div>
                <section className="pra-section"><h3>{t("Claims and evidence")}</h3>
                  <div className="pra-claims">
                    {result.paperCard.claims.map((claim, index) => <article key={`${claim.claim}-${index}`} className={`pra-claim ${claim.status}`}>
                      <header><b>{claim.claim}</b><span>{claim.page ? `p. ${claim.page}` : "page unknown"} · {claim.status}</span></header>
                      {claim.evidence ? <p>{claim.evidence}</p> : null}
                    </article>)}
                    {!result.paperCard.claims.length ? <p className="pra-muted">{t("No claims extracted.")}</p> : null}
                  </div>
                </section>
                <section className="pra-section"><h3>{t("Method")}</h3><p>{result.paperCard.method || "—"}</p></section>
                <section className="pra-section"><h3>{t("Experiments")}</h3><p>{result.paperCard.experiments || "—"}</p></section>
              </> : <p className="pra-muted">{t("No paper card is available for this run.")}</p>}
              <section className="pra-section"><h3>{t("Preflight")}</h3>
                <dl className="pra-card-facts">
                  <div><dt>{t("Pages")}</dt><dd>{result.preflight.pageCount} ({result.preflight.pagesWithText} readable)</dd></div>
                  <div><dt>{t("Text")}</dt><dd>{result.preflight.textChars.toLocaleString()} chars</dd></div>
                  <div><dt>{t("Desk reject")}</dt><dd>{result.preflight.deskRejectRisk}</dd></div>
                  <div><dt>{t("Injection signals")}</dt><dd>{result.preflight.injectionSignals.length}</dd></div>
                </dl>
                {result.preflight.warnings.length ? <ul className="pra-plain-list">{result.preflight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
              </section>
              <section className="pra-section"><h3>{t("Audit trail")}</h3>
                <ol className="pra-trace">{result.trace.map((entry, index) => <li key={`${entry.stage}-${index}`}><b>{entry.stage}</b><span>{entry.detail}</span><em>{formatDate(entry.at)}</em></li>)}</ol>
              </section>
            </div> : null}
          </> : null}
        </>}
      </section>

      <RunList runs={runs} selectedId={selectedRun?.id || ""} onSelect={(run) => void selectRun(run)} onDelete={(run) => void removeRun(run)} />
    </div>

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
            <p className="pra-settings-note">
              {t("Using {provider}/{model} from the main agent configuration.", { provider: settings?.agentModel.provider || "—", model: settings?.agentModel.model || "—" })}
            </p>
            {!settings?.agentModel.hasApiKey ? <p className="pra-settings-note warning"><ShieldAlert size={13} />{t("The main agent has no API key yet. Configure Settings → Models or choose a custom provider.")}</p> : null}
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
        <p className="pra-settings-note"><ShieldAlert size={13} />{t("Runs are local. The paper text is sent to the selected model provider only when you start a review.")}</p>
        <div className="pra-settings-actions">
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>{t("Cancel")}</button>
          <button type="button" className="primary-button" onClick={() => void saveSettings()}>{t("Save settings")}</button>
        </div>
      </div> : null}
    </Dialog>
  </main>;
}
