import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Image as ImageIcon, LoaderCircle, Maximize2, RefreshCw, Search, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  artifactKind,
  artifactStatusLabel,
  artifactTitle,
  artifactTypeLabelForPath,
  filterArtifacts,
  formatArtifactSize,
  groupArtifacts,
  mergeArtifacts,
  nextArtifactIndex,
  type ArtifactFilter,
  type ArtifactItem,
} from "./artifacts-model";
import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";

type ArtifactsPanelProps = {
  bridge: ResearchDeskBridge;
  workspace: string;
  threadId: string | null;
  currentTurnId: string | null;
  changeSets: WorkspaceChangeSet[];
  active: boolean;
  version: number;
  onOpenFile: (path: string) => void;
  onSeen: () => void;
};

const FILTERS: Array<{ value: ArtifactFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "images", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "data", label: "Data" },
  { value: "docs", label: "Docs" },
  { value: "web", label: "Web" },
];

type PreviewState = { kind: "image"; path: string } | { kind: "file"; path: string } | null;

type LoadedFile = {
  status: "loading" | "ready" | "error";
  file?: WorkspaceFilePreview;
  error?: string;
};

function artifactMeta(item: ArtifactItem) {
  const size = formatArtifactSize(item.size);
  if (item.source === "change-set") return ["change set", artifactStatusLabel(item.status), size].filter(Boolean).join(" · ");
  return size;
}

function turnLabel(item: ArtifactItem, currentTurnId: string | null) {
  if (item.turnId && item.turnId === currentTurnId) return "this turn";
  return item.source === "change-set" ? "change set" : "earlier";
}

