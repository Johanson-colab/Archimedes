const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const registry = fs.readFileSync(path.join(root, "src", "sidebar-registry.tsx"), "utf8");
const view = fs.readFileSync(path.join(root, "src", "PaperReviewView.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const workbench = fs.readFileSync(path.join(root, "src", "PaperReviewWorkbench.tsx"), "utf8");
const presentation = fs.readFileSync(path.join(root, "src", "PaperPresentationDeck.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const sidebarSettings = fs.readFileSync(path.join(root, "electron", "sidebar-settings.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const i18n = readLocale();

test("Paper review is a built-in micro app in a separate Evaluate group", () => {
  assert.match(registry, /id: "paper-review"[^\n]*section: "evaluate"[^\n]*labelKey: "Paper review"[^\n]*icon: ClipboardCheck/);
  assert.match(registry, /export type SidebarSection = "knowledge" \| "create" \| "evaluate"/);
  assert.match(sidebarSettings, /const CORE_MODULE_IDS = \[[^\]]*"paper-review"/);
  assert.match(app, /\["knowledge", "create", "evaluate"\] as const/);
  assert.match(app, /id === "create" \? t\("Create"\) : t\("Evaluate"\)/);
});

test("Paper review is registry-hosted with a real bridge and in-page controls", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/PaperReviewView"\)\)/);
  assert.match(app, /"paper-review": <PaperReviewView bridge=\{desktopBridge\} workspace=\{executionWorkspace\} projectId=\{activeProjectId\} active=\{mainSection === "paper-review"\} \/>/);
  assert.doesNotMatch(view, /ToolbarActions|ToolbarPortal|module-toolbar-actions/);
  assert.match(view, /pra-header/);
  assert.match(view, /Run simulated review/);
  assert.match(view, /pra-reviewers/);
  assert.match(view, /t\("Export"\)/);
});

test("Library Review tab is renamed Interactive paper and the old workbench reads as reading", () => {
  assert.match(library, /<Tab value="review"[\s\S]{0,120}>\{t\("Interactive paper"\)\}<\/Tab>/);
  assert.match(workbench, /<Tab value="review">Reading<\/Tab>/);
  assert.match(workbench, /Run reading/);
  assert.doesNotMatch(workbench, /Text review/);
  assert.match(presentation, /Use saved reading/);
});

test("Paper review exposes venue packs, model choice and a simulated-review disclaimer", () => {
  assert.match(view, /listPaperReviewVenues/);
  assert.match(view, /Simulated review/);
  assert.match(view, /Main agent model/);
  assert.match(view, /Custom provider/);
  assert.match(view, /API key/);
  assert.match(view, /Text is sent only to the selected provider/);
  assert.match(view, /localStorage|local|Local/);
  assert.match(css, /\.pra-page/);
  assert.match(css, /\.pra-score-summary/);
  assert.match(css, /\.pra-reviewer/);
  assert.doesNotMatch(css.match(/\.pra-page[\s\S]*?(?=\n\/\*|$)/)?.[0] || "", /#[0-9a-f]{3,8}\b/i);
});

test("Paper review API surface is wired through preload and main", () => {
  for (const channel of [
    "paper-review-app:get-settings",
    "paper-review-app:save-settings",
    "paper-review-app:list-venues",
    "paper-review-app:list-papers",
    "paper-review-app:choose-pdf",
    "paper-review-app:create",
    "paper-review-app:get-run",
    "paper-review-app:list-runs",
    "paper-review-app:cancel-run",
    "paper-review-app:delete-run",
    "paper-review-app:export-run",
  ]) {
    assert.ok(main.includes(`ipcMain.handle("${channel}"`), `main handles ${channel}`);
  }
  assert.match(preload, /createPaperReviewRun: \(input\) => ipcRenderer\.invoke\("paper-review-app:create", input\)/);
  assert.match(preload, /onPaperReviewProgress: \(callback\) =>/);
  assert.match(main, /paperReview\.initialize\(app\.getPath\("userData"\)\)/);
});

test("Paper review strings are translated", () => {
  assert.match(i18n, /"Paper review": "论文评审"/);
  assert.match(i18n, /"Simulated review": "模拟评审"/);
  assert.match(i18n, /"Interactive paper": "交互论文"/);
  assert.match(i18n, /"Score-conditioned reviewers": "分数条件审稿人"/);
  assert.match(i18n, /"Evaluate": "评估"/);
});
