import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useUISettings } from "./i18n";

type ProjectMembersPanelProps = {
  bridge: ResearchDeskBridge;
  project: ResearchProject;
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

export default function ProjectMembersPanel({ bridge, project }: ProjectMembersPanelProps) {
  const { t } = useUISettings();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProjectMember["role"]>("commenter");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [bridge, project.id]);

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
      await bridge.updateProjectMemberRole(project.id, member.user_id, nextRole);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove(member: ProjectMember) {
    if (!window.confirm(`Remove ${member.display_name} from this project?`)) return;
    setError("");
    try {
      await bridge.removeProjectMember(project.id, member.user_id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <div className="settings-sections project-members-panel">
    <section className="settings-section">
      <h3 className="settings-section-title">{t("Project members")}</h3>
      <div className="settings-group">
        {loading && !members.length ? <div className="project-members-loading"><LoaderCircle size={14} />{t("Loading members…")}</div> : members.map((member) => <div className="settings-row project-member-row" key={member.user_id}>
          <span className="project-member-avatar" aria-hidden="true">{(member.display_name || "?").slice(0, 1).toUpperCase()}</span>
          <div className="settings-row-copy">
            <span className="settings-row-title">{member.display_name}</span>
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
        <p className="settings-group-note">{t("Local membership only. Cloud invites, presence, and email delivery arrive with the collaboration service.")}</p>
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
