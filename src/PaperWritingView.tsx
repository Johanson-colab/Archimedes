import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileCode2,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  FolderOpen,
  FolderUp,
  LoaderCircle,
  MessageCircle,
  Play,
  RefreshCw,
} from "lucide-react";

const EDITABLE_EXTENSIONS = new Set(["tex", "bib", "bst", "cls", "sty", "cfg"]);
const PAPER_ASSET_EXTENSIONS = new Set([...EDITABLE_EXTENSIONS, "pdf", "png", "jpg", "jpeg", "webp"]);

function extension(filePath: string) {
  return filePath.split(".").at(-1)?.toLowerCase() || "";
}

function isEditable(filePath: string) {
  return EDITABLE_EXTENSIONS.has(extension(filePath));
}

function lineStart(content: string, line: number) {
  if (line <= 1) return 0;
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = content.indexOf("\n", offset);
    if (next < 0) return content.length;
    offset = next + 1;
  }
  return offset;
}

function PaperFileIcon({ entry }: { entry: WorkspaceFileEntry }) {
  if (entry.type === "directory") return <Folder size={14} />;
  if (["png", "jpg", "jpeg", "webp"].includes(extension(entry.path))) return <FileImage size={14} />;
  return extension(entry.path) === "pdf" ? <FileText size={14} /> : <FileCode2 size={14} />;
}

