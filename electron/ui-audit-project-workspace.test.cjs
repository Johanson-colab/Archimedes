const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src", "ProjectSidebar.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "electron", "store.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const agent = fs.readFileSync(path.join(root, "electron", "agent.cjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const types = fs.readFileSync(path.join(root, "src", "vite-env.d.ts"), "utf8");

test("projects persist a bound folder and sessions snapshot their inherited folder", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS research_projects[\s\S]*workspace_path TEXT/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS research_threads[\s\S]*workspace_path TEXT/);
  assert.match(store, /function setResearchProjectWorkspace/);
  assert.match(store, /normalizeWorkspacePath/);
  assert.match(store, /A session inherits its project's folder by default/);
  assert.match(store, /workspace_path: resolvedWorkspace/);
});

test("agent and review runs separate the data workspace from the execution folder", () => {
  assert.match(main, /const dataWorkspace = workspaceForWindow\(BrowserWindow\.fromWebContents\(event\.sender\)\) \|\| workspace;/);
  assert.match(main, /store\.openWorkspace\(dataWorkspace\);/);
  assert.match(agent, /createResearchThread\(\{ prompt, mode, projectId, workspacePath: workspace, visibility, kind: origin === "paper" \? "paper" : "research", title \}\)/);
  assert.match(main, /ipcMain\.handle\("research-project:set-workspace"/);
  assert.match(preload, /setResearchProjectWorkspace: \(id, workspacePath\)/);
  assert.match(types, /setResearchProjectWorkspace: \(id: string, workspacePath: string\)/);
});

test("live running and review states refresh without reopening the data workspace", () => {
  assert.match(main, /ipcMain\.handle\("research:snapshot", \(\) => store\.getSnapshot\(\)\)/);
  assert.match(preload, /getResearchSnapshot: \(\) => ipcRenderer\.invoke\("research:snapshot"\)/);
  assert.match(app, /getResearchSnapshot\?\.\(\)/);
  assert.match(app, /pending_actions: \(thread\.pending_actions \?\? 0\) \+ 1/);
  assert.match(app, /clearThreadPendingAction\(\);/);
});

test("the renderer resolves session → project → primary workspace for tools", () => {
  assert.match(app, /const executionWorkspace = activeThread\?\.workspace_path \|\| activeProject\?\.workspace_path \|\| workspace;/);
  assert.match(app, /runAgent\(\{ prompt: requestPrompt, workspace: executionWorkspace/);
  assert.match(app, /runTerminal\(\{ command: trimmedCommand, cwd: executionWorkspace/);
  assert.match(app, /writeWorkspaceFile\(executionWorkspace/);
  assert.match(app, /workspace=\{executionWorkspace\}/);
  assert.match(app, /desktopBridge\.watchWorkspace\?\.\(executionWorkspace\)/);
});

test("new projects choose a folder and existing projects can rebind it", () => {
  assert.match(sidebar, /Project folder/);
  assert.match(sidebar, /onChooseFolder/);
  assert.match(sidebar, /onChangeProjectWorkspace/);
  assert.match(app, /newProjectWorkspace/);
  assert.match(app, /createResearchProject\(\{ name, workspacePath: newProjectWorkspace \|\| workspace \}\)/);
  assert.match(app, /setResearchProjectWorkspace\(project\.id, selected\)/);
});

test("the composer surfaces the effective working folder", () => {
  assert.match(app, /workspace=\{executionWorkspace\}\s+projectId=\{activeProjectId\}\s+threadVisibility=\{threadVisibility\}\s+onThreadVisibility=/);
  assert.match(app, /className="composer-context"[\s\S]*?onClick=\{onOpenWorkspaceSettings\}/);
  assert.match(app, /title=\{workspace \? `\$\{t\("Workspace"\)\}: \$\{workspace\}`/);
});

test("folder previews and watches do not move the window's primary workspace", () => {
  assert.match(main, /function createPreviewToken\(senderId, workspace\)/);
  assert.match(main, /const token = createPreviewToken\(event\.sender\.id, workspace\);/);
  assert.match(main, /ipcMain\.handle\("workspace:watch"/);
  assert.match(preload, /watchWorkspace: \(workspace\) => ipcRenderer\.invoke\("workspace:watch", workspace\)/);
  assert.match(preload, /revealWorkspace: \(workspace\) => ipcRenderer\.invoke\("workspace:reveal", workspace\)/);
});
