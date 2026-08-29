const { app, BrowserWindow, Menu, ipcMain, dialog, net, protocol } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");
const agent = require("./agent.cjs");
const { loadLocalAgentEnvironment } = require("./config.cjs");
const modelConfig = require("./model-config.cjs");
const { discoverDailyPapers, normalizeDailyOptions, searchAcademicPapers } = require("./literature.cjs");
const skillCatalog = require("./skill-catalog.cjs");
const store = require("./store.cjs");
const workspaceFiles = require("./workspace-files.cjs");

const commandSessions = new Map();
const interactiveTerminalSessions = new Map();
const windowWorkspaces = new Map();
const windowPreviewTokens = new Map();
const previewTokenWorkspaces = new Map();
const workspaceWatchers = new Map();
const allowedContextPaths = new Set();

app.setName("Archimedes");
protocol.registerSchemesAsPrivileged([{
  scheme: "archimedes-file",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

function cleanTerminalEnvironment() {
  return Object.fromEntries(Object.entries({
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "Archimedes",
    TERM_PROGRAM_VERSION: app.getVersion(),
  }).filter(([, value]) => typeof value === "string"));
}

function getInteractiveTerminal(event, sessionId) {
  const session = interactiveTerminalSessions.get(sessionId);
  if (!session || session.senderId !== event.sender.id) throw new Error("Terminal session not found.");
  return session;
}

function closeInteractiveTerminal(sessionId) {
  const session = interactiveTerminalSessions.get(sessionId);
  if (!session) return;
  interactiveTerminalSessions.delete(sessionId);
  try {
    session.process.kill();
  } catch {
    // The shell may already have exited.
  }
}

function closeAllTerminals() {
  for (const sessionId of interactiveTerminalSessions.keys()) closeInteractiveTerminal(sessionId);
  for (const session of commandSessions.values()) session.process.kill("SIGTERM");
  commandSessions.clear();
}

function closeWindowTerminals(senderId) {
  for (const [sessionId, session] of interactiveTerminalSessions) {
    if (session.senderId === senderId) closeInteractiveTerminal(sessionId);
  }
  for (const [sessionId, session] of commandSessions) {
    if (session.senderId !== senderId) continue;
    session.process.kill("SIGTERM");
    commandSessions.delete(sessionId);
  }
}

function stopWorkspaceWatcher(senderId) {
  const current = workspaceWatchers.get(senderId);
  if (!current) return;
  if (current.timer) clearTimeout(current.timer);
  current.watcher.close();
  workspaceWatchers.delete(senderId);
}

function setWindowWorkspace(senderId, workspace) {
  windowWorkspaces.set(senderId, workspace);
  let token = windowPreviewTokens.get(senderId);
  if (!token) {
    token = randomUUID();
    windowPreviewTokens.set(senderId, token);
  }
  previewTokenWorkspaces.set(token, workspace);
  return token;
}

function watchWorkspace(sender, workspace) {
  stopWorkspaceWatcher(sender.id);
  try {
    const state = { watcher: null, timer: null };
    state.watcher = fs.watch(workspace, { recursive: true }, (_eventType, filename) => {
      const changedPath = String(filename || "").replaceAll("\\", "/");
      if (changedPath.split("/").some((part) => [".archimedes", ".git", "node_modules", "dist", "build", ".next"].includes(part))) return;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        if (!sender.isDestroyed()) sender.send("workspace:files-changed", { path: changedPath });
      }, 180);
    });
    workspaceWatchers.set(sender.id, state);
  } catch {
    // Recursive watching is not available on every platform; manual refresh remains available.
  }
}

function createWindow(workspace) {
  const browserWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f6f7f5",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
    },
  });

  const senderId = browserWindow.webContents.id;
  if (workspace) setWindowWorkspace(senderId, resolveWorkspace(workspace));

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    browserWindow.loadURL(devServerUrl);
  } else {
    browserWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  browserWindow.on("closed", () => {
    closeWindowTerminals(senderId);
    stopWorkspaceWatcher(senderId);
    const token = windowPreviewTokens.get(senderId);
    if (token) previewTokenWorkspaces.delete(token);
    windowPreviewTokens.delete(senderId);
    windowWorkspaces.delete(senderId);
  });

  return browserWindow;
}

