import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleDot, FileCode2, FileImage, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, FolderUp, LoaderCircle, MessageCircle, Play, RefreshCw, X } from "lucide-react";

const EDITABLE = new Set(["tex", "bib", "bst", "cls", "sty", "cfg"]);
const ASSETS = new Set([...EDITABLE, "pdf", "png", "jpg", "jpeg", "webp"]);
const ext = (value: string) => value.split(".").at(-1)?.toLowerCase() || "";
const editable = (value: string) => EDITABLE.has(ext(value));
const projectRoot = (value: string) => value.split("/").slice(0, -1).join("/");

function lineStart(content: string, line: number) {
  let offset = 0;
  for (let index = 1; index < line; index += 1) {
    const next = content.indexOf("\n", offset);
    if (next < 0) return content.length;
    offset = next + 1;
  }
  return offset;
}

function replaceChildren(entries: WorkspaceFileEntry[], directory: string, children: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return entries.map((entry) => {
    if (entry.type !== "directory") return entry;
    if (entry.path === directory) return { ...entry, children };
    return directory.startsWith(`${entry.path}/`) && entry.children ? { ...entry, children: replaceChildren(entry.children, directory, children) } : entry;
  });
}

function FileIcon({ entry }: { entry: WorkspaceFileEntry }) {
  if (entry.type === "directory") return <Folder size={14} />;
  if (["png", "jpg", "jpeg", "webp"].includes(ext(entry.path))) return <FileImage size={14} />;
  return ext(entry.path) === "pdf" ? <FileText size={14} /> : <FileCode2 size={14} />;
}

function TreeNode({ entry, depth, selected, activeDirectory, expanded, loading, onToggle, onLoad, onOpen }: {
  entry: WorkspaceFileEntry; depth: number; selected: string; activeDirectory: string; expanded: Set<string>; loading: Set<string>;
  onToggle: (path: string) => void; onLoad: (path: string) => void; onOpen: (path: string) => void;
}) {
  const directory = entry.type === "directory";
  const open = directory && expanded.has(entry.path);
  const pending = loading.has(entry.path);
  useEffect(() => { if (open && entry.children === undefined && !pending) onLoad(entry.path); }, [entry.children, entry.path, onLoad, open, pending]);
  if (!directory && !ASSETS.has(ext(entry.path))) return null;
  return <div className="paper-tree-node">
    <button className={entry.path === selected || (directory && entry.path === activeDirectory) ? "paper-tree-row active" : "paper-tree-row"} style={{ paddingLeft: `${8 + depth * 14}px` }} onClick={() => directory ? onToggle(entry.path) : onOpen(entry.path)} title={entry.path}>
      <span>{pending ? <RefreshCw className="spin" size={11} /> : directory ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span><FileIcon entry={entry} /><strong>{entry.name}</strong>
    </button>
    {open && entry.children?.map((child) => <TreeNode key={child.path} entry={child} depth={depth + 1} selected={selected} activeDirectory={activeDirectory} expanded={expanded} loading={loading} onToggle={onToggle} onLoad={onLoad} onOpen={onOpen} />)}
  </div>;
}

function HighlightLine({ text, problem }: { text: string; problem: boolean }) {
  let commentIndex = -1;
  for (let index = 0; index < text.length; index += 1) if (text[index] === "%" && text[index - 1] !== "\\") { commentIndex = index; break; }
  const code = commentIndex < 0 ? text : text.slice(0, commentIndex);
  const comment = commentIndex < 0 ? "" : text.slice(commentIndex);
  const tokens: Array<{ value: string; className?: string }> = [];
  const pattern = /(\\[a-zA-Z@]+|\\[^a-zA-Z@]|\$\$?|[{}\[\]]|\b\d+(?:\.\d+)?\b)/g;
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ value: code.slice(cursor, index) });
    const value = match[0];
    tokens.push({ value, className: value.startsWith("\\") ? "latex-token-command" : value.startsWith("$") ? "latex-token-math" : /^[{}\[\]]$/.test(value) ? "latex-token-punctuation" : "latex-token-number" });
    cursor = index + value.length;
  }
  if (cursor < code.length) tokens.push({ value: code.slice(cursor) });
  if (comment) tokens.push({ value: comment, className: "latex-token-comment" });
  return <span className={problem ? "latex-highlight-line diagnostic" : "latex-highlight-line"}>{tokens.length ? tokens.map((token, index) => <span className={token.className} key={index}>{token.value}</span>) : " "}</span>;
}

