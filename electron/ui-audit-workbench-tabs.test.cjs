const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const right = read("src/RightWorkbench.tsx");
const tabs = read("src/workbench-tabs.tsx");
const settings = read("src/SettingsModal.tsx");
const settingsPanel = read("src/WorkbenchSettingsPanel.tsx");
const changes = read("src/ChangesView.tsx");
const notes = read("src/NotesView.tsx");
const css = read("src/styles.css");
const i18n = read("src/i18n.tsx");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");

test("workbench tabs are registry-driven, reorderable, and configurable", () => {
  assert.match(tabs, /export type WorkbenchTabId = "journey" \| "trajectory" \| "files" \| "changes" \| "notes" \| "terminal"/);
  assert.match(tabs, /DEFAULT_WORKBENCH_TAB_ORDER: WorkbenchTabId\[\] = \["journey", "trajectory", "files", "changes", "notes", "terminal"\]/);
  assert.match(tabs, /setWorkbenchTabVisibility/);
  assert.match(right, /role="tablist"/);
  assert.match(right, /draggable/);
  assert.match(right, /onDrop=/);
  assert.match(right, /Customize tabs…/);
  assert.match(right, /Move left/);
  assert.match(right, /Move right/);
  assert.match(css, /\.workbench-tab\.drop-target::before/);
  assert.match(css, /\.workbench-menu/);
  assert.match(settings, /section === "workbench"/);
  assert.match(settings, /WorkbenchSettingsPanel/);
  assert.match(settingsPanel, /role="switch"/);
  assert.match(settingsPanel, /draggable/);
  assert.match(app, /getWorkbenchSettings/);
  assert.match(app, /saveWorkbenchSettings/);
  assert.match(main, /workbench:get-settings/);
  assert.match(main, /workbench:save-settings/);
  assert.match(preload, /getWorkbenchNote/);
  assert.match(preload, /saveWorkbenchNote/);
  assert.match(i18n, /"Customize tabs…"/);
});

test("Changes tab aggregates agent changes without duplicating the chat card", () => {
  assert.match(changes, /changeSets: WorkspaceChangeSet\[\]/);
  assert.match(changes, /visibleChanges/);
  assert.match(changes, /status/);
  assert.match(changes, /onOpenFile/);
  assert.match(changes, /No file changes yet/);
  assert.match(app, /<ChangesView changeSets=\{changeSets\}/);
  assert.match(app, /changes: <ChangesView/);
  assert.match(app, /badges=\{\{ changes: changesBadge/);
  assert.match(css, /\.changes-view/);
  assert.match(css, /\.change-row/);
});

test("Notes tab autosaves per conversation and sends into the composer", () => {
  assert.match(notes, /<textarea/);
  assert.match(notes, /Add to chat/);
  assert.match(notes, /Use as prompt/);
  assert.match(notes, /Send selection/);
  assert.match(notes, /notes-save-state/);
  assert.match(app, /getWorkbenchNote/);
  assert.match(app, /saveWorkbenchNote/);
  assert.match(app, /noteKey = activeThreadId \?\? draftNoteKey/);
  assert.match(app, /composerRequest.mode === "replace"/);
  assert.match(app, /function sendNoteToChat/);
  assert.match(css, /\.notes-editor/);
  assert.match(css, /\.notes-footer/);
});
