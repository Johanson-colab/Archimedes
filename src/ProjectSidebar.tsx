import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useUISettings } from "./i18n";
import { useDialogFocus } from "./useDialogFocus";

export default function ProjectSidebar({ projects, archivedProjects, threads, archivedThreads, activeProjectId, activeThreadId, disabled, onNewProject, onNewChat, onRenameProject, onArchiveProject, onRemoveProject, onOpenThread, onArchiveThread, onRemoveThread }: {
  projects: ResearchProject[];
  archivedProjects: ResearchProject[];
  threads: ResearchThread[];
  archivedThreads: ResearchThread[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  disabled: boolean;
  onNewProject: () => void;
  onNewChat: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onArchiveProject: (project: ResearchProject, archived: boolean) => void;
  onRemoveProject: (project: ResearchProject) => void;
  onOpenThread: (thread: ResearchThread) => void;
  onArchiveThread: (thread: ResearchThread, archived: boolean) => void;
  onRemoveThread: (thread: ResearchThread) => void;
}) {
  const { t } = useUISettings();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
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

  // The project row mirrors the chevron so browsing does not lose the
  // current chat; starting a new chat is reserved for the + action.
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

  return <section className="sidebar-group projects-group">
    <div className="projects-heading"><span>{t("Projects")}</span><button onClick={onNewProject} title={t("New project")} disabled={disabled}><FolderPlus size={14} /></button></div>
    <div className="project-tree">
      {projects.map((project) => {
        const projectThreads = threads.filter((thread) => thread.project_id === project.id);
        const isExpanded = expanded.has(project.id);
        return <div className="project-node" key={project.id}>
          <div className={activeProjectId === project.id ? "project-tree-row active" : "project-tree-row"}>
            <button className="project-toggle" onClick={() => toggleProject(project.id)} title={isExpanded ? t("Collapse project") : t("Expand project")}>{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            {editingProjectId === project.id
              ? <span className="project-rename-field"><Folder size={14} /><input autoFocus value={projectNameDraft} aria-label={t("Project name")} maxLength={100} disabled={renaming} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={() => void finishRename(project)} onKeyDown={(event) => {
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
              : <button className="project-select" onClick={() => toggleProject(project.id)} title={project.name} aria-expanded={isExpanded}><Folder size={14} /><span>{project.name}</span>{projectThreads.length > 0 && <small>{projectThreads.length}</small>}</button>}
            <span className="project-row-actions">
              <button onClick={() => onNewChat(project.id)} title={t("New chat in {name}", { name: project.name })} disabled={disabled}><MessageSquarePlus size={13} /></button>
              <button onClick={() => beginRename(project)} title={t("Rename {name}", { name: project.name })} disabled={disabled}><Pencil size={12} /></button>
              <button onClick={() => onArchiveProject(project, true)} title={t("Archive {name}", { name: project.name })} disabled={disabled}><Archive size={12} /></button>
              <button onClick={() => onRemoveProject(project)} title={t("Remove {name}", { name: project.name })} disabled={disabled}><Trash2 size={12} /></button>
            </span>
          </div>
          {isExpanded && <div className="project-chat-list">
            {projectThreads.map((thread) => <div className={activeThreadId === thread.id ? "project-chat-row active" : "project-chat-row"} key={thread.id}>
              <button className="project-chat-open" onClick={() => onOpenThread(thread)} title={thread.title}><span>{thread.title}</span></button>
              <button className="project-chat-archive" onClick={() => onArchiveThread(thread, true)} title={t("Archive chat")} disabled={disabled}><Archive size={12} /></button>
            </div>)}
            {!projectThreads.length && <div className="project-chat-empty">{t("No chats yet")}</div>}
          </div>}
        </div>;
      })}
      {!projects.length && <div className="recent-empty">{t("Create a project to begin")}</div>}
    </div>
    {renameError && <div className="project-rename-error" role="alert">{renameError}</div>}
    {archivedProjects.length > 0 && <>
      <button className={showArchivedProjects ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchivedProjects((visible) => !visible)}><Archive size={13} /><span>{t("Archived projects")}</span><small>{archivedProjects.length}</small></button>
      {showArchivedProjects && <div className="archived-project-list">
        {archivedProjects.map((project) => <div className="archived-project-row" key={project.id}>
          <span title={project.name}><Folder size={13} /><strong>{project.name}</strong>{project.chat_count > 0 && <small>{project.chat_count}</small>}</span>
          <div><button onClick={() => onArchiveProject(project, false)} title={t("Restore {name}", { name: project.name })} disabled={disabled}><ArchiveRestore size={12} /></button><button onClick={() => onRemoveProject(project)} title={t("Remove {name}", { name: project.name })} disabled={disabled}><Trash2 size={12} /></button></div>
        </div>)}
      </div>}
    </>}
    {archivedThreads.length > 0 && <>
      <button className={showArchived ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchived((visible) => !visible)}><Archive size={13} /><span>{t("Archived chats")}</span><small>{archivedThreads.length}</small></button>
      {showArchived && <div className="archived-chat-list">
        {archivedThreads.map((thread) => <div className="archived-chat-row" key={thread.id}><span>{thread.title}</span><div><button onClick={() => onArchiveThread(thread, false)} title={t("Restore chat")} disabled={disabled}><ArchiveRestore size={12} /></button><button className="archived-chat-delete" onClick={() => onRemoveThread(thread)} title={t("Permanently delete chat")} disabled={disabled}><Trash2 size={12} /></button></div></div>)}
      </div>}
    </>}
  </section>;
}

export function NewProjectModal({ open, name, onName, onClose, onCreate }: { open: boolean; name: string; onName: (value: string) => void; onClose: () => void; onCreate: () => void }) {
  const { t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal project-create-modal" role="dialog" aria-modal="true" aria-label={t("New project")} onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">{t("Research workspace")}</span><h2>{t("New project")}</h2></div></header>
    <p>{t("A project groups related chats while keeping every chat history independent.")}</p>
    <label>{t("Project name")}<input autoFocus value={name} onChange={(event) => onName(event.target.value)} placeholder={t("Agent reliability study")} maxLength={100} onKeyDown={(event) => event.key === "Enter" && onCreate()} /></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="primary-button" onClick={onCreate} disabled={!name.trim()}><Plus size={14} />{t("Create project")}</button></div>
  </section></div>;
}

export function ProjectRemoveModal({ project, onClose, onRemove }: { project: ResearchProject | null; onClose: () => void; onRemove: () => void }) {
  const { t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(project), onClose);
  if (!project) return null;
  const chatLabel = project.chat_count === 1 ? t("1 chat") : t("{count} chats", { count: project.chat_count });
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal project-remove-modal" role="dialog" aria-modal="true" aria-label={t("Remove {name}", { name: project.name })} onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">{t("Permanent action")}</span><h2>{t("Remove project?")}</h2></div></header>
    <p>{t("{name} and its {chats}, research turns, and recorded Agent actions will be permanently deleted.", { name: project.name, chats: chatLabel })}</p>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="danger-button" onClick={onRemove}><Trash2 size={14} />{t("Remove project")}</button></div>
  </section></div>;
}

export function ThreadRemoveModal({ thread, error, onClose, onRemove }: { thread: ResearchThread | null; error: string; onClose: () => void; onRemove: () => void }) {
  const { t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(thread), onClose);
  if (!thread) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal project-remove-modal" role="dialog" aria-modal="true" aria-label={t("Delete chat?")} onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">{t("Permanent action")}</span><h2>{t("Delete chat?")}</h2></div></header>
    <p>{t("{title}, its research turns, recorded Agent actions, and chat history will be permanently deleted.", { title: thread.title })}</p>
    {error && <p className="project-rename-error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="danger-button" onClick={onRemove}><Trash2 size={14} />{t("Delete chat")}</button></div>
  </section></div>;
}
