/** The selected task is one identity, including its immutable execution folder. */
export type TaskSelection = {
  dataRoot: string;
  projectId: string | null;
  workspaceId: string | null;
  threadId: string | null;
  executionRoot: string;
};
type Project = { id: string; workspace_path: string | null };
type Workspace = { id: string; project_id: string; root: string; is_default: boolean };
type Thread = { id: string; project_id: string; workspace_id?: string | null; workspace_path: string | null };

export function newTaskSelection(dataRoot: string, project: Project | null, workspaces: Workspace[], workspaceId?: string | null): TaskSelection {
  const own = workspaces.filter((entry) => entry.project_id === project?.id);
  const selected = own.find((entry) => entry.id === workspaceId) ?? own.find((entry) => entry.is_default) ?? own[0];
  return { dataRoot, projectId: project?.id ?? null, workspaceId: selected?.id ?? null, threadId: null, executionRoot: selected?.root || project?.workspace_path || dataRoot };
}

export function threadTaskSelection(dataRoot: string, thread: Thread, workspaces: Workspace[]): TaskSelection {
  const selected = thread.workspace_id ? workspaces.find((entry) => entry.id === thread.workspace_id)
    : workspaces.find((entry) => entry.project_id === thread.project_id && entry.is_default)
      ?? workspaces.find((entry) => entry.project_id === thread.project_id);
  if (selected && selected.project_id !== thread.project_id) throw new Error("This session belongs to a different project workspace.");
  if (!thread.workspace_path && !selected?.root) throw new Error("This session has no local execution folder. Open its project workspace first.");
  // Existing sessions retain the folder in which they were created, even if a
  // project's default folder has since changed. These paths come from main.
  return { dataRoot, projectId: thread.project_id, workspaceId: thread.workspace_id ?? selected?.id ?? null, threadId: thread.id, executionRoot: thread.workspace_path || selected!.root };
}

export function taskDraftKey(selection: TaskSelection): string {
  return selection.threadId ? `thread:${JSON.stringify([selection.dataRoot, selection.threadId])}`
    : `new:${JSON.stringify([selection.dataRoot, selection.projectId, selection.workspaceId, selection.executionRoot])}`;
}

export function analysisOwnerKey(selection: TaskSelection): string {
  return JSON.stringify([selection.dataRoot, selection.projectId, selection.workspaceId, selection.executionRoot]);
}
