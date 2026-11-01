const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sourceFiles = fs.readdirSync(path.join(root, "src")).filter((file) => file.endsWith(".tsx"));

test("all modal surfaces use the shared dialog shell and skin", () => {
  for (const file of sourceFiles) {
    if (file === "Dialog.tsx" || file === "DialogPortal.tsx") continue;
    const source = read(`src/${file}`);
    assert.doesNotMatch(source, /aria-modal=/, `${file} should delegate dialog semantics to Dialog`);
    assert.doesNotMatch(source, /DialogPortal/, `${file} should delegate portalling to Dialog`);
  }
  const components = ["AuthModal.tsx", "SettingsModal.tsx", "ThreadShareModal.tsx", "ThreadCommentsModal.tsx", "CommandPalette.tsx", "ProjectSidebar.tsx", "LibraryView.tsx", "PaperWritingView.tsx", "ArtifactsPanel.tsx", "ExtensionsView.tsx", "TerminalSettingsModal.tsx"];
  for (const file of components) assert.match(read(`src/${file}`), /<Dialog\b/, `${file} should use the shared Dialog shell`);
  const dialog = read("src/Dialog.tsx");
  assert.match(dialog, /app-dialog/);
  assert.match(dialog, /aria-modal/);
  assert.match(dialog, /DialogPortal/);
  assert.match(dialog, /useDialogFocus/);
});

test("native confirms are replaced by the shared confirm provider", () => {
  assert.match(read("src/main.tsx"), /ConfirmProvider/);
  assert.match(read("src/ConfirmDialog.tsx"), /role="alertdialog"/);
  for (const file of sourceFiles) {
    assert.doesNotMatch(read(`src/${file}`), /window\.confirm/, `${file} still contains window.confirm`);
  }
});

test("lightboxes and extension dialogs participate in focus management", () => {
  assert.match(read("src/ArtifactsPanel.tsx"), /<Dialog\b/);
  assert.match(read("src/ExtensionsView.tsx"), /<Dialog\b/);
});

test("non-modal pickers and filters do not claim dialog semantics", () => {
  assert.doesNotMatch(read("src/ContextPicker.tsx"), /context-picker-menu[^>]*role="dialog"/);
  assert.doesNotMatch(read("src/ImageCreationView.tsx"), /image-creation-filter-panel[^>]*role="dialog"/);
  assert.doesNotMatch(read("src/DataChartGallery.tsx"), /data-chart-filter-panel[^>]*role="dialog"/);
});
