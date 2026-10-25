const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("every literal t() key has a Simplified Chinese translation", () => {
  const i18nSource = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");
  const translatedKeys = new Set(
    [...i18nSource.matchAll(/^\s*"((?:[^"\\]|\\.)+)"\s*:/gm)]
      .map((match) => JSON.parse(`"${match[1]}"`)),
  );
  const missing = [];
  for (const file of fs.readdirSync(path.join(root, "src")).filter((name) => name.endsWith(".tsx") && name !== "i18n.tsx")) {
    const source = fs.readFileSync(path.join(root, "src", file), "utf8");
    for (const match of source.matchAll(/\bt\("((?:[^"\\]|\\.)+)"/g)) {
      const key = JSON.parse(`"${match[1]}"`);
      if (!translatedKeys.has(key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the paper review workbench routes visible copy through i18n", () => {
  const source = fs.readFileSync(path.join(root, "src", "PaperReviewWorkbench.tsx"), "utf8");
  const required = [
    't("Evidence review")',
    't("Read the paper against its own record.")',
    't("Run review")',
    't("Independent readings")',
    't("Evidence audit")',
    't("Research memorandum")',
  ];
  for (const marker of required) assert.ok(source.includes(marker), `missing ${marker}`);
});
