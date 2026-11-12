import { Box, GitBranch, Pencil, Trash } from "lucide-react";
import { MenuDivider, MenuItem } from "./Menu";
import { useUISettings } from "./i18n";

/** Shared by the sidebar context menu and the toolbar workspace picker. */
export default function WorkspaceMenuActions({ workspace, canWorktree, disabled, onRename, onDelete, onCreate, compact = false }: {
  workspace: ProjectWorkspace;
  canWorktree: boolean;
  disabled: boolean;
  onRename: () => void;
  onDelete: () => void;
  onCreate?: (kind: ProjectWorkspaceKind) => void;
  compact?: boolean;
}) {
  const { t } = useUISettings();
  if (compact) return <>
    <button className="workspace-option-action" onClick={onRename} disabled={disabled} title={t("Rename workspace")} aria-label={t("Rename workspace")}><Pencil size={13} /></button>
    <button className="workspace-option-action danger" onClick={onDelete} disabled={disabled || workspace.is_default} title={workspace.is_default ? t("The project workspace cannot be deleted.") : t("Delete workspace")} aria-label={t("Delete workspace")}><Trash size={13} /></button>
  </>;
  return <>
    <MenuItem icon={<Pencil size={16} />} onClick={onRename} disabled={disabled}>{t("Rename workspace")}</MenuItem>
    <MenuItem danger icon={<Trash size={16} />} onClick={onDelete} disabled={disabled || workspace.is_default} title={workspace.is_default ? t("The project workspace cannot be deleted.") : undefined}>{t("Delete workspace")}</MenuItem>
    {onCreate && <>
      <MenuDivider />
      {canWorktree && <MenuItem icon={<GitBranch size={16} />} onClick={() => onCreate("worktree")} disabled={disabled}>{t("New worktree")}</MenuItem>}
      <MenuItem icon={<Box size={16} />} onClick={() => onCreate("sandbox")} disabled={disabled}>{t("New sandbox")}</MenuItem>
    </>}
  </>;
}
