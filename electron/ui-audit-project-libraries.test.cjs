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
const library = read("src/LibraryView.tsx");
const picker = read("src/ContextPicker.tsx");
const app = read("src/App.tsx");
const preview = read("src/library-preview.ts");

test("libraries are project-owned and migrated to their project", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS libraries \(\s*id TEXT PRIMARY KEY NOT NULL,\s*project_id TEXT,/);
  assert.match(store, /ensureColumn\(db, "libraries", "project_id", "TEXT"\)/);
  assert.match(store, /UPDATE libraries SET project_id = \? WHERE project_id IS NULL/);
  assert.match(store, /function ensureProjectLibraries/);
  assert.match(store, /Project library/);
  assert.match(store, /WHERE libraries\.project_id = \?/);
  assert.match(store, /You do not have permission to add libraries to this project/);
  assert.match(store, /A project needs at least one library/);
});

test("library IPC and renderer pass the active project", () => {
  assert.match(main, /ipcMain\.handle\("library:list", \(_event, input = \{\}\) => store\.listLibraries\(input\.projectId \?\? null\)\)/);
  assert.match(preload, /listLibraries: \(projectId\) => ipcRenderer\.invoke\("library:list", \{ projectId \}\)/);
  assert.match(bridge, /listLibraries: \(projectId\?: string \| null\) => Promise<ResearchLibrary\[\]>/);
  assert.match(library, /bridge\.listLibraries\(projectId \?\? undefined\)/);
  assert.match(library, /bridge\.createLibrary\(\{ \.\.\.input, projectId: projectId \?\? null \}\)/);
  assert.match(library, /setSelectedLibraryId\(null\);\s*setSelectedPaperId\(null\)/);
  assert.match(picker, /projectId\?: string \| null/);
  assert.match(picker, /bridge\.listLibraries\(projectId \?\? undefined\)/);
  assert.match(app, /<ContextPicker bridge=\{desktopBridge\} workspace=\{workspace\} projectId=\{projectId\}/);
  assert.match(app, /projectId=\{activeProjectId\}/);
  assert.match(preview, /listLibraries: async \(_projectId\?: string \| null\)/);
});
