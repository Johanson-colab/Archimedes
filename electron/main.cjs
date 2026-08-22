const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const agent = require("./agent.cjs");
const { loadLocalAgentEnvironment } = require("./config.cjs");
const { discoverDailyPapers, normalizeDailyOptions, searchAcademicPapers } = require("./literature.cjs");
const store = require("./store.cjs");

let mainWindow;
const terminalSessions = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
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
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
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

app.whenReady().then(() => {
  loadLocalAgentEnvironment();
  createWindow();

  ipcMain.handle("workspace:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Choose a research workspace",
    });
    return result.canceled ? null : resolveWorkspace(result.filePaths[0]);
  });

  ipcMain.handle("workspace:open", (_event, requestedWorkspace) => {
    const workspace = resolveWorkspace(requestedWorkspace);
    return store.openWorkspace(workspace);
  });

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
    const workspace = resolveWorkspace(input.workspace);
    store.openWorkspace(workspace);
    return agent.runAgent({
      prompt: input.prompt.trim(),
      workspace,
      emit: (payload) => event.sender.send("agent:event", payload),
    });
  });

  ipcMain.handle("agent:approve-action", (_event, actionId) => {
    if (typeof actionId !== "string") throw new Error("An Agent action ID is required.");
    return store.approveAction(actionId);
  });

  ipcMain.handle("agent:reject-action", (_event, actionId) => {
    if (typeof actionId !== "string") throw new Error("An Agent action ID is required.");
    return store.resolveAction(actionId, "rejected");
  });

  ipcMain.handle("terminal:run", (event, { command, cwd }) => {
    if (typeof command !== "string" || command.trim().length === 0 || command.length > 2000) {
      throw new Error("A non-empty command of at most 2000 characters is required.");
    }

    const workspace = resolveWorkspace(cwd);
    store.openWorkspace(workspace);
    const sessionId = randomUUID();
    const commandRun = store.startCommand({ command, cwd: workspace });
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/zsh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
    const child = spawn(shell, args, {
      cwd: workspace,
      env: process.env,
    });

    terminalSessions.set(sessionId, child);
    const send = (data) => {
      store.appendCommandOutput(commandRun.id, data);
      event.sender.send("terminal:data", { sessionId, commandRunId: commandRun.id, data });
    };
    child.stdout.on("data", (chunk) => send(chunk.toString()));
    child.stderr.on("data", (chunk) => send(chunk.toString()));
    child.on("error", (error) => send(`\n[process error] ${error.message}\n`));
    child.on("close", (code) => {
      send(`\n[process exited with code ${code ?? "unknown"}]\n`);
      store.finishCommand(commandRun.id, code, code === 0 ? "completed" : "failed");
      terminalSessions.delete(sessionId);
    });
    return { sessionId, commandRunId: commandRun.id, workspace };
  });

  ipcMain.handle("terminal:stop", (_event, sessionId) => {
    const child = terminalSessions.get(sessionId);
    if (child) child.kill("SIGTERM");
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