export type PaperOpenRequest = { path: string; token: number } | null;

export default function PaperWritingView({ bridge, workspace, openRequest, onRefresh, onAskAI }: {
  bridge: ResearchDeskBridge; workspace: string; openRequest: PaperOpenRequest; onRefresh: () => Promise<void> | void; onAskAI: (path: string) => void;
}) {
  const [projects, setProjects] = useState<LatexProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState("");
  const [tree, setTree] = useState<WorkspaceFileTree>({ entries: [], count: 0, truncated: false });
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [mainPath, setMainPath] = useState("");
  const [file, setFile] = useState<WorkspaceFilePreview | null>(null);
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeDirectory, setActiveDirectory] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [compileState, setCompileState] = useState<"idle" | "compiling" | "success" | "error">("idle");
  const [compileResult, setCompileResult] = useState<LatexCompileResult | null>(null);
  const [activeProblem, setActiveProblem] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [autoCompile, setAutoCompile] = useState(true);
  const [chooserOpen, setChooserOpen] = useState(true);
  const [projectName, setProjectName] = useState("paper");
  const [importing, setImporting] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "folder" | null>(null);
  const [createName, setCreateName] = useState("");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const fileRef = useRef<WorkspaceFilePreview | null>(null);
  const draftRef = useRef("");
  const savedRef = useRef("");
  const saveSequence = useRef(0);
  const compileSequence = useRef(0);

  const refreshProjects = useCallback(async () => {
    const next = await bridge.listLatexProjects(workspace);
    setProjects(next);
    return next;
  }, [bridge, workspace]);

  const loadDirectory = useCallback(async (directory: string, root = false) => {
    setLoading((current) => new Set(current).add(directory));
    try {
      const listing = await bridge.listWorkspaceFiles(workspace, directory);
      setTree((current) => root ? listing : { ...current, entries: replaceChildren(current.entries, directory, listing.entries) });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading((current) => { const next = new Set(current); next.delete(directory); return next; });
    }
  }, [bridge, workspace]);

  const openFile = useCallback(async (path: string) => {
    if (!editable(path)) return;
    try {
      if (fileRef.current && draftRef.current !== savedRef.current) await bridge.writeWorkspaceFile(workspace, fileRef.current.path, draftRef.current);
      const next = await bridge.readWorkspaceFile(workspace, path);
      const content = next.content || "";
      fileRef.current = next; draftRef.current = content; savedRef.current = content;
      setFile(next); setDraft(content); setSavedDraft(content); setSaveState("saved"); setCompileResult(null); setActiveProblem(null); setError("");
      if (ext(path) === "tex" && /\\documentclass(?:\[[^\]]*\])?\s*\{/s.test(content)) setMainPath(path);
      setActiveDirectory(projectRoot(path));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  }, [bridge, workspace]);

  const activateProject = useCallback(async (path: string) => {
    const root = projectRoot(path);
    if (!root) { setError("Move this document into its own folder before opening it. Paper Writing only shows files belonging to one paper project."); return; }
    setActiveProject(root); setActiveDirectory(root); setExpanded(new Set([root])); setChooserOpen(false); setError("");
    await loadDirectory(root, true);
    await openFile(path);
  }, [loadDirectory, openFile]);

  const compile = useCallback(async (target = mainPath) => {
    if (!target) return;
    const sequence = ++compileSequence.current;
    setCompileState("compiling"); setError("");
    try {
      if (fileRef.current && draftRef.current !== savedRef.current) {
        await bridge.writeWorkspaceFile(workspace, fileRef.current.path, draftRef.current);
        savedRef.current = draftRef.current; setSavedDraft(draftRef.current); setSaveState("saved");
      }
      const result = await bridge.compileLatexDocument(workspace, target);
      if (sequence !== compileSequence.current) return;
      setCompileResult(result); setCompileState(result.ok ? "success" : "error"); setActiveProblem(result.ok ? null : result.diagnostics.find((item) => item.line)?.line ?? null);
    } catch (nextError) {
      if (sequence !== compileSequence.current) return;
      setCompileState("error"); setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [bridge, mainPath, workspace]);

  useEffect(() => { void refreshProjects().catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError))); }, [refreshProjects]);
  useEffect(() => { if (openRequest?.path) void activateProject(openRequest.path); }, [activateProject, openRequest?.path, openRequest?.token]);
  useEffect(() => {
    if (!file || draft === savedDraft) return;
    setSaveState("unsaved");
    const sequence = ++saveSequence.current;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await bridge.writeWorkspaceFile(workspace, file.path, draft);
        if (sequence !== saveSequence.current) return;
        savedRef.current = draft; setSavedDraft(draft); setSaveState("saved");
        if (autoCompile && mainPath) void compile(mainPath);
      } catch (nextError) { if (sequence === saveSequence.current) { setSaveState("unsaved"); setError(nextError instanceof Error ? nextError.message : String(nextError)); } }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [autoCompile, bridge, compile, draft, file, mainPath, savedDraft, workspace]);

  async function createProject() {
    try {
      const created = await bridge.createLatexProject(workspace, projectName.trim() || "paper");
      await onRefresh(); await refreshProjects(); await activateProject(created.path); void compile(created.path);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  }
  async function importFolder() {
    setImporting(true); setError("");
    try {
      const imported = await bridge.importLatexFolder(workspace);
      if (imported.canceled) return;
      await onRefresh(); await refreshProjects();
      if (imported.main_path) await activateProject(imported.main_path);
      else setError("The imported folder has no .tex document. Add one, then open the project again.");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); } finally { setImporting(false); }
  }
  async function createEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!name || !createKind || !activeProject) return;
    const parent = activeDirectory || activeProject;
    try {
      if (createKind === "file") {
        const created = await bridge.createLatexFile(workspace, `${parent}/${name}`);
        setCreateKind(null); await loadDirectory(parent, parent === activeProject); await openFile(created.path);
      } else {
        const created = await bridge.createLatexDirectory(workspace, `${parent}/${name}`);
        setCreateKind(null); setActiveDirectory(created.path); setExpanded((current) => new Set(current).add(created.path)); await loadDirectory(parent, parent === activeProject);
      }
      await onRefresh();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  }
  function toggleDirectory(path: string) {
    setActiveDirectory(path);
    setExpanded((current) => { const next = new Set(current); next.has(path) ? next.delete(path) : next.add(path); return next; });
  }
  function syncScroll(element: HTMLTextAreaElement) {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = element.scrollTop;
    if (highlightRef.current) { highlightRef.current.scrollTop = element.scrollTop; highlightRef.current.scrollLeft = element.scrollLeft; }
  }
  function jumpToProblem(diagnostic: LatexCompileDiagnostic) {
    if (!diagnostic.line || !editorRef.current) return;
    const offset = lineStart(draft, diagnostic.line);
    setActiveProblem(diagnostic.line); editorRef.current.focus(); editorRef.current.setSelectionRange(offset, offset);
    const height = Number.parseFloat(getComputedStyle(editorRef.current).lineHeight) || 20;
    editorRef.current.scrollTop = Math.max(0, (diagnostic.line - 3) * height); syncScroll(editorRef.current);
  }

  const lines = useMemo(() => draft.split("\n"), [draft]);
  const problemLines = useMemo(() => new Set(compileResult?.diagnostics.flatMap((item) => item.line ? [item.line] : []) ?? []), [compileResult]);
  const projectDocuments = projects.filter((project) => projectRoot(project.path) === activeProject);
  const projectLabel = activeProject.split("/").at(-1) || "New project";

  return <div className="paper-writing-page">
    <header className="paper-writing-header"><div><span className="page-kicker">LaTeX workspace</span><h1>Paper writing</h1><p>Create a paper project, edit its source, and preview the compiled PDF in one place.</p></div><div className="paper-writing-actions">{file && <button className="secondary-button" onClick={() => onAskAI(file.path)}><MessageCircle size={14} />Ask AI</button>}<button className="secondary-button" onClick={() => setChooserOpen(true)}><FolderOpen size={14} />Projects</button>{activeProject && <><button className="secondary-button" disabled={importing} onClick={() => void importFolder()}>{importing ? <LoaderCircle className="spin" size={14} /> : <FolderUp size={14} />}{importing ? "Importing…" : "Import folder"}</button><button className="primary-button" disabled={!mainPath || compileState === "compiling"} onClick={() => void compile()}>{compileState === "compiling" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}{compileState === "compiling" ? "Compiling…" : "Recompile"}</button></>}</div></header>
    <div className="paper-writing-workspace">
      <aside className="paper-source-browser"><div className="paper-browser-title"><FolderOpen size={14} /><strong>{projectLabel}</strong>{activeProject && <div className="paper-browser-actions"><button onClick={() => { setCreateKind("file"); setCreateName("section.tex"); }} aria-label="New LaTeX file"><FilePlus2 size={14} /></button><button onClick={() => { setCreateKind("folder"); setCreateName("figures"); }} aria-label="New folder"><FolderPlus size={14} /></button></div>}</div><label className="paper-main-document">Main document<select value={mainPath} disabled={!activeProject} onChange={(event) => { setMainPath(event.target.value); void openFile(event.target.value); }}>{!activeProject && <option value="">Choose a project first</option>}{projectDocuments.map((project) => <option key={project.path} value={project.path}>{project.title}</option>)}</select></label><div className="paper-tree-scroll">{activeProject ? tree.entries.map((entry) => <TreeNode key={entry.path} entry={entry} depth={0} selected={file?.path || ""} activeDirectory={activeDirectory} expanded={expanded} loading={loading} onToggle={toggleDirectory} onLoad={(path) => void loadDirectory(path)} onOpen={(path) => void openFile(path)} />) : <div className="paper-project-placeholder"><FolderOpen size={20} /><strong>No project selected</strong><span>Start a blank paper or import an existing LaTeX folder.</span></div>}</div></aside>
      <section className="latex-editor-pane"><div className="paper-pane-toolbar"><FileCode2 size={14} /><strong>{file?.name || "No source selected"}</strong><span className={`paper-save-state ${saveState}`}>{saveState === "saving" ? <LoaderCircle className="spin" size={11} /> : saveState === "saved" ? <Check size={11} /> : <CircleDot size={11} />}{saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Unsaved"}</span></div>{file ? <div className="latex-editor-body"><div className="latex-line-numbers" ref={lineNumbersRef}>{lines.map((_, index) => <span key={index} className={problemLines.has(index + 1) ? "diagnostic" : ""}>{problemLines.has(index + 1) ? <AlertTriangle size={10} /> : index + 1}</span>)}</div><div className="latex-editor-layer"><pre className="latex-highlight" ref={highlightRef} aria-hidden="true">{lines.map((line, index) => <HighlightLine key={index} text={line} problem={problemLines.has(index + 1) || activeProblem === index + 1} />)}</pre><textarea className="latex-editor-textarea" ref={editorRef} value={draft} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); const target = event.currentTarget; const next = `${draft.slice(0, target.selectionStart)}  ${draft.slice(target.selectionEnd)}`; const start = target.selectionStart; draftRef.current = next; setDraft(next); window.requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2)); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void compile(); } }} onScroll={(event) => syncScroll(event.currentTarget)} spellCheck={false} aria-label={`Edit ${file.path}`} /></div></div> : <div className="paper-writing-empty"><FileText size={25} /><strong>No LaTeX project open</strong><span>Choose a blank project or import a complete folder to start writing.</span><button className="primary-button" onClick={() => setChooserOpen(true)}><FolderOpen size={14} />Open project</button></div>}{(error || compileResult?.diagnostics.length || (compileResult && !compileResult.ok)) && <div className="latex-diagnostics"><header><AlertTriangle size={13} /><strong>{error ? "Workspace error" : `Problems · ${compileResult?.diagnostics.length || 1}`}</strong><span>{error ? "Resolve this before compiling again." : "Select a problem to jump to the source line."}</span></header>{error && <p>{error}</p>}{compileResult?.diagnostics.map((diagnostic, index) => <button key={`${diagnostic.line}-${index}`} className={diagnostic.line === activeProblem ? "active" : ""} onClick={() => jumpToProblem(diagnostic)}><b>{diagnostic.line ? `Line ${diagnostic.line}` : "LaTeX"}</b><span>{diagnostic.message}</span></button>)}{compileResult && !compileResult.ok && compileResult.log && <details><summary>Show full build log</summary><pre>{compileResult.log}</pre></details>}</div>}</section>
      <section className="paper-pdf-pane"><div className="paper-pane-toolbar"><FileText size={14} /><strong>PDF preview</strong><label className="paper-auto-compile"><input type="checkbox" checked={autoCompile} onChange={(event) => setAutoCompile(event.target.checked)} />Auto compile</label><span className={`paper-compile-state ${compileState}`}>{compileState === "compiling" ? <LoaderCircle className="spin" size={11} /> : compileState === "success" ? <Check size={11} /> : compileState === "error" ? <AlertTriangle size={11} /> : null}{compileState === "success" ? `${compileResult?.duration_ms ?? 0} ms` : compileState === "error" ? "Build failed" : compileState === "compiling" ? "Building" : "Not built"}</span></div>{compileResult?.preview_url ? <iframe key={compileResult.preview_url} src={compileResult.preview_url} title="Compiled paper PDF" /> : <div className="paper-writing-empty"><FileText size={27} /><strong>Compile to preview</strong><span>The generated PDF appears here. Any build problem is listed beside the source with its line number.</span>{mainPath && <button className="primary-button" disabled={compileState === "compiling"} onClick={() => void compile()}><Play size={14} />Compile paper</button>}</div>}</section>
    </div>
    {chooserOpen && <div className="paper-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && activeProject) setChooserOpen(false); }}><section className="paper-project-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-project-title"><header><div><span className="page-kicker">Paper writing</span><h2 id="paper-project-title">New project</h2><p>Each paper owns its own folder, source files, figures, bibliography, and build output.</p></div>{activeProject && <button className="reader-icon-button" onClick={() => setChooserOpen(false)} aria-label="Close project chooser"><X size={16} /></button>}</header><div className="paper-project-options"><form onSubmit={(event) => { event.preventDefault(); void createProject(); }}><FilePlus2 size={19} /><div><strong>Blank project</strong><span>Start with a clean, compilable article template.</span></div><label>Project folder<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="paper" /></label><button className="primary-button" type="submit" disabled={!projectName.trim()}>Create blank project</button></form><div className="paper-project-import"><FolderUp size={19} /><div><strong>Import existing folder</strong><span>Copy an Overleaf or local LaTeX project, including figures, bibliography, styles, and other assets.</span></div><button className="secondary-button" disabled={importing} onClick={() => void importFolder()}>{importing ? <LoaderCircle className="spin" size={14} /> : <FolderUp size={14} />}{importing ? "Importing…" : "Choose folder"}</button></div></div>{projects.some((project) => project.main && projectRoot(project.path)) && <div className="paper-existing-projects"><h3>Open an existing project</h3>{projects.filter((project) => project.main && projectRoot(project.path)).map((project) => <button key={project.path} onClick={() => void activateProject(project.path)}><FileCode2 size={14} /><span><strong>{project.title}</strong><small>{projectRoot(project.path)}</small></span><ChevronRight size={15} /></button>)}</div>}</section></div>}
    {createKind && <div className="paper-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateKind(null); }}><form className="paper-create-dialog" role="dialog" aria-modal="true" onSubmit={(event) => void createEntry(event)}><span className="page-kicker">{projectLabel}</span><h2>{createKind === "file" ? "New LaTeX file" : "New folder"}</h2><p>Creating in <strong>{activeDirectory || activeProject}</strong></p><label>{createKind === "file" ? "File name" : "Folder name"}<input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={createKind === "file" ? "section.tex" : "figures"} /></label><div><button type="button" className="secondary-button" onClick={() => setCreateKind(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!createName.trim()}>Create</button></div></form></div>}
  </div>;
}
