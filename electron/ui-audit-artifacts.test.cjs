const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const panel = read("src/ArtifactsPanel.tsx");
const model = read("src/artifacts-model.ts");
const tabs = read("src/workbench-tabs.tsx");
const settings = read("src/WorkbenchSettingsPanel.tsx");
const css = read("src/styles.css");
const agent = read("electron/agent.cjs");
const context = read("electron/agent/context.cjs");
const store = read("electron/store.cjs");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");

test("Artifacts is an independent, default-hidden workbench tab", () => {
  assert.match(tabs, /id: "artifacts", labelKey: "Artifacts"/);
  assert.match(tabs, /icon: <GalleryVerticalEnd size=\{13\} \/>, optional: true/);
  assert.match(tabs, /"journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"/);
  assert.match(tabs, /hidden: \[\.\.\.OPTIONAL_WORKBENCH_TAB_IDS\]/);
  assert.match(app, /artifacts: <ArtifactsPanel/);
  assert.match(app, /badges=\{\{[^}]*artifacts: artifactsBadge/);
  assert.match(app, /event\.type === "artifact"/);
  assert.match(app, /approval-apply/);
  assert.doesNotMatch(app, /approval-icon/);
  assert.match(css, /\.approval-apply/);
  assert.match(app, /setArtifactsVersion/);
  assert.match(settings, /<strong>\{t\(tab\.labelKey\)\}<\/strong>/);
  assert.doesNotMatch(settings, /Optional/);
});

test("the gallery is a square-card album with grouped output and filters", () => {
  assert.match(panel, /groupArtifacts\(filtered, currentTurnId\)/);
  assert.match(panel, /<h3>This turn<\/h3>/);
  assert.match(panel, /<h3>Earlier<\/h3>/);
  assert.match(panel, /All types/);
  assert.match(panel, /Images/);
  assert.match(panel, /Docs/);
  assert.match(panel, /Search artifacts/);
  assert.match(panel, /artifact-card\$\{!item\.seen/);
  assert.match(css, /\.artifact-card \{[^}]*border-radius: 0;/);
  assert.match(css, /\.artifact-thumb \{[^}]*aspect-ratio: 4 \/ 3;/);
  assert.match(css, /\.artifacts-group h3 \{[^}]*font-size: 11px;[^}]*font-weight: 650;[^}]*text-transform: none;/);
  assert.match(model, /artifactKind/);
  assert.match(model, /markdown/);
  assert.match(model, /changeSets/);
});

test("image artifacts open a large keyboard-navigable lightbox", () => {
  assert.match(panel, /artifact-lightbox-dialog/);
  assert.match(panel, /ArrowLeft/);
  assert.match(panel, /ArrowRight/);
  assert.match(panel, /Escape/);
  assert.match(panel, /Previous image/);
  assert.match(panel, /Next image/);
  assert.match(panel, /Open in Files/);
  assert.match(css, /\.artifact-lightbox \{ position: fixed/);
  assert.match(css, /\.artifact-lightbox-stage img/);
});

test("Markdown, data, and web artifacts have dedicated previews", () => {
  assert.match(panel, /ReactMarkdown/);
  assert.match(panel, /artifact-preview-markdown/);
  assert.match(panel, /artifact-preview-table/);
  assert.match(panel, /artifact-preview-code/);
  assert.match(panel, /sandbox=""/);
  assert.match(panel, /scripts, network, and same-origin access are disabled/);
});

test("the agent can register durable outputs as artifacts", () => {
  assert.match(agent, /name: "add_artifact"/);
  assert.match(agent, /store\.upsertArtifact\(\{/);
  assert.match(agent, /emit\(\{ type: "artifact", title: "Artifact saved"/);
  assert.match(context, /call add_artifact with its workspace-relative path/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS research_artifacts/);
  assert.match(store, /function upsertArtifact/);
  assert.match(store, /function listArtifacts/);
  assert.match(store, /function markArtifactsSeen/);
  assert.match(main, /ipcMain\.handle\("artifacts:list"/);
  assert.match(preload, /listArtifacts: \(threadId\)/);
  assert.match(bridge, /listArtifacts: \(threadId: string\) => Promise<ResearchArtifact\[\]>/);
});

test("Files remains the file browser and the old Artifacts page name is gone", () => {
  assert.match(app, /function FilesView\(/);
  assert.match(app, /mainSection === "files"/);
  assert.match(app, /setMainSection\("files"\)/);
  assert.doesNotMatch(app, /ArtifactsView/);
  assert.doesNotMatch(app, /mainSection === "artifacts"/);
  assert.doesNotMatch(app, /type Modal = "artifact"/);
});
