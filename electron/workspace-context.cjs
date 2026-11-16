const fs = require("node:fs");
const path = require("node:path");

function canonicalWorkspace(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A workspace folder is required.");
  const root = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(root).isDirectory()) throw new Error("The workspace is not a folder.");
  return root;
}

/** A window selects the data store; project/session records select execution. */
function resolveResearchContext(store, input = {}) {
  if (input.threadId && input.basedOnResultId) throw new Error("Choose one source conversation or project result.");
  const result = input.basedOnResultId ? store.getProjectResultRecord(input.basedOnResultId) : null;
  if (input.basedOnResultId && !result) throw new Error("The source project result does not exist in this data workspace.");
  const thread = input.threadId ? store.getResearchThread(input.threadId) : null;
  if (thread?.archived_at) throw new Error("Restore this conversation before continuing it.");
  if (thread && input.projectId && input.projectId !== thread.project_id) throw new Error("The conversation does not belong to the selected project.");
  if (result && input.projectId && input.projectId !== result.projectId) throw new Error("The source result does not belong to the selected project.");
  const projectId = thread?.project_id || result?.projectId || input.projectId;
  const project = projectId ? store.getResearchProject(projectId) : store.defaultResearchProject();
  if (!project || project.archived_at || !store.canAccessProject(project.id, "editor")) throw new Error("You do not have access to run a conversation in this project.");
  if (thread?.workspace_id && input.workspaceId && thread.workspace_id !== input.workspaceId) throw new Error("The conversation does not belong to the selected project workspace.");
  if (result && input.workspaceId && input.workspaceId !== result.workspaceId) throw new Error("The source result does not belong to the selected project workspace.");
  const workspaceId = thread?.workspace_id || result?.workspaceId || input.workspaceId;
  const workspace = workspaceId ? store.getProjectWorkspace(workspaceId) : store.defaultProjectWorkspace(project.id);
  if (!workspace || workspace.project_id !== project.id) throw new Error("That workspace does not belong to this project.");
  const executionRoot = canonicalWorkspace(thread?.workspace_path || result?.executionRoot || workspace.root || project.workspace_path || store.workspace);
  if (input.workspace && canonicalWorkspace(input.workspace) !== executionRoot) throw new Error("The execution folder does not match this conversation or project workspace.");
  const resolvedThread = thread && (!thread.workspace_path || !thread.workspace_id)
    ? store.bindResearchThreadWorkspace(thread.id, workspace.id, executionRoot)
    : thread;
  return { dataRoot: store.workspace, projectId: project.id, workspaceId: workspace.id, workspace: executionRoot, thread: resolvedThread };
}

/** Each invocation retains the sender's store even after the window switches. */
function createWorkspaceIpc({ ipcMain, store, workspaceForEvent }) {
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        const root = workspaceForEvent(event, channel, args);
        if (!root) return handler(event, ...args);
        const selected = store.createWorkspaceStore(root);
        const captured = selected.captureStore();
        try {
          const result = selected.run(() => handler(event, ...args));
          if (result && typeof result.then === "function") return Promise.resolve(result).finally(captured.release);
          captured.release();
          return result;
        } catch (error) { captured.release(); throw error; }
      });
    },
    on: (...args) => ipcMain.on(...args),
  };
}

module.exports = { canonicalWorkspace, createWorkspaceIpc, resolveResearchContext };
