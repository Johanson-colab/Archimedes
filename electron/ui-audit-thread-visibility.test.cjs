const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const store = read("electron/store.cjs");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");
const app = read("src/App.tsx");
const share = read("src/ThreadShareModal.tsx");
const css = read("src/styles.css");

test("threads have owner and visibility, and snapshots are persisted", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS research_threads \([\s\S]*?owner_id TEXT,[\s\S]*?visibility TEXT NOT NULL DEFAULT 'project'/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS thread_snapshots/);
  assert.match(store, /ensureColumn\(db, "research_threads", "visibility"/);
  assert.match(store, /function setResearchThreadVisibility/);
  assert.match(store, /function createThreadSnapshot/);
  assert.match(store, /function listThreadSnapshots/);
  assert.match(store, /function getThreadSnapshot/);
});

test("thread visibility and snapshot APIs are exposed", () => {
  assert.match(main, /ipcMain\.handle\("research-thread:set-visibility"/);
  assert.match(main, /ipcMain\.handle\("research-thread:create-snapshot"/);
  assert.match(main, /ipcMain\.handle\("research-thread:list-snapshots"/);
  assert.match(preload, /setResearchThreadVisibility/);
  assert.match(preload, /createResearchThreadSnapshot/);
  assert.match(bridge, /setResearchThreadVisibility: \(threadId: string/);
  assert.match(bridge, /createResearchThreadSnapshot: \(threadId: string\)/);
});

test("thread snapshots can be inspected and downloaded from a share dialog", () => {
  assert.match(app, /ThreadShareModal/);
  assert.match(app, /openThreadShare/);
  assert.match(app, /Share thread snapshot/);
  assert.match(share, /Share a snapshot/);
  assert.match(share, /Copy JSON/);
  assert.match(share, /Download \.json/);
  assert.match(share, /Cloud share links and guest access arrive with the collaboration service/);
  assert.match(css, /\.thread-share-modal/);
});

test("the composer exposes a project/private thread toggle", () => {
  assert.match(app, /const \[threadVisibility, setThreadVisibility\] = useState<"project" \| "private">\("project"\)/);
  assert.match(app, /visibility: threadVisibility/);
  assert.match(app, /changeThreadVisibility/);
  assert.match(app, /thread-visibility-trigger/);
  assert.match(app, /Private draft/);
  assert.match(app, /Project thread/);
  assert.match(css, /\.thread-visibility-trigger/);
});
