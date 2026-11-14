const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");

function rule(selector) {
  const start = styles.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  const end = styles.indexOf("}", start);
  assert.ok(end > start, `unterminated ${selector}`);
  return styles.slice(start, end + 1);
}

test("the sessions popover constrains its list so the list can scroll", () => {
  const popover = rule(".menu-surface.session-switcher-popover");
  assert.match(popover, /display: flex/);
  assert.match(popover, /flex-direction: column/);
  const list = rule(".session-list");
  assert.match(list, /min-height: 0/);
  assert.match(list, /flex: 1 1 auto/);
  assert.match(list, /overflow-y: auto/);
});
