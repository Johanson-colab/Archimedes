import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, Cloud, FilePenLine, FileText, Folder, FolderOpen, FolderPlus, Library, ListFilter, LoaderCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { useConfirm } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { MenuItem, MenuSurface } from "./Menu";
import { StateView } from "./StateView";
import { LibraryPaperNotes, type LibraryNoteDrafts } from "./LibraryPaperNotes";
import { createLibraryRequestQueue, libraryDocumentKey, matchLibraryPaper, sortLibraryPapers, uniqueLibraryPapers, type LibraryDocument, type PaperReaderSession } from "./library-workspace-state";
import "./library-workspace.css";

type PaperPatch = Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1];
type LibraryInput = { name: string; description: string; color: string };
type ReaderProps = {
  paper: LibraryPaper; library: ResearchLibrary; onBack: () => void;
  onUpdate: (patch: PaperPatch) => Promise<void>;
  session?: PaperReaderSession;
  onSessionSave: (session: PaperReaderSession) => void;
  onActivityChange: (busy: boolean) => void;
  noteDrafts: LibraryNoteDrafts;
};
type Props = {
  bridge: ResearchDeskBridge;
  projectId?: string | null;
  active: boolean;
  refreshVersion: number;
  onLibraryImported?: () => void;
  onOpenProject?: (id: string) => void;
  renderReader: (props: ReaderProps) => ReactNode;
  renderInspector: (props: { noteDrafts: LibraryNoteDrafts; paper: LibraryPaper; onUpdate: (patch: PaperPatch) => Promise<void>; onRemove: () => Promise<void>; onRead: () => void }) => ReactNode;
  renderEditor: (props: { editor: ResearchLibrary | "new" | null; onClose: () => void; onSave: (input: LibraryInput) => Promise<void> }) => ReactNode;
  renderImport: (props: { library: ResearchLibrary; open: boolean; onClose: () => void; onImport: (paper: AcademicSearchResult) => Promise<void> }) => ReactNode;
};

