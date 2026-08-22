import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ExternalLink,
  Library,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

const LIBRARY_COLORS = ["#3973c8", "#2d8a68", "#a8652e", "#7a5bb5", "#b34f58"];

type LibraryViewProps = {
  bridge: ResearchDeskBridge;
  mode: "library" | "daily";
};

export default function LibraryView({ bridge, mode }: LibraryViewProps) {
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
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
      <PaperInspector paper={selectedPaper} onUpdate={updatePaper} onRemove={removePaper} />
    </div>
    <LibraryEditor editor={libraryEditor} onClose={() => setLibraryEditor(null)} onSave={saveLibrary} />
    <PaperImportModal open={importOpen} bridge={bridge} library={selectedLibrary} onClose={() => setImportOpen(false)} onImport={importPaper} />
  </section>;
}

function PaperInspector({ paper, onUpdate, onRemove }: { paper: LibraryPaper | null; onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>; onRemove: () => Promise<void> }) {
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(paper?.notes ?? ""), [paper]);
  if (!paper) return <div className="paper-inspector empty"><BookOpen size={24} /><span>Select a paper to inspect its record.</span></div>;
  return <article className="paper-inspector">
    <div className="paper-inspector-kicker"><span>{paper.venue || "Research paper"}</span><span>{paper.year ?? "Year unknown"}</span></div>
    <div className="paper-inspector-title"><h2>{paper.title}</h2><button className={paper.starred ? "icon-button starred" : "icon-button"} onClick={() => void onUpdate({ starred: !paper.starred })} title={paper.starred ? "Unstar" : "Star"}><Star size={17} fill={paper.starred ? "currentColor" : "none"} /></button></div>
    <p className="paper-authors">{paper.authors.join(", ") || "Authors unavailable"}</p>
    <p className="paper-abstract">{paper.abstract || "No abstract was returned by the metadata provider."}</p>
    <div className="paper-record-row"><label>Reading status<select value={paper.reading_status} onChange={(event) => void onUpdate({ reading_status: event.target.value as ReadingStatus })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>{paper.url && <a className="outline-button" href={paper.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open source</a>}</div>
    <label className="paper-notes">My notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Why is this paper useful? What should you verify?" /></label>
    <div className="paper-inspector-actions"><button className="secondary-button danger-text" onClick={() => void onRemove()}><Trash2 size={14} />Remove</button><button className="primary-button" onClick={() => void onUpdate({ notes })}><Save size={14} />Save notes</button></div>
  </article>;
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
  const [query, setQuery] = useState("large language model agents");
  const [targetLibraryId, setTargetLibraryId] = useState("");
  const [papers, setPapers] = useState<AcademicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  useEffect(() => { if (!targetLibraryId && libraries[0]) setTargetLibraryId(libraries[0].id); }, [libraries, targetLibraryId]);
  const targetLibrary = useMemo(() => libraries.find((library) => library.id === targetLibraryId), [libraries, targetLibraryId]);
  async function discover() {
    setLoading(true);
    setError("");
    try { setPapers(await bridge.searchAcademicPapers(query, 16)); } catch (discoverError) { setError(String(discoverError)); } finally { setLoading(false); }
  }
  async function add(paper: AcademicSearchResult) {
    if (!targetLibraryId) return;
    await bridge.addLibraryPaper(targetLibraryId, paper);
    setAdded((current) => new Set(current).add(paper.external_id || paper.title));
    await onImported();
  }
  return <section className="library-page daily-page">
    <header className="library-page-header"><div><span className="eyebrow">Live discovery</span><h1>Daily papers</h1><p>Query current academic indexes, triage results, and save useful work into a curated library.</p></div><span className="daily-mark"><CalendarDays size={20} /></span></header>
    <div className="daily-controls"><div className="external-search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void discover()} /><button className="primary-button" disabled={loading || !query.trim()} onClick={() => void discover()}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Discover</button></div><label>Save to<select value={targetLibraryId} disabled={loadingLibraries} onChange={(event) => setTargetLibraryId(event.target.value)}>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label></div>
    {error && <div className="library-error">{error}</div>}
    {!papers.length && !loading ? <div className="daily-empty"><CalendarDays size={28} /><strong>Run a discovery query</strong><span>Try AI agents, test-time scaling, retrieval, or embodied intelligence.</span></div> : <div className="daily-paper-list">{papers.map((paper) => {
      const key = paper.external_id || paper.title;
      const isAdded = added.has(key);
      return <article className="daily-paper-row" key={key}><div className="daily-paper-date"><strong>{paper.year ?? "—"}</strong><span>{paper.source}</span></div><div><h2>{paper.title}</h2><p>{paper.authors.slice(0, 4).join(", ")}</p><small>{paper.abstract || "No abstract available."}</small></div><button className={isAdded ? "secondary-button imported" : "outline-button"} disabled={isAdded || !targetLibrary} onClick={() => void add(paper)}>{isAdded ? <Check size={14} /> : <Plus size={14} />}{isAdded ? "Saved" : "Save"}</button></article>;
    })}</div>}
  </section>;
}

function LoadingState() {
  return <div className="library-loading"><LoaderCircle className="spin" size={18} />Loading research records…</div>;
}
