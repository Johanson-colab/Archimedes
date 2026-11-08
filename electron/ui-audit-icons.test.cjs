const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("simplified icons stay one-per-function at the collision points", () => {
  const app = read("src/App.tsx");
  const imageCreation = read("src/ImageCreationView.tsx");
  const registry = read("src/sidebar-registry.tsx");

  // Proactive AI keeps the single sparkle; FigureForge uses a wand.
  assert.match(app, /id: "proactive-agent"[^\n]*icon: <Sparkle /);
  assert.match(imageCreation, /<Wand size=\{14\} \/>FigureForge/);

  // The sidebar entries that changed keep distinct glyphs.
  assert.match(registry, /id: "daily"[^\n]*icon: Calendar/);
  assert.match(registry, /id: "news"[^\n]*icon: Rss/);
  assert.match(registry, /id: "writing"[^\n]*icon: FilePen/);
  assert.match(registry, /id: "data-charts"[^\n]*icon: ChartLine/);
  assert.match(registry, /id: "data-analysis"[^\n]*icon: Table/);
});

test("replaced Lucide icons are no longer referenced in TSX", () => {
  const replaced = [
    "Sparkles",
    "Wand2",
    "ChartNoAxesCombined",
    "Table2",
    "BrainCircuit",
    "CalendarDays",
    "FolderTree",
    "Microscope",
    "Trash2",
    "PenTool",
    "FileArchive",
    "KeyRound",
    "Shrink",
    "ClipboardPaste",
    "Newspaper",
    "MessageSquareText",
    "ShieldCheck",
    "ScanSearch",
    "MessageSquarePlus",
    "FilePenLine",
  ];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, "src"));
  const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const icon of replaced) {
    assert.doesNotMatch(source, new RegExp(`<${icon}\\b`), `${icon} is still rendered`);
  }
});
