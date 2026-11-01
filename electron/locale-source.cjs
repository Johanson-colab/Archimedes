// The locale lives in per-surface shards under src/i18n/translations. Audit
// tests only need the flattened key/value text, so they read every shard here
// instead of hard-coding one file path.
const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(__dirname, "..", "src", "i18n", "translations");

function readLocale() {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
    .join("\n");
}

module.exports = { readLocale, dir };