function resolveWorkspace(value) {
  const requested = typeof value === "string" ? value.trim() : "";
  const expanded = requested === "~" || requested.startsWith("~/")
    ? path.join(app.getPath("home"), requested.slice(2))
    : requested;
  return expanded && fs.existsSync(expanded) && fs.statSync(expanded).isDirectory()
    ? expanded
    : app.getPath("home");
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function workspaceForWindow(browserWindow) {
  return browserWindow ? windowWorkspaces.get(browserWindow.webContents.id) : undefined;
}

async function chooseFolderForWindow(browserWindow, title = "Open Folder") {
  const options = {
    properties: ["openDirectory"],
    title,
    defaultPath: workspaceForWindow(browserWindow) ?? app.getPath("home"),
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : resolveWorkspace(result.filePaths[0]);
}

async function openFolderFromMenu() {
  const browserWindow = focusedWindow();
  if (!browserWindow) return;
  const workspace = await chooseFolderForWindow(browserWindow);
  if (!workspace || browserWindow.isDestroyed()) return;
  setWindowWorkspace(browserWindow.webContents.id, workspace);
  browserWindow.webContents.send("menu:open-folder", workspace);
}

function installApplicationMenu() {
  const template = [];
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => createWindow(workspaceForWindow(focusedWindow())),
        },
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => focusedWindow()?.webContents.send("menu:new-chat"),
        },
        {
          label: "Open Folder...",
          accelerator: "CmdOrCtrl+O",
          click: () => void openFolderFromMenu(),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function contextItem(type, resourcePath, detail = "") {
  const resolved = path.resolve(resourcePath);
  allowedContextPaths.add(resolved);
  return { id: `${type}:${resolved}`, type, name: path.basename(resolved), path: resolved, detail };
}

function installedSkills(workspace) {
  const roots = [
    path.join(workspace, ".agents", "skills"),
    path.join(workspace, ".codex", "skills"),
    path.join(app.getPath("home"), ".agents", "skills"),
    path.join(app.getPath("home"), ".codex", "skills"),
  ];
  const seen = new Set();
  const results = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith(".")) continue;
      const skillPath = path.join(root, entry.name);
      if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) continue;
      const key = fs.realpathSync(skillPath);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(contextItem("skill", skillPath, path.relative(workspace, skillPath).startsWith("..") ? "Installed skill" : "Workspace skill"));
    }
  }
  for (const skill of skillCatalog.listSkills(workspace)) {
    const key = fs.realpathSync(skill.path);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(contextItem("skill", skill.path, `${skill.collectionName} · ${skill.category}`));
  }
  return results.sort((left, right) => left.name.localeCompare(right.name)).slice(0, 400);
}

function installedPlugins() {
  const cacheRoot = path.join(app.getPath("home"), ".codex", "plugins", "cache");
  if (!fs.existsSync(cacheRoot)) return [];
  const results = [];
  for (const provider of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!provider.isDirectory() || provider.name.startsWith(".")) continue;
    const providerPath = path.join(cacheRoot, provider.name);
    for (const plugin of fs.readdirSync(providerPath, { withFileTypes: true })) {
      if (!plugin.isDirectory() || plugin.name.startsWith(".")) continue;
      const pluginPath = path.join(providerPath, plugin.name);
      const versions = fs.readdirSync(pluginPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      const resolved = versions.length ? path.join(pluginPath, versions.at(-1)) : pluginPath;
      results.push(contextItem("plugin", resolved, provider.name.replace(/^openai-/, "")));
    }
  }
  return results.sort((left, right) => left.name.localeCompare(right.name)).slice(0, 80);
}

