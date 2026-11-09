const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Claude-style menu and dialog tokens are in place", () => {
  const tokens = read("src/tokens.css");
  assert.match(tokens, /--menu-radius:\s*12px/);
  assert.match(tokens, /--menu-padding:\s*8px/);
  assert.match(tokens, /--menu-item-height:\s*30px/);
  assert.match(tokens, /--menu-item-font:\s*13px/);
  assert.match(tokens, /--menu-selected-bg:/);
  assert.match(tokens, /--dialog-radius-lg:\s*16px/);

  const css = read("src/styles.css");
  assert.match(css, /\.app-dialog-compact/);
  assert.match(css, /\.menu-surface \.menu-item\[aria-checked="true"\]/);
  assert.match(css, /\.menu-surface \.menu-item-chevron/);
  assert.match(css, /\.app-dialog \.app-dialog-context/);
  assert.match(css, /\.app-dialog \.dialog-ref-folder/);
});

test("menus support selected rows, chevrons, and the compact harness layout", () => {
  const menu = read("src/Menu.tsx");
  assert.match(menu, /chevron\?: boolean/);
  assert.match(menu, /<ChevronRight size=\{14\}/);

  const harness = read("src/HarnessPicker.tsx");
  assert.match(harness, /MenuDivider/);
  assert.match(harness, /chevron/);
  assert.match(harness, /Model settings/);
  assert.doesNotMatch(harness, /harness-picker-header/);
  assert.doesNotMatch(harness, /MenuLabel/);
});

test("dialogs use the compact Attempt B size where appropriate", () => {
  const dialog = read("src/Dialog.tsx");
  assert.match(dialog, /"compact"/);

  const confirm = read("src/ConfirmDialog.tsx");
  assert.match(confirm, /size="compact"/);
  assert.match(confirm, /app-dialog-context/);

  assert.match(read("src/AuthModal.tsx"), /size="compact"/);
  assert.match(read("src/LibraryWorkspace.tsx"), /size="compact"/);
  assert.match(read("src/PaperWritingView.tsx"), /size="compact"/);

  const sidebar = read("src/ProjectSidebar.tsx");
  assert.match(sidebar, /size="compact" className="dialog-ref project-create-modal"/);
  assert.match(sidebar, /size="compact" className="workspace-modal project-remove-modal"/);
  assert.equal((sidebar.match(/size="compact"/g) || []).length, 2);
});
