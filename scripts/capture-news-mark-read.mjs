// Credential-free News fixture rendered by the real Electron shell.
// Build first, then run the printed runner with Electron to capture the pair.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2] || "after";
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-news-mark-read-"));
const output = path.join(root, "docs/assets/news-mark-all-read");
fs.mkdirSync(output, { recursive: true });
const source = (name) => JSON.stringify(path.join(root, "src", name));
const baseline = new Map(stage === "before"
  ? ["NewsView.tsx", "styles.css"].map((name) => [path.join(root, "src", name).replaceAll("\\", "/"), execFileSync("git", ["show", `origin/main:src/${name}`], { cwd: root, encoding: "utf8" })])
  : []);
const baselineSource = (id) => baseline.get(String(id).split("?")[0].replaceAll("\\", "/"));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UISettingsProvider } from ${source("i18n.tsx")};
import NewsView from ${source("NewsView.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const still = document.createElement('style');
still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
localStorage.setItem('archimedes-language', 'en');
const theme = 'paper';
applyAppearance(document.documentElement, normalizeAppearance({ preset: theme }), theme);
const now = new Date().toISOString();
const settings = { version: 1, view: 'feed', sources: { hn: true, github: true, arxiv: true, lobsters: true, reddit: false, rss: true, x: false, 'x-tavily': false }, rssFeeds: [], reddit: { subreddits: [], clientId: '', clientSecret: '', configured: false }, github: { token: '', configured: false }, x: { bearerToken: '', query: '', configured: false }, watch: ['agents'], mute: [], cadenceMinutes: 10, sinceHours: 24, clustering: true };
const items = [
  { id: 'hn:1', source: 'hn', sourceLabel: 'Hacker News', title: 'A new benchmark for long-context research agents', url: 'https://example.org/agent-bench', author: 'research', publishedAt: now, fetchedAt: now, score: 128, comments: 42, summary: 'A practical evaluation of long-context planning and retrieval.', tags: [], media: [], native: {}, clusterId: '', saved: false, read: false },
  { id: 'arxiv:1', source: 'arxiv', sourceLabel: 'arXiv', title: 'Evidence-grounded scientific writing with local models', url: 'https://arxiv.org/abs/2611.00001', author: 'A. Researcher', publishedAt: now, fetchedAt: now, score: 0, comments: 0, summary: 'We study citation faithfulness and numeric traceability in manuscript drafting.', tags: [], media: [], native: {}, clusterId: '', saved: false, read: false },
  { id: 'rss:1', source: 'rss', sourceLabel: 'RSS', title: 'How research labs organize experiments', url: 'https://example.org/lab-notes', author: 'Lab Notes', publishedAt: now, fetchedAt: now, score: 0, comments: 0, summary: 'A tour of reproducible experiment tracking.', tags: ['Google DeepMind'], media: [], native: { feedLabel: 'Google DeepMind' }, clusterId: '', saved: false, read: true },
];
const sources = [
  { id: 'hn', label: 'Hacker News', total: 1, unread: 1, status: 'ok', message: '', lastSuccessAt: now },
  { id: 'arxiv', label: 'arXiv', total: 1, unread: 1, status: 'ok', message: '', lastSuccessAt: now },
  { id: 'rss', label: 'RSS', total: 1, unread: 0, status: 'ok', message: '', lastSuccessAt: now },
];
const feed = { items, sources, updatedAt: now, settings };
const bridge = {
  listNews: async () => structuredClone(feed),
  refreshNews: async () => ({ skipped: true, results: [] }),
  setNewsSettings: async (patch) => ({ ...settings, ...patch }),
  markNewsRead: async () => ({ ok: true }),
  markAllNewsRead: async () => ({ ok: true }),
  setNewsSaved: async () => ({ ok: true }),
  openExternalUrl: async () => {},
  listLibraries: async () => [],
  createLibrary: async () => ({ id: 'library-1', name: 'Saved news' }),
  addLibraryPaper: async () => ({}),
  getWebSearchConfig: async () => ({ configuredProviders: [] }),
};
createRoot(document.getElementById('root')).render(
  <UISettingsProvider>
    <NewsView bridge={bridge} projectId="project-1" active onSendToChat={() => {}} />
  </UISettingsProvider>
);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline", enforce: "pre", load(id) { return baselineSource(id); } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    await win.loadFile(path.join(temporary, "dist/index.html"));
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(() => Boolean(document.querySelector(".news-chips")))) break;
      await pause(60);
    }
    await pause(250);
    const state = await evaluate(() => ({
      items: document.querySelectorAll(".news-card").length,
      chips: Boolean(document.querySelector(".news-chips")),
      markAll: Boolean(document.querySelector(".news-mark-read")),
    }));
    fs.writeFileSync(path.join(output, `chips-${stage}.png`), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify(state));
    win.destroy();
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* Electron may still release profile handles. */ }
    const passed = state.items === 3 && state.chips && (stage === "before" ? !state.markAll : state.markAll);
    app.exit(passed ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* The temporary profile is safe to leave for cleanup. */ }
    app.exit(1);
  });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