function sanitizeAgentContext(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.name !== "string") return [];
    if (item.type === "paper") {
      const paper = item.paper;
      if (!paper || typeof paper.title !== "string") return [];
      return [{
        id: item.id.slice(0, 500), type: "paper", name: item.name.slice(0, 1000),
        detail: String(item.detail || "").slice(0, 2000),
        paper: {
          title: paper.title.slice(0, 1000), authors: Array.isArray(paper.authors) ? paper.authors.slice(0, 100).map((author) => String(author).slice(0, 300)) : [],
          year: Number.isInteger(paper.year) ? paper.year : null, abstract: String(paper.abstract || "").slice(0, 100_000),
          url: String(paper.url || "").slice(0, 3000), pdfUrl: String(paper.pdfUrl || "").slice(0, 3000),
        },
      }];
    }
    if (!["file", "folder", "plugin", "skill"].includes(item.type) || typeof item.path !== "string") return [];
    const resolved = path.resolve(item.path);
    if (!allowedContextPaths.has(resolved) || !fs.existsSync(resolved)) return [];
    const stats = fs.statSync(resolved);
    if (item.type === "file" && !stats.isFile()) return [];
    if (item.type !== "file" && !stats.isDirectory()) return [];
    return [{ id: `${item.type}:${resolved}`, type: item.type, name: path.basename(resolved), path: resolved, detail: String(item.detail || "").slice(0, 2000) }];
  });
}

