import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpenText, Check, Download, ExternalLink, History, LoaderCircle, Network, Plus, Search, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { exportLiteraturePapers } from "./literature-export";
import "./literature-review.css";

function safeLink(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function samePaper(a: AcademicSearchResult, b: AcademicSearchResult) {
  const normalize = (value: string | undefined) => (value || "").trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^https?:\/\/arxiv\.org\/abs\//, "");
  let conflicting = false;
  for (const field of ["doi", "arxiv_id", "s2_id"] as const) {
    let left = normalize(a[field]), right = normalize(b[field]);
    if (field === "arxiv_id") { left = left.replace(/v\d+$/, ""); right = right.replace(/v\d+$/, ""); }
    if (left && right) { if (left === right) return true; conflicting = true; }
  }
  if (conflicting) return false;
  if (normalize(a.external_id) && normalize(a.external_id) === normalize(b.external_id)) return true;
  return !!a.title && a.title.trim().toLowerCase() === b.title?.trim().toLowerCase();
}
function cleanError(error: unknown) { return String(error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?|^Error:\s*/, ""); }

export default function LiteratureReviewView({ bridge, workspace, projectId, onLibraryImported }: { bridge: ResearchDeskBridge; workspace: string; projectId: string; onLibraryImported?: () => void }) {
  const { t } = useUISettings();
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [libraryPapers, setLibraryPapers] = useState<{ id: string; papers: LibraryPaper[] } | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [savingPaper, setSavingPaper] = useState("");
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState<LiteratureSource>("openalex");
  const [citations, setCitations] = useState(true);
  const [run, setRun] = useState<LiteratureSearchRun | null>(null);
  const [history, setHistory] = useState<LiteratureSearchRun[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [outline, setOutline] = useState<LiteratureOutlineSection[]>([]);
  const [draft, setDraft] = useState<LiteratureReviewDraft | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [reviewPapers, setReviewPapers] = useState<AcademicSearchResult[]>([]);
  const [busy, setBusy] = useState<"search" | "outline" | "draft" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"papers" | "map" | "outline" | "review" | "history">("papers");
  const [activePaper, setActivePaper] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "bib" | "ris">("bib");
  const request = useRef("");
  const scope = { workspace, projectId };
  useEffect(() => {
    let active = true;
    void bridge.listLiteratureSearchHistory({ workspace, projectId }).then(value => { if (active) setHistory(value); }).catch(cause => { if (active) setError(cleanError(cause)); });
    const off = bridge.onLiteratureSearchProgress(event => { if (active && event.requestId === request.current) setProgress(t(event.detail)); });
    return () => { active = false; off(); request.current = ""; };
  }, [bridge, workspace, projectId, t]);
  useEffect(() => {
    let active = true;
    setLibraryLoading(true); setLibraries([]); setLibraryId("");
    void bridge.listLibraries(projectId || undefined).then(items => {
      if (active) { setLibraries(items); setLibraryId(items[0]?.id || ""); }
    }).catch(cause => { if (active) setError(cleanError(cause)); }).finally(() => { if (active) setLibraryLoading(false); });
    return () => { active = false; };
  }, [bridge, projectId]);
  useEffect(() => {
    let active = true;
    setLibraryPapers(null);
    if (libraryId) void bridge.listLibraryPapers(libraryId).then(papers => { if (active) setLibraryPapers({ id: libraryId, papers }); }).catch(cause => { if (active) setError(cleanError(cause)); });
    return () => { active = false; };
  }, [bridge, libraryId]);
  async function savePaper(paper: AcademicSearchResult) {
    if (!libraryId || savingPaper) return;
    const target = libraryId;
    const key = paper.external_id || paper.title;
    setSavingPaper(key); setError("");
    try {
      const saved = await bridge.addLibraryPaper(target, paper);
      setLibraryPapers(current => current?.id === target ? { id: target, papers: [...current.papers.filter(item => item.id !== saved.id), saved] } : current);
      onLibraryImported?.();
    } catch (cause) { setError(cleanError(cause)); }
    finally { setSavingPaper(""); }
  }
  function restore(record: LiteratureSearchRun) {
    setRun(record); setQuestion(record.question); setSource(record.source); setSelected(record.selected || []); setOutline(record.outline || []); setDraft(record.draft || null); setEditingDraft(false); setReviewPapers(record.draftPapers || []); setActivePaper(""); setError(""); setNotice(""); setTab("papers");
  }
  async function persist(record: LiteratureSearchRun) {
    try { setHistory(await bridge.saveLiteratureSearchHistory({ ...scope, record })); return true; }
    catch (cause) { setError(`${t("Could not save history")}: ${cleanError(cause)}`); return false; }
  }
  async function search() {
    const q = question.trim(); if (q.length < 8 || busy || !workspace) return;
    const id = crypto.randomUUID(); request.current = id; setBusy("search"); setError(""); setProgress(t("Planning search…"));
    try {
      const record = await bridge.searchLiterature({ ...scope, question: q, source, citations, requestId: id });
      if (id !== request.current) return;
      restore(record); setHistory(await bridge.listLiteratureSearchHistory(scope));
    } catch (cause) { if (id === request.current) setError(cleanError(cause)); }
    finally { if (id === request.current) { setBusy(null); setProgress(""); } }
  }
  function toggle(index: number) { setSelected(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index].sort((a, b) => a - b)); }
  async function makeOutline() {
    if (!run || !selected.length || busy) return;
    const papers = selected.map(index => run.results[index]?.paper).filter(Boolean); setBusy("outline"); setError("");
    try { const next = await bridge.generateLiteratureOutline({ question: run.question, papers }); setOutline(next); setReviewPapers(papers); setDraft(null); setTab("outline"); const updated = { ...run, selected, outline: next, draft: undefined, draftPapers: papers }; setRun(updated); await persist(updated); }
    catch (cause) { setError(cleanError(cause)); }
    finally { setBusy(null); }
  }
  async function saveOutline() {
    if (!run || !outline.length || busy) return;
    const updated = { ...run, outline, draftPapers: reviewPapers };
    setRun(updated); setNotice(""); if (await persist(updated)) setNotice(t("Outline saved."));
  }
  async function generate() {
    if (!run || !outline.length || !reviewPapers.length || busy) return;
    if (outline.some(section => !section.title.trim() || !section.sources.length)) { setError(t("Each outline section needs a title and at least one source.")); return; }
    setBusy("draft"); setError("");
    try { const result = await bridge.generateLiteratureReview({ question: run.question, papers: reviewPapers, outline }); setDraft(result); setTab("review"); const updated = { ...run, outline, draft: result, draftPapers: reviewPapers }; setRun(updated); await persist(updated); }
    catch (cause) { setError(cleanError(cause)); }
    finally { setBusy(null); }
  }
  async function saveDraft() {
    if (!run || !draft || busy) return;
    const updated = { ...run, outline, draft, draftPapers: reviewPapers };
    setRun(updated); setNotice(""); if (await persist(updated)) setNotice(t("Draft saved."));
  }
  function download() {
    if (!draft || !run) return;
    const sections = draft.sections.map(section => `## ${section.title}\n\n${section.paragraphs.map(paragraph => `${paragraph.text} ${paragraph.sources.map(id => `[${id}]`).join(" ")}\n\n${(paragraph.evidence || []).map(item => `> [${item.source}] ${item.quote}`).join("\n\n")}`).join("\n\n")}`).join("\n\n");
    const refs = reviewPapers.map((paper, index) => `[${index + 1}] ${paper.title} (${paper.year || "n.d."}). ${safeLink(paper.url)}`).join("\n\n");
    const content = `# Literature review\n\n${run.question}\n\n> Draft based on titles and abstracts; verify claims against original papers.\n\n${sections}\n\n## Limitations\n\n${draft.limitations || "Check original papers and source coverage."}\n\n## References\n\n${refs}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "literature-review.md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportPapers() {
    if (!run) return;
    const papers = (selected.length ? selected.map(index => run.results[index]) : run.results).map(result => result.paper);
    const blob = new Blob([exportLiteraturePapers(papers, exportFormat)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `literature-papers.${exportFormat}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const nodes = (run?.results || []).filter(result => run?.edges.some(edge => edge.from === result.paper.external_id || edge.to === result.paper.external_id)).slice(0, 32);
  const nodeIds = new Set(nodes.map(node => node.paper.external_id));
  const visibleEdges = (run?.edges || []).filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const positions = new Map(nodes.map((node, index) => { const angle = 2 * Math.PI * index / Math.max(1, nodes.length); const radius = nodes.length < 5 ? 115 : 205; return [node.paper.external_id, { x: 300 + radius * Math.cos(angle), y: 245 + radius * Math.sin(angle) }]; }));
  const currentNode = nodes.find(item => item.paper.external_id === activePaper);
  return <main className="literature-review" data-ui="literature-review">
    <header className="lit-header"><div><span className="lit-mark"><BookOpenText size={19}/></span><div><h1>{t("Literature Review")}</h1><p>{t("From a research question to a source-linked draft.")}</p></div></div><button className="secondary-button lit-history-button" onClick={() => setTab("history")}><History size={15}/>{t("History")} <span>{history.length}</span></button></header>
    <div className="lit-body">
      <section className="lit-search"><div className="lit-search-copy"><h2>{t("What are you investigating?")}</h2><p>{t("Describe a question, method, or research direction. We’ll search scholarly indexes and help you assemble a reading set.")}</p></div><div className="lit-search-form"><label htmlFor="lit-question">{t("Research question")}</label><textarea id="lit-question" rows={3} value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} placeholder={t("For example: How do language agents learn from past failures?")} /><div className="lit-source-controls"><label>{t("Data source")} <select value={source} disabled={!!busy} onChange={e => setSource(e.target.value as LiteratureSource)}><option value="openalex">OpenAlex</option><option value="arxiv">arXiv</option><option value="semantic-scholar">Semantic Scholar</option><option value="crossref">Crossref</option><option value="pubmed">PubMed</option></select></label>{source === "openalex" && <label><input type="checkbox" checked={citations} disabled={!!busy} onChange={e => setCitations(e.target.checked)}/>{t("Expand citations")}</label>}</div><div className="lit-search-bottom"><span role="status">{busy === "search" ? progress : source === "openalex" ? t("Uses the OpenAlex key in Environment if configured") : source === "semantic-scholar" ? t("Uses the Semantic Scholar key in Environment if configured") : t("One selected source per search")}</span>{busy === "search" && <button className="secondary-button" onClick={() => { void bridge.cancelLiteratureSearch(request.current).catch(cause => setError(cleanError(cause))); }}>{t("Stop search")}</button>}<button className="primary-button" disabled={!!busy || !workspace || question.trim().length < 8} onClick={() => void search()}>{busy === "search" ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} {busy === "search" ? t("Searching…") : t("Find papers")} <ArrowRight size={14}/></button></div></div></section>
      {notice && <p className="lit-warning" role="status">{notice}</p>}
      {error && <div className="lit-notice" role="alert">{error}<button className="quiet-icon-button" aria-label={t("Dismiss")} onClick={() => setError("")}><X size={15}/></button></div>}
      {run?.warnings.length ? <p className="lit-warning" role="status">{run.warnings.join(" ")}</p> : null}
      {tab === "history" ? <section className="lit-history"><div className="lit-results-head"><div><h2>{t("Search history")}</h2><p>{t("Saved locally for this project")}</p></div>{run && <button className="secondary-button" onClick={() => setTab("papers")}>{t("Back to results")}</button>}</div>{history.length ? history.map(item => <button className="lit-history-row" key={item.id} onClick={() => restore(item)}><strong>{item.question}</strong><span>{item.source} · {new Date(item.createdAt).toLocaleString()} · {item.results.length} {t("papers")}</span><ArrowRight size={15}/></button>) : <p>{t("No saved searches yet.")}</p>}</section> : !run ? <section className="lit-empty"><div><BookOpenText size={21}/><h2>{t("Build a reading set")}</h2><p>{t("Search for a topic, select the papers that matter, then draft a review grounded in their available abstracts.")}</p></div><div className="lit-empty-steps"><span><strong>{t("Discover")}</strong>{t("Search across scholarly indexes")}</span><span><strong>{t("Select")}</strong>{t("Choose papers for your review")}</span><span><strong>{t("Synthesize")}</strong>{t("Create a draft with source references")}</span></div><p className="lit-footnote">{t("This tool does not read full papers. Verify claims against original sources.")}</p></section> : <>
        <nav className="lit-tabs" aria-label={t("Literature review workspace")}><button className={tab === "papers" ? "active" : ""} onClick={() => setTab("papers")}>{t("Papers")} <span>{run.results.length}</span></button><button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>{t("Citation map")}</button><button className={tab === "outline" ? "active" : ""} disabled={!outline.length} onClick={() => setTab("outline")}>{t("Outline")}</button><button className={tab === "review" ? "active" : ""} disabled={!draft} onClick={() => setTab("review")}>{t("Review draft")}</button></nav>
        {tab === "papers" && <section className="lit-results"><div className="lit-results-head"><div><h2>{t("Search results")}</h2><p>{run.question}</p><p>{run.source} · {run.totalCandidates} {t("candidates retained")}</p><details><summary>{t("View search strategy")}</summary><ol>{run.history.map((item, index) => <li key={index}>{item.query} · {item.error ? t("Source failed") : `${item.count} ${t("results")}`} · {t("Round")} {item.round}</li>)}</ol></details></div><div className="lit-actions"><button className="secondary-button" onClick={() => setSelected(selected.length === Math.min(run.results.length, 64) ? [] : run.results.map((_, i) => i).slice(0, 64))}>{selected.length === Math.min(run.results.length, 64) ? t("Clear selection") : t("Select all")}</button><span>{t("{count} selected", { count: selected.length })}</span><button className="primary-button" disabled={!selected.length || !!busy} onClick={() => void makeOutline()}>{busy === "outline" ? <LoaderCircle size={15} className="spin"/> : <BookOpenText size={15}/>} {busy === "outline" ? t("Building outline…") : t("Build outline")}</button></div></div>
          <div className="lit-save-target"><label htmlFor="lit-library">{t("Save to")}</label><select id="lit-library" value={libraryId} disabled={libraryLoading || !libraries.length} onChange={event => setLibraryId(event.target.value)}>{!libraries.length && <option value="">{libraryLoading ? t("Loading…") : t("No libraries in this project")}</option>}{libraries.map(library => <option value={library.id} key={library.id}>{library.name}</option>)}</select></div><div className="lit-export-papers"><span>{t("Export selected papers, or all if none selected")}</span><select aria-label={t("Export format")} value={exportFormat} onChange={event => setExportFormat(event.target.value as typeof exportFormat)}><option value="bib">BibTeX</option><option value="ris">RIS</option><option value="csv">CSV</option><option value="json">JSON</option></select><button className="secondary-button" onClick={exportPapers}><Download size={14}/>{t("Export papers")}</button></div>
          <div className="lit-paper-list">{run.results.map((result, index) => { const paper = result.paper; const link = safeLink(paper.url); const checked = selected.includes(index); const saved = libraryPapers?.id === libraryId && libraryPapers.papers.some(item => samePaper(item, paper)); const saving = savingPaper === (paper.external_id || paper.title); return <article key={`${paper.external_id || paper.title}-${index}`} className={checked ? "lit-paper selected" : "lit-paper"}><button type="button" className="lit-select" disabled={!checked && selected.length >= 64} onClick={() => toggle(index)} aria-pressed={checked} aria-label={t("Select {title}", { title: paper.title })}>{checked && <Check size={14}/>}</button><div className="lit-paper-main"><div className="lit-paper-meta"><span>{paper.year || "—"}</span><span>{paper.venue || paper.source || t("Unknown source")}</span></div><h3>{paper.title}{link && <a href={link} target="_blank" rel="noreferrer" aria-label={t("Open paper")}><ExternalLink size={14}/></a>}</h3><p className="lit-authors">{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}</p><p className="lit-abstract">{paper.abstract || t("No abstract available.")}</p><p className="lit-reason"><strong>{t("Why it ranks")} · </strong>{result.reason}</p></div><div className="lit-paper-actions"><span className="lit-match">{result.score === null ? t("Unscored") : `${result.score}/10`}</span><button className="secondary-button lit-save-button" disabled={!libraryId || libraryPapers?.id !== libraryId || !!savingPaper || saved} onClick={() => void savePaper(paper)} aria-label={`${saved ? t("Saved") : t("Save")} ${paper.title}`}>{saved ? <Check size={14}/> : saving ? <LoaderCircle size={14} className="spin"/> : <Plus size={14}/>} {saved ? t("Saved") : saving ? t("Saving") : t("Save")}</button></div></article>; })}</div>
        </section>}
        {tab === "map" && <section className="lit-map"><div className="lit-results-head"><div><h2>{t("Citation map")}</h2><p>{t("Links show observed OpenAlex citations, not topic similarity.")}</p></div><Network size={18}/></div>{visibleEdges.length ? <div className="lit-map-layout"><svg viewBox="0 0 600 490" role="img" aria-label={t("Citation map")}><defs><marker id="lit-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>{visibleEdges.map((edge, index) => { const a = positions.get(edge.from)!, b = positions.get(edge.to)!; return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#lit-arrow)"/>; })}{nodes.map(node => { const p = positions.get(node.paper.external_id)!; return <g key={node.paper.external_id} onClick={() => setActivePaper(node.paper.external_id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActivePaper(node.paper.external_id); } }} aria-label={node.paper.title}><circle cx={p.x} cy={p.y} r={node.paper.external_id === activePaper ? 10 : 7}/><title>{node.paper.title}</title></g>; })}</svg><aside>{currentNode ? <><h3>{currentNode.paper.title}</h3><p>{currentNode.paper.year || "—"} · {currentNode.paper.source}</p>{safeLink(currentNode.paper.url) && <a href={safeLink(currentNode.paper.url)} target="_blank" rel="noreferrer">{t("Open paper")} <ExternalLink size={13}/></a>}</> : <p>{t("Select a node to inspect its paper.")}</p>}<small>{t("Showing up to 32 ranked papers with observed links.")}</small></aside></div> : <p className="lit-warning">{t("No citation relationships were retrieved. Citation expansion is available for OpenAlex when its API responds.")}</p>}</section>}
        {tab === "outline" && <section className="lit-outline"><div className="lit-results-head"><div><h2>{t("Review the outline")}</h2><p>{t("Edit the structure and source assignments before drafting.")}</p></div><div className="lit-actions"><button className="secondary-button" disabled={!!busy} onClick={() => void saveOutline()}>{t("Save outline")}</button><button className="primary-button" disabled={!!busy} onClick={() => void generate()}>{busy === "draft" ? <LoaderCircle size={15} className="spin"/> : <BookOpenText size={15}/>} {busy === "draft" ? t("Drafting…") : t("Generate review")}</button></div></div><p className="lit-warning">{t("Based on titles and abstracts only. Source references do not verify individual claims; read the original papers.")}</p>{outline.map((section, index) => <div className="lit-outline-section" key={index}><input aria-label={`${t("Section title")} ${index + 1}`} value={section.title} onChange={event => setOutline(current => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}/><textarea aria-label={`${t("Section description")} ${index + 1}`} value={section.description} onChange={event => setOutline(current => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))}/><details><summary>{t("Sources")} · {section.sources.length}</summary>{reviewPapers.map((paper, i) => <label key={i}><input type="checkbox" checked={section.sources.includes(i + 1)} onChange={() => setOutline(current => current.map((item, j) => j !== index ? item : { ...item, sources: item.sources.includes(i + 1) ? item.sources.filter(id => id !== i + 1) : [...item.sources, i + 1] }))}/> [{i + 1}] {paper.title}</label>)}</details></div>)}</section>}
        {tab === "review" && draft && <section className="lit-draft"><div className="lit-results-head"><div><h2>{t("Review draft")}</h2><p>{run.question}</p></div><div className="lit-actions"><button className="secondary-button" onClick={() => setEditingDraft(current => !current)}>{editingDraft ? t("Done editing") : t("Edit draft")}</button><button className="secondary-button" onClick={() => void saveDraft()}>{t("Save draft")}</button><button className="secondary-button" onClick={download}><Download size={15}/> {t("Export Markdown")}</button></div></div><p className="lit-warning">{t("Based on titles and abstracts only. Source references do not verify individual claims; read the original papers.")}</p>{draft.sections.map((section, index) => <section key={`${section.title}-${index}`}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, p) => <div key={p}>{editingDraft ? <textarea className="lit-draft-editor" aria-label={`${section.title} ${p + 1}`} value={paragraph.text} onChange={event => setDraft(current => current ? { ...current, sections: current.sections.map((item, sectionIndex) => sectionIndex === index ? { ...item, paragraphs: item.paragraphs.map((entry, paragraphIndex) => paragraphIndex === p ? { ...entry, text: event.target.value } : entry) } : item) } : current)} /> : <p>{paragraph.text} {paragraph.sources.map(source => <a className="lit-citation" key={source} href={`#lit-reference-${source}`}>[{source}]</a>)}</p>}{paragraph.evidence?.length ? <details className="lit-evidence"><summary>{t("View abstract evidence")}</summary>{paragraph.evidence.map((item, i) => <blockquote key={i}>[{item.source}] {item.quote}</blockquote>)}</details> : null}</div>)}</section>)}{draft.limitations && <section><h3>{t("Limitations")}</h3><p>{draft.limitations}</p></section>}<section className="lit-references"><h3>{t("References")}</h3>{reviewPapers.map((paper, index) => { const link = safeLink(paper.url); return <p id={`lit-reference-${index + 1}`} key={index}><strong>[{index + 1}]</strong> {link ? <a href={link} target="_blank" rel="noreferrer">{paper.title}</a> : paper.title} · {paper.year || "—"}</p>; })}</section></section>}
      </>}
    </div>
  </main>;
}
