const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const library = read("src", "LibraryView.tsx");
const css = read("src", "styles.css");

test("clearing the search box restores the live feed without a button", () => {
  // Emptying the input has to reset the submitted search, otherwise Latest /
  // Trending and the range control stay locked behind an explicit button.
  assert.match(library, /function changeQuery\(value: string\) \{/);
  assert.match(library, /if \(!value\.trim\(\) && submittedQuery\) clearSearch\(\);/);
  assert.equal((library.match(/onChange=\{\(event\) => changeQuery\(event\.target\.value\)\}/g) || []).length, 2);
  assert.doesNotMatch(library, /daily-clear-search/);
  assert.doesNotMatch(library, />Clear search</);
  assert.doesNotMatch(css, /\.daily-clear-search/);
});

test("the range control offers an all-time option", () => {
  assert.match(library, /const DAILY_RANGES: Array<\{ id: DailyDiscoveryRange; label: string \}> = \[/);
  assert.match(library, /\{ id: "all", label: "All" \}/);
  assert.match(library, /\{DAILY_RANGES\.map\(\(item\) => <button key=\{item\.id\}/);
  assert.doesNotMatch(library, /\(\["7d", "30d", "90d"\] as DailyDiscoveryRange\[\]\)/);
});

test("speech and audio is offered as a daily topic", () => {
  assert.match(library, /\{ id: "speech_audio", label: "Speech & Audio", description: "[^"]+" \}/);
});

test("daily rows pair the copy with a thumbnail on the right", () => {
  const literature = fs.readFileSync(path.join(root, "electron", "literature.cjs"), "utf8");
  assert.match(library, /daily-paper-aside/);
  assert.match(library, /daily-paper-thumb/);
  assert.match(library, /loading="lazy"/);
  assert.match(library, /event\.currentTarget\.remove\(\)/);
  assert.match(css, /\.daily-paper-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 208px/);
  assert.match(css, /\.daily-paper-thumb img \{[^}]*object-fit: cover/);
  assert.match(literature, /social-thumbnails\/papers/);
  assert.match(literature, /thumbnail: arxivThumbnailUrl\(arxivId\)/);
  assert.match(literature, /thumbnail: normalizeThumbnailUrl\(item\.thumbnail/);
});
