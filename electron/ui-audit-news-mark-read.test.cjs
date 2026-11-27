const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("News exposes mark-all-read through IPC and the chips row", () => {
  const view = read("src/NewsView.tsx");
  assert.match(view, /markAllNewsRead/);
  assert.match(view, /news-mark-read/);
  assert.match(view, /Mark all read/);
  assert.match(view, /const unreadCount = items\.reduce\(\(total, item\) => total \+ \(item\.read \? 0 : 1\), 0\);/);
  assert.match(read("electron/preload.cjs"), /markAllNewsRead/);
  assert.match(read("electron/main.cjs"), /news:mark-all-read/);
  assert.match(read("src/i18n/translations/news.ts"), /"Mark all read"/);
});
