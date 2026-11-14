import { FolderOpen } from "lucide-react";
import { useUISettings } from "../i18n";
import { SettingsRow, SettingsSection } from "../SettingsPrimitives";
import ProjectMembersPanel from "../ProjectMembersPanel";

type WorkspaceSettingsHubProps = {
  view: string;
  workspace: string;
  workspaceReady: boolean;
  agentBusy: boolean;
  onChooseWorkspace: () => void;
  bridge: ResearchDeskBridge;
  activeProject: ResearchProject | null;
  activeThreadId?: string | null;
  onProjectsChanged?: () => Promise<void>;
};

export default function WorkspaceSettingsHub({
  view,
  workspace,
  workspaceReady,
  agentBusy,
  onChooseWorkspace,
  bridge,
  activeProject,
  activeThreadId,
  onProjectsChanged,
}: WorkspaceSettingsHubProps) {
  const { t } = useUISettings();
  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : "";
  return <div className="settings-sections">
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "folder"}>
      <SettingsSection title={t("Folder")}>
        <div className="settings-group">
          <SettingsRow
            stacked
            controlClassName="settings-workspace-control"
            title={<>{t("Current workspace")}</>}
            description={<>{workspaceName || t("Opening workspace")} · {workspaceReady ? t("Workspace connected") : t("Opening workspace")}</>}
          >
            <code className="settings-path">{workspace || "—"}</code>
            <button className="primary-button" onClick={onChooseWorkspace} disabled={agentBusy}><FolderOpen size={14} />{t("Change folder")}</button>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "members"}>
      {activeProject
        ? <ProjectMembersPanel bridge={bridge} project={activeProject} activeThreadId={activeThreadId} onProjectsChanged={onProjectsChanged} />
        : <div className="project-members-empty">{t("Select a project to manage members.")}</div>}
    </div>
  </div>;
}
