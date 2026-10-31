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
const review = read("src/PaperReviewWorkbench.tsx");
const presentation = read("src/PaperPresentationDeck.tsx");

test("paper annotations and personal state are scoped in the schema", () => {
  assert.match(store, /project_id TEXT,\s*paper_id TEXT NOT NULL REFERENCES papers\(id\) ON DELETE CASCADE,\s*author_id TEXT,/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS paper_user_state/);
  assert.match(store, /project_id TEXT NOT NULL,\s*paper_id TEXT NOT NULL REFERENCES papers\(id\) ON DELETE CASCADE,\s*owner_id TEXT NOT NULL/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS paper_chat_threads \(\s*project_id TEXT NOT NULL,\s*paper_id TEXT NOT NULL/);
  assert.match(store, /function migrateProjectScopedPaperData/);
  assert.match(store, /paper_reviews_legacy/);
  assert.match(store, /paper_user_state \(paper_id, user_id, reading_status/);
  assert.match(store, /resolveLibraryProject\(projectId\)/);
});

test("projectId is threaded through reader, review, presentation, and chat IPC", () => {
  assert.match(main, /readerStateForWindow\(event\.sender\.id, resolvedWorkspace, paperId, projectId\)/);
  assert.match(main, /store\.getPaperChatThread\(paperId, projectId\)/);
  assert.match(main, /store\.setPaperChatThread\(paperId, threadId, projectId\)/);
  assert.match(main, /store\.createPaperHighlight\(paperId, input, projectId\)/);
  assert.match(main, /store\.getPaperReview\(paperId, projectId\)/);
  assert.match(main, /store\.savePaperReview\(paper\.id, result, input\.projectId\)/);
  assert.match(main, /store\.getPaperPresentation\(paperId, projectId\)/);
  assert.match(main, /store\.savePaperPresentation\(paper\.id, \{ \.\.\.presentationPlan, artifact \}, sourceMarker, input\.projectId\)/);
  assert.match(preload, /getLibraryPaperReader: \(paperId, workspace, projectId\)/);
  assert.match(preload, /getPaperReview: \(paperId, workspace, projectId\)/);
  assert.match(bridge, /getPaperReview: \(paperId: string, workspace\?: string, projectId\?: string \| null\)/);
});

test("renderer passes the active project to annotation operations", () => {
  assert.match(library, /getLibraryPaperReader\(paper\.id, workspace, projectId\)/);
  assert.match(library, /getLibraryPaperChatThread\(paper\.id, workspace, projectId\)/);
  assert.match(library, /createLibraryPaperHighlight\(paper\.id, \{/);
  assert.match(library, /\}, workspace, projectId\)/);
  assert.match(library, /deleteLibraryPaperHighlight\(id, workspace, projectId\)/);
  assert.match(review, /getPaperReview\(paper\.id, workspace, projectId\)/);
  assert.match(presentation, /getPaperPresentation\(paper\.id, workspace, projectId\)/);
  assert.match(presentation, /revealPaperPresentation\(paper\.id, workspace, projectId\)/);
});
