const { BrowserWindow, session } = require("electron");
const dns = require("node:dns");
const { isPrivateAddress, publicHttpsUrl } = require("./remote-content.cjs");

const windows = new Map();
let requestsGuarded = false;
const checkedHosts = new Map();

function allowedNavigation(value) {
  try { publicHttpsUrl(value); return true; }
  catch { return false; }
}

async function allowedRequest(value) {
  if (/^(?:data|blob):/i.test(value)) return true;
  const candidate = value.startsWith("wss:") ? value.replace(/^wss:/, "https:") : value;
  if (!allowedNavigation(candidate)) return false;
  const host = new URL(candidate).hostname;
  const cached = checkedHosts.get(host);
  if (cached && cached.expires > Date.now()) return cached.allowed;
  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    const allowed = addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
    checkedHosts.set(host, { allowed, expires: Date.now() + 30_000 });
    return allowed;
  } catch { return false; }
}

function browserKey(sender, threadId) {
  return `${sender.id}:${threadId}`;
}

function getWindow(sender, threadId) {
  const key = browserKey(sender, threadId);
  const existing = windows.get(key);
  if (existing && !existing.window.isDestroyed()) return existing;
  if (!requestsGuarded) {
    session.fromPartition("persist:archimedes-research-browser").webRequest.onBeforeRequest((details, callback) => {
      void allowedRequest(details.url).then((allowed) => callback({ cancel: !allowed }), () => callback({ cancel: true }));
    });
    requestsGuarded = true;
  }
  const window = new BrowserWindow({
    parent: BrowserWindow.fromWebContents(sender) || undefined,
    width: 1180, height: 850, title: "Archimedes Browser",
    show: true,
    webPreferences: {
      partition: "persist:archimedes-research-browser", nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!allowedNavigation(typeof url === "string" ? url : event.url)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!allowedNavigation(typeof url === "string" ? url : event.url)) event.preventDefault();
  });
  const state = { window, links: [], snapshotUrl: "" };
  windows.set(key, state);
  window.on("closed", () => windows.delete(key));
  return state;
}

async function navigate(state, value, signal) {
  const url = publicHttpsUrl(value).href;
  if (signal?.aborted) throw new Error("Browser operation interrupted.");
  const stop = () => state.window.webContents.stop();
  signal?.addEventListener("abort", stop, { once: true });
  let timer;
  try {
    await Promise.race([
      state.window.loadURL(url),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Browser navigation timed out.")), 30_000); }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (signal?.aborted) throw new Error("Browser operation interrupted.");
}

async function snapshot(state, args = {}) {
  if (state.window.webContents.getURL() === "") throw new Error("Open a page before reading the browser.");
  const page = await state.window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: `(() => ({
    title: document.title,
    text: document.body?.innerText || "",
    links: [...document.querySelectorAll("a[href]")].slice(0, 120).map((link) => ({
      text: (link.innerText || link.getAttribute("aria-label") || "").trim().slice(0, 120), href: link.href
    })).filter((link) => link.text && link.href.startsWith("https://"))
  }))()` }], true);
  state.links = page.links.filter((link) => allowedNavigation(link.href));
  state.snapshotUrl = state.window.webContents.getURL();
  const text = String(page.text || "");
  const query = String(args.query || "").trim();
  const lower = text.toLocaleLowerCase();
  const found = query ? lower.indexOf(query.toLocaleLowerCase()) : -1;
  const start = found >= 0 ? Math.max(0, found - 250) : Math.max(0, Math.min(Number(args.start_char) || 0, text.length));
  const end = Math.min(text.length, start + 12_000);
  return {
    url: state.window.webContents.getURL(), title: page.title || state.window.getTitle(),
    retrieved_at: new Date().toISOString(), start_char: start, end_char: end,
    next_char: end < text.length ? end : null, text: text.slice(start, end),
    query_found: query ? found >= 0 : undefined,
    links: state.links.slice(0, 40).map((link, index) => ({ index, title: link.text, url: link.href })),
  };
}

async function browserUse(sender, threadId, args, signal) {
  const action = String(args.action || "read");
  if (action !== "open" && !windows.has(browserKey(sender, threadId))) throw new Error("Open a page in this research chat before reading or clicking.");
  const state = getWindow(sender, threadId);
  if (action === "open") {
    await navigate(state, args.url, signal);
  } else if (action === "click") {
    if (state.snapshotUrl !== state.window.webContents.getURL()) throw new Error("The page changed. Read it again before selecting a link.");
    const index = Number(args.link_index);
    const link = Number.isInteger(index) && index >= 0 && index < 40 ? state.links[index] : null;
    if (!link) throw new Error("Choose a link_index returned by the most recent browser read.");
    await navigate(state, link.href, signal);
  } else if (action !== "read") {
    throw new Error("Browser action must be open, read, or click.");
  }
  return snapshot(state, args);
}

module.exports = { browserUse };
