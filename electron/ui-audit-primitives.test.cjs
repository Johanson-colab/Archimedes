const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sourceFiles = fs.readdirSync(path.join(root, "src")).filter((file) => file.endsWith(".tsx"));

test("settings surfaces share the settings primitives", () => {
  const primitive = read("src/SettingsPrimitives.tsx");
  for (const name of ["SettingsSection", "SettingsGroup", "SettingsRow", "SettingsSwitch", "SettingsChoiceGroup"]) {
    assert.match(primitive, new RegExp(`export function ${name}`), `missing ${name}`);
  }
  assert.match(primitive, /role="radiogroup"/);
  assert.match(primitive, /role="switch"/);

  for (const file of [
    "src/SettingsModal.tsx",
    "src/AccountSettingsPanel.tsx",
    "src/ProjectMembersPanel.tsx",
    "src/SharedRunsPanel.tsx",
    "src/JourneySettingsPanel.tsx",
    "src/ProactiveSettingsPanel.tsx",
    "src/TerminalSettingsModal.tsx",
    "src/WebSearchSettingsModal.tsx",
  ]) {
    assert.match(read(file), /SettingsPrimitives/, `${file} should import settings primitives`);
  }

  for (const file of sourceFiles) {
    if (file === "SettingsPrimitives.tsx") continue;
    const source = read(`src/${file}`);
    assert.doesNotMatch(source, /className="settings-row(?:\s|")/, `${file} still builds a settings row by hand`);
    assert.doesNotMatch(source, /className="settings-choice/, `${file} still builds a settings choice group by hand`);
    assert.doesNotMatch(source, /^function (Row|Toggle|Choice|SettingsRow|SettingsSwitch)\b/m, `${file} still has a local settings primitive`);
  }
});

test("state and notice surfaces share the feedback primitives", () => {
  const state = read("src/StateView.tsx");
  assert.match(state, /role=\{tone === "error" \? "alert"/);
  assert.match(state, /aria-busy/);
  const notice = read("src/InlineNotice.tsx");
  assert.match(notice, /role=\{tone === "danger" \? "alert"/);
  assert.match(notice, /aria-live/);

  for (const file of [
    "src/LibraryView.tsx",
    "src/ExtensionsView.tsx",
    "src/ArtifactsPanel.tsx",
    "src/DataChartGallery.tsx",
    "src/ImageCreationView.tsx",
    "src/ReproduceView.tsx",
    "src/BenchmarkRadarView.tsx",
    "src/ContextPicker.tsx",
    "src/ThreadCommentsModal.tsx",
    "src/ProjectMembersPanel.tsx",
    "src/ConferenceDiscovery.tsx",
    "src/SkillsView.tsx",
    "src/PaperWritingView.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /StateView|InlineNotice/, `${file} should use shared feedback primitives`);
  }
  assert.doesNotMatch(read("src/LibraryView.tsx"), /<div className="library-error"/);
  assert.doesNotMatch(read("src/ExtensionsView.tsx"), /<div className="skills-error"/);
});

test("every modal delegates portalling, focus, and ARIA to Dialog", () => {
  const dialog = read("src/Dialog.tsx");
  assert.match(dialog, /DialogPortal/);
  assert.match(dialog, /useDialogFocus/);
  assert.match(dialog, /role/);
  assert.match(dialog, /aria-modal/);
  assert.match(dialog, /app-dialog/);
  assert.match(dialog, /as="form"|as === "form"/);
  assert.match(dialog, /onSubmit/);

  for (const file of [
    "src/App.tsx",
    "src/AuthModal.tsx",
    "src/SettingsModal.tsx",
    "src/TerminalSettingsModal.tsx",
    "src/ThreadShareModal.tsx",
    "src/ThreadCommentsModal.tsx",
    "src/LibraryView.tsx",
    "src/ProjectSidebar.tsx",
    "src/PaperWritingView.tsx",
    "src/ArtifactsPanel.tsx",
    "src/ExtensionsView.tsx",
    "src/ImageCreationView.tsx",
    "src/DataChartGallery.tsx",
    "src/CommandPalette.tsx",
    "src/JourneyView.tsx",
    "src/ConfirmDialog.tsx",
  ]) {
    assert.match(read(file), /<Dialog\b/, `${file} should use the shared Dialog`);
  }
  for (const file of sourceFiles) {
    if (file === "Dialog.tsx" || file === "DialogPortal.tsx") continue;
    assert.doesNotMatch(read(`src/${file}`), /aria-modal=/, `${file} still owns aria-modal`);
  }
});
