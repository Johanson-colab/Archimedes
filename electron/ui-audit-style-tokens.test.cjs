const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const tokens = read("src", "tokens.css");
const styles = read("src", "styles.css");

test("button style tokens cover primary and secondary variants", () => {
  for (const token of [
    "--button-height", "--button-pad-x", "--button-radius", "--button-font-size",
    "--button-font-weight", "--button-gap", "--button-shadow",
    "--button-primary-bg", "--button-primary-ink", "--button-primary-border",
    "--button-primary-border-width", "--button-primary-hover-bg",
    "--button-secondary-height", "--button-secondary-pad-x", "--button-secondary-radius",
    "--button-secondary-font-weight", "--button-secondary-bg", "--button-secondary-ink",
    "--button-secondary-border", "--button-secondary-border-width",
    "--button-secondary-hover-bg", "--button-secondary-hover-ink", "--button-secondary-hover-border",
  ]) {
    assert.match(tokens, new RegExp(`${token}\\s*:`), `missing ${token}`);
  }
  assert.match(styles, /\.primary-button \{[^}]*background: var\(--button-primary-bg\)/);
  assert.match(styles, /\.primary-button \{[^}]*border: var\(--button-primary-border-width\)/);
  assert.match(styles, /\.primary-button:hover \{ background: var\(--button-primary-hover-bg\)/);
  assert.match(styles, /\.outline-button, \.secondary-button \{[^}]*background: var\(--button-secondary-bg\)/);
  assert.match(styles, /\.outline-button:hover, \.secondary-button:hover \{ color: var\(--button-secondary-hover-ink\)/);
});

test("paper overrides keep the same button tokens", () => {
  assert.match(tokens, /:root\[data-theme="paper"\][\s\S]*?--button-secondary-bg: #f3f0eb/);
  assert.match(tokens, /:root\[data-theme="paper"\][\s\S]*?--button-secondary-hover-bg: #e9e5df/);
  assert.match(styles, /\.theme-paper \.outline-button,[\s\S]*?background: var\(--button-secondary-bg\)/);
});

test("dialog style tokens cover settings, project, and gallery surfaces", () => {
  for (const token of [
    "--dialog-radius-lg", "--dialog-radius-md", "--dialog-radius-sm",
    "--dialog-shadow-lg", "--dialog-shadow-md", "--dialog-shadow-sm",
    "--dialog-border", "--dialog-border-strong", "--dialog-backdrop",
  ]) {
    assert.match(tokens, new RegExp(`${token}\\s*:`), `missing ${token}`);
  }
  assert.match(styles, /\.settings-modal \{[^}]*border-radius: var\(--dialog-radius-lg\)/);
  assert.match(styles, /\.settings-modal \{[^}]*box-shadow: var\(--dialog-shadow-lg\)/);
  assert.match(styles, /\.paper-project-dialog \{[^}]*border-radius: var\(--dialog-radius-md\)/);
  assert.match(styles, /\.gallery-dialog \{[^}]*border-radius: var\(--dialog-radius-sm\)/);
  assert.match(styles, /\.modal-backdrop, \.gallery-dialog-backdrop \{ background: var\(--dialog-backdrop\)/);
});

test("default geometry stays at the pre-token values", () => {
  assert.match(tokens, /--button-height: var\(--control-height\)/);
  assert.match(tokens, /--button-radius: var\(--radius-control\)/);
  assert.match(tokens, /--button-secondary-radius: 5px/);
  assert.match(tokens, /--dialog-radius-lg: 12px/);
  assert.match(tokens, /--dialog-radius-md: 9px/);
  assert.match(tokens, /--dialog-radius-sm: 7px/);
});