export default function LibraryWorkspace({ bridge, projectId, active, refreshVersion, onLibraryImported, onOpenProject, renderReader, renderInspector, renderEditor, renderImport }: Props) {
  const { t } = useUISettings();
  const confirm = useConfirm();
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [catalog, setCatalog] = useState<Record<string, LibraryPaper[]>>({});
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [papersExpanded, setPapersExpanded] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [scope, setScope] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("added");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [readerBusy, setReaderBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [otherProjects, setOtherProjects] = useState<LibraryProjectSummary[]>([]);
  const [editor, setEditor] = useState<ResearchLibrary | "new" | null>(null);
  const [importLibraryId, setImportLibraryId] = useState<string | null>(null);
  const [importPicker, setImportPicker] = useState(false);
  const [importChoice, setImportChoice] = useState("");
  const [menuLibrary, setMenuLibrary] = useState<ResearchLibrary | null>(null);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const mounted = useRef(false);
  const catalogRef = useRef(catalog);
  const requests = useRef(new Map<string, { promise: Promise<LibraryPaper[]>; version: number }>());
  const versions = useRef(new Map<string, number>());
  const libraryRequest = useRef(0);
  const requestQueue = useRef(createLibraryRequestQueue());
  const sessions = useRef(new Map<string, PaperReaderSession>());
  const drafts = useRef<LibraryNoteDrafts>(new Map());
  const projectPaperCount = libraries.reduce((sum, library) => sum + library.paper_count, 0);
  catalogRef.current = catalog;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestQueue.current.clearPending(); }; }, []);

  useEffect(() => {
    const openPapers = new Set(documents.map((document) => document.paperId));
    for (const paperId of sessions.current.keys()) {
      if (!openPapers.has(paperId)) sessions.current.delete(paperId);
    }
  }, [documents]);

  const loadPapers = useCallback((id: string, force = false): Promise<LibraryPaper[]> => {
    if (!force && catalogRef.current[id]) return Promise.resolve(catalogRef.current[id]);
    const pending = requests.current.get(id);
    if (!force && pending) return pending.promise;
    const version = (versions.current.get(id) || 0) + 1;
    versions.current.set(id, version);
    setLoadingIds((current) => new Set(current).add(id));
    const promise = requestQueue.current.run(() => versions.current.get(id) === version ? bridge.listLibraryPapers(id) : Promise.resolve([])).then((papers) => {
      if (mounted.current && versions.current.get(id) === version) {
        catalogRef.current = { ...catalogRef.current, [id]: papers };
        setCatalog(catalogRef.current);
      }
      return papers;
    }).catch((cause: unknown) => {
      if (mounted.current && versions.current.get(id) === version) setError(cause instanceof Error ? cause.message : String(cause));
      return [];
    }).finally(() => {
      if (requests.current.get(id)?.version !== version) return;
      requests.current.delete(id);
      if (mounted.current) setLoadingIds((current) => { const next = new Set(current); next.delete(id); return next; });
    });
    requests.current.set(id, { promise, version });
    return promise;
  }, [bridge]);

  const loadLibraries = useCallback(async () => {
    const request = ++libraryRequest.current;
    setLoadingLibraries(true);
    try {
      const next = await bridge.listLibraries(projectId ?? undefined);
      if (!mounted.current || libraryRequest.current !== request) return;
      setLibraries(next);
      setError("");
      if (!Object.keys(catalogRef.current).length && next[0]) {
        setExpanded((current) => new Set(current).add(next[0].id));
        void loadPapers(next[0].id);
      }
    } catch (cause) {
      if (mounted.current && libraryRequest.current === request) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current && libraryRequest.current === request) setLoadingLibraries(false);
    }
  }, [bridge, loadPapers, projectId]);

  useEffect(() => {
    void loadLibraries();
    // A Daily Papers import can change the contents of an already-open folder.
    for (const id of Object.keys(catalogRef.current)) void loadPapers(id, true);
  }, [loadLibraries, loadPapers, refreshVersion]);

  useEffect(() => {
    if (loadingLibraries || projectPaperCount || !bridge.listLibraryProjects) { setOtherProjects([]); return; }
    let cancelled = false;
    void bridge.listLibraryProjects().then((projects) => {
      if (!cancelled) setOtherProjects(projects.filter((project) => project.project_id !== projectId && project.paper_count > 0));
    }).catch(() => { if (!cancelled) setOtherProjects([]); });
    return () => { cancelled = true; };
  }, [bridge, loadingLibraries, projectId, projectPaperCount]);

  // Load unopened folders only for an explicit project-wide view/search, with
  // two requests in flight at most. Collapsed trees do not hydrate every PDF.
  useEffect(() => {
    if (scope !== "all" && !query.trim() && !notesExpanded) return;
    let cancelled = false;
    const pending = libraries.filter((library) => !catalogRef.current[library.id]);
    let index = 0;
    async function worker() {
      while (!cancelled && index < pending.length) await loadPapers(pending[index++].id);
    }
    void Promise.all([worker(), worker()]);
    return () => { cancelled = true; };
  }, [libraries, loadPapers, notesExpanded, query, scope]);

  const allPapers = useMemo(() => uniqueLibraryPapers(catalog, libraries.map((library) => library.id)), [catalog, libraries]);
  const library = libraries.find((candidate) => candidate.id === scope) ?? null;
  const currentDocument = documents.find((document) => libraryDocumentKey(document) === activeDocument);
  const documentLibrary = libraries.find((candidate) => candidate.id === currentDocument?.libraryId);
  const documentPaper = currentDocument ? catalog[currentDocument.libraryId]?.find((paper) => paper.id === currentDocument.paperId) : null;
  const visiblePapers = useMemo(() => sortLibraryPapers((scope && scope !== "all" ? catalog[scope] || [] : allPapers).filter((paper) => matchLibraryPaper(paper, query) && (filter === "all" || (filter === "starred" ? paper.starred : paper.reading_status === filter))), sort), [allPapers, catalog, filter, query, scope, sort]);
  const selectedPaper = visiblePapers.find((paper) => paper.id === selectedPaperId) ?? visiblePapers[0];
  const importLibrary = libraries.find((candidate) => candidate.id === importLibraryId);
  const busy = scope && scope !== "all" ? loadingIds.has(scope) : loadingIds.size > 0;

  function canNavigate() {
    if (!readerBusy) return true;
    setNotice(t("Stop the running paper conversation before switching documents."));
    return false;
  }
  function browse(id: string | null) {
    if (!canNavigate()) return;
    setActiveDocument(null);
    setScope(id);
    setSelectedPaperId(null);
    setQuery("");
    setFilter("all");
    if (id && id !== "all") { setExpanded((current) => new Set(current).add(id)); void loadPapers(id); }
  }
  function openPaper(paper: LibraryPaper, libraryId: string, kind: LibraryDocument["kind"] = "paper") {
    if (!canNavigate()) return;
    const document = { paperId: paper.id, libraryId, kind };
    const key = libraryDocumentKey(document);
    if (!documents.some((candidate) => libraryDocumentKey(candidate) === key)) {
      setDocuments((current) => [...current, document]);
    }
    setActiveDocument(key);
    setSelectedPaperId(paper.id);
    setScope(libraryId);
    setExpanded((current) => new Set(current).add(libraryId));
  }
  function paperLibraryId(paper: LibraryPaper) {
    return library?.id || libraries.find((candidate) => catalog[candidate.id]?.some((item) => item.id === paper.id))?.id || "";
  }
  function closeDocument(document: LibraryDocument) {
    const key = libraryDocumentKey(document);
    if (activeDocument === key && !canNavigate()) return;
    const remaining = documents.filter((candidate) => libraryDocumentKey(candidate) !== key);
    setDocuments(remaining);
    if (activeDocument === key) setActiveDocument(remaining.length ? libraryDocumentKey(remaining.at(-1)!) : null);
  }
  const updatePaper = useCallback(async (paperId: string, patch: PaperPatch) => {
    const updated = await bridge.updateLibraryPaper(paperId, patch);
    if (!mounted.current) return;
    const next = { ...catalogRef.current };
    for (const [id, papers] of Object.entries(next)) {
      if (!papers.some((paper) => paper.id === paperId)) continue;
      versions.current.set(id, (versions.current.get(id) || 0) + 1);
      next[id] = papers.map((paper) => paper.id === paperId ? updated : paper);
    }
    catalogRef.current = next;
    setCatalog(next);
  }, [bridge]);
  async function removePaper(paper: LibraryPaper) {
    const libraryId = paperLibraryId(paper);
    if (!libraryId || !(await confirm({ title: t("Remove paper?"), description: t("This paper will be removed from the selected library."), confirmLabel: t("Remove"), destructive: true }))) return;
    try {
      await bridge.removeLibraryPaper(libraryId, paper.id);
      setDocuments((current) => current.filter((document) => document.paperId !== paper.id || document.libraryId !== libraryId));
      setActiveDocument(null);
      await Promise.all([loadPapers(libraryId, true), loadLibraries()]);
    } catch (cause) { setError(String(cause)); }
  }
  async function deleteLibrary(target: ResearchLibrary) {
    if (!canNavigate() || !(await confirm({ title: t("Delete library?"), description: t("Papers shared with other libraries are kept."), confirmLabel: t("Delete library"), destructive: true }))) return;
    try {
      await bridge.deleteLibrary(target.id);
      versions.current.set(target.id, (versions.current.get(target.id) || 0) + 1);
      const next = { ...catalogRef.current }; delete next[target.id]; catalogRef.current = next; setCatalog(next);
      setDocuments((current) => current.filter((document) => document.libraryId !== target.id));
      if (documentLibrary?.id === target.id) setActiveDocument(null);
      if (scope === target.id) setScope(null);
      await loadLibraries();
    } catch (cause) { setError(String(cause)); }
  }
  async function saveLibrary(input: LibraryInput) {
    if (editor === "new") {
      const created = await bridge.createLibrary({ ...input, projectId: projectId ?? null });
      setScope(created.id);
      setExpanded((current) => new Set(current).add(created.id));
      void loadPapers(created.id);
    } else if (editor) await bridge.updateLibrary(editor.id, input);
    setEditor(null);
    await loadLibraries();
  }
  function beginImport() {
    if (!libraries.length) { setEditor("new"); return; }
    if (library) setImportLibraryId(library.id);
    else { setImportChoice(libraries[0].id); setImportPicker(true); }
  }
  async function importPaper(paper: AcademicSearchResult) {
    if (!importLibrary) return;
    await bridge.addLibraryPaper(importLibrary.id, paper);
    await Promise.all([loadPapers(importLibrary.id, true), loadLibraries()]);
    onLibraryImported?.();
  }
  async function syncLibraries() {
    if (!projectId || cloudBusy || !bridge.syncProjectLibraries) return;
    setCloudBusy(true); setNotice(""); setError("");
    try {
      const result = await bridge.syncProjectLibraries(projectId);
      const warnings = [...(result.warnings || [])];
      if (bridge.syncProjectAnnotations) warnings.push(...((await bridge.syncProjectAnnotations(projectId)).warnings || []));
      if (!mounted.current) return;
      setLibraries(result.libraries);
      for (const id of Object.keys(catalogRef.current)) await loadPapers(id, true);
      setNotice(warnings.length ? warnings.join(" ") : t("Libraries, papers, and annotations are in sync."));
      onLibraryImported?.();
    } catch (cause) { if (mounted.current) setError(String(cause)); }
    finally { if (mounted.current) setCloudBusy(false); }
  }

  return <section className={`library-workspace${navigationOpen ? "" : " navigation-closed"}`} aria-label={t("Library workspace")}>
    <aside className="library-workspace-tree" aria-label={t("Library folders")}>
      <header><strong>{t("Library")}</strong><div><button className="icon-button" onClick={() => setEditor("new")} title={t("New folder")} aria-label={t("New folder")}><FolderPlus size={16} /></button><button className="icon-button" onClick={() => setNavigationOpen(false)} title={t("Hide library folders")} aria-label={t("Hide library folders")}><PanelLeftClose size={15} /></button></div></header>
      <label className="library-tree-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search library")} placeholder={t("Search library…")} /></label>
      <div className="library-tree-scroll">
        <button className={`library-tree-row${!activeDocument && scope === null ? " active" : ""}`} onClick={() => browse(null)}><Library size={16} /><span>{t("Library overview")}</span></button>
        <button className={`library-tree-row${!activeDocument && scope === "all" ? " active" : ""}`} onClick={() => browse("all")}><BookOpen size={16} /><span>{t("All papers")}</span><small>{projectPaperCount}</small></button>
        <div className="library-tree-section"><span>{t("Project libraries")}</span></div>
        <button className="library-tree-row" onClick={() => setPapersExpanded((open) => !open)} aria-expanded={papersExpanded}><span className="library-tree-chevron">{papersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>{papersExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}<span>{t("Papers")}</span></button>
        {papersExpanded && libraries.map((folder) => {
          const children = (catalog[folder.id] || []).filter((paper) => matchLibraryPaper(paper, query));
          if (query.trim() && !children.length && !folder.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && !loadingIds.has(folder.id)) return null;
          const isExpanded = expanded.has(folder.id) || Boolean(query.trim());
          return <div className="library-tree-folder" key={folder.id}>
            <div className="library-folder-row">
              <button className="library-tree-disclosure" aria-label={t(isExpanded ? "Collapse {name}" : "Expand {name}", { name: folder.name })} aria-expanded={isExpanded} onClick={() => { setExpanded((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; }); if (!isExpanded) void loadPapers(folder.id); }}>{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
              <button className={`library-tree-row${scope === folder.id && !activeDocument ? " active" : ""}`} onClick={() => browse(folder.id)} title={folder.name}>{isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}<span>{folder.name}</span><small>{folder.paper_count}</small></button>
              <button className="library-tree-menu icon-button" aria-label={t("Folder actions for {name}", { name: folder.name })} aria-haspopup="menu" aria-expanded={menuLibrary?.id === folder.id} onClick={(event) => { menuRef.current = event.currentTarget; setMenuLibrary(folder); }}><MoreHorizontal size={14} /></button>
            </div>
            {isExpanded && <div className="library-tree-papers">{loadingIds.has(folder.id) && !catalog[folder.id] ? <span className="library-tree-hint"><LoaderCircle className="spin" size={13} />{t("Loading…")}</span> : children.length ? children.map((paper) => <button className={`library-tree-row library-tree-paper${documentPaper?.id === paper.id && currentDocument?.libraryId === folder.id ? " active" : ""}`} key={paper.id} onClick={() => openPaper(paper, folder.id)} title={paper.title}><FileText size={14} /><span>{paper.title}</span>{paper.starred && <Star size={11} className="library-tree-star" fill="currentColor" />}</button>) : <span className="library-tree-hint">{t(query ? "No matching papers" : "No papers yet")}</span>}</div>}
          </div>;
        })}
        <button className="library-tree-row" onClick={() => setNotesExpanded((open) => !open)} aria-expanded={notesExpanded}><span className="library-tree-chevron">{notesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>{notesExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}<span>{t("Notes")}</span></button>
        {notesExpanded && <div className="library-tree-papers">{allPapers.filter((paper) => paper.notes.trim() && matchLibraryPaper(paper, query)).map((paper) => <button className={`library-tree-row library-tree-paper${currentDocument?.kind === "notes" && documentPaper?.id === paper.id ? " active" : ""}`} key={paper.id} title={paper.title} onClick={() => openPaper(paper, paperLibraryId(paper), "notes")}><FilePenLine size={14} /><span>{paper.title}</span></button>)}<span className="library-tree-hint">{t("Notes are linked to their papers.")}</span></div>}
      </div>
      <footer><Folder size={13} /><span>{t("Project libraries")}</span><span>{libraries.length}</span></footer>
    </aside>
    <div className="library-workspace-content">
      <div className="library-workspace-tabs">
        {!navigationOpen && <button className="icon-button library-show-folders" onClick={() => setNavigationOpen(true)} aria-label={t("Show library folders")} title={t("Show library folders")}><PanelLeftOpen size={16} /></button>}
        <button aria-pressed={!activeDocument} className={`library-document-tab${!activeDocument ? " active" : ""}`} onClick={() => { if (canNavigate()) setActiveDocument(null); }}><Library size={14} /><span>{t("Library")}</span></button>
        <div className="library-document-tabs" role="tablist" aria-label={t("Open documents")}>{documents.map((document) => {
          const key = libraryDocumentKey(document);
          const paper = catalog[document.libraryId]?.find((paper) => paper.id === document.paperId);
          if (!paper) return null;
          return <div className={`library-document-tab${activeDocument === key ? " active" : ""}`} key={key}><button role="tab" aria-selected={activeDocument === key} onClick={() => { if (canNavigate()) setActiveDocument(key); }} title={paper.title}>{document.kind === "notes" ? <FilePenLine size={14} /> : <FileText size={14} />}<span>{document.kind === "notes" ? `${t("Notes")} · ` : ""}{paper.title}</span></button><button className="library-document-close" aria-label={t("Close {name}", { name: paper.title })} onClick={() => closeDocument(document)}><X size={13} /></button></div>;
        })}</div>
        <div className="library-workspace-actions"><button className="icon-button" disabled={!projectId || cloudBusy} onClick={() => void syncLibraries()} title={t("Sync cloud")} aria-label={t("Sync cloud")}>{cloudBusy ? <LoaderCircle className="spin" size={15} /> : <Cloud size={15} />}</button><button className="primary-button" onClick={beginImport}><Plus size={14} />{t("Import paper")}</button></div>
      </div>
      {(error || notice) && <div className="library-workspace-notices"><InlineNotice tone={error ? "danger" : "info"}>{error || notice}</InlineNotice><button className="icon-button" aria-label={t("Dismiss notice")} onClick={() => { setError(""); setNotice(""); }}><X size={14} /></button></div>}
      {currentDocument && documentPaper && documentLibrary ? <div className="library-document-content" key={libraryDocumentKey(currentDocument)}>
        {currentDocument.kind === "notes" ? <LibraryPaperNotes key={documentPaper.id} paper={documentPaper} drafts={drafts.current} onSave={(notes) => updatePaper(documentPaper.id, { notes })} /> : renderReader({ paper: documentPaper, library: documentLibrary, onBack: () => browse(documentLibrary.id), onUpdate: (patch) => updatePaper(documentPaper.id, patch), session: sessions.current.get(documentPaper.id), onSessionSave: (session) => { sessions.current.set(documentPaper.id, session); }, onActivityChange: setReaderBusy, noteDrafts: drafts.current })}
      </div> : <div className="library-browser">
        <header className="library-browser-header"><div><h1>{library?.name || t(scope === "all" ? "All papers" : "Library")}</h1><p>{library?.description || t("Your papers and reading notes, organised by research topic.")}</p></div>{!scope && <button className="secondary-button" onClick={() => setEditor("new")}><FolderPlus size={15} />{t("New folder")}</button>}{library && <button className="icon-button" ref={menuRef} onClick={() => setMenuLibrary(library)} aria-label={t("Folder actions for {name}", { name: library.name })}><MoreHorizontal size={17} /></button>}</header>
        {!scope && !query.trim() ? <div className="library-overview">
          {otherProjects.length > 0 && <div className="library-project-hint"><div><strong>{t("This project has no papers yet")}</strong><span>{t("Libraries are stored per project.")}</span></div><div className="library-project-hint-actions">{otherProjects.map((project) => <button className="secondary-button" key={project.project_id} onClick={() => onOpenProject?.(project.project_id)}>{project.name} · {project.paper_count} {t("papers")}</button>)}</div></div>}
          {loadingLibraries && !libraries.length ? <StateView icon={<LoaderCircle className="spin" size={22} />} title={t("Loading…")} /> : libraries.length ? <div className="library-folder-grid">{libraries.map((folder) => <button className="library-folder-card" key={folder.id} onClick={() => browse(folder.id)}><FolderOpen size={27} strokeWidth={1.3} /><strong>{folder.name}</strong><p>{folder.description}</p><span>{folder.paper_count} {t("papers")}<ChevronRight size={14} /></span></button>)}</div> : <StateView icon={<Folder size={25} />} title={t("No libraries in this project")} description={t("Create a folder to start collecting papers.")} action={<button className="primary-button" onClick={() => setEditor("new")}><Plus size={15} />{t("New folder")}</button>} />}
          {allPapers.some((paper) => paper.reading_status === "reading") && <section className="library-continue-reading"><h2>{t("Continue reading")}</h2>{allPapers.filter((paper) => paper.reading_status === "reading").slice(0, 5).map((paper) => <button key={paper.id} onClick={() => openPaper(paper, paperLibraryId(paper))}><FileText size={16} /><span>{paper.title}<small>{paper.authors.slice(0, 2).join(", ")}</small></span><ChevronRight size={14} /></button>)}</section>}
        </div> : <>
          <div className="library-browser-toolbar"><label className="library-browser-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search library")} placeholder={t("Search title, author, abstract, or venue")} /></label><label className="library-sort"><select aria-label={t("Sort papers")} value={sort} onChange={(event) => setSort(event.target.value)}><option value="added">{t("Recently added")}</option><option value="year">{t("Newest publication")}</option><option value="title">{t("Title A–Z")}</option></select></label><button className="icon-button" aria-label={t(inspectorOpen ? "Hide paper details" : "Show paper details")} title={t(inspectorOpen ? "Hide paper details" : "Show paper details")} onClick={() => setInspectorOpen((open) => !open)}><ListFilter size={16} /></button><div className="library-browser-filters">{[["all", "All"], ["unread", "Unread"], ["reading", "Reading"], ["starred", "Starred"]].map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}</div><span className="library-result-count" role="status">{busy && <LoaderCircle className="spin" size={12} />}{visiblePapers.length} {t("papers")}</span></div>
          <div className={`library-browser-split${inspectorOpen && selectedPaper ? "" : " details-hidden"}`}><div className="library-workspace-paper-list">
            {busy && !visiblePapers.length ? <StateView icon={<LoaderCircle className="spin" size={22} />} title={t("Loading…")} /> : visiblePapers.length ? visiblePapers.map((paper) => <article className={`library-workspace-paper-row${selectedPaper?.id === paper.id ? " selected" : ""}`} key={paper.id}><button className="library-workspace-paper-select" onClick={() => setSelectedPaperId(paper.id)} onDoubleClick={() => openPaper(paper, paperLibraryId(paper))}><strong>{paper.title}</strong><span>{paper.authors.slice(0, 2).join(", ")}{paper.authors.length > 2 ? " et al." : ""} · {paper.year || "—"}</span><small>{t(paper.reading_status === "reading" ? "Reading" : paper.reading_status === "read" ? "Already read" : "Unread")}{paper.venue ? ` · ${paper.venue}` : ""}</small></button><div className="library-paper-row-actions"><button className="icon-button" onClick={() => openPaper(paper, paperLibraryId(paper))} title={t("Open reading workspace")} aria-label={t("Open {name}", { name: paper.title })}><BookOpen size={15} /></button><button className={`icon-button${paper.starred ? " starred" : ""}`} onClick={() => void updatePaper(paper.id, { starred: !paper.starred }).catch((cause) => setError(String(cause)))} aria-label={t(paper.starred ? "Unstar paper" : "Star paper")}><Star size={14} fill={paper.starred ? "currentColor" : "none"} /></button></div></article>) : <StateView icon={<BookOpen size={23} />} title={t("No matching papers")} description={t("Import a paper or change the search query.")} action={library ? <button className="primary-button" onClick={beginImport}><Plus size={14} />{t("Import paper")}</button> : undefined} />}
          </div>{inspectorOpen && selectedPaper && renderInspector({ noteDrafts: drafts.current, paper: selectedPaper, onUpdate: (patch) => updatePaper(selectedPaper.id, patch), onRemove: () => removePaper(selectedPaper), onRead: () => openPaper(selectedPaper, paperLibraryId(selectedPaper)) })}</div>
        </>}
      </div>}
    </div>
    <MenuSurface open={Boolean(menuLibrary) && active} onClose={() => setMenuLibrary(null)} anchorRef={menuRef} ariaLabel={t("Folder actions")} width={220}><MenuItem icon={<Pencil size={14} />} onClick={() => { setEditor(menuLibrary); setMenuLibrary(null); }}>{t("Edit library")}</MenuItem><MenuItem icon={<Trash2 size={14} />} danger onClick={() => { const target = menuLibrary; setMenuLibrary(null); if (target) void deleteLibrary(target); }}>{t("Delete library")}</MenuItem></MenuSurface>
    {renderEditor({ editor, onClose: () => setEditor(null), onSave: saveLibrary })}
    {importLibrary && renderImport({ library: importLibrary, open: active, onClose: () => setImportLibraryId(null), onImport: importPaper })}
    <Dialog open={active && importPicker} onClose={() => setImportPicker(false)} size="compact" ariaLabel={t("Choose a library")} className="library-import-picker"><header><h2>{t("Choose a library")}</h2></header><p>{t("Select the folder where the imported paper should be saved.")}</p><select aria-label={t("Choose a library")} value={importChoice} onChange={(event) => setImportChoice(event.target.value)}>{libraries.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><footer><button className="secondary-button" onClick={() => setImportPicker(false)}>{t("Cancel")}</button><button className="primary-button" disabled={!importChoice} onClick={() => { setImportPicker(false); setImportLibraryId(importChoice); }}>{t("Continue")}</button></footer></Dialog>
  </section>;
}
