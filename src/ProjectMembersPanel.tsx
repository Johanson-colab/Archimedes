import { useEffect, useState } from "react";
import { Cloud, Download, LoaderCircle, Plus, RefreshCw, Share2, Trash2, UserPlus, Users } from "lucide-react";
import SharedRunsPanel from "./SharedRunsPanel";
import SharedNoteEditor from "./SharedNoteEditor";
import { useUISettings } from "./i18n";
import { useConfirm } from "./ConfirmDialog";

type ProjectMembersPanelProps = {
  bridge: ResearchDeskBridge;
  project: ResearchProject;
  activeThreadId?: string | null;
  onProjectsChanged?: () => Promise<void>;
};

const ROLE_OPTIONS: Array<{ id: ProjectMember["role"]; label: string }> = [
  { id: "viewer", label: "Viewer" },
  { id: "commenter", label: "Commenter" },
  { id: "editor", label: "Editor" },
  { id: "admin", label: "Admin" },
];

const ACTION_LABELS: Record<string, string> = {
  "project.member_added": "Member added",
  "project.member_role_changed": "Role changed",
  "project.member_removed": "Member removed",
  "project.cloud_linked": "Project shared",
  "thread.visibility_changed": "Thread visibility changed",
  "thread.snapshot_created": "Thread snapshot created",
  "library.created": "Library created",
  "library.updated": "Library updated",
  "library.deleted": "Library deleted",
  "review.saved": "Review saved",
  "presentation.saved": "Presentation saved",
  "comment.created": "Comment added",
  "comment.resolved": "Comment resolved",
  "comment.reopened": "Comment reopened",
  "comment.deleted": "Comment deleted",
};

