import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquarePlus, Plus } from "lucide-react";

export default function ProjectSidebar({ projects, threads, archivedThreads, activeProjectId, activeThreadId, disabled, onNewProject, onNewChat, onOpenThread, onArchiveThread }: {
  projects: ResearchProject[];
  threads: ResearchThread[];
  archivedThreads: ResearchThread[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  disabled: boolean;
  onNewProject: () => void;
  onNewChat: (projectId: string) => void;
  onOpenThread: (thread: ResearchThread) => void;
  onArchiveThread: (thread: ResearchThread, archived: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

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

  return <section className="sidebar-group projects-group">
    <div className="projects-heading"><span>Projects</span><button onClick={onNewProject} title="New project" disabled={disabled}><FolderPlus size={14} /></button></div>
    <div className="project-tree">
      {projects.map((project) => {
        const projectThreads = threads.filter((thread) => thread.project_id === project.id);
        const isExpanded = expanded.has(project.id);
        return <div className="project-node" key={project.id}>
          <div className={activeProjectId === project.id ? "project-tree-row active" : "project-tree-row"}>
            <button className="project-toggle" onClick={() => toggleProject(project.id)} title={isExpanded ? "Collapse project" : "Expand project"}>{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            <button className="project-select" onClick={() => onNewChat(project.id)} title={project.name} disabled={disabled}><Folder size={14} /><span>{project.name}</span><small>{projectThreads.length}</small></button>
            <span className="project-row-actions">
              <button onClick={() => onNewChat(project.id)} title={`New chat in ${project.name}`} disabled={disabled}><MessageSquarePlus size={13} /></button>
            </span>
          </div>
          {isExpanded && <div className="project-chat-list">
            {projectThreads.map((thread) => <div className={activeThreadId === thread.id ? "project-chat-row active" : "project-chat-row"} key={thread.id}>
              <button className="project-chat-open" onClick={() => onOpenThread(thread)} title={thread.title} disabled={disabled}><span>{thread.title}</span></button>
              <button className="project-chat-archive" onClick={() => onArchiveThread(thread, true)} title="Archive chat" disabled={disabled}><Archive size={12} /></button>
            </div>)}
            {!projectThreads.length && <div className="project-chat-empty">No chats yet</div>}
          </div>}
        </div>;
      })}
      {!projects.length && <div className="recent-empty">Create a project to begin</div>}
    </div>
    <button className={showArchived ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchived((visible) => !visible)}><Archive size={13} /><span>Archived</span><small>{archivedThreads.length}</small></button>
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
