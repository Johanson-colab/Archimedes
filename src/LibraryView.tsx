import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  AlignLeft,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  ExternalLink,
  FileSearch,
  FileText,
  Flame,
  Highlighter,
  Languages,
  Library,
  ListTree,
  LoaderCircle,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";

const LIBRARY_COLORS = ["#3973c8", "#2d8a68", "#a8652e", "#7a5bb5", "#b34f58"];

type LibraryViewProps = {
  bridge: ResearchDeskBridge;
  mode: "library" | "daily";
  workspace?: string;
  projectId?: string | null;
  onAgentRun?: (result: AgentRunResult) => void;
};

export default function LibraryView({ bridge, mode, workspace = "", projectId, onAgentRun }: LibraryViewProps) {
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [readerPaperId, setReaderPaperId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [libraryEditor, setLibraryEditor] = useState<ResearchLibrary | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const nextLibraries = await bridge.listLibraries();
      setLibraries(nextLibraries);
      setError("");
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  const loadPapers = useCallback(async (libraryId: string, query = "") => {
    setLoading(true);
    try {
      const nextPapers = await bridge.listLibraryPapers(libraryId, query);
      setPapers(nextPapers);
      setSelectedPaperId((current) => nextPapers.some((paper) => paper.id === current) ? current : nextPapers[0]?.id ?? null);
      setError("");
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => { void loadLibraries(); }, [loadLibraries]);

  useEffect(() => {
    if (!selectedLibraryId) return;
    const timeout = window.setTimeout(() => void loadPapers(selectedLibraryId, localQuery), 160);
    return () => window.clearTimeout(timeout);
  }, [loadPapers, localQuery, selectedLibraryId]);

  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const selectedPaper = papers.find((paper) => paper.id === selectedPaperId) ?? null;
  const readerPaper = papers.find((paper) => paper.id === readerPaperId) ?? null;

  async function saveLibrary(input: { name: string; description: string; color: string }) {
    if (libraryEditor === "new") await bridge.createLibrary(input);
    else if (libraryEditor) await bridge.updateLibrary(libraryEditor.id, input);
    setLibraryEditor(null);
    await loadLibraries();
  }

  async function deleteLibrary() {
    if (!selectedLibrary || !window.confirm(`Delete "${selectedLibrary.name}"? Papers shared with other libraries are kept.`)) return;
    await bridge.deleteLibrary(selectedLibrary.id);
    setSelectedLibraryId(null);
    setPapers([]);
    await loadLibraries();
  }

  async function updatePaper(patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) {
    if (!selectedPaper) return;
    const updated = await bridge.updateLibraryPaper(selectedPaper.id, patch);
    setPapers((current) => current.map((paper) => paper.id === updated.id ? updated : paper));
  }

  async function removePaper() {
    if (!selectedLibrary || !selectedPaper || !window.confirm(`Remove "${selectedPaper.title}" from this library?`)) return;
    await bridge.removeLibraryPaper(selectedLibrary.id, selectedPaper.id);
    await Promise.all([loadPapers(selectedLibrary.id, localQuery), loadLibraries()]);
  }

  async function importPaper(paper: AcademicSearchResult) {
    if (!selectedLibrary) return;
    await bridge.addLibraryPaper(selectedLibrary.id, paper);
    await Promise.all([loadPapers(selectedLibrary.id, localQuery), loadLibraries()]);
  }

  if (mode === "daily") {
    return <DailyDiscovery bridge={bridge} libraries={libraries} loadingLibraries={loading} onImported={loadLibraries} />;
  }

  if (!selectedLibrary) {
    return <section className="library-page">
      <header className="library-page-header">
        <div><span className="eyebrow">Knowledge base</span><h1>Literature library</h1><p>Curated research directions with searchable, reusable paper records.</p></div>
        <button className="primary-button" onClick={() => setLibraryEditor("new")}><Plus size={15} />New library</button>
      </header>
      {error && <div className="library-error">{error}</div>}
      {loading && !libraries.length ? <LoadingState /> : <div className="library-card-grid">
        {libraries.map((library) => <button className="library-card" key={library.id} onClick={() => setSelectedLibraryId(library.id)}>
          <span className="library-color" style={{ background: library.color }}><Library size={18} /></span>
          <span className="library-card-copy"><strong>{library.name}</strong><small>{library.description}</small></span>
          <span className="library-card-meta"><b>{library.paper_count}</b> papers<ExternalLink size={13} /></span>
        </button>)}
      </div>}
      <LibraryEditor editor={libraryEditor} onClose={() => setLibraryEditor(null)} onSave={saveLibrary} />
    </section>;
  }

  if (readerPaper) {
    return <PaperReadingWorkbench
      paper={readerPaper}
      library={selectedLibrary}
      onBack={() => setReaderPaperId(null)}
      onUpdate={updatePaper}
      bridge={bridge}
      workspace={workspace}
      projectId={projectId}
      onAgentRun={onAgentRun}
    />;
  }

  return <section className="library-page library-detail-page">
    <header className="library-detail-header">
      <button className="icon-button" onClick={() => setSelectedLibraryId(null)} title="All libraries"><ArrowLeft size={17} /></button>
      <span className="library-color small" style={{ background: selectedLibrary.color }}><Library size={15} /></span>
      <div><span className="eyebrow">Literature library</span><h1>{selectedLibrary.name}</h1></div>
      <div className="library-header-actions">
        <button className="icon-button" onClick={() => setLibraryEditor(selectedLibrary)} title="Edit library"><Pencil size={15} /></button>
        <button className="icon-button danger" onClick={() => void deleteLibrary()} title="Delete library"><Trash2 size={15} /></button>
        <button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={15} />Import paper</button>
      </div>
    </header>
    <div className="library-description">{selectedLibrary.description}</div>
    <div className="library-toolbar"><Search size={15} /><input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="Search title, author, abstract, or venue" /><span>{papers.length} papers</span></div>
    {error && <div className="library-error">{error}</div>}
    <div className="library-split">
      <div className="library-paper-list">
        {loading && !papers.length ? <LoadingState /> : papers.length ? papers.map((paper) => <button className={paper.id === selectedPaperId ? "library-paper-row selected" : "library-paper-row"} key={paper.id} onClick={() => setSelectedPaperId(paper.id)}>
          <span className="paper-row-year">{paper.year ?? "—"}</span>
          <span><strong>{paper.title}</strong><small>{paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}</small></span>
          {paper.starred && <Star size={13} fill="currentColor" />}
        </button>) : <div className="empty-library"><BookOpen size={22} /><strong>No matching papers</strong><span>Import a paper or change the search query.</span></div>}
      </div>
      <PaperInspector paper={selectedPaper} onUpdate={updatePaper} onRemove={removePaper} onRead={() => selectedPaper && setReaderPaperId(selectedPaper.id)} />
    </div>
    <LibraryEditor editor={libraryEditor} onClose={() => setLibraryEditor(null)} onSave={saveLibrary} />
    <PaperImportModal open={importOpen} bridge={bridge} library={selectedLibrary} onClose={() => setImportOpen(false)} onImport={importPaper} />
  </section>;
}

function PaperInspector({ paper, onUpdate, onRemove, onRead }: { paper: LibraryPaper | null; onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>; onRemove: () => Promise<void>; onRead: () => void }) {
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(paper?.notes ?? ""), [paper]);
  if (!paper) return <div className="paper-inspector empty"><BookOpen size={24} /><span>Select a paper to inspect its record.</span></div>;
  return <article className="paper-inspector">
    <div className="paper-inspector-kicker"><span>{paper.venue || "Research paper"}</span><span>{paper.year ?? "Year unknown"}</span></div>
    <div className="paper-inspector-title"><h2>{paper.title}</h2><button className={paper.starred ? "icon-button starred" : "icon-button"} onClick={() => void onUpdate({ starred: !paper.starred })} title={paper.starred ? "Unstar" : "Star"}><Star size={17} fill={paper.starred ? "currentColor" : "none"} /></button></div>
    <p className="paper-authors">{paper.authors.join(", ") || "Authors unavailable"}</p>
    <p className="paper-abstract">{paper.abstract || "No abstract was returned by the metadata provider."}</p>
    <div className="paper-record-row"><label>Reading status<select value={paper.reading_status} onChange={(event) => void onUpdate({ reading_status: event.target.value as ReadingStatus })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>{paper.url && <a className="outline-button" href={paper.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open source</a>}</div>
    <button className="paper-reader-launch" onClick={onRead}><BookOpen size={15} /><span><strong>Open reading workspace</strong><small>Notes, evidence, and paper structure</small></span><ChevronRight size={16} /></button>
    <label className="paper-notes">My notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Why is this paper useful? What should you verify?" /></label>
    <div className="paper-inspector-actions"><button className="secondary-button danger-text" onClick={() => void onRemove()}><Trash2 size={14} />Remove</button><button className="primary-button" onClick={() => void onUpdate({ notes })}><Save size={14} />Save notes</button></div>
  </article>;
}

type PaperChatMessage = { role: "assistant" | "user"; text: string };
type SelectionAnchor = { x: number; y: number };

function PaperReadingWorkbench({ paper, library, onBack, onUpdate, bridge, workspace, projectId, onAgentRun }: {
  paper: LibraryPaper; library: ResearchLibrary; onBack: () => void;
  onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>;
  bridge: ResearchDeskBridge; workspace: string; projectId?: string | null; onAgentRun?: (result: AgentRunResult) => void;
}) {
  const [reader, setReader] = useState<PaperReaderState | null>(null);
  const [busy, setBusy] = useState<"remote" | "local" | null>(null);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [query, setQuery] = useState("");
  const [passages, setPassages] = useState<PaperPassage[]>([]);
  const [selection, setSelection] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | undefined>();
  const [chatMessages, setChatMessages] = useState<PaperChatMessage[]>([]);
  const ready = reader?.asset?.status === "ready" && reader.pages.length > 0 && Boolean(reader.asset.preview_url);
  const currentPage = reader?.pages.find((page) => page.page_number === pageNumber) ?? reader?.pages[0] ?? null;
  const lastPage = reader?.asset?.page_count ?? reader?.pages.at(-1)?.page_number ?? 1;

  const loadReader = useCallback(async () => {
    try {
      const next = await bridge.getLibraryPaperReader(paper.id, workspace);
      setReader(next);
      if (next.pages[0]) setPageNumber((current) => Math.min(Math.max(1, current), next.pages.at(-1)?.page_number ?? 1));
    } catch (loadError) { setError(readableError(loadError, "Could not load the paper reader.")); }
  }, [bridge, paper.id, workspace]);
  useEffect(() => { void loadReader(); }, [loadReader]);

  function closeSelection() { setSelection(""); setSelectionAnchor(null); setCommentOpen(false); setComment(""); }
  function receiveSelection(text: string, anchor: SelectionAnchor) {
    const next = text.replace(/\s+/g, " ").trim();
    if (!next) return;
    setSelection(next.slice(0, 5000));
    setSelectionAnchor(anchor);
    setCommentOpen(false);
  }
  async function prepare(kind: "remote" | "local") {
    setBusy(kind); setError("");
    try {
      const next = kind === "remote"
        ? await bridge.prepareLibraryPaperReader(paper.id, workspace)
        : await bridge.attachLibraryPaperPdf(paper.id, workspace);
      setReader(next);
      setPageNumber(next.pages[0]?.page_number ?? 1);
    } catch (prepareError) { setError(readableError(prepareError, "Could not prepare the original PDF.")); }
    finally { setBusy(null); }
  }
  async function find() {
    if (!query.trim() || !reader) return;
    try {
      const next = await bridge.findLibraryPaperPassages(paper.id, query.trim(), workspace);
      setPassages(next);
      if (next[0]) setPageNumber(next[0].page_number);
      else setError("No matching passage was found in the indexed pages.");
    } catch (findError) { setError(readableError(findError, "Could not search this paper.")); }
  }
  async function saveHighlight(note = "", color: PaperHighlightInput["color"] = "yellow") {
    if (!currentPage || !selection) return;
    const start = currentPage.text.indexOf(selection);
    try {
      const item = await bridge.createLibraryPaperHighlight(paper.id, {
        page_number: currentPage.page_number, quote: selection, note, color,
        start_offset: start >= 0 ? start : undefined,
        end_offset: start >= 0 ? start + selection.length : undefined,
      }, workspace);
      setReader((current) => current ? { ...current, highlights: [...current.highlights, item] } : current);
      closeSelection();
    } catch (highlightError) { setError(readableError(highlightError, "Could not save this highlight.")); }
  }
  async function askAI(question: string) {
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    if (!workspace) { setError("Choose a workspace before starting a paper conversation."); return; }
    const quotedPassage = selection ? `\n\nSelected passage from page ${pageNumber}:\n> ${selection}` : "";
    const instruction = `You are helping a researcher read the paper \"${paper.title}\". ${prompt}${quotedPassage}\n\nGround your answer in the selected passage and the attached paper. State when the passage alone is insufficient, and cite page numbers when available.`;
    setChatOpen(true);
    setChatDraft("");
    setChatMessages((current) => [...current, { role: "user", text: prompt }]);
    setChatBusy(true);
    try {
      const result = await bridge.runAgent({
        prompt: instruction,
        workspace,
        threadId: chatThreadId,
        projectId: projectId || undefined,
        mode: "free-chat",
        contextItems: [{ id: `paper:${paper.id}`, type: "paper", name: paper.title, detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`, paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url } }],
      });
      setChatThreadId(result.threadId);
      setChatMessages((current) => [...current, { role: "assistant", text: result.response }]);
      onAgentRun?.(result);
    } catch (askError) {
      setChatMessages((current) => [...current, { role: "assistant", text: `I could not answer that yet: ${readableError(askError, "Agent request failed.")}` }]);
    } finally { setChatBusy(false); }
  }
  function translateSelection() { void askAI(`Translate this passage into natural Chinese. Preserve technical terms and then add one concise sentence explaining its role in the paper.`); }
  function openAskForSelection() { setChatOpen(true); setChatDraft(`请解释论文第 ${pageNumber} 页所选这段话的含义、上下文和可能的局限。`); }

  return <section className={chatOpen ? "paper-workbench-page paper-chat-open" : "paper-workbench-page"}>
    <header className="paper-workbench-header paper-reader-header">
      <button className="reader-back-button" onClick={onBack}><ChevronLeft size={16} />Library</button>
      <span className="reader-header-divider" />
      <div className="reader-title"><span>{library.name}</span><strong title={paper.title}>{paper.title}</strong></div>
      <div className="reader-header-actions">
        {paper.url && <a className="reader-icon-button" href={paper.url} target="_blank" rel="noreferrer" title="Open source"><ExternalLink size={16} /></a>}
        <button className="reader-icon-button" title={paper.starred ? "Unstar paper" : "Star paper"} onClick={() => void onUpdate({ starred: !paper.starred })}><Star size={16} fill={paper.starred ? "currentColor" : "none"} /></button>
        <button className={chatOpen ? "reader-ask-button active" : "reader-ask-button"} title="Ask Archimedes" onClick={() => setChatOpen((value) => !value)}>{chatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}<span>Ask AI</span></button>
      </div>
    </header>
    <div className="paper-reader-tabs" role="tablist"><button className="active" role="tab" aria-selected="true"><FileText size={16} />原始论文</button><button role="tab" disabled title="评述工作台即将推出"><BookOpen size={16} />评述 <small>Coming soon</small></button></div>
    <div className="paper-reader-layout">
      <main className="original-paper-reader">
        {ready ? <>
          <div className="paper-reader-toolbar">
            <div className="paper-page-controls"><button onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1} title="Previous page"><ChevronLeft size={17} /></button><strong>{pageNumber} / {lastPage}</strong><button onClick={() => setPageNumber((value) => Math.min(lastPage, value + 1))} disabled={pageNumber >= lastPage} title="Next page"><ChevronRight size={17} /></button></div>
            <div className="paper-search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void find()} placeholder="Find in paper" /><button onClick={() => void find()} disabled={!query.trim()}>Find</button></div>
            <span className="paper-reader-evidence"><Highlighter size={14} />{reader?.highlights.length ?? 0}</span>
          </div>
          {passages.length > 0 && <div className="paper-search-results">{passages.slice(0, 5).map((passage) => <button key={`${passage.page_number}-${passage.start_offset}`} onClick={() => setPageNumber(passage.page_number)}><b>p. {passage.page_number}</b>{passage.excerpt}</button>)}</div>}
          <PdfPaperCanvas url={reader?.asset?.preview_url || ""} pageNumber={pageNumber} onSelection={receiveSelection} />
        </> : <div className="paper-reader-empty">
          <span className="paper-reader-empty-icon"><FileText size={24} /></span><h2>Open the original paper</h2><p>{paper.pdf_url ? "The public PDF can be cached locally and opened in the reader." : "Attach a local PDF to open the original paper here."}</p>
          <div><button className="primary-button" disabled={Boolean(busy) || !paper.pdf_url} onClick={() => void prepare("remote")}>{busy === "remote" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "remote" ? "Preparing…" : "Prepare PDF"}</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void prepare("local")}>{busy === "local" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}Attach PDF</button></div>
        </div>}
        {(error || reader?.asset?.error) && <div className="reader-runtime-error">{error || reader?.asset?.error}</div>}
      </main>
      {chatOpen && <aside className="paper-ai-panel">
        <header><div><span className="eyebrow">Archimedes</span><h2>论文对话</h2></div><button className="reader-icon-button" onClick={() => setChatOpen(false)} title="Close AI panel"><X size={16} /></button></header>
        <div className="paper-ai-thread">{chatMessages.length ? chatMessages.map((message, index) => <article className={message.role} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? <Bot size={14} /> : "You"}</span><p>{message.text}</p></article>) : <div className="paper-ai-empty"><Bot size={22} /><strong>Ask about this paper</strong><p>Select any passage, then ask for an explanation, a translation, or a critical reading.</p></div>}{chatBusy && <div className="paper-ai-working"><LoaderCircle className="spin" size={15} />Archimedes is reading…</div>}</div>
        {selection && <div className="paper-ai-context"><span>p. {pageNumber} selection</span><p>{selection}</p><button onClick={closeSelection}><X size={12} /></button></div>}
        <div className="paper-ai-compose"><textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void askAI(chatDraft); } }} placeholder="Ask about the paper…" rows={3} /><button className="primary-button" disabled={chatBusy || !chatDraft.trim()} onClick={() => void askAI(chatDraft)}><Send size={14} />Send</button></div>
      </aside>}
    </div>
    {selection && selectionAnchor && <div className="paper-selection-menu" style={{ left: Math.min(window.innerWidth - 300, Math.max(12, selectionAnchor.x - 112)), top: Math.max(12, selectionAnchor.y - 58) }} onMouseDown={(event) => event.preventDefault()}>
      <button onClick={() => void saveHighlight()}><Highlighter size={15} />高亮</button><button onClick={translateSelection}><Languages size={15} />翻译</button><button onClick={() => setCommentOpen(true)}><MessageSquareText size={15} />评论</button><button onClick={openAskForSelection}><Bot size={15} />向 AI 提问</button>
      {commentOpen && <form className="paper-comment-composer" onSubmit={(event) => { event.preventDefault(); void saveHighlight(comment, "blue"); }}><textarea autoFocus value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment…" rows={3} /><div><button type="button" onClick={closeSelection}>Cancel</button><button type="submit" disabled={!comment.trim()}>Save</button></div></form>}
    </div>}
  </section>;
}

function PdfPaperCanvas({ url, pageNumber, onSelection }: { url: string; pageNumber: number; onSelection: (text: string, anchor: SelectionAnchor) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(420, Math.floor(entry.contentRect.width))));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let destroyLoadingTask: (() => void) | undefined;
    const host = hostRef.current;
    if (!host || !url) return;
    const renderHost = host;
    async function render() {
      setState("loading"); setError(""); renderHost.replaceChildren();
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const response = await fetch(url);
        if (!response.ok) throw new Error(`PDF request failed (${response.status}).`);
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
        destroyLoadingTask = () => loadingTask.destroy();
        const pdfDocument = await loadingTask.promise;
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.65, Math.max(.7, (width - 72) / baseViewport.width));
        const viewport = pdfPage.getViewport({ scale });
        const page = window.document.createElement("div");
        page.className = "arch-pdf-page";
        page.style.width = `${viewport.width}px`;
        page.style.height = `${viewport.height}px`;
        const canvas = window.document.createElement("canvas");
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio); canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        page.append(canvas);
        const textLayer = window.document.createElement("div");
        textLayer.className = "arch-pdf-text-layer";
        textLayer.style.setProperty("--total-scale-factor", String(scale));
        page.append(textLayer); renderHost.append(page);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        const textContent = await pdfPage.getTextContent();
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport });
        await layer.render();
        if (!cancelled) setState("ready");
        pdfPage.cleanup(); pdfDocument.cleanup();
      } catch (renderError) { if (!cancelled) { setState("error"); setError(readableError(renderError, "The PDF page could not be rendered.")); } }
    }
    void render();
    return () => { cancelled = true; destroyLoadingTask?.(); };
  }, [pageNumber, url, width]);
  function selected(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.toString().trim() || !target.contains(selection.anchorNode)) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    onSelection(selection.toString(), { x: rect.left + rect.width / 2, y: rect.top });
  }
  return <div className="arch-pdf-stage" onMouseUp={selected}><div className="arch-pdf-surface" ref={hostRef} />{state === "loading" && <div className="arch-pdf-loading"><LoaderCircle className="spin" size={17} />Rendering original PDF…</div>}{state === "error" && <div className="arch-pdf-loading error"><FileText size={17} />{error}</div>}</div>;
}

function LibraryEditor({ editor, onClose, onSave }: { editor: ResearchLibrary | "new" | null; onClose: () => void; onSave: (input: { name: string; description: string; color: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(LIBRARY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(editor && editor !== "new" ? editor.name : "");
    setDescription(editor && editor !== "new" ? editor.description : "");
    setColor(editor && editor !== "new" ? editor.color : LIBRARY_COLORS[0]);
  }, [editor]);
  if (!editor) return null;
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try { await onSave({ name: name.trim(), description: description.trim(), color }); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workspace-modal" role="dialog" aria-modal="true" aria-label={editor === "new" ? "New library" : "Edit library"} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Knowledge base</span><h2>{editor === "new" ? "New literature library" : "Edit library"}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    <label>Library name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Agentic RAG" /></label>
    <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What belongs in this research direction?" /></label>
    <div className="color-picker" aria-label="Library color">{LIBRARY_COLORS.map((swatch) => <button key={swatch} className={color === swatch ? "color-swatch selected" : "color-swatch"} style={{ background: swatch }} onClick={() => setColor(swatch)} title={swatch}>{color === swatch && <Check size={13} />}</button>)}</div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{editor === "new" ? "Create library" : "Save changes"}</button></div>
  </section></div>;
}

function PaperImportModal({ open, bridge, library, onClose, onImport }: { open: boolean; bridge: ResearchDeskBridge; library: ResearchLibrary; onClose: () => void; onImport: (paper: AcademicSearchResult) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AcademicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  if (!open) return null;
  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const nextResults = await bridge.searchAcademicPapers(query.trim(), 12);
      setResults(nextResults);
      if (!nextResults.length) setError("No matching papers were found. Check the identifier or try a title keyword.");
    } catch (searchError) {
      setError(readableError(searchError, "Paper search failed."));
    } finally {
      setSearching(false);
    }
  }
  async function add(paper: AcademicSearchResult) {
    const key = paper.external_id || paper.title;
    setAdding(key);
    setError("");
    try {
      await onImport(paper);
      setImported((current) => new Set(current).add(key));
    } catch (importError) {
      setError(readableError(importError, "The paper could not be added."));
    } finally {
      setAdding(null);
    }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="workspace-modal paper-import-modal" role="dialog" aria-modal="true" aria-label="Import paper" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Import into {library.name}</span><h2>Find academic papers</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    <p>Search by title, topic, DOI, arXiv URL, or arXiv ID. arXiv links are resolved directly; other queries use Semantic Scholar and OpenAlex.</p>
    <div className="external-search-box"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder="e.g. adaptive retrieval or 2401.18059" /><button className="primary-button" disabled={searching || !query.trim()} onClick={() => void search()}>{searching ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}Search</button></div>
    {error && <div className="library-error" role="alert">{error}</div>}
    <div className="external-results">{results.map((paper) => {
      const key = paper.external_id || paper.title;
      const isImported = imported.has(key);
      const isAdding = adding === key;
      return <article className="external-paper" key={key}><div><strong>{paper.title}</strong><small>{paper.authors.slice(0, 3).join(", ")} · {paper.year ?? "n.d."} · {paper.venue || paper.source}</small></div><button className={isImported ? "secondary-button imported" : "outline-button"} disabled={isImported || Boolean(adding)} onClick={() => void add(paper)}>{isImported ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isImported ? "Added" : isAdding ? "Adding" : "Add"}</button></article>;
    })}</div>
  </section></div>;
}

function readableError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || fallback;
}

function DailyDiscovery({ bridge, libraries, loadingLibraries, onImported }: { bridge: ResearchDeskBridge; libraries: ResearchLibrary[]; loadingLibraries: boolean; onImported: () => Promise<void> }) {
  const [mode, setMode] = useState<DailyDiscoveryMode>("latest");
  const [range, setRange] = useState<DailyDiscoveryRange>("3d");
  const [categories, setCategories] = useState(["cs.AI", "cs.LG", "cs.CL"]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [targetLibraryId, setTargetLibraryId] = useState("");
  const [response, setResponse] = useState<DailyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const feedRequestId = useRef(0);
  const responseRef = useRef<DailyDiscoveryResponse | null>(null);
  useEffect(() => { if (!targetLibraryId && libraries[0]) setTargetLibraryId(libraries[0].id); }, [libraries, targetLibraryId]);
  const targetLibrary = useMemo(() => libraries.find((library) => library.id === targetLibraryId), [libraries, targetLibraryId]);
  const categoryKey = categories.join(",");
  const loadFeed = useCallback(async (forceRefresh = false) => {
    const requestId = ++feedRequestId.current;
    setLoading(true);
    setError("");
    try {
      const nextResponse = await bridge.discoverDailyPapers({ mode, range, categories, query: submittedQuery, limit: 60, forceRefresh });
      if (requestId !== feedRequestId.current) return;
      responseRef.current = nextResponse;
      setResponse(nextResponse);
      if (nextResponse.warning) setError(nextResponse.warning);
    } catch (discoverError) {
      if (requestId !== feedRequestId.current) return;
      const message = readableError(discoverError, "The daily paper feed could not be refreshed.");
      setError(responseRef.current ? `${message} Showing the previous results.` : message);
    } finally {
      if (requestId === feedRequestId.current) setLoading(false);
    }
  }, [bridge, categoryKey, mode, range, submittedQuery]);

  useEffect(() => {
    void loadFeed(false);
    return () => { feedRequestId.current += 1; };
  }, [loadFeed]);

  const visiblePapers = response?.papers ?? [];

  function submitSearch() {
    const nextQuery = query.trim();
    if (nextQuery === submittedQuery) void loadFeed(true);
    else setSubmittedQuery(nextQuery);
  }

  function toggleCategory(category: string) {
    setCategories((current) => current.includes(category)
      ? current.length === 1 ? current : current.filter((item) => item !== category)
      : [...current, category]);
  }

  async function add(paper: DailyPaper) {
    if (!targetLibraryId) return;
    const key = paper.external_id || paper.title;
    setAdding(key);
    setError("");
    try {
      await bridge.addLibraryPaper(targetLibraryId, paper);
      setAdded((current) => new Set(current).add(key));
      await onImported();
    } catch (addError) {
      setError(readableError(addError, "The paper could not be saved."));
    } finally {
      setAdding(null);
    }
  }

  return <section className="library-page daily-page">
    <header className="library-page-header"><div><span className="eyebrow">Live research feed</span><h1>Daily papers</h1><p>Track newly submitted arXiv work and community-trending papers, then save useful records into your library.</p></div><span className="daily-mark"><CalendarDays size={20} /></span></header>
    <div className="daily-feed-toolbar">
      <div className="daily-mode-tabs" role="tablist" aria-label="Paper feed mode">
        <button className={mode === "latest" ? "active" : ""} role="tab" aria-selected={mode === "latest"} onClick={() => setMode("latest")}><Clock3 size={14} />Latest</button>
        <button className={mode === "trending" ? "active" : ""} role="tab" aria-selected={mode === "trending"} onClick={() => setMode("trending")}><Flame size={14} />Trending</button>
      </div>
      <div className="daily-range-control" aria-label="Publication range">{(["1d", "3d", "7d"] as DailyDiscoveryRange[]).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item === "1d" ? "24h" : item === "3d" ? "3 days" : "7 days"}</button>)}</div>
      <button className="secondary-button daily-refresh" disabled={loading} onClick={() => void loadFeed(true)}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Refresh</button>
      <label className="daily-save-target">Save to<select value={targetLibraryId} disabled={loadingLibraries} onChange={(event) => setTargetLibraryId(event.target.value)}>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label>
    </div>
    {mode === "latest" && <div className="daily-category-filter"><span>arXiv fields</span>{["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.RO", "cs.SE"].map((category) => <label key={category} className={categories.includes(category) ? "selected" : ""}><input type="checkbox" checked={categories.includes(category)} onChange={() => toggleCategory(category)} />{category}</label>)}</div>}
    <div className="daily-search-row"><div className="external-search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitSearch()} placeholder="Search recent papers by keyword, title, author, or topic" /><button className="primary-button" disabled={loading} onClick={submitSearch}>{loading ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}Search</button></div><span>{visiblePapers.length} papers{submittedQuery ? ` · “${submittedQuery}”` : ""}{response ? ` · ${response.cached ? "cached" : "live"} · updated ${formatFeedTime(response.fetched_at)}` : ""}</span></div>
    {error && <div className="library-error" role="alert">{error}</div>}
    {loading && !response ? <LoadingState /> : error && !response ? <div className="daily-empty daily-feed-failed"><RefreshCw size={28} /><strong>Could not load the live feed</strong><span>arXiv may be responding slowly. Your library is unaffected.</span><button className="secondary-button" onClick={() => void loadFeed(true)}><RefreshCw size={14} />Retry</button></div> : !visiblePapers.length ? <div className="daily-empty"><CalendarDays size={28} /><strong>No papers found</strong><span>Try a broader keyword, expand the date range, or select more arXiv fields.</span></div> : <div className="daily-paper-list">{visiblePapers.map((paper) => {
      const key = paper.external_id || paper.title;
      const isAdded = added.has(key);
      const isAdding = adding === key;
      return <article className="daily-paper-row" key={key}>
        <div className="daily-paper-date"><strong>{formatPaperDate(paper.published_at)}</strong><span>{paper.source === "hugging-face" ? "HF Daily" : "arXiv"}</span></div>
        <div className="daily-paper-content"><div className="daily-paper-title"><h2>{paper.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer" title="Open paper"><ExternalLink size={13} /></a>}</div><p>{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}</p><small>{paper.abstract || "No abstract available."}</small><div className="daily-paper-signals">{paper.categories.slice(0, 3).map((category) => <span key={category}>{category}</span>)}{paper.upvotes > 0 && <span><Flame size={11} />{paper.upvotes}</span>}{paper.github_url && <a href={paper.github_url} target="_blank" rel="noreferrer"><Code2 size={11} />{paper.github_stars > 0 ? paper.github_stars : "Code"}</a>}</div></div>
        <button className={isAdded ? "secondary-button imported" : "outline-button"} disabled={isAdded || Boolean(adding) || !targetLibrary} onClick={() => void add(paper)}>{isAdded ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isAdded ? "Saved" : isAdding ? "Saving" : "Save"}</button>
      </article>;
    })}</div>}
  </section>;
}

function formatPaperDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFeedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "now" : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function LoadingState() {
  return <div className="library-loading"><LoaderCircle className="spin" size={18} />Loading research records…</div>;
}
