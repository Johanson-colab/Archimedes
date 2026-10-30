const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const registry = fs.readFileSync(path.join(root, "src", "sidebar-registry.tsx"), "utf8");
const view = fs.readFileSync(path.join(root, "src", "ImageCreationView.tsx"), "utf8");
const charts = fs.readFileSync(path.join(root, "src", "DataChartGallery.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");

test("Paper diagrams is a view inside Image creation, not a second Create destination", () => {
  assert.match(registry, /id: "image-creation"[^\n]*labelKey: "Image creation"[^\n]*destination: \{ type: "section", section: "image-creation" \}/);
  assert.doesNotMatch(registry, /id: "gallery"/);
  assert.doesNotMatch(registry, /id: "image-creation"[^\n]*disabled/);
  assert.doesNotMatch(registry, /id: "image-creation"[^\n]*badge/);
  assert.match(app, /<ImageCreationView active=\{mainSection === "image-creation"\}/);
  assert.match(app, /mainSection === "image-creation" \? t\("Image creation"\)/);
  assert.match(i18n, /"Generate and remix research figures"/);
});

test("the page keeps Paper diagrams and Data charts in one tab row without Templates", () => {
  assert.match(view, /className="image-creation-tabs" role="tablist"/);
  assert.match(view, />\s*Paper diagrams <small>/);
  assert.match(view, />\s*Data charts\s*</);
  assert.doesNotMatch(view, /image-creation-tab-templates|image-creation-panel-templates|TemplateCard/);
  assert.match(view, /className="image-creation-actions"/);
  assert.match(view, /className="image-creation-sort"/);
  assert.match(view, /Browse full proceedings/);
  assert.doesNotMatch(view, /ToolbarActions/);
  assert.match(view, /useDialogFocus/);
});

test("Data charts is a separate tab with chart types and tables, but no field or venue filter", () => {
  assert.match(view, /role="tab" id="image-creation-tab-charts"/);
  assert.match(view, /<DataChartGallery active=\{active\} sort=\{chartSort\} \/>/);
  assert.match(view, /<option value="preferred">Sort: AI venues first<\/option>/);
  assert.match(view, /<option value="newest">Sort: Newest across all<\/option>/);
  assert.match(charts, /type Category = "data" \| "table"/);
  assert.match(charts, /EXCLUDED_CHARTS = new Set\(\["area", "other", "mixed"\]\)/);
  assert.match(charts, /figure\.chart_types\.some\(\(type\) => EXCLUDED_CHARTS\.has\(type\)\)/);
  assert.match(charts, /img\.paperfigure\.net/);
  assert.match(charts, /image-creation-filter-panel data-chart-filter-panel" role="dialog"/);
  assert.match(charts, /className="image-creation-controls data-chart-controls"/);
  assert.doesNotMatch(charts, /searchParams\.set\("area"|searchParams\.set\("venue"|Filter by venue|Research field/);
  assert.match(charts, /data\/index-\$\{index\}\.json/);
  assert.match(charts, /Number\(b\.year \|\| 0\) - Number\(a\.year \|\| 0\)/);
  assert.match(charts, /const FEATURED_VENUES = \["NeurIPS", "ICML", "ICLR", "ACL", "CVPR"\]/);
  assert.match(charts, /orderPreferred\(matched\)/);
  assert.match(charts, /interleave\(venues\.map/);
  assert.match(charts, /sourceLink\.searchParams\.set\("sort", "year"\)/);
  assert.doesNotMatch(charts, /api\/search|first 50 checked/);
  assert.match(charts, /className="image-creation-card chart-reference-card"/);
  assert.match(charts, /className="image-creation-card-image chart-reference-preview"/);
  assert.match(charts, /className="image-creation-card-shade"/);
  assert.match(charts, /className="image-creation-card-venue"/);
  assert.match(charts, /className="image-creation-card-title"/);
});

test("images lead and text is a single secondary line", () => {
  assert.match(css, /\.image-creation-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
  assert.match(css, /\.image-creation-card-image \{[^}]*aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.image-creation-card-image img \{[^}]*object-fit: cover/);
  assert.match(css, /\.image-creation-card-venue \{[^}]*position: absolute/);
  assert.match(css, /\.image-creation-card-title \{[^}]*white-space: nowrap/);
  assert.match(css, /\.image-creation-card-use \{[^}]*opacity: 0/);
  assert.match(css, /\.image-creation-reference \{/);
  assert.match(view, /Use as template/);
  assert.match(view, /setComposerText\("Adapt this figure for "\)/);
  assert.doesNotMatch(view, /image-creation-tab-templates|image-creation-panel-templates|TemplateCard/);
});

test("filter facets fold into one popover instead of a permanent block", () => {
  assert.match(view, /className=\{filterOpen \? "image-creation-filter-button active" : "image-creation-filter-button"\}/);
  assert.match(view, /image-creation-filter-panel" role="dialog"/);
  assert.match(view, /Clear all/);
  assert.match(css, /\.image-creation-filter-panel \{[^}]*position: absolute/);
});

test("the composer is present but does not pretend image generation is shipped", () => {
  assert.match(view, /className="image-creation-composer-dock"/);
  assert.match(view, /Describe an image to generate/);
  assert.match(view, /Image model · Soon/);
  assert.match(view, /disabled title="Image generation is coming soon"/);
  assert.match(css, /\.image-creation-composer-dock \{[^}]*position: fixed/);
  assert.match(css, /\.image-creation-fade \{[^}]*position: fixed/);
});