export default function ProjectMembersPanel({ bridge, project, activeThreadId, onProjectsChanged }: ProjectMembersPanelProps) {
  const confirm = useConfirm();
  const { t } = useUISettings();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProjectMember["role"]>("commenter");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(project.cloud_project_id || null);
  const [cloudStatus, setCloudStatus] = useState<CollaborationStatus | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudRole, setCloudRole] = useState<ProjectMember["role"]>("commenter");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [threadBusy, setThreadBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudNotice, setCloudNotice] = useState("");

  async function refreshCloudProjects() {
    if (typeof bridge.listCloudProjects !== "function") return;
    try { setCloudProjects(await bridge.listCloudProjects()); }
    catch { setCloudProjects([]); }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextMembers, nextActivity] = await Promise.all([
        bridge.listProjectMembers(project.id),
        bridge.listAuditEvents(project.id, 40),
      ]);
      setMembers(nextMembers);
      setActivity(nextActivity);
      setCloudProjectId(project.cloud_project_id || null);
      if (typeof bridge.getCollaborationStatus === "function") {
        const status = await bridge.getCollaborationStatus();
        setCloudStatus(status);
        if (status.signedIn) await refreshCloudProjects();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [bridge, project.id]);

  function applyCloudResult(result: CloudProjectSyncResult, notice: string) {
    setMembers(result.members);
    setCloudProjectId(result.project.cloud_project_id || null);
    setCloudNotice(result.warnings?.length ? `${notice} ${result.warnings.join(" ")}` : notice);
    setCloudError("");
  }

  async function add() {
    const displayName = name.trim();
    if (!displayName || busy) return;
    setBusy(true);
    setError("");
    try {
      await bridge.addProjectMember({ projectId: project.id, userId: `usr_${crypto.randomUUID()}`, role, displayName });
      setName("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: ProjectMember, nextRole: ProjectMember["role"]) {
    setError("");
    try {
      if (member.source === "cloud" && cloudProjectId && typeof bridge.updateCloudProjectMember === "function") {
        applyCloudResult(await bridge.updateCloudProjectMember(project.id, member.user_id, nextRole), t("Cloud role updated."));
      } else {
        await bridge.updateProjectMemberRole(project.id, member.user_id, nextRole);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove(member: ProjectMember) {
    if (!(await confirm({ title: "Remove member?", description: `${member.display_name} will lose access to this project.`, confirmLabel: "Remove member", destructive: true }))) return;
    setError("");
    try {
      if (member.source === "cloud" && cloudProjectId && typeof bridge.removeCloudProjectMember === "function") {
        applyCloudResult(await bridge.removeCloudProjectMember(project.id, member.user_id), t("Cloud member removed."));
      } else {
        await bridge.removeProjectMember(project.id, member.user_id);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function publish() {
    if (cloudBusy || typeof bridge.publishProject !== "function") return;
    setCloudBusy(true); setCloudError(""); setCloudNotice("");
    try {
      applyCloudResult(await bridge.publishProject(project.id), t("Project shared with your cloud account."));
      await Promise.all([refreshCloudProjects(), onProjectsChanged?.()]);
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setCloudBusy(false); }
  }

  async function sync() {
    if (cloudBusy || typeof bridge.syncCloudProject !== "function") return;
    setCloudBusy(true); setCloudError(""); setCloudNotice("");
    try {
      applyCloudResult(await bridge.syncCloudProject(project.id), t("Cloud members synced."));
      await Promise.all([refreshCloudProjects(), onProjectsChanged?.()]);
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setCloudBusy(false); }
  }

  async function exportProject() {
    if (exportBusy || typeof bridge.exportProject !== "function") return;
    setExportBusy(true); setCloudError(""); setCloudNotice("");
    try {
      const bundle = await bridge.exportProject(project.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "project"}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCloudNotice(t("Project export downloaded."));
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setExportBusy(false); }
  }

  async function syncThreads() {
    if (threadBusy || typeof bridge.syncProjectThreads !== "function") return;
    setThreadBusy(true); setCloudError(""); setCloudNotice("");
    try {
      const result = await bridge.syncProjectThreads(project.id);
      setCloudNotice(result.warnings?.length ? result.warnings.join(" ") : t("Threads and comments synced."));
      await onProjectsChanged?.();
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setThreadBusy(false); }
  }

  async function addCloudMember() {
    const email = cloudEmail.trim();
    if (!email || cloudBusy || typeof bridge.addCloudProjectMember !== "function") return;
    setCloudBusy(true); setCloudError(""); setCloudNotice("");
    try {
      applyCloudResult(await bridge.addCloudProjectMember(project.id, email, cloudRole), t("Cloud member added."));
      setCloudEmail("");
      await Promise.all([refreshCloudProjects(), onProjectsChanged?.()]);
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setCloudBusy(false); }
  }

  async function importProject(cloudProject: CloudProject) {
    if (cloudBusy || typeof bridge.importCloudProject !== "function") return;
    setCloudBusy(true); setCloudError(""); setCloudNotice("");
    try {
      const result = await bridge.importCloudProject(cloudProject.id);
      setCloudNotice(t("Imported {name}. Select it in the project sidebar.", { name: cloudProject.name }));
      await Promise.all([refreshCloudProjects(), onProjectsChanged?.()]);
      setMembers(result.members);
    } catch (cause) {
      setCloudError(cause instanceof Error ? cause.message : String(cause));
    } finally { setCloudBusy(false); }
  }

  const unlinkedCloudProjects = cloudProjects.filter((candidate) => candidate.id !== cloudProjectId);

  return <div className="settings-sections project-members-panel">
    <section className="settings-section">
      <h3 className="settings-section-title"><Cloud size={15} />{t("Cloud sharing")}</h3>
      <div className="settings-group">
        {!cloudStatus?.signedIn ? <p className="settings-group-note">{t("Sign in from Account to share this project with collaborators.")}</p> : <>
          {cloudProjectId ? <>
            <div className="settings-row project-cloud-row">
              <div className="settings-row-copy">
                <span className="settings-row-title"><Share2 size={14} />{t("Shared project")}</span>
                <p className="settings-row-description"><code>{cloudProjectId.slice(0, 18)}…</code></p>
              </div>
              <div className="settings-row-control">
                <button className="secondary-button" disabled={cloudBusy} onClick={() => void sync()}><RefreshCw size={13} />{t("Sync members")}</button>
                <button className="secondary-button" disabled={threadBusy} onClick={() => void syncThreads()}><RefreshCw size={13} />{t("Sync threads")}</button>
                <button className="secondary-button" disabled={exportBusy} onClick={() => void exportProject()}><Download size={13} />{exportBusy ? t("Exporting…") : t("Export")}</button>
              </div>
            </div>
            <div className="settings-row project-member-add">
              <span className="project-member-avatar add"><UserPlus size={14} /></span>
              <div className="settings-row-control">
                <input className="settings-text-input" type="email" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} placeholder={t("Collaborator email")} onKeyDown={(event) => { if (event.key === "Enter") void addCloudMember(); }} />
                <select className="settings-select" value={cloudRole} onChange={(event) => setCloudRole(event.target.value as ProjectMember["role"])} aria-label={t("Role")}>
                  {ROLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
                </select>
                <button className="primary-button" disabled={!cloudEmail.trim() || cloudBusy || cloudRole === "owner"} onClick={() => void addCloudMember()}><Plus size={13} />{t("Invite")}</button>
              </div>
            </div>
          </> : <div className="settings-row project-cloud-row">
            <div className="settings-row-copy">
              <span className="settings-row-title"><Share2 size={14} />{t("Share this project")}</span>
              <p className="settings-row-description">{t("Create a cloud copy so collaborators can join this project.")}</p>
            </div>
            <div className="settings-row-control">
              <button className="primary-button" disabled={cloudBusy} onClick={() => void publish()}><Cloud size={13} />{t("Share")}</button>
            </div>
          </div>}
          {unlinkedCloudProjects.length > 0 && <div className="project-cloud-list">
            <p className="settings-group-note">{t("Shared projects available to your account")}</p>
            {unlinkedCloudProjects.map((candidate) => <div className="project-cloud-item" key={candidate.id}>
              <div><strong>{candidate.name}</strong><small>{candidate.role ? t(candidate.role) : ""}</small></div>
              <button className="secondary-button" disabled={cloudBusy} onClick={() => void importProject(candidate)}><Download size={13} />{t("Import")}</button>
            </div>)}
          </div>}
        </>}
        {cloudBusy && <div className="project-members-loading"><LoaderCircle size={14} />{t("Syncing…")}</div>}
        {cloudError && <p className="settings-group-note warning">{cloudError}</p>}
        {cloudNotice && <p className="settings-group-note">{cloudNotice}</p>}
      </div>
    </section>

    {cloudProjectId && <SharedNoteEditor bridge={bridge} projectId={project.id} />}
    {cloudProjectId && <SharedRunsPanel bridge={bridge} projectId={project.id} activeThreadId={activeThreadId} />}

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Project members")}</h3>
      <div className="settings-group">
        {loading && !members.length ? <div className="project-members-loading"><LoaderCircle size={14} />{t("Loading members…")}</div> : members.map((member) => <div className="settings-row project-member-row" key={member.user_id}>
          <span className="project-member-avatar" aria-hidden="true">{(member.display_name || "?").slice(0, 1).toUpperCase()}</span>
          <div className="settings-row-copy">
            <span className="settings-row-title">{member.display_name}{member.source === "cloud" && <Cloud size={12} />}</span>
            <p className="settings-row-description">{member.role === "owner" ? t("Project owner") : `${t("Member")} · ${member.user_id.slice(0, 16)}…`}</p>
          </div>
          <div className="settings-row-control">
            <select className="settings-select project-member-role" value={member.role} disabled={member.role === "owner"} onChange={(event) => void changeRole(member, event.target.value as ProjectMember["role"])} aria-label={t("Role for {name}", { name: member.display_name })}>
              {member.role === "owner" && <option value="owner">{t("Owner")}</option>}
              {ROLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
            </select>
            {member.role !== "owner" && <button className="icon-button danger" onClick={() => void remove(member)} title={t("Remove member")} aria-label={t("Remove member")}><Trash2 size={13} /></button>}
          </div>
        </div>)}
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Add a local member")}</h3>
      <div className="settings-group">
        <div className="settings-row project-member-add">
          <span className="project-member-avatar add"><UserPlus size={14} /></span>
          <div className="settings-row-control">
            <input className="settings-text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Display name")} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} />
            <select className="settings-select" value={role} onChange={(event) => setRole(event.target.value as ProjectMember["role"])} aria-label={t("Role")}>
              {ROLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
            </select>
            <button className="primary-button" disabled={!name.trim() || busy} onClick={() => void add()}><Plus size={13} />{t("Add")}</button>
          </div>
        </div>
        <p className="settings-group-note">{t("Local members stay on this device. Invite signed-in collaborators above to share through the cloud.")}</p>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Project activity")}</h3>
      <div className="settings-group project-activity">
        {activity.length ? activity.map((event) => <div className="project-activity-row" key={event.id}>
          <span className="project-activity-dot" />
          <div><strong>{t(ACTION_LABELS[event.action] || event.action)}</strong><small>{new Date(event.created_at).toLocaleString()}</small></div>
        </div>) : <div className="project-activity-empty"><Users size={16} /><span>{t("No project activity yet.")}</span></div>}
      </div>
    </section>
    {error && <p className="settings-group-note warning">{error}</p>}
  </div>;
}
