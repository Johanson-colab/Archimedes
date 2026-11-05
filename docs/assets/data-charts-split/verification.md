# Standalone Data Charts

Owner-requested follow-up to [#256](https://github.com/Johanson-colab/Archimedes/issues/256): split Data charts out of Image creation. The owner previously instructed direct updates to `main` and `origin/main`.

## Result

- Research Apps has a dedicated **Data charts** entry and command, using a chart icon.
- Settings → Research Apps → Analysis & visualization offers independent switches for Image creation and Data charts.
- Image creation contains Paper diagrams and FigureForge. The old Data charts tab is removed; gallery sorting, filters and Use as template remain.
- Data charts reuses the existing Paper Figure Library gallery, chart/table filters, venue-priority/newest sorting, source links and preview dialog. No image copies or new data source are introduced.
- Both modules load only after opening their own sidebar/palette destination. Opening Data charts no longer loads the Top-Conf diagrams catalog. Switching away retains chart controls but closes menus and preview scroll locks.

Fresh installations show Data charts beside Image creation, making six default apps. Version 4 migrates legacy settings: Data charts inherits Image creation's visibility once, then can be toggled independently. Version 3 explicit all-visible preferences are preserved. Browser preview applies the same visibility migration.

## Evidence

`node scripts/capture-data-charts-split.mjs before` / `after` builds a credential-free fixture; run the printed Electron runner separately. Baseline: `137198f`. Screens use real renderer components and extracted App navigation markup, with matching 1200×900 viewport, theme and illustrative fixture data. Catalog responses and images are intercepted locally; no user data, model calls or live external requests are used. Animations are disabled for deterministic captures.

| Surface | Paper | Charcoal |
| --- | --- | --- |
| Image creation | [Before](paper-diagrams-before.png) / [After](paper-diagrams-after.png) | [Before](charcoal-diagrams-before.png) / [After](charcoal-diagrams-after.png) |
| Data charts | [Before](paper-charts-before.png) / [After](paper-charts-after.png) | [Before](charcoal-charts-before.png) / [After](charcoal-charts-after.png) |
| App settings | [Before](paper-settings-before.png) / [After](paper-settings-after.png) | [Before](charcoal-settings-before.png) / [After](charcoal-settings-after.png) |

`before-checks.json` and `after-checks.json` record sidebar entries, cards, catalog requests, overflow and FigureForge's four-step enter/return flow. Both themes pass; the charts page also has no horizontal overflow at 800px.

## Validation

- Production build passed; existing Vite chunk-size warnings remain.
- Behavior tests exercise real chart sorting, chart/table filters, catalog caching, menu cleanup, preview scroll-lock cleanup and state retention when inactive.
- Settings tests cover inherited visibility, subsequent independent switches, explicit all-visible preservation and earlier migrations.
- TypeScript lint, theme checks and `git diff --check` passed.
- Full suite: **968 tests: 957 passed, 4 skipped, 7 unchanged baseline failures** (three macOS/Windows-shell expectations, three Benchmark Radar fallback/cache tests affected by the adjacent checkout, and the existing PaperReviewView native-confirm audit).
- Full tests ran serially with a 256MiB JavaScript heap and 700MiB process-tree cap; peak measured tree memory was 479.7MiB. Temporary Electron captures ran separately with a 1024MiB process-tree cap.
