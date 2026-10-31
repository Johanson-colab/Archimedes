const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sourceFiles = fs.readdirSync(path.join(root, "src")).filter((file) => file.endsWith(".tsx"));

test("all modal surfaces use the shared dialog skin and portal", () => {
  for (const file of sourceFiles) {
    const source = read(`src/${file}`);
    for (const line of source.split("\n").filter((entry) => entry.includes('aria-modal="true"'))) {
      assert.match(line, /app-dialog/, `${file} has an aria-modal surface without app-dialog`);
    }
  }
  const components = ["AuthModal.tsx", "SettingsModal.tsx", "ThreadShareModal.tsx", "ThreadCommentsModal.tsx", "CommandPalette.tsx", "ProjectSidebar.tsx", "LibraryView.tsx", "PaperWritingView.tsx", "ArtifactsPanel.tsx", "ExtensionsView.tsx", "TerminalSettingsModal.tsx"];
  for (const file of components) assert.match(read(`src/${file}`), /DialogPortal/, `${file} should portal its modal`);
});

test("native confirms are replaced by the shared confirm provider", () => {
  assert.match(read("src/main.tsx"), /ConfirmProvider/);
  assert.match(read("src/ConfirmDialog.tsx"), /role="alertdialog"/);
  for (const file of sourceFiles) {
    assert.doesNotMatch(read(`src/${file}`), /window\.confirm/, `${file} still contains window.confirm`);
  }
});

test("lightboxes and extension dialogs participate in focus management", () => {
  assert.match(read("src/ArtifactsPanel.tsx"), /useDialogFocus/);
  assert.match(read("src/ExtensionsView.tsx"), /useDialogFocus/);
});

test("non-modal pickers and filters do not claim dialog semantics", () => {
  assert.doesNotMatch(read("src/ContextPicker.tsx"), /context-picker-menu[^>]*role="dialog"/);
  assert.doesNotMatch(read("src/ImageCreationView.tsx"), /image-creation-filter-panel[^>]*role="dialog"/);
  assert.doesNotMatch(read("src/DataChartGallery.tsx"), /data-chart-filter-panel[^>]*role="dialog"/);
});