function PaperTreeNode({ entry, depth, selectedPath, activeDirectory, expanded, loadingDirectories, onToggle, onLoadDirectory, onOpen }: {
  entry: WorkspaceFileEntry;
  depth: number;
  selectedPath: string;
  activeDirectory: string;
  expanded: Set<string>;
  loadingDirectories: Set<string>;
  onToggle: (path: string) => void;
  onLoadDirectory: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const directory = entry.type === "directory";
  const isExpanded = directory && expanded.has(entry.path);
  const loading = loadingDirectories.has(entry.path);
  useEffect(() => {
    if (isExpanded && entry.children === undefined && !loading) onLoadDirectory(entry.path);
  }, [entry.children, entry.path, isExpanded, loading, onLoadDirectory]);
  if (!directory && !PAPER_ASSET_EXTENSIONS.has(extension(entry.path))) return null;
  return <div className="paper-tree-node">
    <button className={entry.path === selectedPath || (directory && entry.path === activeDirectory) ? "paper-tree-row active" : "paper-tree-row"} style={{ paddingLeft: `${8 + depth * 14}px` }} onClick={() => directory ? onToggle(entry.path) : onOpen(entry.path)} title={entry.path}>
      <span>{loading ? <RefreshCw className="spin" size={11} /> : directory ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
      <PaperFileIcon entry={entry} />
      <strong>{entry.name}</strong>
    </button>
    {isExpanded && entry.children?.map((child) => <PaperTreeNode key={child.path} entry={child} depth={depth + 1} selectedPath={selectedPath} activeDirectory={activeDirectory} expanded={expanded} loadingDirectories={loadingDirectories} onToggle={onToggle} onLoadDirectory={onLoadDirectory} onOpen={onOpen} />)}
  </div>;
}

export type PaperOpenRequest = { path: string; token: number } | null;

export default function PaperWritingView({ bridge, workspace, tree, loadingDirectories, openRequest, onLoadDirectory, onRefresh, onAskAI }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  tree: WorkspaceFileTree;
  loadingDirectories: Set<string>;
  openRequest: PaperOpenRequest;
  onLoadDirectory: (directory: string) => void;
  onRefresh: () => Promise<void> | void;
  onAskAI: (path: string) => void;
}) {
  const [projects, setProjects] = useState<LatexProjectSummary[]>([]);
  const [mainPath, setMainPath] = useState("");
  const [file, setFile] = useState<WorkspaceFilePreview | null>(null);
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [compileState, setCompileState] = useState<"idle" | "compiling" | "success" | "error">("idle");
  const [compileResult, setCompileResult] = useState<LatexCompileResult | null>(null);
  const [error, setError] = useState("");
  const [autoCompile, setAutoCompile] = useState(true);
  const [activeDirectory, setActiveDirectory] = useState("");
  const [createKind, setCreateKind] = useState<"file" | "folder" | null>(null);
  const [createName, setCreateName] = useState("");
  const [importing, setImporting] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<WorkspaceFilePreview | null>(null);
  const draftRef = useRef("");
  const savedDraftRef = useRef("");
  const saveSequenceRef = useRef(0);
  const compileSequenceRef = useRef(0);

  const refreshProjects = useCallback(async () => {
    if (!workspace) return [];
    const next = await bridge.listLatexProjects(workspace);
    setProjects(next);
    setMainPath((current) => current && next.some((project) => project.path === current)
      ? current
      : next.find((project) => project.main)?.path || next[0]?.path || "");
    return next;
  }, [bridge, workspace]);

  const openFile = useCallback(async (path: string) => {
    if (!isEditable(path)) return;
    setError("");
    try {
      if (fileRef.current && draftRef.current !== savedDraftRef.current) {
        await bridge.writeWorkspaceFile(workspace, fileRef.current.path, draftRef.current);
        savedDraftRef.current = draftRef.current;
      }
      const next = await bridge.readWorkspaceFile(workspace, path);
      const content = next.content || "";
      fileRef.current = next;
      draftRef.current = content;
      savedDraftRef.current = content;
      setFile(next);
      setDraft(content);
      setSavedDraft(content);
      setSaveState("saved");
      if (extension(path) === "tex" && /\\documentclass(?:\[[^\]]*\])?\s*\{/s.test(content)) setMainPath(path);
      const parts = path.split("/");
      setActiveDirectory(parts.slice(0, -1).join("/"));
      setExpanded((current) => {
        const nextExpanded = new Set(current);
        for (let index = 1; index < parts.length; index += 1) nextExpanded.add(parts.slice(0, index).join("/"));
        return nextExpanded;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [bridge, workspace]);

  const compile = useCallback(async (targetPath = mainPath) => {
    if (!targetPath) return;
    const sequence = ++compileSequenceRef.current;
    setCompileState("compiling");
    setError("");
    try {
      if (fileRef.current && draftRef.current !== savedDraftRef.current) {
        await bridge.writeWorkspaceFile(workspace, fileRef.current.path, draftRef.current);
        savedDraftRef.current = draftRef.current;
        setSavedDraft(draftRef.current);
        setSaveState("saved");
      }
      const result = await bridge.compileLatexDocument(workspace, targetPath);
      if (sequence !== compileSequenceRef.current) return;
      setCompileResult(result);
      setCompileState(result.ok ? "success" : "error");
    } catch (nextError) {
      if (sequence !== compileSequenceRef.current) return;
      setCompileState("error");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [bridge, mainPath, workspace]);

  useEffect(() => {
    void refreshProjects().then((next) => {
      if (openRequest?.path) return;
      const first = next.find((project) => project.main) || next[0];
      if (first) void openFile(first.path);
    }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [openFile, openRequest?.path, refreshProjects]);

  useEffect(() => {
    if (openRequest?.path) void openFile(openRequest.path);
  }, [openFile, openRequest?.path, openRequest?.token]);

  useEffect(() => {
    if (!file || draft === savedDraft) return;
    setSaveState("unsaved");
    const sequence = ++saveSequenceRef.current;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await bridge.writeWorkspaceFile(workspace, file.path, draft);
        if (sequence !== saveSequenceRef.current) return;
        savedDraftRef.current = draft;
        setSavedDraft(draft);
        setSaveState("saved");
        if (autoCompile && mainPath) void compile(mainPath);
      } catch (nextError) {
        if (sequence !== saveSequenceRef.current) return;
        setSaveState("unsaved");
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [autoCompile, bridge, compile, draft, file, mainPath, savedDraft, workspace]);

  async function createPaper() {
    setError("");
    try {
      const created = await bridge.createLatexProject(workspace);
      await onRefresh();
      await refreshProjects();
      setMainPath(created.path);
      await openFile(created.path);
      await compile(created.path);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function importFolder() {
    setError("");
    setImporting(true);
    try {
      const imported = await bridge.importLatexFolder(workspace);
      if (imported.canceled) return;
      await onRefresh();
      await refreshProjects();
      if (imported.directory) {
        setActiveDirectory(imported.directory);
        setExpanded((current) => new Set(current).add(imported.directory!));
      }
      if (imported.main_path) {
        setMainPath(imported.main_path);
        await openFile(imported.main_path);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setImporting(false);
    }
  }

  function beginCreate(kind: "file" | "folder") {
    setError("");
    setCreateName(kind === "file" ? "section.tex" : "figures");
    setCreateKind(kind);
  }

  async function createEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim().replaceAll("\\", "/").replace(/^\/+/, "");
    if (!name || !createKind) return;
    const targetPath = activeDirectory ? `${activeDirectory}/${name}` : name;
    setError("");
    try {
      if (createKind === "file") {
        const created = await bridge.createLatexFile(workspace, targetPath);
        setCreateKind(null);
        await onRefresh();
        await refreshProjects();
        await openFile(created.path);
      } else {
        const created = await bridge.createLatexDirectory(workspace, targetPath);
        setCreateKind(null);
        setActiveDirectory(created.path);
        setExpanded((current) => {
          const next = new Set(current);
          const parts = created.path.split("/");
          for (let index = 1; index <= parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
          return next;
        });
        await onRefresh();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  function toggleDirectory(path: string) {
    setActiveDirectory(path);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function jumpToDiagnostic(diagnostic: LatexCompileDiagnostic) {
    if (!diagnostic.line || !editorRef.current) return;
    const offset = lineStart(draft, diagnostic.line);
    editorRef.current.focus();
    editorRef.current.setSelectionRange(offset, offset);
    const lineHeight = Number.parseFloat(getComputedStyle(editorRef.current).lineHeight) || 20;
    editorRef.current.scrollTop = Math.max(0, (diagnostic.line - 3) * lineHeight);
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
  }

  const lineNumbers = useMemo(() => Array.from({ length: Math.max(1, draft.split("\n").length) }, (_, index) => index + 1), [draft]);
  const selectedName = file?.name || "No source selected";

  return <div className="paper-writing-page">
    <header className="paper-writing-header">
      <div><span className="page-kicker">LaTeX workspace</span><h1>Paper writing</h1><p>Edit source and inspect the compiled PDF without leaving Archimedes.</p></div>
      <div className="paper-writing-actions">
        {file && <button className="secondary-button" onClick={() => onAskAI(file.path)}><MessageCircle size={14} />Ask AI</button>}
        <button className="secondary-button" disabled={importing} onClick={() => void importFolder()}>{importing ? <LoaderCircle className="spin" size={14} /> : <FolderUp size={14} />}{importing ? "Importing…" : "Import folder"}</button>
        <button className="secondary-button" onClick={() => void createPaper()}><FilePlus2 size={14} />New paper</button>
        <button className="primary-button" disabled={!mainPath || compileState === "compiling"} onClick={() => void compile(mainPath)}>{compileState === "compiling" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}{compileState === "compiling" ? "Compiling…" : "Recompile"}</button>
      </div>
    </header>

    <div className="paper-writing-workspace">
      <aside className="paper-source-browser">
        <div className="paper-browser-title"><FolderOpen size={14} /><strong>{workspace.split("/").filter(Boolean).at(-1) || "Workspace"}</strong><div className="paper-browser-actions"><button onClick={() => beginCreate("file")} title={`New LaTeX file${activeDirectory ? ` in ${activeDirectory}` : ""}`} aria-label="New LaTeX file"><FilePlus2 size={14} /></button><button onClick={() => beginCreate("folder")} title={`New folder${activeDirectory ? ` in ${activeDirectory}` : ""}`} aria-label="New folder"><FolderPlus size={14} /></button></div></div>
        <label className="paper-main-document">Main document<select value={mainPath} onChange={(event) => { setMainPath(event.target.value); void openFile(event.target.value); }}>{!projects.length && <option value="">No .tex documents</option>}{projects.map((project) => <option key={project.path} value={project.path}>{project.title}</option>)}</select></label>
        <div className="paper-tree-scroll">{tree.entries.map((entry) => <PaperTreeNode key={entry.path} entry={entry} depth={0} selectedPath={file?.path || ""} activeDirectory={activeDirectory} expanded={expanded} loadingDirectories={loadingDirectories} onToggle={toggleDirectory} onLoadDirectory={onLoadDirectory} onOpen={(path) => void openFile(path)} />)}</div>
      </aside>

      <section className="latex-editor-pane">
        <div className="paper-pane-toolbar"><FileCode2 size={14} /><strong>{selectedName}</strong><span className={`paper-save-state ${saveState}`}>{saveState === "saving" ? <LoaderCircle className="spin" size={11} /> : saveState === "saved" ? <Check size={11} /> : <CircleDot size={11} />}{saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : "Unsaved"}</span></div>
        {file ? <div className="latex-editor-body">
          <div className="latex-line-numbers" ref={lineNumbersRef}>{lineNumbers.map((number) => <span key={number}>{number}</span>)}</div>
          <textarea ref={editorRef} value={draft} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }} onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const next = `${draft.slice(0, start)}  ${draft.slice(end)}`;
              draftRef.current = next;
              setDraft(next);
              window.requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              if (mainPath) void compile(mainPath);
            }
          }} onScroll={(event) => { if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop; }} spellCheck={false} aria-label={`Edit ${file.path}`} />
        </div> : <div className="paper-writing-empty"><FileText size={25} /><strong>No LaTeX paper found</strong><span>Create a paper or select a .tex file from the workspace.</span><button className="primary-button" onClick={() => void createPaper()}><FilePlus2 size={14} />Create paper</button></div>}
        {(error || compileResult?.diagnostics.length || (compileResult && !compileResult.ok)) ? <div className="latex-diagnostics"><header><AlertTriangle size={13} /><strong>{error ? "Workspace error" : "Compiler diagnostics"}</strong></header>{error && <p>{error}</p>}{compileResult?.diagnostics.map((diagnostic, index) => <button key={`${diagnostic.line}-${index}`} onClick={() => jumpToDiagnostic(diagnostic)}><b>{diagnostic.line ? `Line ${diagnostic.line}` : "LaTeX"}</b><span>{diagnostic.message}</span></button>)}{compileResult && !compileResult.ok && compileResult.log && <details><summary>Build log</summary><pre>{compileResult.log}</pre></details>}</div> : null}
      </section>

      <section className="paper-pdf-pane">
        <div className="paper-pane-toolbar"><FileText size={14} /><strong>PDF preview</strong><label className="paper-auto-compile"><input type="checkbox" checked={autoCompile} onChange={(event) => setAutoCompile(event.target.checked)} />Auto compile</label><span className={`paper-compile-state ${compileState}`}>{compileState === "compiling" ? <LoaderCircle className="spin" size={11} /> : compileState === "success" ? <Check size={11} /> : compileState === "error" ? <AlertTriangle size={11} /> : null}{compileState === "success" ? `${compileResult?.duration_ms ?? 0} ms` : compileState === "error" ? "Build failed" : compileState === "compiling" ? "Building" : "Not built"}</span></div>
        {compileResult?.preview_url ? <iframe key={compileResult.preview_url} src={compileResult.preview_url} title="Compiled paper PDF" /> : <div className="paper-writing-empty"><FileText size={27} /><strong>Compile to preview</strong><span>The generated PDF will appear here. A failed build keeps its diagnostics beside the source.</span>{mainPath && <button className="primary-button" disabled={compileState === "compiling"} onClick={() => void compile(mainPath)}><Play size={14} />Compile paper</button>}</div>}
      </section>
    </div>

    {createKind && <div className="paper-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateKind(null); }}>
      <form className="paper-create-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-create-title" onSubmit={(event) => void createEntry(event)}>
        <span className="page-kicker">LaTeX workspace</span>
        <h2 id="paper-create-title">{createKind === "file" ? "New LaTeX file" : "New folder"}</h2>
        <p>Creating in <strong>{activeDirectory || workspace.split("/").filter(Boolean).at(-1) || "workspace root"}</strong></p>
        <label>{createKind === "file" ? "File name" : "Folder name"}<input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreateKind(null); }} placeholder={createKind === "file" ? "section.tex" : "figures"} /></label>
        <div><button type="button" className="secondary-button" onClick={() => setCreateKind(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!createName.trim()}>Create</button></div>
      </form>
    </div>}
  </div>;
}
