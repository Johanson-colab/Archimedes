export function workspaceName(
  workspace: ProjectWorkspace | null,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  if (!workspace) return t("Main workspace");
  if (workspace.name) return workspace.name;
  if (workspace.kind === "worktree") {
    return workspace.base_ref ? t("Worktree · {ref}", { ref: workspace.base_ref }) : t("Worktree");
  }
  if (workspace.kind === "sandbox") return t("Sandbox");
  return t("Main workspace");
}