export default function ArtifactsPanel({ bridge, workspace, threadId, currentTurnId, changeSets, active, version, onOpenFile, onSeen }: ArtifactsPanelProps) {
  const [records, setRecords] = useState<ResearchArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ArtifactFilter>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [seenPaths, setSeenPaths] = useState<Set<string>>(new Set());
  const [loadedFiles, setLoadedFiles] = useState<Record<string, LoadedFile>>({});
  const [imageIndex, setImageIndex] = useState(0);
  const seenThreadRef = useRef("");
  const loadedFilesRef = useRef<Record<string, LoadedFile>>({});

  const load = useCallback(async () => {
    if (!threadId) { setRecords([]); return; }
    setLoading(true);
    setError("");
    try {
      setRecords(await bridge.listArtifacts(threadId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [bridge, threadId]);

  useEffect(() => { void load(); }, [load, version]);

  useEffect(() => { if (!active) seenThreadRef.current = ""; }, [active]);

  useEffect(() => { seenThreadRef.current = ""; setSeenPaths(new Set()); }, [threadId]);

  const items = useMemo(() => mergeArtifacts(records, changeSets, currentTurnId), [changeSets, currentTurnId, records]);
  const filtered = useMemo(() => {
    const byType = filterArtifacts(items, filter);
    const needle = query.trim().toLowerCase();
    return needle ? byType.filter((item) => `${item.title} ${item.path}`.toLowerCase().includes(needle)) : byType;
  }, [filter, items, query]);
  const groups = useMemo(() => groupArtifacts(filtered, currentTurnId), [currentTurnId, filtered]);
  const imageItems = useMemo(() => items.filter((item) => item.kind === "image"), [items]);

  useEffect(() => {
    if (!active || !threadId || seenThreadRef.current === threadId) return;
    seenThreadRef.current = threadId;
    void bridge.markArtifactsSeen(threadId).then(() => {
      setRecords((current) => current.map((record) => ({ ...record, seen: true })));
      setSeenPaths(new Set(items.map((item) => item.path)));
      onSeen();
    }).catch(() => undefined);
  }, [active, bridge, items, onSeen, threadId]);

  const loadFile = useCallback(async (path: string) => {
    if (loadedFilesRef.current[path]?.status === "ready" || loadedFilesRef.current[path]?.status === "loading") return;
    loadedFilesRef.current = { ...loadedFilesRef.current, [path]: { status: "loading" } };
    setLoadedFiles(loadedFilesRef.current);
    try {
      const file = await bridge.readWorkspaceFile(workspace, path);
      loadedFilesRef.current = { ...loadedFilesRef.current, [path]: { status: "ready", file } };
      setLoadedFiles(loadedFilesRef.current);
    } catch (cause) {
      loadedFilesRef.current = { ...loadedFilesRef.current, [path]: { status: "error", error: cause instanceof Error ? cause.message : String(cause) } };
      setLoadedFiles(loadedFilesRef.current);
    }
  }, [bridge, workspace]);

  useEffect(() => {
    for (const item of items) {
      if (item.kind === "image" || item.kind === "markdown" || item.kind === "csv" || item.kind === "json" || item.kind === "html" || item.kind === "svg") void loadFile(item.path);
    }
  }, [items, loadFile]);

  function openItem(item: ArtifactItem) {
    if (item.kind === "image") {
      setImageIndex(Math.max(0, imageItems.findIndex((candidate) => candidate.path === item.path)));
      setPreview({ kind: "image", path: item.path });
      return;
    }
    if (item.kind === "pdf") { onOpenFile(item.path); return; }
    setPreview({ kind: "file", path: item.path });
    void loadFile(item.path);
  }

  function stepImage(offset: number) {
    if (!imageItems.length) return;
    const index = nextArtifactIndex(imageItems.length, imageIndex, offset);
    setImageIndex(index);
    setPreview({ kind: "image", path: imageItems[index].path });
    void loadFile(imageItems[index].path);
  }

  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
      if (preview.kind === "image" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        stepImage(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  });

  if (!threadId) {
    return <div className="artifacts-panel"><StateView className="artifacts-empty" icon={<ImageIcon size={20} />} title="No conversation yet" description="Artifacts created in a research turn will collect here." /></div>;
  }

  return <div className="artifacts-panel">
    <div className="artifacts-toolbar">
      <select value={filter} onChange={(event) => setFilter(event.target.value as ArtifactFilter)} aria-label="Artifact type">
        {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <label className="artifacts-search"><Search size={12} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artifacts" aria-label="Search artifacts" /></label>
      <button className="artifacts-refresh" onClick={() => void load()} title="Refresh artifacts" aria-label="Refresh artifacts" disabled={loading}><RefreshCw size={13} /></button>
    </div>

    {error && <InlineNotice tone="danger" className="artifacts-empty" title="Could not load artifacts">{error}</InlineNotice>}
    {!error && loading && !items.length && <StateView tone="loading" className="artifacts-loading" icon={<LoaderCircle size={15} />} title="Loading artifacts…" />}
    {!error && !loading && !filtered.length && <StateView className="artifacts-empty" icon={<ImageIcon size={20} />} title={items.length ? "No matching artifacts" : "No artifacts yet"} description={items.length ? "Try a different type or search." : "Ask the agent for a figure, table, Markdown brief, or web output."} />}

    {groups.thisTurn.length > 0 && <section className="artifacts-group">
      <h3>This turn</h3>
      <div className="artifacts-grid">{groups.thisTurn.map((item) => <ArtifactCard key={item.path} item={item} loaded={loadedFiles[item.path]} seen={seenPaths.has(item.path)} onOpen={() => openItem(item)} />)}</div>
    </section>}
    {groups.earlier.length > 0 && <section className="artifacts-group">
      <h3>Earlier</h3>
      <div className="artifacts-grid">{groups.earlier.map((item) => <ArtifactCard key={item.path} item={item} loaded={loadedFiles[item.path]} seen={seenPaths.has(item.path)} onOpen={() => openItem(item)} />)}</div>
    </section>}

    {preview?.kind === "image" && (() => {
      const item = imageItems[imageIndex];
      const loaded = item ? loadedFiles[item.path] : undefined;
      const url = loaded?.file?.previewUrl;
      return <Dialog open onClose={() => setPreview(null)} size="lightbox" className="artifact-lightbox-dialog" overlayClassName="artifact-lightbox app-dialog-overlay" ariaLabel="Artifact image preview">
          <header className="artifact-lightbox-head">
            <div><strong className="artifact-lightbox-title">{item?.title ?? "Artifact"}</strong><span className="artifact-lightbox-meta">{item ? `${item.version > 1 ? `v${item.version} · ` : ""}${turnLabel(item, currentTurnId)}` : ""}</span></div>
            <span className="artifact-lightbox-count">{imageItems.length ? `${imageIndex + 1} / ${imageItems.length}` : ""}</span>
            <button className="artifact-lightbox-close" onClick={() => setPreview(null)} aria-label="Close preview"><X size={15} /></button>
          </header>
          <div className="artifact-lightbox-stage">
            <button className="artifact-lightbox-prev" onClick={() => stepImage(-1)} aria-label="Previous image" disabled={imageItems.length < 2}><ArrowLeft size={16} /></button>
            {url ? <img src={url} alt={item?.title ?? "Artifact"} /> : <div className="artifact-preview-state">{loaded?.status === "error" ? loaded.error : "Loading image…"}</div>}
            <button className="artifact-lightbox-next" onClick={() => stepImage(1)} aria-label="Next image" disabled={imageItems.length < 2}><ArrowRight size={16} /></button>
          </div>
          <footer className="artifact-lightbox-foot">
            <div><b>{item ? artifactTypeLabelForPath(item.path) : ""}</b><span>{item ? formatArtifactSize(item.size) : ""}</span></div>
            <div className="artifact-lightbox-actions">
              <button onClick={() => item && onOpenFile(item.path)}>Open in Files</button>
              <button onClick={() => item && loadFile(item.path)}><RefreshCw size={11} />Reload</button>
            </div>
          </footer>
      </Dialog>;
    })()}

    {preview?.kind === "file" && (() => {
      const item = items.find((candidate) => candidate.path === preview.path);
      if (!item) return null;
      const loaded = loadedFiles[item.path];
      return <Dialog open onClose={() => setPreview(null)} size="preview" className="artifact-preview-dialog" overlayClassName="artifact-lightbox app-dialog-overlay" ariaLabel="Artifact preview">
          <header className="artifact-lightbox-head">
            <div><strong className="artifact-lightbox-title">{item.title}</strong><span className="artifact-lightbox-meta">{artifactTypeLabelForPath(item.path)} · {turnLabel(item, currentTurnId)}</span></div>
            <button className="artifact-lightbox-close" onClick={() => setPreview(null)} aria-label="Close preview"><X size={15} /></button>
          </header>
          <div className="artifact-preview-body">
            {loaded?.status !== "ready" ? <div className="artifact-preview-state">{loaded?.status === "error" ? loaded.error : "Loading preview…"}</div> : <ArtifactFilePreview file={loaded.file} />}
          </div>
          <footer className="artifact-lightbox-foot">
            <div><b>{artifactTypeLabelForPath(item.path)}</b><span>{formatArtifactSize(item.size)}</span></div>
            <div className="artifact-lightbox-actions"><button onClick={() => onOpenFile(item.path)}>Open in Files</button></div>
          </footer>
      </Dialog>;
    })()}
  </div>;
}

function ArtifactCard({ item, loaded, seen, onOpen }: { item: ArtifactItem; loaded?: LoadedFile; seen: boolean; onOpen: () => void }) {
  const isImage = item.kind === "image";
  return <article className={`artifact-card${!item.seen && !seen ? " is-new" : ""}`} role="button" tabIndex={0} aria-label={`Open ${item.title}`} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <div className={`artifact-thumb artifact-thumb-${item.kind}`}>
      {isImage ? (loaded?.file?.previewUrl ? <img src={loaded.file.previewUrl} alt="" loading="lazy" /> : <FileText size={18} />) : <ArtifactMiniPreview item={item} file={loaded?.file} />}
      <span className="artifact-type">{artifactTypeLabelForPath(item.path)}</span>
      {item.version > 1 && <span className="artifact-version">v{item.version}</span>}
      <span className="artifact-open"><Maximize2 size={11} />Open</span>
    </div>
    <strong className="artifact-title" title={item.path}>{item.title}</strong>
    <span className="artifact-meta">{artifactMeta(item)}</span>
  </article>;
}

function ArtifactMiniPreview({ item, file }: { item: ArtifactItem; file?: WorkspaceFilePreview }) {
  if (item.kind === "csv" && file?.content) {
    const rows = file.content.split(/\r?\n/).filter(Boolean).slice(0, 4).map((line) => line.split(","));
    return <table className="artifact-mini-table"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.slice(0, 3).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
  }
  if (item.kind === "markdown" && file?.content) {
    return <div className="artifact-mini-markdown">{file.content.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8).map((line, index) => <span key={index} className={index === 0 ? "title" : ""}>{line.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</span>)}</div>;
  }
  if (item.kind === "json") return <pre className="artifact-mini-code">{file?.content?.slice(0, 160) ?? "{…}"}</pre>;
  if (item.kind === "html") return file?.content ? <iframe className="artifact-mini-frame" title="" sandbox="" srcDoc={file.content} tabIndex={-1} /> : <div className="artifact-mini-web"><GlobeGlyph />HTML</div>;
  if (item.kind === "svg") return file?.previewUrl ? <img className="artifact-mini-svg" src={file.previewUrl} alt="" /> : file?.content ? <iframe className="artifact-mini-frame" title="" sandbox="" srcDoc={file.content} tabIndex={-1} /> : <div className="artifact-mini-web"><GlobeGlyph />SVG</div>;
  if (item.kind === "pdf") return <div className="artifact-mini-pdf"><div className="artifact-mini-pdf-page"><span>PDF</span><strong>{artifactTitle(item.path)}</strong><i /><i /><i /><i /></div></div>;
  return <div className="artifact-mini-file"><FileText size={18} /><span>{artifactTypeLabelForPath(item.path)}</span></div>;
}

function GlobeGlyph() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.2-3.3-8.5S9.8 5.9 12 3.5Z" /></svg>;
}

function ArtifactFilePreview({ file }: { file?: WorkspaceFilePreview }) {
  if (!file) return <div className="artifact-preview-state">No preview available.</div>;
  if (file.kind === "image" && file.previewUrl) return <img className="artifact-preview-image" src={file.previewUrl} alt={file.name} />;
  if (file.kind === "markdown") return <div className="artifact-preview-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content ?? ""}</ReactMarkdown></div>;
  if (file.path.endsWith(".csv") || file.path.endsWith(".tsv")) {
    const separator = file.path.endsWith(".tsv") ? "\t" : ",";
    const rows = (file.content ?? "").split(/\r?\n/).filter(Boolean).slice(0, 200).map((line) => line.split(separator));
    return <div className="artifact-preview-scroll"><table className="artifact-preview-table"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
  }
  if (file.path.endsWith(".json")) {
    let content = file.content ?? "";
    try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* keep raw */ }
    return <pre className="artifact-preview-code">{content}</pre>;
  }
  if (file.path.endsWith(".html") || file.path.endsWith(".htm") || file.path.endsWith(".svg")) {
    return <div className="artifact-sandbox-wrap"><div className="artifact-sandbox-note">Sandboxed preview · scripts, network, and same-origin access are disabled</div><iframe className="artifact-sandbox" title="Sandboxed artifact preview" sandbox="" srcDoc={file.content ?? ""} /></div>;
  }
  return <pre className="artifact-preview-code">{file.content ?? "No preview available."}</pre>;
}
