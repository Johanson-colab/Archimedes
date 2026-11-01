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
  assert.match(view, /className="image-creation-tabs">/);
  assert.match(view, /<Tabs value=\{tab\}/);
  assert.match(view, />\s*Paper diagrams <small>/);
  assert.match(view, />\s*Data charts\s*</);
  assert.doesNotMatch(view, /image-creation-tab-templates|image-creation-panel-templates|TemplateCard/);
  assert.match(view, /className="image-creation-actions"/);
  assert.match(view, /className="image-creation-sort"/);
  assert.match(view, /Browse full proceedings/);
  assert.doesNotMatch(view, /ToolbarActions/);
  assert.match(view, /<Dialog open onClose=\{onClose\}/);
});

test("Data charts is a separate tab with chart types and tables, but no field or venue filter", () => {
  assert.match(view, /<Tab value="charts" id="image-creation-tab-charts"/);
  assert.match(view, /<DataChartGallery active=\{active\} sort=\{chartSort\} \/>/);
  assert.match(view, /<option value="preferred">Sort: AI venues first<\/option>/);
  assert.match(view, /<option value="newest">Sort: Newest across all<\/option>/);
  assert.match(charts, /type Category = "data" \| "table"/);
  assert.match(charts, /EXCLUDED_CHARTS = new Set\(\["area", "other", "mixed"\]\)/);
  assert.match(charts, /figure\.chart_types\.some\(\(type\) => EXCLUDED_CHARTS\.has\(type\)\)/);
  assert.match(charts, /img\.paperfigure\.net/);
  assert.match(charts, /image-creation-filter-panel data-chart-filter-panel" role="group"/);
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
  assert.match(view, /Use as template/);
  assert.match(view, /setReferences\(\(current\) => current\.some/);
  assert.match(view, /current\.length \+ uploadedReferences\.length >= 10/);
  assert.doesNotMatch(view, /image-creation-tab-templates|image-creation-panel-templates|TemplateCard/);
});

test("filter facets fold into one popover instead of a permanent block", () => {
  assert.match(view, /className=\{filterOpen \? "image-creation-filter-button active" : "image-creation-filter-button"\}/);
  assert.match(view, /<MenuSurface[\s\S]*?image-creation-filter-panel" role="group"/);
  assert.match(view, /Clear all/);
  assert.match(css, /\.menu-surface \{/);
});

test("FigureForge opens as a separate workspace without a gallery composer", () => {
  assert.doesNotMatch(view, /image-creation-composer-dock|image-creation-fade/);
  assert.match(view, /className="image-creation-forge-button" onClick=\{\(\) => showForge\(true\)\}/);
  assert.match(view, /className="figure-forge-page"/);
  assert.match(view, /className="figure-forge-back" onClick=\{\(\) => showForge\(false\)\}/);
  assert.match(view, /setTab\("gallery"\); showForge\(false\)/);
  assert.match(view, /function useAsTemplate[\s\S]*?setReferences[\s\S]*?showForge\(true\)/);
  assert.match(view, /pageRef\.current\?\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.doesNotMatch(view, /<Dialog open=\{forgeOpen\}/);
  assert.match(view, /Text is extracted on this machine\. Only the plan request leaves it\./);
  assert.match(view, /type="file" accept="\.pdf,application\/pdf"/);
  assert.match(view, /prepareFigurePlan\(\{ paperText: pdfPages\.current\.length/);
  assert.match(view, /disabled=\{!generateReady\}/);
  assert.match(view, /current\.filter\(\(item\) => item\.id !== figure\.id\)/);
  assert.match(css, /\.figure-forge-page \{/);
  assert.doesNotMatch(css, /\.image-creation-composer-dock|\.image-creation-fade/);
});

test("FigureForge reads as four numbered steps with one primary action each", () => {
  // A persistent status rail replaces four anonymous headings.
  assert.match(view, /className="forge-steps" aria-label=\{t\("FigureForge steps"\)\}/);
  assert.match(view, /const forgeSteps = \[/);
  assert.match(view, /tone: selectedReferenceCount >= referenceFloor \? "done" : "idle"/);
  assert.match(css, /\.forge-steps-item\.is-done/);
  assert.match(css, /\.forge-steps-item\.is-busy/);
  // Each step is a card with its own numbered header and anchored id.
  for (const step of [1, 2, 3, 4]) {
    assert.match(view, new RegExp(`className="forge-step" id="forge-step-${step}"`));
  }
  assert.match(view, /className="forge-step-actions"/);
  assert.match(css, /\.forge-step-index \{/);
  assert.match(css, /\.forge-step-subtitle \{/);
  // Configuration is behind a disclosure so the default path needs no setup.
  assert.match(view, /<summary>\{t\("Model settings"\)\}/);
  assert.match(view, /Archimedes main model/);
  // Every disabled primary action explains itself.
  assert.match(view, /const analyzeBlockedReason = hasPaperInput \? "" : t\("Add a PDF, or at least 100 characters of paper text\."\)/);
  assert.match(view, /const generateBlockedReason =/);
  assert.match(view, /className="forge-blocked">\{analyzeBlockedReason\}/);
  assert.match(view, /className="forge-blocked">\{generateBlockedReason\}/);
  // Uploads use a drop target instead of a raw file input.
  assert.match(view, /className=\{`forge-drop\$\{pdfName \? " is-loaded" : ""\}`\}/);
  assert.match(css, /\.forge-drop-input \{ position: absolute/);
  // Method and output are segmented controls, not stacked selects.
  assert.match(view, /variant="segmented"[\s\S]*?<Tab value="two-stage">/);
  assert.match(view, /<Tab value="bitmap">/);
});

test("FigureForge reference search is decoupled, explainable and never stale silently", () => {
  // Gallery filters and FigureForge filters are separate state, so tuning one
  // no longer resets the other.
  assert.match(view, /const updateForgeFilter = \(key: keyof Filters, value: string \| number\) => setForgeFilters/);
  assert.match(view, /const \[forgeFilters, setForgeFilters\] = useState<Filters>\(INITIAL_FILTERS\)/);
  const stepTwo = view.slice(view.indexOf('id="forge-step-2"'), view.indexOf('id="forge-step-3"'));
  assert.doesNotMatch(stepTwo, /updateFilter\("(pattern|venue|year|tier)"/, "step 2 must not drive the gallery filters");
  // The paper's figure type seeds the reference pattern filter.
  assert.match(view, /const FIGURE_TYPE_PATTERN: Record<string, string> = \{/);
  assert.match(view, /function changeFigureType\(value: string\)[\s\S]*?setForgeFilters/);
  // A changed plan marks the previous ranking as out of date.
  assert.match(view, /const currentSearchQuery = \(figurePlan \|\| paperContent \|\| composerText\)\.slice\(0, 10_000\)/);
  assert.match(view, /const resultsStale = searchedQuery !== null && searchedQuery !== currentSearchQuery/);
  assert.match(view, /className="forge-stale">\{t\("The plan changed since the last search/);
  // Retrieval explains why a card ranked where it did.
  assert.match(view, /title=\{reason \|\| undefined\}/);
  assert.match(view, /className="figure-forge-results-hits">\{keywords\.join/);
});

test("FigureForge measures the references before generating and lets you edit the contract", () => {
  // Analysis is its own action, so a wrong palette is fixed before paying for a draft.
  assert.match(view, /async function analyzeReferences\(\)/);
  assert.match(view, /onClick=\{\(\) => void analyzeReferences\(\)\}/);
  assert.match(view, /className="forge-contract"/);
  assert.match(view, /t\("Reference contract"\)/);
  assert.match(view, /className="forge-metrics"/);
  assert.match(view, /value=\{designContract\.layout\}/);
  assert.match(view, /designContract\.palette\[key\]/);
  assert.match(view, /draft\.typography\[key as "title"\] = Number/);
  // Generation consumes the edited contract, not the raw model prose.
  assert.match(view, /if \(!designContract \|\| !contractIsUsable\(designContract\)\) throw new Error\(t\("Analyze the references first\."\)\)/);
  assert.match(view, /const contract = normalizeDesignContract\(designContract\)/);
  assert.match(view, /renderDesignContract\(contract\) : renderImageGuide\(contract\)/);
  // The contract dies when its inputs change, so it is never reused blindly.
  assert.match(view, /const referenceSignature = /);
  assert.match(view, /useEffect\(\(\) => \{[\s\S]*?setDesignContract\(null\);[\s\S]*?\}, \[figurePlan, referenceSignature\]\)/);
  assert.match(view, /const needsContract = forgeMethod === "two-stage" && !\(designContract && contractIsUsable\(designContract\)\)/);
});
