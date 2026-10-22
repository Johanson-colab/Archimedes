const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

function palette(selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector}`);
  return Object.fromEntries([...match[1].matchAll(/--code-([\w-]+):\s*([^;]+);/g)].map((item) => [item[1], item[2].trim()]));
}

function channels(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const linear = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function distance(left, right) {
  const a = channels(left);
  const b = channels(right);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("theme selection fills are distinct from code backgrounds and keep text readable", () => {
  for (const [selector, expected] of [[":root", "#264f78"], [':root[data-theme="paper"]', "#add6ff"]]) {
    const colors = palette(selector);
    assert.equal(colors.selection, expected);
    assert.ok(distance(colors.selection, colors.bg) > 60, `${selector} selection must stand out from code background`);
    assert.ok(contrast(colors.fg, colors.selection) >= 4.5, `${selector} selected text must meet 4.5:1`);
  }
});

test("CodeMirror and native preview selections use the theme variable", () => {
  assert.match(
    css,
    /\.cm-editor \.cm-selectionBackground,[\s\S]*?\.cm-editor\.cm-focused \.cm-selectionBackground\s*\{\s*background:\s*var\(--code-selection\)\s*!important;/,
  );
  assert.match(
    css,
    /html body :is\(\.message-code-block, \.code-preview, \.codebase-source\) ::selection,[\s\S]*?color:\s*inherit\s*!important;\s*background:\s*var\(--code-selection\)\s*!important;/,
  );
  assert.doesNotMatch(css, /--code-selection:\s*#(?:2a2d3d|e3ddd3)/);
});
