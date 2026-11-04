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

test("a daily row opens a large paper preview without losing its inline actions", () => {
  assert.match(library, /function DailyPaperPreview\(/);
  assert.match(library, /<Dialog open onClose=\{onClose\} size="lg" className="daily-paper-preview-dialog"/);
  assert.match(library, /className="daily-paper-preview-figure"/);
  assert.match(library, /bridge\.getDailyFigure/);
  assert.match(library, /className="daily-paper-preview-actions"/);
  assert.match(library, /role="button"[\s\S]*?setPreviewPaper\(paper\)/);
  assert.match(library, /closest\("a, button, input, textarea, select, label"\)/);
  assert.match(css, /\.daily-paper-preview-dialog \{[^}]*max-height: min\(780px/);
  assert.match(css, /\.daily-paper-preview-body \{[^}]*grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, \.95fr\)/);
  assert.match(css, /\.daily-paper-row \{[^}]*cursor: pointer/);
});

test("quick and deep search share one send button and search surface", () => {
  const sendButtons = library.match(/className="daily-search-send"/g) || [];
  assert.equal(sendButtons.length, 1);
  assert.match(library, /title=\{searchKind === "deep" \? "Deep search" : "Search"\}/);
  assert.doesNotMatch(library, /daily-search-input-row .*primary-button/);
  assert.match(css, /\.daily-search-panel\.deep \{ padding: 9px; \}/);
  assert.match(css, /\.daily-search-panel\.deep \.daily-search-kind button\.active \{ color: #235b45; \}/);
  // The send arrow sits inside the field, mirroring the main chat composer.
  assert.match(css, /\.daily-search-send \{[^}]*position: absolute; right: 4px; bottom: 4px;[^}]*width: 30px; height: 30px;[^}]*color: var\(--text-muted\)[^}]*background: transparent/);
  assert.match(css, /\.daily-search-send:hover:not\(:disabled\) \{ color: var\(--accent\); \}/);
  assert.match(css, /\.daily-search-input-row input, \.daily-search-input-row textarea \{[^}]*padding: 10px 44px 10px 11px/);
  assert.match(css, /\.daily-search-input-row textarea \{[^}]*padding-bottom: 40px/);
});

test("the open-paper link sits on the row surface instead of an accent chip", () => {
  assert.match(css, /\.daily-paper-title a \{ background: transparent !important; border-color: transparent !important; \}/);
  assert.doesNotMatch(css, /\.daily-paper-title a,\s*\n\.reader-document-kicker/);
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
