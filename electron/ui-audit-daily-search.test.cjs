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

test("daily rows pair the copy with the paper figure on the right", () => {
  const literature = fs.readFileSync(path.join(root, "electron", "literature.cjs"), "utf8");
  assert.match(library, /function DailyThumbnail\(/);
  assert.match(library, /daily-paper-thumb/);
  assert.match(library, /IntersectionObserver/);
  assert.match(library, /bridge\.getDailyFigure/);
  assert.match(css, /\.daily-paper-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 208px/);
  assert.match(css, /\.daily-paper-thumb img \{[^}]*object-fit: cover/);
  // The preview is the paper's own figure, not a generated social card.
  assert.match(literature, /ARXIV_HTML_HOSTS = \["https:\/\/arxiv\.org\/html"/);
  assert.match(literature, /function firstFigureSrc/);
  assert.match(literature, /<figure/);
  assert.doesNotMatch(literature, /social-thumbnails/);
});

test("the save action sits beside the open-paper link", () => {
  assert.match(library, /daily-paper-title"><h2>\{paper\.title\}<\/h2>\{paper\.url && <a[^>]*><ExternalLink size=\{13\} \/><\/a>\}<button/);
});

test("conference rows reuse the daily row structure", () => {
  const conference = fs.readFileSync(path.join(root, "src", "ConferenceDiscovery.tsx"), "utf8");
  assert.match(conference, /className="daily-paper-row conference-paper-row"/);
  assert.match(conference, /className="daily-paper-title"/);
  assert.match(conference, /className="daily-paper-meta"/);
  // Save moved into the title row, next to the open-record link.
  assert.match(conference, /<ExternalLink size=\{13\} \/><\/a>\s*<button[^>]*onClick=\{\(\) => void save\(paper\)\}/);
  assert.match(css, /\.conference-paper-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(conference, /className="daily-paper-date"><strong>/);
});
