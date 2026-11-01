import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, FolderOpen, MessageSquarePlus, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { Dialog } from "./Dialog";
import { MenuDivider, MenuItem, MenuSurface } from "./Menu";

export type WorkFilter = "all" | "running" | "review" | "automations" | "archived";

function threadWorkState(thread: ResearchThread, runningThreadId?: string | null): "running" | "review" | "failed" | null {
  if (thread.id === runningThreadId || thread.status === "running") return "running";
  if (thread.status === "error") return "failed";
  if ((thread.pending_actions ?? 0) > 0) return "review";
  return null;
}

function needsAttention(thread: ResearchThread, runningThreadId?: string | null) {
  const state = threadWorkState(thread, runningThreadId);
  return state === "review" || state === "failed";
}

function folderName(workspacePath: string | null | undefined) {
  if (!workspacePath) return "";
  return workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? workspacePath;
}

export default function ProjectSidebar({ projects, archivedProjects, threads, archivedThreads, activeProjectId, activeThreadId, runningThreadId, disabled, onNewProject, onNewChat, onRenameProject, onArchiveProject, onRemoveProject, onChangeProjectWorkspace, onOpenThread, onArchiveThread, onRemoveThread, filterError }: {
  projects: ResearchProject[];
  archivedProjects: ResearchProject[];
  threads: ResearchThread[];
  archivedThreads: ResearchThread[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  runningThreadId?: string | null;
  disabled: boolean;
  onNewProject: () => void;
  onNewChat: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onArchiveProject: (project: ResearchProject, archived: boolean) => void;
  onRemoveProject: (project: ResearchProject) => void;
  onChangeProjectWorkspace: (project: ResearchProject) => void;
  onOpenThread: (thread: ResearchThread) => void;
  onArchiveThread: (thread: ResearchThread, archived: boolean) => void;
  onRemoveThread: (thread: ResearchThread) => void;
  filterError?: string;
}) {
  const { t } = useUISettings();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState<{ project: ResearchProject } | null>(null);
  const [showArchivedProjects, setShowArchivedProjects] = useState(true);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const projectAnchorRef = useRef<HTMLElement | null>(null);
  const renameInFlightRef = useRef(false);

  useEffect(() => {
    if (!projects.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      if (activeProjectId) next.add(activeProjectId);
      if (!next.size) next.add(projects[0].id);
      return next;
    });
  }, [activeProjectId, projects]);

  function toggleProject(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function beginRename(project: ResearchProject) {
    if (disabled) return;
    setRenameError("");
    setProjectNameDraft(project.name);
    setEditingProjectId(project.id);
  }

  async function finishRename(project: ResearchProject) {
    if (editingProjectId !== project.id || renameInFlightRef.current) return;
    const name = projectNameDraft.replace(/\s+/g, " ").trim();
    setEditingProjectId(null);
    if (!name || name === project.name) return;
    renameInFlightRef.current = true;
    setRenaming(true);
    try {
      await onRenameProject(project.id, name);
      setRenameError("");
    } catch (error) {
      setRenameError(t("Could not rename project: {error}", { error: String(error) }));
    } finally {
      renameInFlightRef.current = false;
      setRenaming(false);
    }
  }

  const runningCount = threads.filter((thread) => threadWorkState(thread, runningThreadId) === "running").length;
  const reviewCount = threads.filter((thread) => needsAttention(thread, runningThreadId)).length;
  const automationCount = 0;
  const filterOptions: Array<{ id: WorkFilter; label: string; count?: number }> = [
    { id: "all", label: t("All work"), count: threads.length },
    { id: "running", label: t("Running"), count: runningCount },
    { id: "review", label: t("Needs review"), count: reviewCount },
    { id: "automations", label: t("Automations"), count: automationCount },
    { id: "archived", label: t("Archived"), count: archivedThreads.length + archivedProjects.length },
  ];
  const activeFilterLabel = filter === "all" ? t("Filter") : filterOptions.find((option) => option.id === filter)?.label ?? t("Filter");

  const visibleThreads = filter === "all"
    ? threads
    : filter === "running"
      ? threads.filter((thread) => threadWorkState(thread, runningThreadId) === "running")
      : filter === "review"
        ? threads.filter((thread) => needsAttention(thread, runningThreadId))
        : [];
  const visibleProjectIds = new Set(visibleThreads.map((thread) => thread.project_id));
  const visibleProjects = filter === "all"
    ? projects
    : projects.filter((project) => visibleProjectIds.has(project.id));
  const emptyCopy = filter === "all"
    ? t("No work yet")
    : filter === "running"
      ? t("Nothing is running")
      : filter === "review"
        ? t("Nothing needs review")
        : filter === "automations"
          ? t("No automated runs yet")
          : t("No archived work");

  return <section className="sidebar-group projects-group work-group">
    <div className="work-heading">
      <span>{t("Work")}</span>
      <div className="work-heading-actions">
        <button ref={filterButtonRef} className={filter === "all" ? "work-filter-button" : "work-filter-button active"} onClick={() => setFilterOpen((open) => !open)} title={t("Filter work")} aria-haspopup="menu" aria-expanded={filterOpen} disabled={disabled}>
          <span>{activeFilterLabel}</span><ChevronDown size={11} />
        </button>
        <button className="work-new-project" onClick={onNewProject} title={t("New project")} aria-label={t("New project")} disabled={disabled}><Plus size={14} /></button>
        <MenuSurface open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterButtonRef} placement="bottom-end" width={280} className="work-filter-menu" ariaLabel={t("Filter work")}>
          {filterOptions.map((option) => <MenuItem key={option.id} checked={filter === option.id} hint={typeof option.count === "number" ? option.count : undefined} onClick={() => { setFilter(option.id); setFilterOpen(false); }}>{option.label}</MenuItem>)}
        </MenuSurface>
      </div>
    </div>

    <div className="project-tree work-tree">
      {filter === "archived" ? <>
        {archivedProjects.length > 0 && <>
          <button className={showArchivedProjects ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchivedProjects((visible) => !visible)}><Archive size={13} /><span>{t("Archived projects")}</span><small>{archivedProjects.length}</small></button>
          {showArchivedProjects && <div className="archived-project-list">
            {archivedProjects.map((project) => <div className="archived-project-row" key={project.id}>
              <span title={project.workspace_path || project.name}><strong>{project.name}</strong>{project.chat_count > 0 && <small>{project.chat_count}</small>}</span>
              <div><button onClick={() => onArchiveProject(project, false)} title={t("Restore {name}", { name: project.name })} disabled={disabled}><ArchiveRestore size={12} /></button><button onClick={() => onRemoveProject(project)} title={t("Remove {name}", { name: project.name })} disabled={disabled}><Trash2 size={12} /></button></div>
            </div>)}
          </div>}
        </>}
        {archivedThreads.length > 0 && <>
        <div className="work-subheading">{t("Archived chats")}</div>
        <div className="archived-chat-list">
          {archivedThreads.map((thread) => <div className="archived-chat-row" key={thread.id}><span title={thread.title}>{thread.title}</span><div><button onClick={() => onArchiveThread(thread, false)} title={t("Restore chat")} disabled={disabled}><ArchiveRestore size={12} /></button><button className="archived-chat-delete" onClick={() => onRemoveThread(thread)} title={t("Permanently delete chat")} disabled={disabled}><Trash2 size={12} /></button></div></div>)}
        </div>
        </>}
        {!archivedProjects.length && !archivedThreads.length && <div className="work-empty">{emptyCopy}</div>}
      </> : <>
        {visibleProjects.map((project) => {
          const projectThreads = visibleThreads.filter((thread) => thread.project_id === project.id);
          const isExpanded = expanded.has(project.id) || filter !== "all";
          const isActiveProject = activeProjectId === project.id && !activeThreadId;
          const menuOpen = projectMenu?.project.id === project.id;
          return <div className="project-node" key={project.id}>
            <div className={isActiveProject ? "project-tree-row active" : "project-tree-row"}>
              {editingProjectId === project.id
                ? <span className="project-rename-field"><input autoFocus value={projectNameDraft} aria-label={t("Project name")} maxLength={100} disabled={renaming} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={() => void finishRename(project)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void finishRename(project);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setRenameError("");
                    setEditingProjectId(null);
                  }
                }} /></span>
                : <button className="project-select" onClick={() => toggleProject(project.id)} title={`${project.name}${project.workspace_path ? ` · ${project.workspace_path}` : ""}`} aria-expanded={isExpanded}><span className="project-name">{project.name}</span>{projectThreads.length > 0 && <small>{projectThreads.length}</small>}</button>}
              <span className="project-row-actions">
                <button onClick={() => onNewChat(project.id)} title={t("New chat in {name}", { name: project.name })} disabled={disabled}><MessageSquarePlus size={13} /></button>
                <button className={menuOpen ? "project-more-button active" : "project-more-button"} onClick={(event) => { projectAnchorRef.current = event.currentTarget; setProjectMenu((current) => current?.project.id === project.id ? null : { project }); }} title={t("More project actions")} aria-label={t("More project actions")} aria-haspopup="menu" aria-expanded={menuOpen} disabled={disabled}><MoreVertical size={14} /></button>
              </span>
              <MenuSurface open={menuOpen} onClose={() => setProjectMenu(null)} anchorRef={projectAnchorRef} placement="bottom-end" width={300} className="project-more-menu" ariaLabel={t("Project actions")}>
                <MenuItem icon={<FolderOpen size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onChangeProjectWorkspace(project); }} disabled={disabled}>{t("Change project folder")}</MenuItem>
                <MenuItem icon={<Pencil size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); beginRename(project); }} disabled={disabled}>{t("Rename")}</MenuItem>
                <MenuItem icon={<Archive size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onArchiveProject(project, true); }} disabled={disabled}>{t("Archive")}</MenuItem>
                <MenuDivider />
                <MenuItem danger icon={<Trash2 size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onRemoveProject(project); }} disabled={disabled}>{t("Remove")}</MenuItem>
              </MenuSurface>
            </div>
            {isExpanded && <div className="project-chat-list">
              {projectThreads.map((thread) => {
                const state = threadWorkState(thread, runningThreadId);
                return <div className={activeThreadId === thread.id ? "project-chat-row active" : "project-chat-row"} key={thread.id}>
                  <button className="project-chat-open" onClick={() => onOpenThread(thread)} title={`${thread.title}${thread.workspace_path ? ` · ${folderName(thread.workspace_path)}` : ""}`}>
                    <span className="project-chat-title">{thread.title}</span>
                    {state === "running" && <span className="work-status running" title={t("Agent running")}>{t("Running")}</span>}
                    {state === "review" && <span className="work-status review" title={t("Needs review")}><i aria-hidden="true" />{t("Review")}</span>}
                    {state === "failed" && <span className="work-status failed" title={t("Last turn failed")}>{t("Failed")}</span>}
                  </button>
                  <button className="project-chat-archive" onClick={() => onArchiveThread(thread, true)} title={t("Archive chat")} disabled={disabled}><Archive size={12} /></button>
                </div>;
              })}
              {!projectThreads.length && filter === "all" && <div className="project-chat-empty">{t("No chats yet")}</div>}
            </div>}
          </div>;
        })}
        {!visibleProjects.length && <div className="work-empty">{emptyCopy}</div>}
      </>}
    </div>
    {filterError && <div className="project-rename-error" role="alert">{filterError}</div>}
    {renameError && <div className="project-rename-error" role="alert">{renameError}</div>}
  </section>;
}

