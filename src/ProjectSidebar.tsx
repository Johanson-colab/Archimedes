import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, FolderOpen, MoreVertical, Pencil, Plus, Trash, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { Dialog } from "./Dialog";
import { MenuDivider, MenuItem, MenuSurface } from "./Menu";
import { workspaceName } from "./workspace-name";

export default function ProjectSidebar({ projects, archivedProjects, workspaces, activeProjectId, activeWorkspaceId, disabled, onNewProject, onNewWorkspace, onRenameProject, onArchiveProject, onRemoveProject, onChangeProjectWorkspace, onOpenWorkspace, filterError }: {
  projects: ResearchProject[];
  archivedProjects: ResearchProject[];
  workspaces: ProjectWorkspace[];
  activeProjectId: string | null;
  activeWorkspaceId: string | null;
  disabled: boolean;
  onNewProject: () => void;
  onNewWorkspace: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onArchiveProject: (project: ResearchProject, archived: boolean) => void;
  onRemoveProject: (project: ResearchProject) => void;
  onChangeProjectWorkspace: (project: ResearchProject) => void;
  onOpenWorkspace: (workspace: ProjectWorkspace) => void;
  filterError?: string;
}) {
  const { t } = useUISettings();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [projectMenu, setProjectMenu] = useState<{ project: ResearchProject } | null>(null);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
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

  return <section className="sidebar-group projects-group work-group">
    <div className="work-heading">
      <span>{t("Projects")}</span>
      <div className="work-heading-actions">
        <button className="work-new-project" onClick={onNewProject} title={t("New project")} aria-label={t("New project")} disabled={disabled}>
          <Plus size={15} />
        </button>
      </div>
    </div>

    <div className="project-tree work-tree">
      {projects.map((project) => {
          const projectWorkspaces = workspaces.filter((workspace) => workspace.project_id === project.id);
          const isExpanded = expanded.has(project.id);
          const menuOpen = projectMenu?.project.id === project.id;
          return <div className="project-node" key={project.id}>
            <div className="project-tree-row">
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
                : <button className="project-select" onClick={() => toggleProject(project.id)} title={`${project.name}${project.workspace_path ? ` · ${project.workspace_path}` : ""}`} aria-expanded={isExpanded}><span className="project-name">{project.name}</span>{projectWorkspaces.length > 0 && <small>{projectWorkspaces.length}</small>}</button>}
              <span className="project-row-actions">
                <button onClick={() => onNewWorkspace(project.id)} title={t("New workspace")} aria-label={t("New workspace")} disabled={disabled}><Plus size={13} /></button>
                <button className={menuOpen ? "project-more-button active" : "project-more-button"} onClick={(event) => { projectAnchorRef.current = event.currentTarget; setProjectMenu((current) => current?.project.id === project.id ? null : { project }); }} title={t("More project actions")} aria-label={t("More project actions")} aria-haspopup="menu" aria-expanded={menuOpen} disabled={disabled}><MoreVertical size={14} /></button>
              </span>
              <MenuSurface open={menuOpen} onClose={() => setProjectMenu(null)} anchorRef={projectAnchorRef} placement="bottom-end" width={300} className="project-more-menu" ariaLabel={t("Project actions")}>
                <MenuItem icon={<FolderOpen size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onChangeProjectWorkspace(project); }} disabled={disabled}>{t("Change project folder")}</MenuItem>
                <MenuItem icon={<Pencil size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); beginRename(project); }} disabled={disabled}>{t("Rename")}</MenuItem>
                <MenuItem icon={<Archive size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onArchiveProject(project, true); }} disabled={disabled}>{t("Archive")}</MenuItem>
                <MenuDivider />
                <MenuItem danger icon={<Trash size={18} strokeWidth={1.7} />} onClick={() => { setProjectMenu(null); onRemoveProject(project); }} disabled={disabled}>{t("Remove")}</MenuItem>
              </MenuSurface>
            </div>
            {isExpanded && <div className="project-chat-list">
              {projectWorkspaces.map((workspace) => <div className={activeWorkspaceId === workspace.id ? "project-chat-row active" : "project-chat-row"} key={workspace.id}>
                <button className="project-chat-open" onClick={() => onOpenWorkspace(workspace)} title={workspace.root}>
                  <span className="project-chat-title">{workspaceName(workspace, t)}</span>
                  {workspace.session_count > 0 && <span className="project-chat-count">{workspace.session_count}</span>}
                </button>
              </div>)}
              {!projectWorkspaces.length && <div className="project-chat-empty">{t("No workspaces yet")}</div>}
            </div>}
          </div>;
      })}
      {!projects.length && <div className="work-empty">{t("No projects yet")}</div>}
      {archivedProjects.length > 0 && <>
        <button className={showArchivedProjects ? "archived-toggle active" : "archived-toggle"} onClick={() => setShowArchivedProjects((visible) => !visible)} aria-expanded={showArchivedProjects}>
          <Archive size={13} /><span>{t("Archived projects")}</span><small>{archivedProjects.length}</small>
        </button>
        {showArchivedProjects && <div className="archived-project-list">
          {archivedProjects.map((project) => <div className="archived-project-row" key={project.id}>
            <span title={project.workspace_path || project.name}><strong>{project.name}</strong>{project.chat_count > 0 && <small>{project.chat_count}</small>}</span>
            <div><button onClick={() => onArchiveProject(project, false)} title={t("Restore {name}", { name: project.name })} aria-label={t("Restore {name}", { name: project.name })} disabled={disabled}><ArchiveRestore size={12} /></button><button onClick={() => onRemoveProject(project)} title={t("Remove {name}", { name: project.name })} aria-label={t("Remove {name}", { name: project.name })} disabled={disabled}><Trash size={12} /></button></div>
          </div>)}
        </div>}
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
  return <Dialog open onClose={onClose} size="compact" className="dialog-ref project-create-modal" overlayClassName="modal-backdrop dialog-ref-backdrop" ariaLabelledBy="new-project-title">
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
  return <Dialog open onClose={onClose} size="compact" className="workspace-modal project-remove-modal" ariaLabel={t("Remove {name}", { name: project.name })}>
    <header className="modal-header"><div><h2>{t("Remove project?")}</h2></div><button className="app-dialog-close" onClick={onClose} aria-label={t("Close")}><X size={16} /></button></header>
    <p>{t("{name} and its {chats}, research turns, and recorded Agent actions will be permanently deleted. Files in the project folder are not deleted.", { name: project.name, chats: chatLabel })}</p>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="danger-button" onClick={onRemove}><Trash size={14} />{t("Remove project")}</button></div>
  </Dialog>;
}


