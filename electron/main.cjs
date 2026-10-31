const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, net, protocol, clipboard, shell, session, safeStorage, systemPreferences } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");
const agent = require("./agent.cjs");
const { runPaperReview } = require("./paper-review-orchestrator.cjs");
const kimiSlidesSkill = require("./kimi-slides-skill.cjs");
const runKimiSlidesPlan = kimiSlidesSkill.runKimiSlidesPlan || kimiSlidesSkill.runKimiSlidesPresentation;
const runPaperPresentationPlan = kimiSlidesSkill.runPaperPresentationPlan || runKimiSlidesPlan;
const { generateNativePptx } = require("./native-pptx.cjs");
const { browserUse } = require("./agent/browser-use.cjs");
const { loadLocalAgentEnvironment } = require("./config.cjs");
const terminalSettings = require("./terminal-settings.cjs");
const journeySettings = require("./journey-settings.cjs");
const journeySnapshots = require("./journey-snapshots.cjs");
const workbenchSettings = require("./workbench-settings.cjs");
const workbenchNotes = require("./workbench-notes.cjs");
const localIdentity = require("./local-identity.cjs");
const { createClient } = require("@supabase/supabase-js");
const { createSupabaseAuth } = require("./supabase-auth.cjs");
const { createCollaborationApi } = require("./collaboration-api.cjs");
const { createLibrarySync } = require("./library-sync.cjs");
const { createAnnotationSync } = require("./annotation-sync.cjs");
const { createThreadSync } = require("./thread-sync.cjs");
const { createSupabaseServer } = require("../server/supabase-server.cjs");
const supabaseConfig = require("../shared/supabase-config.json");
const journeySummarizer = require("./journey-summarizer.cjs");
const modelConfig = require("./model-config.cjs");
const { planReproduction } = require("./reproduction/planner.cjs");
const proactiveAgent = require("./proactive-agent.cjs");
const { getModelCapabilities, normalizeContextLength, normalizeReasoningEffort } = require("./agent/model-capabilities.cjs");
const webSearch = require("./web-search.cjs");
const { discoverDailyPapers, normalizeDailyOptions, resolveArxivFigure, searchAcademicPapers } = require("./literature.cjs");
const { deepSearchPapers } = require("./deep-paper-search.cjs");
const { searchConferencePapers } = require("./conferences.cjs");
const skillCatalog = require("./skill-catalog.cjs");
const speech = require("./speech.cjs");
const store = require("./store.cjs");
const workspaceFiles = require("./workspace-files.cjs");
const latexWorkspace = require("./latex-workspace.cjs");
const { preparePaperReader } = require("./library-reader.cjs");
const { loadGithubRepository, normalizeGithubRepositoryUrl } = require("./github-repository.cjs");
const { cloneRepositoryCheckout, getRepositoryCheckout, listRepositoryCheckoutDirectory, readRepositoryCheckoutFile, resolveAuditPath, resolveRepositoryCodeReference } = require("./repository-checkout.cjs");
const { getBenchmarkRadarData } = require("./benchmark-radar.cjs");

const commandSessions = new Map();
const interactiveTerminalSessions = new Map();
const windowWorkspaces = new Map();
const windowPreviewTokens = new Map();
const previewTokenWorkspaces = new Map();
const workspaceWatchers = new Map();
const allowedContextPaths = new Set();
const WORKSPACE_STATE_FILE = "last-workspace.json";
const MAX_CLIPBOARD_IMAGE_BYTES = 6 * 1024 * 1024;
const WORKBENCH_BROWSER_PARTITION = "archimedes-browser";
let browserSessionHardened = false;

app.setName("Archimedes");
app.setAppUserModelId("com.archimedes.research");
protocol.registerSchemesAsPrivileged([{
  scheme: "archimedes-file",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
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

function createPreviewToken(senderId, workspace) {
  // Execution folders (project directories) can differ from the window's data
  // workspace. Preview tokens must not move the window's primary workspace.
  let token = windowPreviewTokens.get(senderId);
  if (!token) {
    token = randomUUID();
    windowPreviewTokens.set(senderId, token);
  }
  previewTokenWorkspaces.set(token, workspace);
  return token;
}

function workspaceStatePath() {
  return path.join(app.getPath("userData"), WORKSPACE_STATE_FILE);
}

function validWorkspace(value) {
  return typeof value === "string" && value.trim() && fs.existsSync(value) && fs.statSync(value).isDirectory();
}

function rememberWorkspace(workspace) {
  if (!validWorkspace(workspace)) return;
  try {
    fs.writeFileSync(workspaceStatePath(), JSON.stringify({ workspace, updatedAt: new Date().toISOString() }, null, 2));
  } catch {
    // The active window still works if user-data storage is temporarily unavailable.
  }
}

function lastWorkspace() {
  try {
    const saved = JSON.parse(fs.readFileSync(workspaceStatePath(), "utf8"));
    return validWorkspace(saved?.workspace) ? saved.workspace : null;
  } catch {
    return null;
  }
}

function startupWorkspace() {
  const saved = lastWorkspace();
  if (saved) return saved;
  // During local development, the application lives inside its default research workspace.
  const developmentWorkspace = process.env.VITE_DEV_SERVER_URL ? path.dirname(app.getAppPath()) : null;
  return validWorkspace(developmentWorkspace) ? developmentWorkspace : null;
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

function titleBarOverlay(theme) {
  const dark = theme !== "paper";
  return {
    color: dark ? "#141414" : "#fbfaf8",
    symbolColor: dark ? "#e6e5e0" : "#33332f",
    height: 52,
  };
}

function createWindow(workspace) {
  const overlay = process.platform === "win32";
  const initialTheme = nativeTheme.shouldUseDarkColors ? "charcoal" : "paper";
  const browserWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: initialTheme === "paper" ? "#f6f7f5" : "#111111",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : overlay ? "hidden" : undefined,
    titleBarOverlay: overlay ? titleBarOverlay(initialTheme) : undefined,
    autoHideMenuBar: process.platform !== "darwin",
    icon: path.join(__dirname, "assets", "app-icon-256.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
      webviewTag: true,
    },
  });

  if (process.platform !== "darwin") browserWindow.setMenuBarVisibility(false);

  const senderId = browserWindow.webContents.id;
  browserWindow.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    const browserTab = params.partition === WORKBENCH_BROWSER_PARTITION;
    const allowed = browserTab ? isWebPage(params.src) : isEmbeddableProjectPage(params.src);
    if (!allowed) {
      event.preventDefault();
      return;
    }
    if (!browserTab && isGithubPage(params.src)) {
      try {
        const repository = normalizeGithubRepositoryUrl(params.src);
        params.src = repository.url;
      } catch {
        event.preventDefault();
        return;
      }
    }
    delete webPreferences.preload;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
  });
  browserWindow.webContents.on("did-attach-webview", (_event, guestContents) => {
    const browserTab = guestContents.session === session.fromPartition(WORKBENCH_BROWSER_PARTITION);
    guestContents.setWindowOpenHandler(({ url }) => {
      if (browserTab && isWebPage(url)) void shell.openExternal(url);
      if (!browserTab && isEmbeddableProjectPage(url)) void guestContents.loadURL(url);
      return { action: "deny" };
    });
    guestContents.on("will-navigate", (event, url) => {
      if (!(browserTab ? isWebPage(url) : isEmbeddableProjectPage(url))) event.preventDefault();
    });
    if (browserTab) hardenBrowserSession(guestContents.session);
  });
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
  if (!expanded) return app.getPath("home");
  if (fs.existsSync(expanded) && fs.statSync(expanded).isDirectory()) return expanded;
  // Do not silently fall back to the home folder when a project folder was
  // deleted or moved; the user needs to rebind the project instead.
  throw new Error(`The folder "${expanded}" is no longer available. Rebind the project folder and try again.`);
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function isGithubPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "github.com" || url.hostname.endsWith(".github.com"));
  } catch {
    return false;
  }
}

