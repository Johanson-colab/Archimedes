const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "src", "i18n", "translations");
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".ts")).sort();

// The locale used to be one flat object that every branch appended to, so any two
// PRs adding a string conflicted at the same tail. It is now split per surface and
// sorted inside each file, which keeps additions on different lines.
function entries(file) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  return [...text.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)]
    .map((match) => [match[1], match[2]]);
}

test("translation shards cover every string exactly once", () => {
  assert.ok(files.length >= 8, "the locale should be split across surface files");
  const seen = new Map();
  const duplicates = [];
  let total = 0;
  for (const file of files) {
    for (const [key, value] of entries(file)) {
      total += 1;
      if (seen.has(key)) duplicates.push(key);
      seen.set(key, value);
    }
  }
  assert.deepEqual(duplicates, [], "a key must live in exactly one shard");
  assert.equal(seen.size, total, "every shard entry must survive the merge");
  assert.ok(total > 1000, `expected the full locale, found ${total} keys`);
});

test("keys stay sorted inside each shard so concurrent additions do not collide", () => {
  for (const file of files) {
    const keys = entries(file).map(([key]) => key.toLowerCase());
    for (let i = 1; i < keys.length; i += 1) {
      assert.ok(keys[i - 1] <= keys[i], `${file} is out of order at "${keys[i]}"`);
    }
  }
});

test("the shell merges every shard and keeps the surfaces translated", () => {
  const shell = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");
  for (const file of files) {
    const domain = file.replace(/\.ts$/, "");
    assert.match(shell, new RegExp(`import \\{ ${domain} as ${domain}Strings \\} from "\\./i18n/translations/${domain}"`));
    assert.match(shell, new RegExp(`\\.\\.\\.${domain}Strings,`));
  }
  const merged = new Map(files.flatMap(entries));
  assert.equal(merged.get("Paper content"), "论文内容");
  assert.equal(merged.get("FigureForge steps"), "FigureForge 步骤");
  assert.equal(merged.get("Canvas"), "画布");
});
