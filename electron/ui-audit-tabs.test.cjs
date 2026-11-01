const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the shared tab primitive handles roving focus and ARIA", () => {
  const tabs = read("src/Tabs.tsx");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{active\}/);
  assert.match(tabs, /aria-controls=\{controls\}/);
  assert.match(tabs, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(tabs, /event\.key === previousKey/);
  assert.match(tabs, /event\.key === nextKey/);
  assert.match(tabs, /event\.key === "Home"/);
  assert.match(tabs, /event\.key === "End"/);
});

test("all true tab groups use the primitive", () => {
  const groups = [
    ["src/RightWorkbench.tsx", /<Tabs value=\{activeTab\}/],
    ["src/ExtensionsView.tsx", /<Tabs value=\{tab\}/],
    ["src/App.tsx", /<Tabs value=\{selectedPath \?\? ""\}/],
    ["src/TerminalPanel.tsx", /<Tabs value=\{activeSessionId \?\? ""\}/],
    ["src/LibraryView.tsx", /<Tabs value=\{readerView\}/],
    ["src/LibraryView.tsx", /<Tabs value=\{searchActive \? "" : mode\}/],
    ["src/LibraryView.tsx", /<Tabs value=\{searchKind\}/],
    ["src/ImageCreationView.tsx", /<Tabs value=\{tab\}/],
    ["src/BenchmarkRadarView.tsx", /<Tabs value=\{tab\}/],
    ["src/JourneyView.tsx", /<Tabs value=\{view\}/],
    ["src/SettingsModal.tsx", /<Tabs value=\{section\}/],
  ];
  for (const [file, pattern] of groups) assert.match(read(file), pattern, `${file} should use Tabs`);
});

test("filters use filter groups instead of tab semantics", () => {
  assert.match(read("src/LibraryView.tsx"), /<FilterGroup label="AI research topic"/);
  assert.match(read("src/ConferenceDiscovery.tsx"), /<FilterGroup label="Presentation format"/);
  assert.match(read("src/ProactiveAgentPanel.tsx"), /<FilterGroup label=\{t\("Suggestion history filter"\)\}/);
  for (const file of ["src/LibraryView.tsx", "src/ConferenceDiscovery.tsx", "src/ProactiveAgentPanel.tsx", "src/ContextPicker.tsx", "src/ImageCreationView.tsx", "src/DataChartGallery.tsx"]) {
    assert.doesNotMatch(read(file), /role="tablist"/, `${file} should not claim tab semantics for filters`);
  }
});

test("actions are kept outside tab lists", () => {
  const image = read("src/ImageCreationView.tsx");
  assert.ok(image.indexOf("</Tabs>") < image.indexOf('className="image-creation-actions"'));
  assert.match(read("src/LibraryView.tsx"), /className="paper-reader-action reproduce-tab"/);
  assert.ok(read("src/ProactiveAgentPanel.tsx").indexOf("</FilterGroup>") < read("src/ProactiveAgentPanel.tsx").indexOf("agent-proactive-history-scope"));
});
