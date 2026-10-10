import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ConferenceDiscovery from "./ConferenceDiscovery";
import {
  AlignLeft,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  ExternalLink,
  FileSearch,
  FileText,
  Flame,
  GraduationCap,
  Highlighter,
  Languages,
  Library,
  ListTree,
  LoaderCircle,
  MessageSquareText,
  Minus,
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
const DAILY_TOPICS: Array<{ id: DailyDiscoveryTopic; label: string; description: string }> = [
  { id: "all", label: "All", description: "Recent AI, machine learning, and language-model papers" },
  { id: "ai4ai_rsi", label: "AI4AI/RSI", description: "AI systems improving AI and recursive self-improvement" },
  { id: "gui_compute_use", label: "GUI/Compute Use", description: "Agents operating graphical and computer interfaces" },
  { id: "coding_agents", label: "Coding Agents", description: "Agentic coding and software engineering" },
  { id: "reinforcement_learning", label: "Reinforcement Learning", description: "Learning policies through interaction and feedback" },
  { id: "on_policy_distillation", label: "On-Policy Distillation", description: "Distilling policies from on-policy or online trajectories" },
  { id: "robotics_vla", label: "Robotics/VLA", description: "Robotics and vision-language-action models" },
  { id: "world_models", label: "World Models", description: "Learned environment dynamics and simulation" },
  { id: "reasoning_test_time", label: "Reasoning / Test-Time Scaling", description: "Reasoning and inference-time computation" },
  { id: "interpretability", label: "Interpretability", description: "Understanding and explaining model behavior" },
  { id: "rag", label: "RAG & Long Context", description: "Retrieval, memory, and long-context models" },
  { id: "multimodal", label: "Multimodal", description: "Vision-language and multimodal models" },
  { id: "safety", label: "AI Safety", description: "Alignment, robustness, and red teaming" },
  { id: "science", label: "AI for Science", description: "Scientific discovery and research automation" },
];

function publicPaperRecordUrl(paper: Pick<LibraryPaper, "url" | "conference">) {
  return paper.conference?.presentation_source_url || paper.url;
}

type LibraryViewProps = {
  bridge: ResearchDeskBridge;
  mode: "library" | "daily";
  initialDailyMode?: DailyDiscoveryMode | "conference";
  workspace?: string;
  projectId?: string | null;
  libraryRefreshVersion?: number;
  onLibraryImported?: () => void;
  onAgentRun?: (result: AgentRunResult) => void;
};

export default function LibraryView({ bridge, mode, initialDailyMode, workspace = "", projectId, libraryRefreshVersion = 0, onLibraryImported, onAgentRun }: LibraryViewProps) {
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

  useEffect(() => { void loadLibraries(); }, [libraryRefreshVersion, loadLibraries]);

  useEffect(() => {
    if (!selectedLibraryId) return;
    const timeout = window.setTimeout(() => void loadPapers(selectedLibraryId, localQuery), 160);
    return () => window.clearTimeout(timeout);
  }, [libraryRefreshVersion, loadPapers, localQuery, selectedLibraryId]);

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
    return <DailyDiscovery initialMode={initialDailyMode} bridge={bridge} libraries={libraries} loadingLibraries={loading} onImported={async () => {
      await loadLibraries();
      onLibraryImported?.();
    }} />;
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
    {paper.conference && <div className="conference-saved-metadata"><span>{paper.conference.presentation === "unknown" ? "Unclassified" : paper.conference.presentation === "oral" ? "Oral" : paper.conference.presentation === "spotlight" ? "Spotlight" : "Poster"}</span><a href={paper.conference.presentation_source_url || paper.conference.source_url} target="_blank" rel="noreferrer">Official conference record</a></div>}
    <p className="paper-abstract">{paper.abstract || "No abstract was returned by the metadata provider."}</p>
    <div className="paper-record-row"><label>Reading status<select value={paper.reading_status} onChange={(event) => void onUpdate({ reading_status: event.target.value as ReadingStatus })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>{publicPaperRecordUrl(paper) && <a className="outline-button" href={publicPaperRecordUrl(paper)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open source</a>}</div>
    <button className="paper-reader-launch" onClick={onRead}><BookOpen size={15} /><span><strong>Open reading workspace</strong><small>Notes, evidence, and paper structure</small></span><ChevronRight size={16} /></button>
    <label className="paper-notes">My notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Why is this paper useful? What should you verify?" /></label>
    <div className="paper-inspector-actions"><button className="secondary-button danger-text" onClick={() => void onRemove()}><Trash2 size={14} />Remove</button><button className="primary-button" onClick={() => void onUpdate({ notes })}><Save size={14} />Save notes</button></div>
  </article>;
}

type PaperChatMessage = { role: "assistant" | "user"; text: string };
type SelectionAnchor = { x: number; y: number };
type TranslationPopover = { source: string; translation: string; anchor: SelectionAnchor; error?: string };
const PAPER_BRIEFING_REQUEST = "Create the initial full-paper reading briefing before answering any follow-up question. First call read_attached_paper_pdf repeatedly for the attached paper, in consecutive page ranges of at most 24 pages, until every available PDF page has been read. Do not substitute the abstract for full text. Then write concise Chinese Markdown with exactly these sections:\n\n## 关键词词典\nList 4-8 essential terms, each with a one-line explanation.\n\n## 三行摘要\nWrite exactly three numbered sentences covering the problem, method, and main evidence/result.\n\n## 论文地图\nUse bullets for research question, method, experiments/evaluation, and main findings. Cite PDF page numbers.\n\n## 局限与待核查\nState limitations explicitly reported by the authors and open questions that need closer reading. Cite page numbers where possible.\n\nBe evidence-aware: distinguish what the paper states from your inference.";
const HIGHLIGHT_COLORS: Array<{ value: PaperHighlightInput["color"]; label: string }> = [
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
];

function PaperReadingWorkbench({ paper, library, onBack, onUpdate, bridge, workspace, projectId, onAgentRun }: {
  paper: LibraryPaper; library: ResearchLibrary; onBack: () => void;
  onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>;
  bridge: ResearchDeskBridge; workspace: string; projectId?: string | null; onAgentRun?: (result: AgentRunResult) => void;
}) {
  const [reader, setReader] = useState<PaperReaderState | null>(null);
  const [busy, setBusy] = useState<"remote" | "local" | null>(null);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [passages, setPassages] = useState<PaperPassage[]>([]);
  const [selection, setSelection] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [translationPopover, setTranslationPopover] = useState<TranslationPopover | null>(null);
  const [translating, setTranslating] = useState(false);
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatDraftRef = useRef<HTMLTextAreaElement>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | undefined>();
  const [chatMessages, setChatMessages] = useState<PaperChatMessage[]>([]);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [briefingVersion, setBriefingVersion] = useState(0);
  const briefingStartedRef = useRef(false);
  const ready = reader?.asset?.status === "ready" && reader.pages.length > 0 && Boolean(reader.asset.preview_url);
  const currentPage = reader?.pages.find((page) => page.page_number === pageNumber) ?? reader?.pages[0] ?? null;
  const lastPage = reader?.asset?.page_count ?? reader?.pages.at(-1)?.page_number ?? 1;
  const resizeChatDraft = useCallback((textarea = chatDraftRef.current) => {
    if (!textarea) return;
    const maxHeight = 132;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const loadReader = useCallback(async () => {
    try {
      const next = await bridge.getLibraryPaperReader(paper.id, workspace);
      setReader(next);
      if (next.pages[0]) setPageNumber((current) => Math.min(Math.max(1, current), next.pages.at(-1)?.page_number ?? 1));
    } catch (loadError) { setError(readableError(loadError, "Could not load the paper reader.")); }
  }, [bridge, paper.id, workspace]);
  useEffect(() => { void loadReader(); }, [loadReader]);
  useEffect(() => {
    let active = true;
    briefingStartedRef.current = false;
    setChatHistoryLoaded(false);
    setChatThreadId(undefined);
    setChatMessages([]);
    void bridge.getLibraryPaperChatThread(paper.id, workspace).then((thread) => {
      if (!active) return;
      if (thread) {
        const messages = thread.messages
          .filter((message) => !(message.role === "user" && message.text === PAPER_BRIEFING_REQUEST))
          .map((message) => ({ role: message.role, text: message.text }));
        setChatThreadId(thread.id);
        setChatMessages(messages);
        briefingStartedRef.current = messages.some((message) => message.role === "assistant");
      }
    }).catch((loadError) => {
      if (active) setError(readableError(loadError, "Could not restore the paper conversation."));
    }).finally(() => {
      if (active) setChatHistoryLoaded(true);
    });
    return () => { active = false; };
  }, [bridge, paper.id, workspace]);

  const selectedHighlight = reader?.highlights.find((highlight) => highlight.page_number === pageNumber &&
    (highlight.quote === selection || highlight.quote.includes(selection) || selection.includes(highlight.quote))) ?? null;

  function clearSelection() { setSelection(""); setSelectionAnchor(null); setHighlightPickerOpen(false); setCommentOpen(false); setComment(""); }
  function closeSelection() { clearSelection(); setTranslationPopover(null); }
  function receiveSelection(text: string, anchor: SelectionAnchor) {
    const next = text.replace(/\s+/g, " ").trim();
    if (!next) return;
    setSelection(next.slice(0, 5000));
    setSelectionAnchor(anchor);
    setTranslationPopover(null);
    setHighlightPickerOpen(false);
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
  async function deleteSelectedHighlight() {
    if (!selectedHighlight) return;
    try {
      await bridge.deleteLibraryPaperHighlight(selectedHighlight.id, workspace);
      setReader((current) => current ? { ...current, highlights: current.highlights.filter((highlight) => highlight.id !== selectedHighlight.id) } : current);
      closeSelection();
    } catch (deleteError) { setError(readableError(deleteError, "Could not remove this highlight.")); }
  }
  const paperContext: ContextAttachment[] = [{ id: `paper:${paper.id}`, type: "paper", name: paper.title, detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`, paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url } }];
  async function askAI(question: string, options: { initialBriefing?: boolean } = {}) {
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    if (!workspace) { setError("Choose a workspace before starting a paper conversation."); return; }
    const quotedPassage = options.initialBriefing || !selection ? "" : `\n\nSelected passage from page ${pageNumber}:\n> ${selection}`;
    const instruction = options.initialBriefing
      ? `You are preparing a durable research reading guide for the paper \"${paper.title}\" (${lastPage} PDF pages available). ${prompt}`
      : `You are helping a researcher read the paper \"${paper.title}\". ${prompt}${quotedPassage}\n\nUse the existing full-paper briefing as continuity, but read attached PDF pages again when the answer depends on details absent from it. Ground your answer in the selected passage and the attached paper. State when the passage alone is insufficient, and cite page numbers when available.`;
    setChatOpen(true);
    setChatDraft("");
    if (!options.initialBriefing) setChatMessages((current) => [...current, { role: "user", text: prompt }]);
    setChatBusy(true);
    try {
      const result = await bridge.runAgent({
        prompt: instruction,
        workspace,
        threadId: chatThreadId,
        projectId: projectId || undefined,
        mode: options.initialBriefing ? "deep-research" : "free-chat",
        contextItems: paperContext,
      });
      setChatThreadId(result.threadId);
      setChatMessages((current) => [...current, { role: "assistant", text: result.response }]);
      try { await bridge.setLibraryPaperChatThread(paper.id, result.threadId, workspace); }
      catch (saveError) { setError(readableError(saveError, "The paper conversation completed but could not be saved.")); }
      onAgentRun?.(result);
    } catch (askError) {
      setChatMessages((current) => [...current, { role: "assistant", text: `I could not answer that yet: ${readableError(askError, "Agent request failed.")}` }]);
    } finally { setChatBusy(false); }
  }
  useEffect(() => {
    if (!chatOpen || !ready || !chatHistoryLoaded || chatBusy || briefingStartedRef.current) return;
    briefingStartedRef.current = true;
    void askAI(PAPER_BRIEFING_REQUEST, { initialBriefing: true });
  }, [briefingVersion, chatBusy, chatHistoryLoaded, chatOpen, ready]);
  useEffect(() => { resizeChatDraft(); }, [chatDraft, chatOpen, resizeChatDraft]);
  async function translateSelection() {
    if (!selection || !selectionAnchor || translating) return;
    const source = selection;
    const anchor = selectionAnchor;
    setTranslating(true);
    setError("");
    setTranslationPopover({ source, translation: "", anchor });
    setSelection("");
    setSelectionAnchor(null);
    setHighlightPickerOpen(false);
    setCommentOpen(false);
    try {
      const result = await bridge.translateLibraryPaperSelection(source);
      setTranslationPopover((current) => current?.source === source ? { ...current, translation: result.translation } : current);
    } catch (translateError) {
      const message = readableError(translateError, "Could not translate the selected passage.");
      setTranslationPopover((current) => current?.source === source ? { ...current, error: message } : current);
    } finally { setTranslating(false); }
  }
  function openAskForSelection() { setChatOpen(true); setChatDraft(`请解释论文第 ${pageNumber} 页所选这段话的含义、上下文和可能的局限。`); }
  function restartBriefing() {
    if (chatBusy) return;
    briefingStartedRef.current = false;
    setChatThreadId(undefined);
    setChatMessages([]);
    setBriefingVersion((current) => current + 1);
  }

  return <section className={chatOpen ? "paper-workbench-page paper-chat-open" : "paper-workbench-page"}>
    <header className="paper-workbench-header paper-reader-header">
      <button className="reader-back-button" onClick={onBack}><ChevronLeft size={16} />Library</button>
      <span className="reader-header-divider" />
      <div className="reader-title"><span>{library.name}</span><strong title={paper.title}>{paper.title}</strong></div>
      <div className="reader-header-actions">
        {publicPaperRecordUrl(paper) && <a className="reader-icon-button" href={publicPaperRecordUrl(paper)} target="_blank" rel="noreferrer" title="Open source"><ExternalLink size={16} /></a>}
        <button className="reader-icon-button" title={paper.starred ? "Unstar paper" : "Star paper"} onClick={() => void onUpdate({ starred: !paper.starred })}><Star size={16} fill={paper.starred ? "currentColor" : "none"} /></button>
        <button className={chatOpen ? "reader-ask-button active" : "reader-ask-button"} title="Ask Archimedes" onClick={() => setChatOpen((value) => !value)}>{chatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}<span>Ask AI</span></button>
      </div>
    </header>
    <div className="paper-reader-tabs" role="tablist"><button className="active" role="tab" aria-selected="true"><FileText size={16} />原始论文</button><button role="tab" disabled title="评述工作台即将推出"><BookOpen size={16} />评述 <small>Coming soon</small></button></div>
    <div className="paper-reader-layout">
      <main className="original-paper-reader">
        {ready ? <>
          <div className="paper-reader-toolbar">
            <div className="paper-reader-navigation">
              <div className="paper-page-controls"><button onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1} title="Previous page"><ChevronLeft size={17} /></button><strong>{pageNumber} / {lastPage}</strong><button onClick={() => setPageNumber((value) => Math.min(lastPage, value + 1))} disabled={pageNumber >= lastPage} title="Next page"><ChevronRight size={17} /></button></div>
              <div className="paper-zoom-control" aria-label="PDF zoom">
                <button onClick={() => setPdfZoom((value) => Math.max(.55, Math.round((value - .1) * 100) / 100))} disabled={pdfZoom <= .55} title="Zoom out 10%"><Minus size={16} /></button>
                <button className="paper-zoom-readout" onClick={() => setPdfZoom(1)} title="Reset zoom to 100%"><span>{Math.round(pdfZoom * 100)}%</span><ChevronDown size={14} /></button>
                <button onClick={() => setPdfZoom((value) => Math.min(3.2, Math.round((value + .1) * 100) / 100))} disabled={pdfZoom >= 3.2} title="Zoom in 10%"><Plus size={16} /></button>
              </div>
            </div>
            <div className="paper-search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void find()} placeholder="Find in paper" /><button onClick={() => void find()} disabled={!query.trim()}>Find</button></div>
            <span className="paper-reader-evidence"><Highlighter size={14} />{reader?.highlights.length ?? 0}</span>
          </div>
          {passages.length > 0 && <div className="paper-search-results">{passages.slice(0, 5).map((passage) => <button key={`${passage.page_number}-${passage.start_offset}`} onClick={() => setPageNumber(passage.page_number)}><b>p. {passage.page_number}</b>{passage.excerpt}</button>)}</div>}
          <PdfPaperCanvas url={reader?.asset?.preview_url || ""} pageNumber={pageNumber} highlights={reader?.highlights ?? []} zoom={pdfZoom} onZoomChange={setPdfZoom} onSelection={receiveSelection} onClearSelection={clearSelection} />
        </> : <div className="paper-reader-empty">
          <span className="paper-reader-empty-icon"><FileText size={24} /></span><h2>Open the original paper</h2><p>{paper.pdf_url ? "The public PDF can be cached locally and opened in the reader." : "Attach a local PDF to open the original paper here."}</p>
          <div><button className="primary-button" disabled={Boolean(busy) || !paper.pdf_url} onClick={() => void prepare("remote")}>{busy === "remote" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "remote" ? "Preparing…" : "Prepare PDF"}</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void prepare("local")}>{busy === "local" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}Attach PDF</button></div>
        </div>}
        {(error || reader?.asset?.error) && <div className="reader-runtime-error">{error || reader?.asset?.error}</div>}
      </main>
      {chatOpen && <aside className="paper-ai-panel">
        <header><div><span className="eyebrow">Archimedes</span><h2>论文对话</h2></div><div className="paper-ai-header-actions"><button className="reader-icon-button" onClick={restartBriefing} disabled={chatBusy} title="Read the full paper again"><RefreshCw size={15} /></button><button className="reader-icon-button" onClick={() => setChatOpen(false)} title="Close AI panel"><X size={16} /></button></div></header>
        <div className="paper-ai-thread">{chatMessages.length ? chatMessages.map((message, index) => <article className={message.role} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? <Bot size={14} /> : "You"}</span>{message.role === "assistant" ? <div className="paper-ai-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizePaperMathDelimiters(message.text)}</ReactMarkdown></div> : <p>{message.text}</p>}</article>) : <div className="paper-ai-empty"><Bot size={22} /><strong>Reading the full paper</strong><p>Archimedes is building a page-grounded guide before taking detailed questions.</p></div>}{chatBusy && <div className="paper-ai-working"><LoaderCircle className="spin" size={15} />{chatMessages.length ? "Archimedes is reading…" : "Reading PDF pages and building the guide…"}</div>}{chatMessages.some((message) => message.role === "assistant") && !chatBusy && <div className="paper-ai-suggestions"><button onClick={() => void askAI("这篇论文最核心的贡献是什么？请结合全文说明。")}>核心贡献</button><button onClick={() => void askAI("请细讲方法部分：输入、关键机制、训练或推理流程分别是什么？")}>讲解方法</button><button onClick={() => void askAI("实验设置、数据集、基线、指标和主要结果分别是什么？")}>查看实验</button><button onClick={() => void askAI("论文有哪些局限、威胁或尚未验证的主张？")}>分析局限</button></div>}</div>
        {selection && <div className="paper-ai-context"><span>p. {pageNumber} selection</span><p>{selection}</p><button onClick={closeSelection}><X size={12} /></button></div>}
        <div className="paper-ai-compose"><textarea ref={chatDraftRef} value={chatDraft} onChange={(event) => { setChatDraft(event.target.value); resizeChatDraft(event.currentTarget); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void askAI(chatDraft); } }} placeholder="Ask about the paper…" rows={1} /><button className="primary-button" disabled={chatBusy || !chatDraft.trim()} onClick={() => void askAI(chatDraft)}><Send size={14} />Send</button></div>
      </aside>}
    </div>
    {selection && selectionAnchor && <div className="paper-selection-menu" style={{ left: Math.min(window.innerWidth - 300, Math.max(12, selectionAnchor.x - 112)), top: Math.max(12, selectionAnchor.y - 58) }} onMouseDown={(event) => event.preventDefault()}>
      <button onClick={() => setHighlightPickerOpen((value) => !value)}><Highlighter size={15} />高亮</button><button onClick={translateSelection}><Languages size={15} />翻译</button><button onClick={() => setCommentOpen(true)}><MessageSquareText size={15} />评论</button><button onClick={openAskForSelection}><Bot size={15} />向 AI 提问</button>{selectedHighlight && <button className="remove-highlight-action" onClick={() => void deleteSelectedHighlight()}><Trash2 size={14} />删除高亮</button>}
      {highlightPickerOpen && <div className="paper-highlight-picker" role="menu" aria-label="Highlight color">{HIGHLIGHT_COLORS.map((color) => <button key={color.value} className={`highlight-color ${color.value}`} title={color.label} onClick={() => void saveHighlight("", color.value)}><span /></button>)}</div>}
      {commentOpen && <form className="paper-comment-composer" onSubmit={(event) => { event.preventDefault(); void saveHighlight(comment, "blue"); }}><textarea autoFocus value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment…" rows={3} /><div><button type="button" onClick={closeSelection}>Cancel</button><button type="submit" disabled={!comment.trim()}>Save</button></div></form>}
    </div>}
    {translationPopover && <aside className="paper-translation-popover" style={{ left: Math.min(window.innerWidth - 404, Math.max(12, translationPopover.anchor.x - 150)), top: Math.min(window.innerHeight - 278, Math.max(12, translationPopover.anchor.y + 18)) }} onMouseDown={(event) => event.preventDefault()}>
      <header><span><Languages size={14} />译文</span><button onClick={() => setTranslationPopover(null)} title="Close translation"><X size={14} /></button></header>
      <p className="paper-translation-source">{translationPopover.source}</p>
      <div className={translationPopover.error ? "paper-translation-result error" : "paper-translation-result"}>{translating ? <><LoaderCircle className="spin" size={14} />正在翻译…</> : translationPopover.error || translationPopover.translation}</div>
    </aside>}
  </section>;
}

function PdfPaperCanvas({ url, pageNumber, highlights, zoom, onZoomChange, onSelection, onClearSelection }: { url: string; pageNumber: number; highlights: PaperHighlight[]; zoom: number; onZoomChange: (updater: (current: number) => number) => void; onSelection: (text: string, anchor: SelectionAnchor) => void; onClearSelection: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef(highlights);
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
    highlightsRef.current = highlights;
    const textLayer = hostRef.current?.querySelector<HTMLDivElement>(".arch-pdf-text-layer");
    if (textLayer) applyPdfHighlights(textLayer, highlights.filter((highlight) => highlight.page_number === pageNumber));
  }, [highlights, pageNumber]);
  useEffect(() => {
    let cancelled = false;
    let destroyLoadingTask: (() => void) | undefined;
    const host = hostRef.current;
    if (!host || !url) return;
    const renderHost = host;
    async function render() {
      const hasVisiblePage = Boolean(renderHost.querySelector(".arch-pdf-page"));
      if (!hasVisiblePage) setState("loading");
      setError("");
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
        const fitScale = Math.min(1.65, Math.max(.7, (width - 72) / baseViewport.width));
        const scale = fitScale * zoom;
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
        page.append(textLayer);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        const textContent = await pdfPage.getTextContent();
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport });
        await layer.render();
        applyPdfHighlights(textLayer, highlightsRef.current.filter((highlight) => highlight.page_number === pageNumber));
        if (!cancelled) { renderHost.replaceChildren(page); setState("ready"); }
        pdfPage.cleanup(); pdfDocument.cleanup();
      } catch (renderError) { if (!cancelled) { setState("error"); setError(readableError(renderError, "The PDF page could not be rendered.")); } }
    }
    void render();
    return () => { cancelled = true; destroyLoadingTask?.(); };
  }, [pageNumber, url, width, zoom]);
  function selected(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.toString().trim() || !target.contains(selection.anchorNode)) { onClearSelection(); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    onSelection(selection.toString(), { x: rect.left + rect.width / 2, y: rect.top });
  }
  function zoomWithTrackpad(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    onZoomChange((current) => Math.min(3.2, Math.max(.55, current * (event.deltaY < 0 ? 1.12 : .89))));
  }
  return <div className="arch-pdf-stage" onMouseDown={onClearSelection} onMouseUp={selected} onWheel={zoomWithTrackpad}><div className="arch-pdf-surface" ref={hostRef} />{state === "loading" && <div className="arch-pdf-loading"><LoaderCircle className="spin" size={17} />Rendering original PDF…</div>}{state === "error" && <div className="arch-pdf-loading error"><FileText size={17} />{error}</div>}<span className="arch-pdf-zoom-readout">{Math.round(zoom * 100)}%</span></div>;
}

function applyPdfHighlights(textLayer: HTMLDivElement, highlights: PaperHighlight[]) {
  const spans = Array.from(textLayer.querySelectorAll("span"));
  for (const span of spans) span.classList.remove("arch-pdf-highlight", "arch-pdf-highlight-yellow", "arch-pdf-highlight-red", "arch-pdf-highlight-blue", "arch-pdf-highlight-green", "arch-pdf-highlight-pink");
  if (!highlights.length) return;
  const compact = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase();
  const spanRanges: Array<{ element: HTMLSpanElement; start: number; end: number }> = [];
  let cursor = 0;
  for (const element of spans) {
    const length = compact(element.textContent || "").length;
    spanRanges.push({ element, start: cursor, end: cursor + length });
    cursor += length;
  }
  const source = compact(spans.map((span) => span.textContent || "").join(""));
  const painted = new Set<HTMLSpanElement>();
  for (const highlight of highlights) {
    const quote = compact(highlight.quote);
    if (!quote) continue;
    const start = source.indexOf(quote);
    if (start < 0) continue;
    const end = start + quote.length;
    for (const range of spanRanges) if (range.start < end && range.end > start && !painted.has(range.element)) {
      range.element.classList.add("arch-pdf-highlight", `arch-pdf-highlight-${highlight.color}`);
      painted.add(range.element);
    }
  }
}

function normalizePaperMathDelimiters(content: string) {
  let activeFence = "";
  let displayMathOpen = false;
  const normalizedLines: string[] = [];
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] || "";
    if (fence) {
      if (!activeFence) activeFence = fence[0];
      else if (fence[0] === activeFence) activeFence = "";
      normalizedLines.push(line);
      continue;
    }
    if (activeFence) {
      normalizedLines.push(line);
      continue;
    }
    const normalized = normalizePaperMathLine(line);
    if (normalized.trim() === "$$") {
      displayMathOpen = !displayMathOpen;
      normalizedLines.push(normalized);
      continue;
    }
    const standaloneDisplay = /^\s*\$\$([\s\S]*?)\$\$\s*$/.exec(normalized);
    if (standaloneDisplay) {
      normalizedLines.push("$$", standaloneDisplay[1].trim(), "$$");
      continue;
    }
    // Providers sometimes emit a bare equation or leave one display delimiter unmatched.
    if (!displayMathOpen && !normalized.includes("$") && looksLikePaperEquation(normalized)) {
      const equation = normalized.trim().replace(/^\$+|\$+$/g, "").replace(/(^|[^\\])\$/g, "$1").trim();
      normalizedLines.push("$$", equation, "$$");
      continue;
    }
    normalizedLines.push(normalized);
  }
  return normalizedLines.join("\n");
}

function looksLikePaperEquation(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^(#{1,6}|[-*+]\s|\d+\.\s|>|<)/.test(trimmed)) return false;
  const equation = trimmed.replace(/^\$+|\$+$/g, "");
  return equation.includes("=")
    && /(?:\\[a-zA-Z]+|[_^][{(]|[A-Za-z]\s*[_^])/.test(equation)
    && !/[。；;]$/.test(equation);
}

function normalizePaperMathLine(line: string) {
  let result = "";
  let index = 0;
  while (index < line.length) {
    if (line[index] === "`") {
      const tickCount = /^`+/.exec(line.slice(index))?.[0].length || 1;
      const closingIndex = line.indexOf("`".repeat(tickCount), index + tickCount);
      if (closingIndex < 0) return result + line.slice(index);
      result += line.slice(index, closingIndex + tickCount);
      index = closingIndex + tickCount;
      continue;
    }
    const delimiter = line.slice(index, index + 2);
    if (delimiter === "\\[" || delimiter === "\\]") { result += "$$"; index += 2; continue; }
    if (delimiter === "\\(" || delimiter === "\\)") { result += "$"; index += 2; continue; }
    result += line[index];
    index += 1;
  }
  return result;
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

function DailyDiscovery({ initialMode = "latest", bridge, libraries, loadingLibraries, onImported }: { initialMode?: DailyDiscoveryMode | "conference"; bridge: ResearchDeskBridge; libraries: ResearchLibrary[]; loadingLibraries: boolean; onImported: () => Promise<void> }) {
  const [mode, setMode] = useState<DailyDiscoveryMode | "conference">(initialMode);
  const [range, setRange] = useState<DailyDiscoveryRange>("7d");
  const [topic, setTopic] = useState<DailyDiscoveryTopic>("all");
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
  const loadFeed = useCallback(async (forceRefresh = false) => {
    if (mode === "conference") return;
    const requestId = ++feedRequestId.current;
    setLoading(true);
    setError("");
    try {
      const nextResponse = await bridge.discoverDailyPapers({ mode, range, topic, query: submittedQuery, limit: 60, forceRefresh });
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
  }, [bridge, mode, range, submittedQuery, topic]);

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
    <div className="daily-feed-toolbar daily-conference-toolbar">
      <div className="daily-live-controls">
      <div className="daily-mode-tabs" role="tablist" aria-label="Paper feed mode">
        <button className={mode === "latest" ? "active" : ""} role="tab" aria-selected={mode === "latest"} onClick={() => setMode("latest")}><Clock3 size={14} />Latest</button>
        <button className={mode === "trending" ? "active" : ""} role="tab" aria-selected={mode === "trending"} onClick={() => setMode("trending")}><Flame size={14} />Trending</button>
      </div>
      <div className="daily-range-control" aria-label="Publication range">{(["7d", "30d", "90d"] as DailyDiscoveryRange[]).map((item) => <button key={item} disabled={mode === "conference"} className={range === item && mode !== "conference" ? "active" : ""} onClick={() => setRange(item)}>{item === "7d" ? "7 days" : item === "30d" ? "30 days" : "90 days"}</button>)}</div>
      </div>
      <button className={mode === "conference" ? "secondary-button conference-mode-button active" : "secondary-button conference-mode-button"} aria-pressed={mode === "conference"} onClick={() => setMode("conference")}><GraduationCap size={16} />Top conference search</button>
      {mode !== "conference" && <button className="secondary-button daily-refresh" disabled={loading} onClick={() => void loadFeed(true)}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Refresh</button>}
      <label className="daily-save-target">Save to<select value={targetLibraryId} disabled={loadingLibraries} onChange={(event) => setTargetLibraryId(event.target.value)}>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label>
    </div>
    <div className="daily-topic-filter" role="tablist" aria-label="AI research topic">{DAILY_TOPICS.map((item) => <button key={item.id} role="tab" aria-selected={topic === item.id} className={topic === item.id ? "active" : ""} title={item.description} onClick={() => setTopic(item.id)}>{item.label}</button>)}</div>
    {mode === "conference" ? <ConferenceDiscovery bridge={bridge} targetLibraryId={targetLibraryId} topic={topic} onImported={onImported} /> : <>
    <div className="daily-search-row"><div className="external-search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitSearch()} placeholder="Search recent papers by keyword, title, author, or topic" /><button className="primary-button" disabled={loading} onClick={submitSearch}>{loading ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}Search</button></div><span>{visiblePapers.length} papers{submittedQuery ? ` · “${submittedQuery}”` : ""}{response ? ` · ${response.cached ? "cached" : "live"} · updated ${formatFeedTime(response.fetched_at)}` : ""}</span></div>
    {error && <div className="library-error" role="alert">{error}</div>}
    {loading && !response ? <LoadingState /> : error && !response ? <div className="daily-empty daily-feed-failed"><RefreshCw size={28} /><strong>Could not load the live feed</strong><span>arXiv may be responding slowly. Your library is unaffected.</span><button className="secondary-button" onClick={() => void loadFeed(true)}><RefreshCw size={14} />Retry</button></div> : !visiblePapers.length ? <div className="daily-empty"><CalendarDays size={28} /><strong>No papers found</strong><span>Try another topic, expand the date range, or use a broader keyword.</span></div> : <div className="daily-paper-list">{visiblePapers.map((paper) => {
      const key = paper.external_id || paper.title;
      const isAdded = added.has(key);
      const isAdding = adding === key;
      return <article className="daily-paper-row" key={key}>
        <div className="daily-paper-date"><strong>{formatPaperDate(paper.published_at)}</strong><span>{paper.source === "hugging-face" ? "HF Daily" : "arXiv"}</span></div>
        <div className="daily-paper-content"><div className="daily-paper-title"><h2>{paper.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer" title="Open paper"><ExternalLink size={13} /></a>}</div><p>{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}</p><small>{paper.abstract || "No abstract available."}</small><div className="daily-paper-signals">{paper.categories.slice(0, 3).map((category) => <span key={category}>{category}</span>)}{paper.upvotes > 0 && <span><Flame size={11} />{paper.upvotes}</span>}{paper.github_url && <a href={paper.github_url} target="_blank" rel="noreferrer"><Code2 size={11} />{paper.github_stars > 0 ? paper.github_stars : "Code"}</a>}</div></div>
        <button className={isAdded ? "secondary-button imported" : "outline-button"} disabled={isAdded || Boolean(adding) || !targetLibrary} onClick={() => void add(paper)}>{isAdded ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isAdded ? "Saved" : isAdding ? "Saving" : "Save"}</button>
      </article>;
    })}</div>}
    </>}
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