export function NewProjectModal({ open, name, onName, workspacePath, onWorkspacePath, onChooseFolder, onClose, onCreate, error }: {
  open: boolean;
  name: string;
  onName: (value: string) => void;
  workspacePath: string;
  onWorkspacePath: (value: string) => void;
  onChooseFolder: () => void;
  onClose: () => void;
  onCreate: () => void;
  error?: string;
}) {
  const { t } = useUISettings();
  if (!open) return null;
  return <Dialog open onClose={onClose} size="md" className="dialog-ref project-create-modal" overlayClassName="modal-backdrop dialog-ref-backdrop" ariaLabelledBy="new-project-title">
    <header className="dialog-ref-header">
      <div><h2 id="new-project-title">{t("New project")}</h2><p>{t("A project groups related chats and runs them inside one folder. Every chat keeps its own history.")}</p></div>
      <button className="dialog-ref-close" onClick={onClose} aria-label={t("Close")}><X size={18} /></button>
    </header>
    <div className="dialog-ref-body">
      <label className="dialog-ref-field"><span>{t("Project name")}</span><input autoFocus value={name} onChange={(event) => onName(event.target.value)} placeholder={t("Agent reliability study")} maxLength={100} onKeyDown={(event) => event.key === "Enter" && onCreate()} /><small>{t("Use a short name that makes the project easy to find later.")}</small></label>
      <label className="dialog-ref-field"><span>{t("Project folder")}</span><span className="dialog-ref-folder"><FolderOpen size={15} /><input value={workspacePath} onChange={(event) => onWorkspacePath(event.target.value)} placeholder={t("Choose a folder for this project")} /><button type="button" className="secondary-button" onClick={onChooseFolder}>{t("Choose")}</button></span><small>{t("New chats inherit this folder as their working directory. You can change it later.")}</small></label>
      {error && <p className="project-rename-error" role="alert">{error}</p>}
    </div>
    <footer className="dialog-ref-footer">
      <button className="secondary-button" onClick={onClose}>{t("Cancel")}</button>
      <button className="primary-button" onClick={onCreate} disabled={!name.trim() || !workspacePath.trim()}>{t("Create project")}</button>
    </footer>
  </Dialog>;
}

