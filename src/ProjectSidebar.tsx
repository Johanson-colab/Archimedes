import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";

export default function ProjectSidebar({ projects, archivedProjects, threads, archivedThreads, activeProjectId, activeThreadId, disabled, onNewProject, onNewChat, onRenameProject, onArchiveProject, onRemoveProject, onOpenThread, onArchiveThread }: {
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
}) {
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
      setRenameError(`Could not rename project: ${String(error)}`);
    } finally {
      renameInFlightRef.current = false;
      setRenaming(false);
    }
  }

  return <section className="sidebar-group projects-group">
    <div className="projects-heading"><span>Projects</span><button onClick={onNewProject} title="New project" disabled={disabled}><FolderPlus size={14} /></button></div>
    <div className="project-tree">
      {projects.map((project) => {
        const projectThreads = threads.filter((thread) => thread.project_id === project.id);
        const isExpanded = expanded.has(project.id);
        return <div className="project-node" key={project.id}>
          <div className={activeProjectId === project.id ? "project-tree-row active" : "project-tree-row"}>
            <button className="project-toggle" onClick={() => toggleProject(project.id)} title={isExpanded ? "Collapse project" : "Expand project"}>{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            {editingProjectId === project.id
              ? <span className="project-rename-field"><Folder size={14} /><input autoFocus value={projectNameDraft} aria-label="Project name" maxLength={100} disabled={renaming} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={() => void finishRename(project)} onKeyDown={(event) => {
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
              : <button className="project-select" onClick={() => onNewChat(project.id)} title={project.name} disabled={disabled}><Folder size={14} /><span>{project.name}</span><small>{projectThreads.length}</small></button>}
            <span className="project-row-actions">
              <button onClick={() => onNewChat(project.id)} title={`New chat in ${project.name}`} disabled={disabled}><MessageSquarePlus size={13} /></button>
              <button onClick={() => beginRename(project)} title={`Rename ${project.name}`} disabled={disabled}><Pencil size={12} /></button>
              <button onClick={() => onArchiveProject(project, true)} title={`Archive ${project.name}`} disabled={disabled}><Archive size={12} /></button>
              <button onClick={() => onRemoveProject(project)} title={`Remove ${project.name}`} disabled={disabled}><Trash2 size={12} /></button>
            </span>
          </div>
          {isExpanded && <div className="project-chat-list">
            {projectThreads.map((thread) => <div className={activeThreadId === thread.id ? "project-chat-row active" : "project-chat-row"} key={thread.id}>
              <button className="project-chat-open" onClick={() => onOpenThread(thread)} title={thread.title}><span>{thread.title}</span></button>
              <button className="project-chat-archive" onClick={() => onArchiveThread(thread, true)} title="Archive chat" disabled={disabled}><Archive size={12} /></button>
            </div>)}
            {!projectThreads.length && <div className="project-chat-empty">No chats yet</div>}
          </div>}
        </div>;
      })}
      {!projects.length && <div className="recent-empty">Create a project to begin</div>}
    </div>
    {renameError && <div className="project-rename-error" role="alert">{renameError}</div>}
    <button className={showArchivedProjects ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchivedProjects((visible) => !visible)}><Archive size={13} /><span>Archived projects</span><small>{archivedProjects.length}</small></button>
    {showArchivedProjects && <div className="archived-project-list">
      {archivedProjects.map((project) => <div className="archived-project-row" key={project.id}>
        <span title={project.name}><Folder size={13} /><strong>{project.name}</strong><small>{project.chat_count}</small></span>
        <div><button onClick={() => onArchiveProject(project, false)} title={`Restore ${project.name}`} disabled={disabled}><ArchiveRestore size={12} /></button><button onClick={() => onRemoveProject(project)} title={`Remove ${project.name}`} disabled={disabled}><Trash2 size={12} /></button></div>
      </div>)}
      {!archivedProjects.length && <div className="project-chat-empty">No archived projects</div>}
    </div>}
    <button className={showArchived ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchived((visible) => !visible)}><Archive size={13} /><span>Archived chats</span><small>{archivedThreads.length}</small></button>
    {showArchived && <div className="archived-chat-list">
      {archivedThreads.map((thread) => <div className="archived-chat-row" key={thread.id}><span>{thread.title}</span><button onClick={() => onArchiveThread(thread, false)} title="Restore chat"><ArchiveRestore size={12} /></button></div>)}
      {!archivedThreads.length && <div className="project-chat-empty">Archive is empty</div>}
    </div>}
  </section>;
}

export function NewProjectModal({ open, name, onName, onClose, onCreate }: { open: boolean; name: string; onName: (value: string) => void; onClose: () => void; onCreate: () => void }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="workspace-modal project-create-modal" role="dialog" aria-modal="true" aria-label="New research project" onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">Research workspace</span><h2>New project</h2></div></header>
    <p>A project groups related chats while keeping every chat history independent.</p>
    <label>Project name<input autoFocus value={name} onChange={(event) => onName(event.target.value)} placeholder="Agent reliability study" maxLength={100} onKeyDown={(event) => event.key === "Enter" && onCreate()} /></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreate} disabled={!name.trim()}><Plus size={14} />Create project</button></div>
  </section></div>;
}

export function ProjectRemoveModal({ project, onClose, onRemove }: { project: ResearchProject | null; onClose: () => void; onRemove: () => void }) {
  if (!project) return null;
  const chatLabel = project.chat_count === 1 ? "1 chat" : `${project.chat_count} chats`;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="workspace-modal project-remove-modal" role="dialog" aria-modal="true" aria-label={`Remove ${project.name}`} onMouseDown={(event) => event.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">Permanent action</span><h2>Remove project?</h2></div></header>
    <p><strong>{project.name}</strong> and its {chatLabel}, research turns, and recorded Agent actions will be permanently deleted.</p>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="danger-button" onClick={onRemove}><Trash2 size={14} />Remove project</button></div>
  </section></div>;
}
