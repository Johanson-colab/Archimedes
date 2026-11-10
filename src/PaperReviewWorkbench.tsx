import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpenCheck, Download, LoaderCircle, Square } from "lucide-react";
import PaperPresentationDeck from "./PaperPresentationDeck";
import PaperDeepReadingDocument from "./PaperDeepReadingDocument";
import { Tab, Tabs } from "./Tabs";
import { InlineNotice } from "./InlineNotice";
import { useUISettings } from "./i18n";
import "./paper-deep-reading.css";

type ReviewPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
function errorMessage(error: unknown) { return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, ""); }

export default function PaperReviewWorkbench({ bridge, workspace, projectId, paper, pageCount, ready, pdfUrl = "", onOpenSource, onInternalReviewThreadsDeleted }: {
  bridge: ResearchDeskBridge; workspace: string; projectId?: string | null; paper: ReviewPaper; pageCount: number; ready: boolean; pdfUrl?: string;
  onOpenSource?: (page: number) => void; onInternalReviewThreadsDeleted?: (threadIds: string[]) => void;
}) {
  const { t } = useUISettings();
  const bridgeReady = typeof bridge.cancelPaperDeepReading === "function" && typeof bridge.exportPaperDeepReading === "function";
  const [view, setView] = useState<"reading" | "presentation">("reading");
  const [saved, setSaved] = useState<StoredPaperReview | null>(null);
  const [html, setHtml] = useState("");
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [stage, setStage] = useState("source");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const runId = useRef<string | null>(null);
  const generation = useRef(0);
  const stages = useMemo<Record<string, string>>(() => ({ source: t("Reading the original PDF"), plan: t("Planning chapters and figures"), figures: t("Extracting original figures"), chapter: t("Writing the bilingual reading"), audit: t("Checking evidence and exports"), complete: t("Reading ready") }), [t]);

  useEffect(() => {
    let mounted = true;
    void bridge.cleanupPaperReviewRuns(workspace).then(({ threadIds }) => { if (mounted && threadIds.length) onInternalReviewThreadsDeleted?.(threadIds); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [bridge, workspace, onInternalReviewThreadsDeleted]);

  useEffect(() => {
    const request = ++generation.current;
    setRunning(false); setSaved(null); setHtml(""); setError(""); setNotice(""); setView("reading"); setRestoring(true);
    void bridge.getPaperReview(paper.id, workspace, projectId).then(record => {
      if (request !== generation.current || runId.current) return;
      setSaved(record); setHtml(record?.readingHtml || "");
      if (record?.readingError) setError(record.readingError);
      if (record?.readingWarning) setNotice(record.readingWarning);
    }).catch(cause => { if (request === generation.current) setError(errorMessage(cause)); }).finally(() => { if (request === generation.current) setRestoring(false); });
    return () => { generation.current++; const id = runId.current; runId.current = null; if (id && typeof bridge.cancelPaperDeepReading === "function") void bridge.cancelPaperDeepReading(id).catch(() => undefined); };
  }, [bridge, paper.id, workspace, projectId]);

  async function runReading() {
    if (runId.current || !ready || !workspace || !bridgeReady) return;
    const clientRunId = crypto.randomUUID(); runId.current = clientRunId;
    const request = ++generation.current;
    setRunning(true); setError(""); setNotice(""); setStage("source"); setRestoring(false);
    try {
      await bridge.runPaperReview({ paper, pageCount, workspace, projectId, clientRunId });
      if (runId.current !== clientRunId || request !== generation.current) return;
      const record = await bridge.getPaperReview(paper.id, workspace, projectId);
      if (runId.current !== clientRunId || request !== generation.current) return;
      if (!record?.readingHtml) throw new Error(record?.readingError || t("The illustrated reading could not be restored."));
      setSaved(record); setHtml(record.readingHtml); setStage("complete");
    } catch (cause) { if (request === generation.current) setError(errorMessage(cause)); }
    finally { if (runId.current === clientRunId) { runId.current = null; setRunning(false); } }
  }

  useEffect(() => bridge.onPaperReviewEvent(event => {
    if (event.clientRunId && event.clientRunId === runId.current) setStage(event.stage);
  }), [bridge]);

  async function exportReading() {
    if (exporting) return;
    setExporting(true); setError("");
    try { const result = await bridge.exportPaperDeepReading(paper.id, workspace, projectId); if (result.saved) setNotice(t("Reading exported to {path}", { path: result.path })); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setExporting(false); }
  }

  return <div className={`paper-deep-workbench${view === "presentation" ? " presentation-active" : ""}`}>
    <header className="paper-deep-toolbar">
      <Tabs value={view} onChange={v => setView(v as "reading" | "presentation")} label={t("Interactive paper outputs")} variant="segmented">
        <Tab value="reading">{t("Reading")}</Tab><Tab value="presentation" disabled={!saved?.summary}>{t("Presentation")}</Tab>
      </Tabs>
      <span className="paper-deep-status" role="status">{running ? stages[stage] || stages.chapter : html ? t("Reading ready") : ""}</span>
      <div className="paper-deep-actions">
        {html && <button className="secondary-button" disabled={exporting || running} onClick={() => void exportReading()}>{exporting ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}{t("Export reading")}</button>}
        {running ? <button className="secondary-button" onClick={() => { if (runId.current) void bridge.cancelPaperDeepReading(runId.current).catch(cause => setError(errorMessage(cause))); }}><Square size={13} />{t("Stop")}</button> : <button className="primary-button" disabled={!ready || !workspace || restoring || !bridgeReady} onClick={() => void runReading()}>{t(saved ? "Read again" : "Generate reading")}</button>}
      </div>
    </header>
    {!bridgeReady && <InlineNotice tone="warning" className="paper-deep-notice">{t("Restart Archimedes to enable illustrated paper readings.")}</InlineNotice>}
    {error && <InlineNotice tone="danger" className="paper-deep-notice">{error}</InlineNotice>}
    {notice && <InlineNotice tone="info" className="paper-deep-notice">{notice}</InlineNotice>}
    {view === "presentation" ? <PaperPresentationDeck bridge={bridge} workspace={workspace} projectId={projectId} paper={paper} pageCount={pageCount} pdfUrl={pdfUrl} reviewReady={Boolean(saved?.summary)} reviewUpdatedAt={saved?.updated_at || ""} /> : html ? <PaperDeepReadingDocument html={html} title={t("Interactive paper")} pageCount={pageCount} onOpenSource={onOpenSource} /> : <div className="paper-deep-empty">
      <BookOpenCheck size={30} strokeWidth={1.4} /><h2>{t(restoring ? "Restoring reading…" : running ? "Building your illustrated reading" : "Read the paper with its evidence")}</h2>
      <p>{t("Original figures, detailed bilingual explanations, and interactive mechanisms across Related work, Method, Experiments, and Limitations.")}</p>
      {running && <p className="paper-deep-progress"><LoaderCircle className="spin" size={15} />{stages[stage] || stages.chapter}</p>}
      {!ready && <InlineNotice tone="warning">{t("Prepare or attach the original PDF first.")}</InlineNotice>}
      {saved?.summary && !html && <details className="paper-deep-legacy" open><summary>{t("Saved text reading")}</summary><p>{t("Your previous reading is preserved. Read again to create the illustrated bilingual version.")}</p><div className="paper-review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{saved.summary}</ReactMarkdown></div></details>}
    </div>}
  </div>;
}