app.whenReady().then(() => {
  loadLocalAgentEnvironment();
  modelConfig.initializeModelConfig(app.getPath("userData"));
  installApplicationMenu();
  protocol.handle("archimedes-file", (request) => {
    try {
      const url = new URL(request.url);
      const workspace = previewTokenWorkspaces.get(url.hostname);
      if (!workspace) return new Response("Preview token expired.", { status: 403 });
      const relative = decodeURIComponent(url.pathname.slice(1));
      const target = workspaceFiles.workspacePath(workspace, relative);
      if (!fs.statSync(target).isFile()) return new Response("File not found.", { status: 404 });
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response("File preview unavailable.", { status: 404 });
    }
  });

  ipcMain.handle("window:initial-workspace", (event) => {
    return windowWorkspaces.get(event.sender.id) ?? null;
  });

  ipcMain.handle("workspace:choose", async (event) => {
    return chooseFolderForWindow(BrowserWindow.fromWebContents(event.sender), "Choose a research workspace");
  });

  ipcMain.handle("context:choose-paths", async (event, input = {}) => {
    const kind = input.kind === "folder" ? "folder" : "file";
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: kind === "folder" ? "Add a folder to Archimedes context" : "Add files to Archimedes context",
      defaultPath: resolveWorkspace(input.workspace),
      properties: kind === "folder" ? ["openDirectory", "multiSelections"] : ["openFile", "multiSelections"],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    return result.filePaths.map((selectedPath) => contextItem(kind, selectedPath, path.dirname(selectedPath)));
  });

  ipcMain.handle("context:list-resources", (_event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    return input.kind === "plugin" ? installedPlugins() : installedSkills(workspace);
  });

  ipcMain.handle("skills:list-collections", (_event, input = {}) => {
    return skillCatalog.listSkillCollections(resolveWorkspace(input.workspace));
  });

  ipcMain.handle("skills:list", (_event, input = {}) => {
    const skills = skillCatalog.listSkills(resolveWorkspace(input.workspace), input.collectionId);
    for (const skill of skills) allowedContextPaths.add(path.resolve(skill.path));
    return skills;
  });

  ipcMain.handle("skills:read", (_event, input = {}) => {
    const skill = skillCatalog.readSkill(resolveWorkspace(input.workspace), input.skillId);
    allowedContextPaths.add(path.resolve(skill.path));
    return skill;
  });

  ipcMain.handle("workspace:open", (event, requestedWorkspace) => {
    const workspace = resolveWorkspace(requestedWorkspace);
    setWindowWorkspace(event.sender.id, workspace);
    watchWorkspace(event.sender, workspace);
    return store.openWorkspace(workspace);
  });

  ipcMain.handle("workspace:list-files", (_event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    return workspaceFiles.listWorkspaceDirectory(workspace, input.directory);
  });

  ipcMain.handle("workspace:read-file", (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const file = workspaceFiles.readWorkspaceFile(workspace, input.path);
    if (file.kind === "pdf" || file.kind === "image") {
      const token = setWindowWorkspace(event.sender.id, workspace);
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      return { ...file, previewUrl: `archimedes-file://${token}/${encodedPath}` };
    }
    return file;
  });

  ipcMain.handle("workspace:write-file", (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const file = workspaceFiles.writeWorkspaceTextFile(workspace, input.path, input.content);
    if (!event.sender.isDestroyed()) event.sender.send("workspace:files-changed", { path: file.path });
    return file;
  });

  ipcMain.handle("research-thread:get", (_event, input = {}) => {
    if (typeof input.threadId !== "string") throw new Error("A research thread ID is required.");
    const workspace = resolveWorkspace(input.workspace);
    store.openWorkspace(workspace);
    return store.getResearchThread(input.threadId);
  });

  ipcMain.handle("research-project:create", (_event, input = {}) => {
    return store.createResearchProject(input);
  });

  ipcMain.handle("research-project:rename", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.renameResearchProject(input.id, input.name);
  });

  ipcMain.handle("research-project:archive", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.archiveResearchProject(input.id, input.archived !== false);
  });

  ipcMain.handle("research-thread:archive", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research thread ID is required.");
    return store.archiveResearchThread(input.id, input.archived !== false);
  });

  ipcMain.handle("model-config:get", () => modelConfig.getPublicModelConfig());

  ipcMain.handle("model-config:list-models", (_event, input = {}) => modelConfig.listProviderModels(input));

  ipcMain.handle("model-config:save", (_event, input = {}) => modelConfig.saveModelConfig(input));

  ipcMain.handle("model-config:test", (_event, input = {}) => modelConfig.testModelConfig(input));

  ipcMain.handle("library:list", () => store.listLibraries());

  ipcMain.handle("library:create", (_event, input) => {
    if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.length > 120) {
      throw new Error("A library name of at most 120 characters is required.");
    }
    return store.createLibrary(input);
  });

  ipcMain.handle("library:update", (_event, { id, patch }) => {
    if (typeof id !== "string" || !patch || typeof patch !== "object") throw new Error("A library and update payload are required.");
    return store.updateLibrary(id, patch);
  });

  ipcMain.handle("library:delete", (_event, id) => {
    if (typeof id !== "string") throw new Error("A library ID is required.");
    return store.deleteLibrary(id);
  });

  ipcMain.handle("library:list-papers", (_event, { libraryId, query = "" }) => {
    if (typeof libraryId !== "string" || typeof query !== "string" || query.length > 300) {
      throw new Error("A library ID and a short search query are required.");
    }
    return store.listPapers(libraryId, query);
  });

  ipcMain.handle("library:search-external", (_event, { query, limit }) => searchAcademicPapers(query, limit));

  ipcMain.handle("library:discover-daily", async (_event, input = {}) => {
    if (!input || typeof input !== "object") throw new Error("Daily discovery options are required.");
    const options = normalizeDailyOptions(input);
    const cacheKey = JSON.stringify(options);
    const cacheTtl = 20 * 60 * 1000;
    if (!input.forceRefresh) {
      const cached = store.getDailyFeedCache(cacheKey, cacheTtl);
      if (cached) return { ...cached, options, cached: true, stale: false };
    }

    try {
      const response = await discoverDailyPapers(options);
      const saved = store.setDailyFeedCache(cacheKey, response);
      return { ...saved, options, cached: false, stale: false };
    } catch (error) {
      const stale = store.getDailyFeedCache(cacheKey);
      if (stale) {
        return {
          ...stale,
          options,
          cached: true,
          stale: true,
          warning: error instanceof Error ? error.message : "Live refresh failed; showing cached papers.",
        };
      }
      throw error;
    }
  });

  ipcMain.handle("library:add-paper", (_event, { libraryId, paper }) => {
    if (typeof libraryId !== "string" || !paper || typeof paper.title !== "string" || !paper.title.trim()) {
      throw new Error("Choose a library and a valid paper before importing.");
    }
    if (paper.title.length > 1000 || String(paper.abstract || "").length > 100_000) throw new Error("Paper metadata is too large.");
    return store.addPaper(libraryId, paper);
  });

  ipcMain.handle("library:update-paper", (_event, { paperId, patch }) => {
    if (typeof paperId !== "string" || !patch || typeof patch !== "object") throw new Error("A paper and update payload are required.");
    return store.updatePaper(paperId, patch);
  });

  ipcMain.handle("library:remove-paper", (_event, { libraryId, paperId }) => {
    if (typeof libraryId !== "string" || typeof paperId !== "string") throw new Error("A library and paper are required.");
    return store.removePaper(libraryId, paperId);
  });

  ipcMain.handle("task:save", (_event, task) => {
    if (!task || typeof task.prompt !== "string" || typeof task.response !== "string") {
      throw new Error("A task requires prompt and response text.");
    }
    if (task.prompt.length > 20_000 || task.response.length > 100_000) {
      throw new Error("Task payload is too large.");
    }
    return store.saveTask(task);
  });

  ipcMain.handle("agent:run", async (event, input) => {
    if (!input || typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 20_000) {
      throw new Error("An Agent task requires a prompt of at most 20000 characters.");
    }
    const researchModes = new Set(["free-chat", "idea-spark", "experiment-setup", "paper-generation", "paper-review"]);
    const mode = researchModes.has(input.mode) ? input.mode : "idea-spark";
    const workspace = resolveWorkspace(input.workspace);
    store.openWorkspace(workspace);
    const contextItems = sanitizeAgentContext(input.contextItems);
    return agent.runAgent({
      prompt: input.prompt.trim(),
      workspace,
      threadId: typeof input.threadId === "string" && input.threadId ? input.threadId : undefined,
      projectId: typeof input.projectId === "string" && input.projectId ? input.projectId : undefined,
      mode,
      contextItems,
      emit: (payload) => event.sender.send("agent:event", payload),
    });
  });

  ipcMain.handle("agent:approve-action", (event, actionId) => {
    if (typeof actionId !== "string") throw new Error("An Agent action ID is required.");
    const action = store.approveAction(actionId);
    agent.resolveApproval(actionId, true);
    if (action.kind === "write" && action.payload.change && !event.sender.isDestroyed()) {
      event.sender.send("workspace:change-set", {
        id: action.id,
        actionId: action.id,
        taskId: action.task_id,
        threadId: store.getResearchThreadIdForTask(action.task_id),
        kind: action.kind,
        changes: [action.payload.change],
        createdAt: action.created_at,
      });
    }
    return action;
  });

  ipcMain.handle("agent:reject-action", (_event, actionId) => {
    if (typeof actionId !== "string") throw new Error("An Agent action ID is required.");
    const action = store.resolveAction(actionId, "rejected");
    agent.resolveApproval(actionId, false);
    return action;
  });

  ipcMain.handle("agent:interrupt", (_event, threadId) => {
    if (typeof threadId !== "string") throw new Error("A research thread ID is required.");
    return { interrupted: agent.interruptAgent(threadId) };
  });

  ipcMain.handle("terminal:run", (event, { command, cwd, actionId }) => {
    if (typeof command !== "string" || command.trim().length === 0 || command.length > 2000) {
      throw new Error("A non-empty command of at most 2000 characters is required.");
    }

    const workspace = resolveWorkspace(cwd);
    store.openWorkspace(workspace);
    const beforeSnapshot = typeof actionId === "string" ? workspaceFiles.snapshotWorkspace(workspace) : null;
    const sessionId = randomUUID();
    const commandRun = store.startCommand({ command, cwd: workspace });
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/zsh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
    const child = spawn(shell, args, {
      cwd: workspace,
      env: process.env,
    });

    commandSessions.set(sessionId, { process: child, senderId: event.sender.id });
    const send = (data) => {
      store.appendCommandOutput(commandRun.id, data);
      if (!event.sender.isDestroyed()) {
        event.sender.send("terminal:data", { sessionId, commandRunId: commandRun.id, data });
      }
    };
    child.stdout.on("data", (chunk) => send(chunk.toString()));
    child.stderr.on("data", (chunk) => send(chunk.toString()));
    child.on("error", (error) => send(`\n[process error] ${error.message}\n`));
    child.on("close", (code) => {
      send(`\n[process exited with code ${code ?? "unknown"}]\n`);
      store.finishCommand(commandRun.id, code, code === 0 ? "completed" : "failed");
      if (beforeSnapshot && typeof actionId === "string") {
        const changes = workspaceFiles.compareWorkspaceSnapshots(beforeSnapshot, workspaceFiles.snapshotWorkspace(workspace));
        if (changes.length) {
          const action = store.updateActionPayload(actionId, { changes });
          if (!event.sender.isDestroyed()) {
            event.sender.send("workspace:change-set", {
              id: action.id,
              actionId: action.id,
              taskId: action.task_id,
              threadId: store.getResearchThreadIdForTask(action.task_id),
              kind: action.kind,
              changes,
              createdAt: action.created_at,
            });
          }
        }
      }
      commandSessions.delete(sessionId);
    });
    return { sessionId, commandRunId: commandRun.id, workspace };
  });

  ipcMain.handle("terminal:stop", (event, sessionId) => {
    const session = commandSessions.get(sessionId);
    if (session?.senderId === event.sender.id) session.process.kill("SIGTERM");
  });

  ipcMain.handle("terminal:create", (event, input = {}) => {
    const workspace = resolveWorkspace(input.cwd);
    const cols = Math.max(2, Math.min(500, Number(input.cols) || 80));
    const rows = Math.max(1, Math.min(200, Number(input.rows) || 24));
    const shell = process.platform === "win32" ? (process.env.COMSPEC || "powershell.exe") : (process.env.SHELL || os.userInfo().shell || "/bin/zsh");
    const args = process.platform === "win32" ? [] : ["-l"];
    const sessionId = randomUUID();
    const terminalProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: workspace,
      env: cleanTerminalEnvironment(),
    });
    const session = { process: terminalProcess, senderId: event.sender.id, sender: event.sender, ready: false, buffer: "" };
    interactiveTerminalSessions.set(sessionId, session);

    terminalProcess.onData((data) => {
      if (!interactiveTerminalSessions.has(sessionId)) return;
      if (!session.ready) {
        session.buffer = (session.buffer + data).slice(-200_000);
      } else if (!session.sender.isDestroyed()) {
        session.sender.send("terminal:pty-data", { sessionId, data });
      }
    });
    terminalProcess.onExit(({ exitCode, signal }) => {
      interactiveTerminalSessions.delete(sessionId);
      if (!session.sender.isDestroyed()) session.sender.send("terminal:pty-exit", { sessionId, exitCode, signal });
    });

    event.sender.once("destroyed", () => closeInteractiveTerminal(sessionId));
    return { sessionId, workspace, shell: path.basename(shell), pid: terminalProcess.pid };
  });

  ipcMain.handle("terminal:ready", (event, sessionId) => {
    const session = getInteractiveTerminal(event, sessionId);
    session.ready = true;
    if (session.buffer && !session.sender.isDestroyed()) {
      session.sender.send("terminal:pty-data", { sessionId, data: session.buffer });
      session.buffer = "";
    }
  });

  ipcMain.on("terminal:write", (event, { sessionId, data }) => {
    if (typeof data !== "string" || data.length > 65_536) return;
    try {
      getInteractiveTerminal(event, sessionId).process.write(data);
    } catch {
      // Ignore input racing with a shell exit.
    }
  });

  ipcMain.on("terminal:resize", (event, { sessionId, cols, rows }) => {
    const width = Math.max(2, Math.min(500, Number(cols) || 80));
    const height = Math.max(1, Math.min(200, Number(rows) || 24));
    try {
      getInteractiveTerminal(event, sessionId).process.resize(width, height);
    } catch {
      // Ignore resize events racing with a shell exit.
    }
  });

  ipcMain.handle("terminal:close", (event, sessionId) => {
    getInteractiveTerminal(event, sessionId);
    closeInteractiveTerminal(sessionId);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", closeAllTerminals);
