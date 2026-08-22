const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
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

  ipcMain.handle("task:save", (_event, task) => {
    if (!task || typeof task.prompt !== "string" || typeof task.response !== "string") {
      throw new Error("A task requires prompt and response text.");
    }
    if (task.prompt.length > 20_000 || task.response.length > 100_000) {
      throw new Error("Task payload is too large.");
    }
    return store.saveTask(task);
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
