import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  Check,
  FilePlus2,
  FileImage,
  FolderPlus,
  LoaderCircle,
  Plug,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { MenuDivider, MenuLabel, MenuSurface } from "./Menu";

type PickerView = "root" | "libraries" | "papers" | "plugins" | "skills";

export default function ContextPicker({ bridge, workspace, projectId, items, onAdd }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  items: ContextAttachment[];
  onAdd: (items: ContextAttachment[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PickerView>("root");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [resources, setResources] = useState<ContextAttachment[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<ResearchLibrary | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  function reset(nextOpen = false) {
    setOpen(nextOpen);
    setView("root");
    setError("");
    setQuery("");
  }

  async function chooseLocal(kind: "file" | "folder") {
    setError("");
    try {
      const selected = await bridge.chooseContextPaths(kind, workspace);
      if (selected.length) {
        onAdd(selected);
        reset(false);
      }
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function showLibraries() {
    setView("libraries");
    setLoading(true);
    setError("");
    try {
      setLibraries(await bridge.listLibraries(projectId ?? undefined));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function showPapers(library: ResearchLibrary) {
    setSelectedLibrary(library);
    setView("papers");
    setLoading(true);
    setError("");
    setQuery("");
    try {
      setPapers(await bridge.listLibraryPapers(library.id));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function showResources(kind: "plugin" | "skill") {
    setView(kind === "plugin" ? "plugins" : "skills");
    setLoading(true);
    setError("");
    setQuery("");
    try {
      if (kind === "skill") {
        const skills = await bridge.listSkills(workspace);
        setResources(skills.map((skill) => ({
          id: `skill:${skill.path}`,
          type: "skill" as const,
          name: skill.name,
          path: skill.path,
          detail: `${skill.collectionName} · ${skill.category}`,
        })));
      } else {
        setResources(await bridge.listContextResources(kind, workspace));
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }

  function addPaper(paper: LibraryPaper) {
    onAdd([{
      id: `paper:${paper.id}`,
      type: "paper",
      name: paper.title,
      detail: [paper.authors.slice(0, 3).join(", "), paper.year].filter(Boolean).join(" · "),
      paper: {
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        abstract: paper.abstract,
        url: paper.url,
        pdfUrl: paper.pdf_url,
      },
    }]);
  }

  function addResource(resource: ContextAttachment) {
    onAdd([resource]);
    reset(false);
  }

  const filteredPapers = papers.filter((paper) => `${paper.title} ${paper.authors.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const resourceTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredResources = resources.filter((resource) => {
    const searchable = `${resource.name} ${resource.detail || ""}`.toLowerCase();
    return resourceTerms.every((term) => searchable.includes(term));
  });
  const title = view === "libraries" ? "Literature Library" : view === "papers" ? selectedLibrary?.name ?? "Papers" : view === "plugins" ? "Plugins" : view === "skills" ? "Skills" : "Add context";

  return <div className="context-picker">
      <button ref={triggerRef} className={open ? "composer-add-button active" : "composer-add-button"} onClick={() => reset(!open)} title="Add context" aria-label="Add context" aria-haspopup="true" aria-expanded={open}>
        <Plus size={17} />
      </button>
      <MenuSurface open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} placement="top-start" width={340} maxHeight={480} className="context-picker-menu" role="group" ariaLabel="Add context">
        {view !== "root" && <div className="context-picker-header"><button onClick={() => { setView(view === "papers" ? "libraries" : "root"); setError(""); }} title="Back"><ArrowLeft size={15} /></button><strong>{title}</strong></div>}

        {view === "root" && <>
          <MenuLabel>Add context</MenuLabel>
          <PickerAction icon={<FilePlus2 size={16} />} label="Local file" detail="Attach one or more files" onClick={() => void chooseLocal("file")} />
          <PickerAction icon={<FolderPlus size={16} />} label="Local folder" detail="Give Archimedes access to a folder" onClick={() => void chooseLocal("folder")} />
          <MenuDivider />
          <PickerAction icon={<BookMarked size={16} />} label="Literature Library" detail="Add papers from your collections" onClick={() => void showLibraries()} />
          <PickerAction icon={<Plug size={16} />} label="Plugins" detail="Attach an installed plugin" onClick={() => void showResources("plugin")} />
          <PickerAction icon={<Sparkles size={16} />} label="Skills" detail="Attach research instructions" onClick={() => void showResources("skill")} />
        </>}

        {loading && <div className="context-picker-state"><LoaderCircle className="spin" size={17} />Loading...</div>}
        {!loading && view === "libraries" && <div className="context-picker-list">
          {libraries.map((library) => <button key={library.id} data-menu-item className="menu-item menu-item-rich context-list-row" onClick={() => void showPapers(library)}><span className="context-source-icon"><BookMarked size={15} /></span><span><strong>{library.name}</strong><small>{library.paper_count} papers</small></span></button>)}
          {!libraries.length && <div className="context-picker-state">No literature libraries yet.</div>}
        </div>}

        {!loading && view === "papers" && <>
          <label className="context-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved papers" /></label>
          <div className="context-picker-list">
            {filteredPapers.map((paper) => {
              const id = `paper:${paper.id}`;
              return <button key={paper.id} data-menu-item className="menu-item menu-item-rich context-list-row" onClick={() => addPaper(paper)} disabled={selectedIds.has(id)}><span className="context-source-icon"><BookMarked size={15} /></span><span><strong>{paper.title}</strong><small>{paper.authors.slice(0, 2).join(", ") || "Saved paper"}</small></span>{selectedIds.has(id) && <Check size={14} />}</button>;
            })}
            {!filteredPapers.length && <div className="context-picker-state">No matching papers.</div>}
          </div>
        </>}

        {!loading && (view === "plugins" || view === "skills") && <>
          <label className="context-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${view}`} /></label>
          <div className="context-picker-list">
            {filteredResources.map((resource) => <button key={resource.id} data-menu-item className="menu-item menu-item-rich context-list-row" onClick={() => addResource(resource)} disabled={selectedIds.has(resource.id)}><span className="context-source-icon">{resource.type === "plugin" ? <Plug size={15} /> : <Sparkles size={15} />}</span><span><strong>{resource.name}</strong><small>{resource.detail}</small></span>{selectedIds.has(resource.id) && <Check size={14} />}</button>)}
            {!filteredResources.length && <div className="context-picker-state">No matching {view} found.</div>}
          </div>
        </>}

        {error && <div className="context-picker-error">{error.replace(/^Error:\s*/, "")}</div>}
      </MenuSurface>
  </div>;
}

export function ContextChips({ items, onRemove }: { items: ContextAttachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return <div className="attached-contexts" aria-label="Attached context">
    {items.map((item) => <span className={item.type === "image" ? "attached-context-chip image" : "attached-context-chip"} key={item.id} title={item.detail || item.path || item.name}>{item.type === "image" && item.image ? <img src={item.image.dataUrl} alt="" /> : <ContextTypeIcon type={item.type} />}<span>{item.name}</span><button onClick={() => onRemove(item.id)} title={`Remove ${item.name}`}><X size={12} /></button></span>)}
  </div>;
}

function PickerAction({ icon, label, detail, onClick }: { icon: React.ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button type="button" data-menu-item className="menu-item menu-item-rich context-picker-action" onClick={(event) => { event.stopPropagation(); onClick(); }}><span className="menu-item-icon">{icon}</span><span className="menu-item-body"><strong>{label}</strong><small>{detail}</small></span></button>;
}

function ContextTypeIcon({ type }: { type: ContextAttachmentType }) {
  if (type === "file") return <FilePlus2 size={12} />;
  if (type === "folder") return <FolderPlus size={12} />;
  if (type === "paper") return <BookMarked size={12} />;
  if (type === "image") return <FileImage size={12} />;
  if (type === "plugin") return <Plug size={12} />;
  return <Sparkles size={12} />;
}