export function ProjectRemoveModal({ project, onClose, onRemove }: { project: ResearchProject | null; onClose: () => void; onRemove: () => void }) {
  const { t } = useUISettings();
  if (!project) return null;
  const chatLabel = project.chat_count === 1 ? t("1 chat") : t("{count} chats", { count: project.chat_count });
  return <Dialog open onClose={onClose} size="sm" className="workspace-modal project-remove-modal" ariaLabel={t("Remove {name}", { name: project.name })}>
    <header className="modal-header"><div><h2>{t("Remove project?")}</h2></div><button className="app-dialog-close" onClick={onClose} aria-label={t("Close")}><X size={16} /></button></header>
    <p>{t("{name} and its {chats}, research turns, and recorded Agent actions will be permanently deleted. Files in the project folder are not deleted.", { name: project.name, chats: chatLabel })}</p>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="danger-button" onClick={onRemove}><Trash2 size={14} />{t("Remove project")}</button></div>
  </Dialog>;
}

export function ThreadRemoveModal({ thread, error, onClose, onRemove }: { thread: ResearchThread | null; error: string; onClose: () => void; onRemove: () => void }) {
  const { t } = useUISettings();
  if (!thread) return null;
  return <Dialog open onClose={onClose} size="sm" className="workspace-modal project-remove-modal" ariaLabel={t("Delete chat?")}>
    <header className="modal-header"><div><h2>{t("Delete chat?")}</h2></div><button className="app-dialog-close" onClick={onClose} aria-label={t("Close")}><X size={16} /></button></header>
    <p>{t("{title}, its research turns, recorded Agent actions, and chat history will be permanently deleted.", { title: thread.title })}</p>
    {error && <p className="project-rename-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="danger-button" onClick={onRemove}><Trash2 size={14} />{t("Delete chat")}</button></div>
  </Dialog>;
}
