const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

function luminance(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function paperRule(selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector}`);
  return match[1];
}

test("paper workspace tree keeps readable file names on hover", () => {
  assert.match(paperRule(".theme-paper .workspace-tree-row"), /color:\s*#5e5e58/);
  assert.match(paperRule(".theme-paper .workspace-tree-row:hover"), /color:\s*#292926/);
  assert.match(paperRule(".theme-paper .workspace-tree-row:not(.active):hover .tree-file-icon"), /color:\s*#5f5a53/);
  assert.ok(contrast("#292926", "#f2efeb") >= 4.5, "hover text should meet 4.5:1");
  assert.ok(contrast("#5e5e58", "#f2efeb") >= 4.5, "normal text should meet 4.5:1");
});
