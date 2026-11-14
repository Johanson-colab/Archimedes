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

test("chat markdown links keep their underline and color without a fill", () => {
  assert.match(rule(".message-markdown a"), /text-decoration: underline/);
  for (const selector of [".message-markdown a", ".theme-paper .message-markdown a"]) {
    assert.doesNotMatch(rule(selector), /background(?:-color)?\s*:/);
  }
});