function isEmbeddableProjectPage(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isWebPage(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function hardenBrowserSession(session) {
  if (browserSessionHardened) return;
  browserSessionHardened = true;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.on("will-download", (event, item) => {
    event.preventDefault();
    const url = item.getURL();
    if (isWebPage(url)) void shell.openExternal(url);
  });
}

function workspaceForWindow(browserWindow) {
  return browserWindow ? windowWorkspaces.get(browserWindow.webContents.id) : undefined;
}

function readerStateForWindow(senderId, workspace, paperId, projectId = null) {
  const reader = store.getPaperReader(paperId, projectId);
  if (!reader.asset?.relative_path || reader.asset.status !== "ready") return reader;
  try {
    const target = workspaceFiles.workspacePath(workspace, reader.asset.relative_path);
    if (!fs.statSync(target).isFile()) return { ...reader, asset: { ...reader.asset, status: "missing", error: "The cached PDF is no longer available." } };
    const token = setWindowWorkspace(senderId, workspace);
    return { ...reader, asset: { ...reader.asset, preview_url: `archimedes-file://${token}/${encodeURIComponent(reader.asset.relative_path)}` } };
  } catch {
    return { ...reader, asset: { ...reader.asset, status: "missing", error: "The cached PDF is no longer available." } };
  }
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
  rememberWorkspace(workspace);
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

async function sanitizeAgentContext(items, workspace) {
  if (!Array.isArray(items)) return [];
  const sanitized = [];
  for (const item of items.slice(0, 12)) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.name !== "string") continue;
    if (item.type === "paper") {
      const paper = item.paper;
      if (!paper || typeof paper.title !== "string") continue;
      sanitized.push({
        id: item.id.slice(0, 500), type: "paper", name: item.name.slice(0, 1000),
        detail: String(item.detail || "").slice(0, 2000),
        paper: {
          title: paper.title.slice(0, 1000), authors: Array.isArray(paper.authors) ? paper.authors.slice(0, 100).map((author) => String(author).slice(0, 300)) : [],
          year: Number.isInteger(paper.year) ? paper.year : null, abstract: String(paper.abstract || "").slice(0, 100_000),
          url: String(paper.url || "").slice(0, 3000), pdfUrl: String(paper.pdfUrl || "").slice(0, 3000),
        },
      });
      continue;
    }
    if (item.type === "repository") {
      const repository = item.repository;
      if (!repository || typeof repository.url !== "string" || !Array.isArray(repository.files)) continue;
      const cleanFiles = repository.files.slice(0, 12).flatMap((file) => {
        if (!file || typeof file.path !== "string" || typeof file.content !== "string") return [];
        return [{ path: file.path.slice(0, 800), size: Math.max(0, Number(file.size) || 0), language: String(file.language || "Text").slice(0, 80), content: file.content.slice(0, 48_000) }];
      });
      let checkout = null;
      if (repository.audit === true) {
        try { checkout = await getRepositoryCheckout(workspace, repository.url); }
        catch { checkout = null; }
      }
      sanitized.push({
        id: item.id.slice(0, 500), type: "repository", name: item.name.slice(0, 1000), detail: String(item.detail || "").slice(0, 2000),
        repository: {
          url: repository.url.slice(0, 3_000), branch: String(repository.branch || "").slice(0, 160), description: String(repository.description || "").slice(0, 4_000),
          language: String(repository.language || "").slice(0, 160), stars: Math.max(0, Number(repository.stars) || 0),
          data_paths: Array.isArray(repository.data_paths) ? repository.data_paths.slice(0, 100).map((entry) => String(entry).slice(0, 800)) : [],
          readme: String(repository.readme || "").slice(0, 20_000), files: cleanFiles,
          checkout: checkout ? { branch: checkout.branch, commit: checkout.commit, file_count: checkout.file_count } : null,
        },
      });
      continue;
    }
    if (item.type === "image") {
      const image = item.image;
      const match = typeof image?.dataUrl === "string" && image.dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) continue;
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > MAX_CLIPBOARD_IMAGE_BYTES) continue;
      const mimeType = match[1];
      sanitized.push({
        id: item.id.slice(0, 500), type: "image", name: item.name.slice(0, 1000), detail: String(item.detail || "").slice(0, 2000),
        image: {
          dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
          mimeType,
          sizeBytes: bytes.length,
          width: Number.isInteger(image.width) ? Math.max(1, Math.min(image.width, 20_000)) : undefined,
          height: Number.isInteger(image.height) ? Math.max(1, Math.min(image.height, 20_000)) : undefined,
        },
      });
      continue;
    }
    if (!["file", "folder", "plugin", "skill"].includes(item.type) || typeof item.path !== "string") continue;
    const resolved = path.resolve(item.path);
    const resolvedWorkspace = path.resolve(workspace);
    const belongsToWorkspace = resolved === resolvedWorkspace || resolved.startsWith(`${resolvedWorkspace}${path.sep}`);
    if ((!allowedContextPaths.has(resolved) && !belongsToWorkspace) || !fs.existsSync(resolved)) continue;
    const stats = fs.statSync(resolved);
    if (item.type === "file" && !stats.isFile()) continue;
    if (item.type !== "file" && !stats.isDirectory()) continue;
    sanitized.push({ id: `${item.type}:${resolved}`, type: item.type, name: path.basename(resolved), path: resolved, detail: String(item.detail || "").slice(0, 2000) });
  }
  return sanitized;
}

