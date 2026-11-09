import { useEffect, useState } from "react";
import { Folder, GitBranch, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { useUISettings } from "./i18n";

type WorkspaceDialogProps = {
  open: boolean;
  mode: "create" | "rename";
  projectName?: string;
  workspace?: ProjectWorkspace | null;
  suggestedName: string;
  initialKind: ProjectWorkspaceKind;
  canWorktree: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: { name: string; kind: ProjectWorkspaceKind }) => void;
};

export default function WorkspaceDialog({
  open,
  mode,
  projectName,
  workspace,
  suggestedName,
  initialKind,
  canWorktree,
  busy,
  error,
  onClose,
  onSubmit,
}: WorkspaceDialogProps) {
  const { t } = useUISettings();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectWorkspaceKind>("sandbox");

  useEffect(() => {
    if (!open) return;
    setName(mode === "rename" ? workspace?.name || t("Main workspace") : "");
    setKind(initialKind === "worktree" && canWorktree ? "worktree" : "sandbox");
  }, [canWorktree, initialKind, mode, open, t, workspace?.name]);

  if (!open) return null;

  function submit() {
    if (busy) return;
    onSubmit({ name: name.trim(), kind });
  }

  return <Dialog open onClose={onClose} size="compact" className="dialog-ref workspace-name-dialog" overlayClassName="modal-backdrop dialog-ref-backdrop" ariaLabelledBy="workspace-name-title">
    <header className="dialog-ref-header">
      <div>
        <h2 id="workspace-name-title">{mode === "create" ? t("New workspace") : t("Rename workspace")}</h2>
        <p>{mode === "create"
          ? t("Name it, or leave blank to use the next studio name.")
          : t("Only the name changes. The folder and its sessions stay where they are.")}</p>
      </div>
      <button className="dialog-ref-close" onClick={onClose} aria-label={t("Close")} type="button"><X size={18} /></button>
    </header>
    <div className="dialog-ref-body">
      {mode === "create" && <div className="workspace-kind-options" role="group" aria-label={t("Workspace type")}>
        <button type="button" className={kind === "sandbox" ? "active" : ""} onClick={() => setKind("sandbox")} aria-pressed={kind === "sandbox"}>
          <Folder size={15} /><span><strong>{t("Sandbox")}</strong><small>{t("A copied, isolated workbench.")}</small></span>
        </button>
        {canWorktree && <button type="button" className={kind === "worktree" ? "active" : ""} onClick={() => setKind("worktree")} aria-pressed={kind === "worktree"}>
          <GitBranch size={15} /><span><strong>{t("Worktree")}</strong><small>{t("A Git worktree on a new branch.")}</small></span>
        </button>}
      </div>}
      <label className="dialog-ref-field">
        <span>{t("Workspace name")}</span>
        <input
          autoFocus
          value={name}
          maxLength={80}
          placeholder={mode === "create" ? (suggestedName ? t("Leave blank for {name}", { name: suggestedName }) : t("Use the next studio name")) : t("Workspace name")}
          aria-label={t("Workspace name")}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        {mode === "rename" && projectName && <small>{t("Project: {name}", { name: projectName })}</small>}
      </label>
      {error && <p className="project-rename-error" role="alert">{error}</p>}
    </div>
    <footer className="dialog-ref-footer">
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("Cancel")}</button>
      <button type="button" className="primary-button" onClick={submit} disabled={busy || (mode === "rename" && !name.trim())}>
        {busy ? t("Saving…") : mode === "create" ? t("Create workspace") : t("Save name")}
      </button>
    </footer>
  </Dialog>;
}
