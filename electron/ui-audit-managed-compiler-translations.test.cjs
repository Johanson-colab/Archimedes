const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const shard = fs.readFileSync(path.join(root, "src/i18n/translations/writing.ts"), "utf8");
const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");

const diagnostics = [
  "The managed LaTeX compiler could not be prepared.",
  "Retry the download, or switch to the installed local compiler.",
];

test("managed compiler diagnostics are translatable keys", () => {
  for (const message of diagnostics) {
    assert.ok(main.includes(`"${message}"`), `main.cjs should pass ${message} through t()`);
    const entry = new RegExp(`^\\s*"${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)",?\\s*$`, "m").exec(shard);
    assert.ok(entry, `writing shard is missing ${message}`);
    assert.notEqual(entry[1], message, `writing shard should translate ${message}`);
    assert.match(entry[1], /[一-鿿]/, `writing shard needs a Chinese value for ${message}`);
  }
});