const journeySummariesInFlight = new Map();
let supabaseAuth = null;
let authReady = Promise.resolve();
let collaborationApi = null;
let collaborationServer = null;

app.whenReady().then(async () => {
  loadLocalAgentEnvironment();
  modelConfig.initializeModelConfig(app.getPath("userData"));
  webSearch.initializeWebSearch(app.getPath("userData"));
  terminalSettings.initialize(app.getPath("userData"));
  journeySettings.initialize(app.getPath("userData"));
  journeySnapshots.initialize(app.getPath("userData"));
  workbenchSettings.initialize(app.getPath("userData"));
  workbenchNotes.initialize(app.getPath("userData"));
  localIdentity.initialize(app.getPath("userData"));
  store.setLocalIdentity(localIdentity.localIdentity());
  const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  supabaseAuth = createSupabaseAuth({
    client: supabaseClient,
    storagePath: app.getPath("userData"),
    safeStorage,
    configured: Boolean(supabaseConfig.url && supabaseConfig.publishableKey),
  });
  authReady = supabaseAuth.initialize();
  try {
    collaborationServer = createSupabaseServer({ supabaseUrl: supabaseConfig.url, publishableKey: supabaseConfig.publishableKey });
    const address = await collaborationServer.listen(0, "127.0.0.1");
    collaborationApi = createCollaborationApi({
      baseUrl: `http://127.0.0.1:${address.port}`,
      getToken: () => supabaseAuth.accessToken(),
    });
  } catch (error) {
    console.error("Could not start the local collaboration API.", error);
  }
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

  ipcMain.handle("window:set-titlebar-theme", (event, theme) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow || browserWindow.isDestroyed()) return;
    const dark = theme !== "paper";
    try {
      browserWindow.setTitleBarOverlay(titleBarOverlay(theme));
    } catch {
      // Linux window managers may not expose an overlay title bar.
    }
    browserWindow.setBackgroundColor(dark ? "#111111" : "#f6f7f5");
  });

  ipcMain.handle("window:set-ui-zoom", (event, factor) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const numeric = Number(factor);
    const next = Number.isFinite(numeric) ? Math.min(1.5, Math.max(.75, numeric)) : 1;
    if (browserWindow && !browserWindow.isDestroyed()) browserWindow.webContents.setZoomFactor(next);
    return next;
  });

  ipcMain.handle("workspace:choose", async (event) => {
    return chooseFolderForWindow(BrowserWindow.fromWebContents(event.sender), "Choose a research workspace");
  });

  ipcMain.handle("workspace:watch", (event, requestedWorkspace) => {
    const workspace = resolveWorkspace(requestedWorkspace);
    watchWorkspace(event.sender, workspace);
    return workspace;
  });

  ipcMain.handle("workspace:reveal", async (_event, requestedWorkspace) => {
    if (!validWorkspace(requestedWorkspace)) throw new Error("The folder is no longer available.");
    const error = await shell.openPath(path.resolve(requestedWorkspace));
    if (error) throw new Error(error);
    return { opened: true };
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

  ipcMain.handle("context:attach-dropped-paths", async (_event, paths) => {
    if (!Array.isArray(paths) || paths.length > 12 || paths.some((p) => typeof p !== "string" || !path.isAbsolute(p) || p.length > 4000)) throw new Error("Invalid dropped files.");
    return paths.map((p) => {
      const stats = fs.statSync(p);
      if (!stats.isFile() && !stats.isDirectory()) throw new Error("Only files and folders can be attached.");
      return contextItem(stats.isDirectory() ? "folder" : "file", p, path.dirname(p));
    });
  });

  ipcMain.handle("context:attach-repository-path", async (event, { url, workspace, path: filePath } = {}) => {
    if (typeof url !== "string" || url.length > 3000 || typeof filePath !== "string" || !filePath || filePath.length > 2000) throw new Error("Invalid repository path.");
    const resolved = await resolveAuditPath(resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id)), url, filePath);
    const stats = fs.statSync(resolved.target);
    if (!stats.isFile() && !stats.isDirectory()) throw new Error("Only files and folders can be attached.");
    return contextItem(stats.isDirectory() ? "folder" : "file", resolved.target, filePath);
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
    rememberWorkspace(workspace);
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
      const token = createPreviewToken(event.sender.id, workspace);
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

  ipcMain.handle("artifacts:list", (_event, input = {}) => store.listArtifacts(input.threadId));
  ipcMain.handle("artifacts:mark-seen", (_event, input = {}) => store.markArtifactsSeen(input.threadId));
  ipcMain.handle("artifacts:unseen-count", (_event, input = {}) => store.countUnseenArtifacts(input.threadId));
  ipcMain.handle("artifacts:delete", (_event, id) => store.deleteArtifact(id));

  ipcMain.handle("paper:list-projects", (_event, input = {}) => {
    return latexWorkspace.listLatexProjects(resolveWorkspace(input.workspace));
  });

  ipcMain.handle("paper:create-project", (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const file = latexWorkspace.createLatexProject(workspace, input.directory, input.template);
    if (!event.sender.isDestroyed()) event.sender.send("workspace:files-changed", { path: file.path });
    return file;
  });

  ipcMain.handle("paper:create-file", (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const file = latexWorkspace.createLatexFile(workspace, input.path);
    if (!event.sender.isDestroyed()) event.sender.send("workspace:files-changed", { path: file.path });
    return file;
  });

  ipcMain.handle("paper:create-directory", (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const directory = latexWorkspace.createLatexDirectory(workspace, input.path);
    if (!event.sender.isDestroyed()) event.sender.send("workspace:files-changed", { path: directory.path });
    return directory;
  });

  ipcMain.handle("paper:import-folder", async (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "Import a LaTeX project folder", properties: ["openDirectory"] };
    const selection = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const imported = latexWorkspace.importLatexProject(workspace, selection.filePaths[0]);
    if (!event.sender.isDestroyed()) event.sender.send("workspace:files-changed", { path: imported.directory });
    return { canceled: false, ...imported };
  });

  ipcMain.handle("paper:compile", async (event, input = {}) => {
    const workspace = resolveWorkspace(input.workspace);
    const result = await latexWorkspace.compileLatexDocument(workspace, input.path);
    if (!result.pdf_path) return result;
    const token = createPreviewToken(event.sender.id, workspace);
    const encodedPath = result.pdf_path.split("/").map(encodeURIComponent).join("/");
    return { ...result, preview_url: `archimedes-file://${token}/${encodedPath}?v=${Date.now()}` };
  });

  ipcMain.handle("research-thread:get", (_event, input = {}) => {
    if (typeof input.threadId !== "string") throw new Error("A research thread ID is required.");
    const workspace = resolveWorkspace(input.workspace);
    store.openWorkspace(workspace);
    return store.getResearchThread(input.threadId);
  });

  ipcMain.handle("research:snapshot", () => store.getSnapshot());

  ipcMain.handle("research-project:create", (_event, input = {}) => {
    return store.createResearchProject(input);
  });

  ipcMain.handle("research-project:rename", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.renameResearchProject(input.id, input.name);
  });

  ipcMain.handle("research-project:set-workspace", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.setResearchProjectWorkspace(input.id, input.workspacePath);
  });

  ipcMain.handle("research-project:archive", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.archiveResearchProject(input.id, input.archived !== false);
  });

  ipcMain.handle("research-project:delete", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research project ID is required.");
    return store.deleteResearchProject(input.id);
  });

  ipcMain.handle("research-thread:archive", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research thread ID is required.");
    return store.archiveResearchThread(input.id, input.archived !== false);
  });

  ipcMain.handle("research-thread:delete", (_event, input = {}) => {
    if (typeof input.id !== "string") throw new Error("A research thread ID is required.");
    const result = store.deleteResearchThread(input.id);
    journeySnapshots.remove(input.id);
    return result;
  });

  ipcMain.handle("model-config:get", (_event, role) => modelConfig.getPublicModelConfig(role));

  ipcMain.handle("model-config:list-models", (_event, input = {}, role) => modelConfig.listProviderModels(input, role));

  ipcMain.handle("model-config:save", (_event, input = {}, role) => modelConfig.saveModelConfig(input, role));
  ipcMain.handle("speech:transcribe", async (_event, input = {}) => {
    const config = modelConfig.getActiveModelConfig("agent");
    return speech.transcribeSpeech({ audio: input.audio, mimeType: input.mimeType, language: input.language }, config);
  });
  ipcMain.handle("speech:request-permission", async () => {
    if (process.platform !== "darwin") return true;
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") return false;
    return systemPreferences.askForMediaAccess("microphone");
  });

  ipcMain.handle("model-config:test", (_event, input = {}, role) => modelConfig.testModelConfig(input, role));

  ipcMain.handle("proactive:reply", (_event, input = {}) => proactiveAgent.runProactiveReply(input));

  ipcMain.handle("proactive:observe", (_event, input = {}) => proactiveAgent.runProactiveObservation(input));

  ipcMain.handle("proactive:screenshot", (event) => proactiveAgent.captureAppWindow(BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle("web-search:get-config", () => webSearch.getPublicWebSearchConfig());

  ipcMain.handle("web-search:save-config", (_event, input = {}) => webSearch.saveWebSearchConfig(input));

  ipcMain.handle("library:list", (_event, input = {}) => store.listLibraries(input.projectId ?? null));

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

  ipcMain.handle("library:list-projects", () => store.listLibraryProjects());

  ipcMain.handle("library:list-papers", (_event, { libraryId, query = "" }) => {
    if (typeof libraryId !== "string" || typeof query !== "string" || query.length > 300) {
      throw new Error("A library ID and a short search query are required.");
    }
    return store.listPapers(libraryId, query);
  });

  ipcMain.handle("library:search-external", (_event, { query, limit }) => searchAcademicPapers(query, limit));

  ipcMain.handle("library:search-conferences", async (event, input = {}) => {
    if (!input || typeof input !== "object") throw new Error("Conference search options are required.");
    const workspace = resolveWorkspace(windowWorkspaces.get(event.sender.id));
    store.openWorkspace(workspace);
    return searchConferencePapers(input, {
      scope: workspace,
      readCache: (key, age) => { store.openWorkspace(workspace); return store.getDailyFeedCache(key, age); },
      writeCache: (key, value) => { store.openWorkspace(workspace); return store.setDailyFeedCache(key, value); },
    });
  });

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

  ipcMain.handle("library:daily-figure", async (_event, { arxivId } = {}) => {
    if (typeof arxivId !== "string" || !arxivId.trim()) throw new Error("An arXiv id is required.");
    return resolveArxivFigure(arxivId);
  });

  ipcMain.handle("reproduction:list", () => store.listReproductions());

  ipcMain.handle("reproduction:create", (_event, input = {}) => {
    const paperId = typeof input.paperId === "string" && input.paperId ? input.paperId : null;
    if (paperId && !store.getPaper(paperId)) throw new Error("That paper does not exist in this workspace.");
    return store.createReproduction({
      paperId,
      repoUrl: typeof input.repoUrl === "string" ? input.repoUrl : "",
      title: typeof input.title === "string" ? input.title : "",
      source: { kind: paperId ? "paper" : "repo", paper_id: paperId || undefined, repo_url: input.repoUrl || undefined },
      budget: input.budget,
    });
  });

  ipcMain.handle("reproduction:get", (_event, { id } = {}) => {
    if (typeof id !== "string" || !id) throw new Error("A reproduction id is required.");
    return store.getReproduction(id);
  });

  ipcMain.handle("reproduction:update", (_event, { id, patch } = {}) => {
    if (typeof id !== "string" || !id) throw new Error("A reproduction id is required.");
    return store.updateReproduction(id, patch && typeof patch === "object" ? patch : {});
  });

  ipcMain.handle("reproduction:delete", (_event, { id } = {}) => {
    if (typeof id !== "string" || !id) throw new Error("A reproduction id is required.");
    return store.deleteReproduction(id);
  });

  ipcMain.handle("reproduction:plan", async (_event, { id } = {}) => {
    const reproduction = store.getReproduction(id);
    if (!reproduction) throw new Error("That reproduction does not exist.");
    if (reproduction.contract && reproduction.status !== "draft") {
      throw new Error("This reproduction already has an approved contract.");
    }
    if (!reproduction.paper_id) throw new Error("Reproduction planning is only available for papers.");
    const paper = store.getPaper(reproduction.paper_id);
    if (!paper) throw new Error("The paper for this reproduction is missing.");
    const reader = store.getPaperReader(reproduction.paper_id);
    const review = store.getPaperReview(reproduction.paper_id);
    store.updateReproduction(id, { status: "draft", error: "" });
    try {
      const contract = await planReproduction({
        paper,
        pages: reader.pages || [],
        review: review?.review || review,
        repoUrl: reproduction.repo_url,
        config: modelConfig.getActiveModelConfig(),
        complete: agent.complete,
      });
      return store.updateReproduction(id, { status: "planned", contract, error: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Planning failed.";
      store.updateReproduction(id, { status: "draft", error: message });
      throw error;
    }
  });

  ipcMain.handle("library:deep-search", async (_event, input = {}) => {
    if (!input || typeof input !== "object") throw new Error("Deep-search input is required.");
    return deepSearchPapers(input, { modelConfig: modelConfig.getActiveModelConfig() });
  });

  ipcMain.handle("benchmark-radar:get-data", () => getBenchmarkRadarData());

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

  ipcMain.handle("library:get-reader", (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string") throw new Error("A paper is required.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    return readerStateForWindow(event.sender.id, resolvedWorkspace, paperId, projectId);
  });

  ipcMain.handle("library:get-paper-chat-thread", (_event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string") throw new Error("A paper is required.");
    store.openWorkspace(resolveWorkspace(workspace));
    return store.getPaperChatThread(paperId, projectId);
  });

  ipcMain.handle("library:set-paper-chat-thread", (_event, { paperId, threadId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string" || typeof threadId !== "string") throw new Error("A paper and research thread are required.");
    store.openWorkspace(resolveWorkspace(workspace));
    return store.setPaperChatThread(paperId, threadId, projectId);
  });

  ipcMain.handle("library:prepare-reader", async (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string") throw new Error("A paper is required.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    const paper = store.getPaper(paperId);
    if (!paper) throw new Error("Paper not found.");
    try {
      const asset = await preparePaperReader({ workspace: resolvedWorkspace, paper });
      store.replacePaperReaderAsset(paperId, asset);
      return readerStateForWindow(event.sender.id, resolvedWorkspace, paperId, projectId);
    } catch (error) {
      store.setPaperReaderFailed(paperId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

  ipcMain.handle("library:attach-reader-pdf", async (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string") throw new Error("A paper is required.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    const paper = store.getPaper(paperId);
    if (!paper) throw new Error("Paper not found.");
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, { title: "Attach paper PDF", properties: ["openFile"], filters: [{ name: "PDF", extensions: ["pdf"] }] })
      : await dialog.showOpenDialog({ title: "Attach paper PDF", properties: ["openFile"], filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePaths[0]) return readerStateForWindow(event.sender.id, resolvedWorkspace, paperId, projectId);
    try {
      const asset = await preparePaperReader({ workspace: resolvedWorkspace, paper, localPath: result.filePaths[0] });
      store.replacePaperReaderAsset(paperId, asset);
      return readerStateForWindow(event.sender.id, resolvedWorkspace, paperId, projectId);
    } catch (error) {
      store.setPaperReaderFailed(paperId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

  ipcMain.handle("library:find-passages", (_event, { paperId, query, workspace } = {}) => {
    if (typeof paperId !== "string" || typeof query !== "string") throw new Error("A paper and search phrase are required.");
    store.openWorkspace(resolveWorkspace(workspace));
    return store.findPaperPassages(paperId, query);
  });

  ipcMain.handle("library:create-highlight", (_event, { paperId, input, workspace, projectId } = {}) => {
    if (typeof paperId !== "string" || !input || typeof input !== "object") throw new Error("A paper and text selection are required.");
    store.openWorkspace(resolveWorkspace(workspace));
    return store.createPaperHighlight(paperId, input, projectId);
  });

  ipcMain.handle("library:delete-highlight", (_event, { id, workspace, projectId } = {}) => {
    if (typeof id !== "string") throw new Error("A highlight is required.");
    store.openWorkspace(resolveWorkspace(workspace));
    return store.deletePaperHighlight(id, projectId);
  });

  ipcMain.handle("library:translate-selection", async (_event, { text } = {}) => {
    if (typeof text !== "string" || !text.trim() || text.length > 12_000) {
      throw new Error("Select between 1 and 12,000 characters to translate.");
    }
    return agent.translatePaperSelection({ text });
  });

  ipcMain.handle("library:load-github-repository", async (_event, { url } = {}) => {
    if (typeof url !== "string" || url.length > 3_000) throw new Error("A public GitHub repository URL is required.");
    return loadGithubRepository(url);
  });

  ipcMain.handle("library:get-github-repository-checkout", async (event, { url, workspace } = {}) => {
    if (typeof url !== "string" || url.length > 3_000) throw new Error("A public GitHub repository URL is required.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    return getRepositoryCheckout(resolvedWorkspace, url);
  });

  ipcMain.handle("library:clone-github-repository", async (event, { url, workspace } = {}) => {
    if (typeof url !== "string" || url.length > 3_000) throw new Error("A public GitHub repository URL is required.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    return cloneRepositoryCheckout(resolvedWorkspace, url);
  });

  ipcMain.handle("library:list-github-repository-checkout", async (event, { url, workspace, directory } = {}) => {
    if (typeof url !== "string" || typeof directory !== "string" || url.length > 3_000 || directory.length > 2_000) throw new Error("A repository URL and valid directory are required.");
    return listRepositoryCheckoutDirectory(resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id)), url, directory);
  });

  ipcMain.handle("library:read-github-repository-checkout-file", async (event, { url, workspace, path: filePath } = {}) => {
    if (typeof url !== "string" || typeof filePath !== "string" || url.length > 3_000 || filePath.length > 2_000) throw new Error("A repository URL and valid file path are required.");
    return readRepositoryCheckoutFile(resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id)), url, filePath);
  });

  ipcMain.handle("library:resolve-github-repository-reference", async (event, { url, workspace, path: filePath } = {}) => {
    if (typeof url !== "string" || typeof filePath !== "string" || url.length > 3_000 || filePath.length > 2_000) throw new Error("A repository URL and valid file path are required.");
    return resolveRepositoryCodeReference(resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id)), url, filePath);
  });

  ipcMain.handle("clipboard:read-text", () => clipboard.readText().slice(0, 100_000));

  ipcMain.handle("app:open-external", async (_event, url) => {
    if (typeof url !== "string" || url.length > 4_096 || !isWebPage(url)) {
      throw new Error("Only http:// and https:// links can be opened.");
    }
    await shell.openExternal(url);
    return { opened: true };
  });

  ipcMain.handle("clipboard:write-text", (_event, { text } = {}) => {
    if (typeof text !== "string") throw new Error("Clipboard text must be a string.");
    clipboard.writeText(text.slice(0, 100_000));
  });

  ipcMain.handle("clipboard:read-image", () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const png = image.toPNG();
    if (!png.length || png.length > MAX_CLIPBOARD_IMAGE_BYTES) {
      throw new Error("The pasted image must be 6 MB or smaller.");
    }
    const size = image.getSize();
    return {
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      mimeType: "image/png",
      sizeBytes: png.length,
      width: size.width,
      height: size.height,
    };
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
    const researchModes = new Set(["free-chat", "idea-spark", "experiment-setup", "paper-generation", "paper-review", "deep-research"]);
    const mode = researchModes.has(input.mode) ? input.mode : "idea-spark";
    const config = modelConfig.getActiveModelConfig();
    const reasoningEffort = normalizeReasoningEffort(config, input.reasoningEffort);
    const contextLength = normalizeContextLength(config, input.contextLength);
    const workspace = resolveWorkspace(input.workspace);
    // Research data stays in the window's primary workspace, while the Agent
    // operates inside the project/session folder.
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || workspace;
    store.openWorkspace(dataWorkspace);
    const contextItems = await sanitizeAgentContext(input.contextItems, workspace);
    const clientRunId = typeof input.clientRunId === "string" && input.clientRunId ? input.clientRunId : undefined;
    return agent.runAgent({
      prompt: input.prompt.trim(),
      workspace,
      threadId: typeof input.threadId === "string" && input.threadId ? input.threadId : undefined,
      projectId: typeof input.projectId === "string" && input.projectId ? input.projectId : undefined,
      visibility: input.visibility === "private" ? "private" : "project",
      mode,
      reasoningEffort,
      contextLength,
      contextItems,
      browser: (args, signal, activeThreadId) => browserUse(event.sender, activeThreadId, args, signal),
      emit: (payload) => event.sender.send("agent:event", { ...payload, ...(clientRunId ? { clientRunId } : {}) }),
    });
  });

  ipcMain.handle("paper-review:run", async (event, input) => {
    if (!input?.paper || typeof input.paper.id !== "string" || typeof input.paper.title !== "string") {
      throw new Error("A paper record is required to run an evidence review.");
    }
    const workspace = resolveWorkspace(input.workspace);
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || workspace;
    store.openWorkspace(dataWorkspace);
    const config = modelConfig.getActiveModelConfig();
    const reasoningEffort = normalizeReasoningEffort(config, input.reasoningEffort || "high");
    const contextLength = normalizeContextLength(config, input.contextLength || "extra-long");
    const contextItems = await sanitizeAgentContext(input.contextItems, workspace);
    const clientRunId = typeof input.clientRunId === "string" && input.clientRunId ? input.clientRunId : undefined;
    const paper = {
      id: input.paper.id,
      title: input.paper.title.slice(0, 1_000),
      authors: Array.isArray(input.paper.authors) ? input.paper.authors.slice(0, 50).map((author) => String(author).slice(0, 300)) : [],
      year: Number.isInteger(input.paper.year) ? input.paper.year : null,
      venue: String(input.paper.venue || "").slice(0, 1_000),
      abstract: String(input.paper.abstract || "").slice(0, 12_000),
      url: String(input.paper.url || "").slice(0, 4_000),
      pdf_url: String(input.paper.pdf_url || "").slice(0, 4_000),
    };
    const emit = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("paper-review:event", { ...payload, ...(clientRunId ? { clientRunId } : {}) });
    };
    const result = await runPaperReview({
      paper,
      pageCount: Math.max(0, Math.min(5_000, Number(input.pageCount) || 0)),
      workspace,
      projectId: typeof input.projectId === "string" && input.projectId ? input.projectId : undefined,
      contextItems,
      reasoningEffort,
      contextLength,
      browser: (args, signal, activeThreadId) => browserUse(event.sender, activeThreadId, args, signal),
      emit,
    });
    if (!result.error && result.summary?.response) store.savePaperReview(paper.id, result, input.projectId);
    return result;
  });

  ipcMain.handle("project:list-members", (_event, { projectId } = {}) => {
    if (typeof projectId !== "string" || !projectId) throw new Error("A project is required.");
    return store.listProjectMembers(projectId);
  });
  ipcMain.handle("project:add-member", (_event, input = {}) => store.addProjectMember(input));
  ipcMain.handle("project:update-member", (_event, { projectId, userId, role } = {}) => store.updateProjectMemberRole(projectId, userId, role));
  ipcMain.handle("project:remove-member", (_event, { projectId, userId } = {}) => store.removeProjectMember(projectId, userId));
  ipcMain.handle("audit:list", (_event, { projectId = null, limit = 100 } = {}) => store.listAuditEvents({ projectId, limit }));

  function requireCollaboration() {
    if (!collaborationApi) throw new Error("The collaboration service is not available. Restart Archimedes and try again.");
    return collaborationApi;
  }

  async function currentCloudEmail() {
    await authReady;
    return supabaseAuth.state().user?.email || "";
  }

  async function syncCloudProject(projectId) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing cloud members.");
    const [members, email] = await Promise.all([
      requireCollaboration().listMembers(project.cloud_project_id),
      currentCloudEmail(),
    ]);
    return { project: store.getResearchProject(projectId), members: store.syncProjectMembersFromCloud(projectId, members, { currentEmail: email }) };
  }

  ipcMain.handle("collab:status", async () => {
    await authReady;
    if (!collaborationApi) return { signedIn: false, user: null, error: "The collaboration service is not available." };
    return collaborationApi.status();
  });
  ipcMain.handle("collab:list-projects", async () => requireCollaboration().listProjects());
  ipcMain.handle("collab:sync-libraries", async (_event, { projectId } = {}) => createLibrarySync({ store, api: requireCollaboration() }).syncProjectLibraries(projectId));
  ipcMain.handle("collab:sync-annotations", async (_event, { projectId } = {}) => {
    await authReady;
    return createAnnotationSync({ store, api: requireCollaboration() }).syncProjectAnnotations(projectId, { currentCloudUserId: supabaseAuth.state().user?.id || "" });
  });
  ipcMain.handle("collab:sync-threads", async (_event, { projectId } = {}) => {
    await authReady;
    return createThreadSync({ store, api: requireCollaboration() }).syncProjectThreads(projectId, {
      currentCloudUserId: supabaseAuth.state().user?.id || "",
      localUserId: localIdentity.localIdentity().userId,
    });
  });
  ipcMain.handle("collab:publish-project", async (_event, { projectId } = {}) => {
    const api = requireCollaboration();
    let project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!store.canAccessProject(projectId, "admin")) throw new Error("You do not have permission to share this project.");
    if (!project.cloud_project_id) {
      const cloud = await api.createProject({ name: project.name, description: project.description });
      project = store.linkResearchProjectToCloud(projectId, cloud.id);
    }
    const warnings = [];
    for (const member of store.listProjectMembers(projectId)) {
      if (member.role === "owner" || !member.email) continue;
      try {
        await api.addMember(project.cloud_project_id, { email: member.email, role: member.role === "owner" ? "admin" : member.role });
      } catch (error) {
        warnings.push(`${member.display_name || member.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { ...(await syncCloudProject(projectId)), warnings };
  });
  ipcMain.handle("collab:sync-project", async (_event, { projectId } = {}) => syncCloudProject(projectId));
  ipcMain.handle("collab:add-member", async (_event, { projectId, email, role = "viewer" } = {}) => {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before inviting cloud members.");
    await requireCollaboration().addMember(project.cloud_project_id, { email, role });
    return syncCloudProject(projectId);
  });
  ipcMain.handle("collab:update-member", async (_event, { projectId, userId, role } = {}) => {
    const project = store.getResearchProject(projectId);
    if (!project?.cloud_project_id) throw new Error("This project is not linked to the cloud.");
    await requireCollaboration().updateMember(project.cloud_project_id, userId, role);
    return syncCloudProject(projectId);
  });
  ipcMain.handle("collab:remove-member", async (_event, { projectId, userId } = {}) => {
    const project = store.getResearchProject(projectId);
    if (!project?.cloud_project_id) throw new Error("This project is not linked to the cloud.");
    await requireCollaboration().removeMember(project.cloud_project_id, userId);
    return syncCloudProject(projectId);
  });
  ipcMain.handle("collab:import-project", async (_event, { cloudProjectId } = {}) => {
    const cloudProject = await requireCollaboration().getProject(cloudProjectId);
    const project = store.importCloudProject({
      cloudProjectId: cloudProject.id,
      name: cloudProject.name,
      description: cloudProject.description,
    });
    return syncCloudProject(project.id);
  });

  ipcMain.handle("comments:list", (_event, { workspace, projectId, resourceType, resourceId, includeResolved = true } = {}) => {
    if (workspace) store.openWorkspace(resolveWorkspace(workspace));
    return store.listComments({ projectId, resourceType, resourceId, includeResolved });
  });
  ipcMain.handle("comments:create", (_event, { workspace, projectId, resourceType, resourceId, body, parentId, anchor } = {}) => {
    if (workspace) store.openWorkspace(resolveWorkspace(workspace));
    return store.createComment({ projectId, resourceType, resourceId, body, parentId, anchor });
  });
  ipcMain.handle("comments:resolve", (_event, { workspace, id, resolved = true } = {}) => {
    if (workspace) store.openWorkspace(resolveWorkspace(workspace));
    return store.setCommentResolved(id, resolved);
  });
  ipcMain.handle("comments:delete", (_event, { workspace, id } = {}) => {
    if (workspace) store.openWorkspace(resolveWorkspace(workspace));
    return store.deleteComment(id);
  });

  ipcMain.handle("research-thread:set-visibility", (_event, { threadId, visibility } = {}) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("A research thread is required.");
    return store.setResearchThreadVisibility(threadId, visibility);
  });
  ipcMain.handle("research-thread:create-snapshot", (_event, { threadId } = {}) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("A research thread is required.");
    return store.createThreadSnapshot(threadId);
  });
  ipcMain.handle("research-thread:list-snapshots", (_event, { threadId } = {}) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("A research thread is required.");
    return store.listThreadSnapshots(threadId);
  });
  ipcMain.handle("research-thread:get-snapshot", (_event, snapshotId) => store.getThreadSnapshot(snapshotId));

  ipcMain.handle("paper-review:get", (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string" || !paperId) throw new Error("A paper ID is required to restore an evidence review.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || resolvedWorkspace;
    store.openWorkspace(dataWorkspace);
    return store.getPaperReview(paperId, projectId);
  });

  ipcMain.handle("paper-presentation:run", async (event, input) => {
    if (!input?.paper || typeof input.paper.id !== "string" || typeof input.paper.title !== "string") {
      throw new Error("A paper record is required to generate a presentation.");
    }
    const workspace = resolveWorkspace(input.workspace);
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || workspace;
    store.openWorkspace(dataWorkspace);
    const requestedSourceMode = input.sourceMode === "paper" ? "paper" : "review";
    const review = store.getPaperReview(input.paper.id, input.projectId);
    if (requestedSourceMode === "review" && !review) {
      throw new Error("Finish and save the text review, or choose Generate from original paper.");
    }
    const config = modelConfig.getActiveModelConfig();
    const reasoningEffort = normalizeReasoningEffort(config, input.reasoningEffort || "high");
    const contextLength = normalizeContextLength(config, input.contextLength || "extra-long");
    const contextItems = await sanitizeAgentContext(input.contextItems, workspace);
    const presentationLanguage = input.language === "en" ? "en" : "zh";
    const paper = {
      id: input.paper.id,
      title: input.paper.title.slice(0, 1_000),
      authors: Array.isArray(input.paper.authors) ? input.paper.authors.slice(0, 50).map((author) => String(author).slice(0, 300)) : [],
      year: Number.isInteger(input.paper.year) ? input.paper.year : null,
      venue: String(input.paper.venue || "").slice(0, 1_000),
      abstract: String(input.paper.abstract || "").slice(0, 12_000),
      url: String(input.paper.url || "").slice(0, 4_000),
      pdf_url: String(input.paper.pdf_url || "").slice(0, 4_000),
    };
    const reader = store.getPaperReader(paper.id);
    if (reader.asset?.status !== "ready" || !reader.asset.relative_path) {
      throw new Error("Prepare or attach the original paper PDF before generating a presentation.");
    }
    const sourcePdfPath = workspaceFiles.workspacePath(dataWorkspace, reader.asset.relative_path);
    const clientRunId = typeof input.clientRunId === "string" ? input.clientRunId.slice(0, 100) : "";
    const emitPresentation = (detail, extra = {}) => {
      if (!event.sender.isDestroyed()) event.sender.send("paper-presentation:event", { paperId: paper.id, clientRunId, detail, ...extra });
    };
    emitPresentation(requestedSourceMode === "paper" ? "Reading the original paper and planning the presentation…" : "Reading the paper and saved review to plan the presentation…");
    const result = await (requestedSourceMode === "paper" ? runPaperPresentationPlan : runKimiSlidesPlan)({
      paper,
      review: requestedSourceMode === "review" ? review : null,
      pageCount: Math.max(0, Math.min(5_000, Number(input.pageCount) || 0)),
      workspace,
      projectId: typeof input.projectId === "string" && input.projectId ? input.projectId : undefined,
      contextItems,
      reasoningEffort,
      contextLength,
      browser: (args, signal, activeThreadId) => browserUse(event.sender, activeThreadId, args, signal),
      language: presentationLanguage,
    });
    const presentationPlan = { ...result.presentation, generation_mode: requestedSourceMode };
    const artifact = await generateNativePptx({ paper, plan: presentationPlan, workspace: dataWorkspace,
      sourcePdfPath, emit: emitPresentation,
      onPage: async (page) => {
        const token = createPreviewToken(event.sender.id, dataWorkspace);
        const previewUrl = `archimedes-file://${token}/${page.pdfPath.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}`;
        emitPresentation(`Page ${page.index + 1} of ${page.total} is ready to view.`, {
          kind: "page-ready",
          page: { ...page, preview_url: previewUrl },
          presentation: {
            title: presentationPlan.title,
            subtitle: presentationPlan.subtitle,
            source_sufficiency: presentationPlan.source_sufficiency,
            generation_mode: presentationPlan.generation_mode,
            slides: presentationPlan.slides,
          },
        });
      } });
    const sourceMarker = requestedSourceMode === "review"
      ? review.updated_at
      : `paper:${reader.asset.updated_at || reader.asset.sha256 || "prepared"}`;
    const saved = store.savePaperPresentation(paper.id, { ...presentationPlan, artifact }, sourceMarker, input.projectId);
    const token = createPreviewToken(event.sender.id, dataWorkspace);
    return { ...saved, artifact: { ...saved.artifact,
      preview_url: `archimedes-file://${token}/${saved.artifact.pdf_path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}` } };
  });

  ipcMain.handle("paper-presentation:get", (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string" || !paperId) throw new Error("A paper ID is required to restore a presentation.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || resolvedWorkspace;
    store.openWorkspace(dataWorkspace);
    const saved = store.getPaperPresentation(paperId, projectId);
    if (!saved?.artifact || !["pptd", "pptx"].includes(saved.artifact.kind)) return saved;
    try {
      workspaceFiles.workspacePath(dataWorkspace, saved.artifact.pdf_path);
      const token = createPreviewToken(event.sender.id, dataWorkspace);
      return { ...saved, artifact: { ...saved.artifact,
        preview_url: `archimedes-file://${token}/${saved.artifact.pdf_path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}` } };
    } catch {
      return { ...saved, artifact: { ...saved.artifact, missing: true } };
    }
  });

  ipcMain.handle("paper-presentation:reveal", (event, { paperId, workspace, projectId } = {}) => {
    if (typeof paperId !== "string" || !paperId) throw new Error("A paper ID is required to locate a presentation.");
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    const dataWorkspace = workspaceForWindow(BrowserWindow.fromWebContents(event.sender)) || resolvedWorkspace;
    store.openWorkspace(dataWorkspace);
    const artifact = store.getPaperPresentation(paperId, projectId)?.artifact;
    if (!artifact || !["pptd", "pptx"].includes(artifact.kind)) throw new Error("This paper has no saved presentation.");
    const pptxPath = workspaceFiles.workspacePath(dataWorkspace, artifact.pptx_path);
    if (!fs.existsSync(pptxPath)) throw new Error("The saved presentation file is missing.");
    shell.showItemInFolder(pptxPath);
  });

  ipcMain.handle("paper-review:cleanup-internal-runs", (event, { workspace } = {}) => {
    const resolvedWorkspace = resolveWorkspace(workspace || windowWorkspaces.get(event.sender.id));
    store.openWorkspace(resolvedWorkspace);
    return store.deleteInternalPaperReviewThreads();
  });

  ipcMain.handle("model-config:capabilities", (_event, role) => getModelCapabilities(modelConfig.getActiveModelConfig(role)));

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

  ipcMain.handle("journey:get-settings", () => journeySettings.journeySettings());
  ipcMain.handle("auth:get-state", () => authReady.then(() => supabaseAuth.state()));
  ipcMain.handle("auth:sign-in", async (_event, { email, password } = {}) => {
    await authReady;
    return supabaseAuth.signIn(email, password);
  });
  ipcMain.handle("auth:sign-up", async (_event, { email, password, displayName } = {}) => {
    await authReady;
    return supabaseAuth.signUp(email, password, displayName);
  });
  ipcMain.handle("auth:sign-out", async () => {
    await authReady;
    return supabaseAuth.signOut();
  });
  ipcMain.handle("auth:access-token", async () => {
    await authReady;
    return supabaseAuth.accessToken();
  });
  ipcMain.handle("identity:get", () => localIdentity.localIdentity());
  ipcMain.handle("identity:update", (_event, patch = {}) => {
    const identity = localIdentity.updateLocalIdentity({ displayName: patch.displayName });
    store.setLocalIdentity(identity);
    return identity;
  });
  ipcMain.handle("workbench:get-settings", () => workbenchSettings.workbenchSettings());
  ipcMain.handle("workbench:save-settings", (_event, input = {}) => workbenchSettings.saveWorkbenchSettings(input));
  ipcMain.handle("workbench:reset-settings", () => workbenchSettings.resetWorkbenchSettings());
  ipcMain.handle("workbench:get-note", (_event, key) => workbenchNotes.getNote(key));
  ipcMain.handle("workbench:save-note", (_event, input = {}) => workbenchNotes.saveNote(input.key, input.content));
  ipcMain.handle("workbench:delete-note", (_event, key) => workbenchNotes.deleteNote(key));
  ipcMain.handle("journey:get-summary", (_event, threadId) => journeySnapshots.get(String(threadId || "")));
  ipcMain.handle("journey:clear-summary", (_event, threadId) => { journeySnapshots.remove(String(threadId || "")); return { cleared: true }; });
  ipcMain.handle("journey:summarize", async (_event, input = {}) => {
    const threadId = String(input.threadId || "").trim();
    if (!threadId) throw new Error("A thread is required to summarize a journey.");
    const inFlight = journeySummariesInFlight.get(threadId);
    if (inFlight) return inFlight;
    const settings = journeySettings.journeySettings();
    const previous = journeySnapshots.get(threadId);
    if (!settings.liveSummaries && !input.force) return previous;
    if (previous && Number(previous.coversTo) === Number(input.coversTo) && !input.force) return previous;
    const task = journeySummarizer.summarizeJourney({ input: { ...input, threadId }, settings, previous })
      .then((snapshot) => journeySnapshots.save(snapshot))
      .finally(() => journeySummariesInFlight.delete(threadId));
    journeySummariesInFlight.set(threadId, task);
    return task;
  });
  ipcMain.handle("journey:save-settings", (_event, input = {}) => journeySettings.saveJourneySettings(input));
  ipcMain.handle("journey:reset-settings", () => journeySettings.resetJourneySettings());

  ipcMain.handle("terminal:get-settings", () => terminalSettings.terminalSettings());
  ipcMain.handle("terminal:save-settings", (_event, input = {}) => terminalSettings.saveTerminalSettings(input));
  ipcMain.handle("terminal:open-external", (_event, input = {}) => terminalSettings.openExternalTerminal(input));

  ipcMain.handle("terminal:create", (event, input = {}) => {
    const workspace = resolveWorkspace(input.cwd);
    const cols = Math.max(2, Math.min(500, Number(input.cols) || 80));
    const rows = Math.max(1, Math.min(200, Number(input.rows) || 24));
    const { shell, args } = terminalSettings.shellLaunch();
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

  createWindow(startupWorkspace());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(startupWorkspace());
});

app.on("before-quit", () => {
  closeAllTerminals();
  collaborationServer?.close?.();
});
