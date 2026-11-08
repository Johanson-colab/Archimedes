# Data Analysis visual review

## Scope and direction

This is an app screen, outside the taste skill's normal marketing-page scope. The user explicitly requested the skill. Its typography, removal of ornament, source lint and real-browser critique were applied to the working tool. Gallery requirements for photographs, footage, entrance animations and a large hero were intentionally not applied. No browser errors or layout faults were waived.

Direction: **The quiet instrument**, seed **1498829621**, no redraws. Brand type was retained; the analysis screen uses neutral working surfaces and scientific series colors in the shared theme tokens. The marketing direction's narrow, mostly empty hero would obstruct the data workflow, so its restraint and two-ended lists were adapted to a full-width working chart.

Subject inventory: 344 real penguins; three species; measurements in mm/g; 19 missing cells; 1,461 weather days; four seasons across four years; NOAA provenance; derived weather labels; local CSV import; all-valid-row statistics; paginated original rows; a five-row chat context; SVG output. No synthetic observations, screenshots masquerading as functionality or ornamental photographs.

Argument: identify the active data → choose a meaningful view → inspect a visible relationship → verify it against original rows → export or ask a bounded follow-up question.

Idea: the researcher's actual observations become the page's dominant material. Live interaction: switch between six suggested analyses, edit fields/grouping, inspect categories without changing axes, and check raw rows.

## ROUND 1

Seen in one second: a large AI banner above a stack of boxes.
Idea (one sentence): a generic card dashboard containing a four-row demonstration.
Live thing: three basic chart types, with field inspection coupled to the Y axis.
Layout words by section: header=stack / ask=card / analysis=cards / data=card.
Scores: design 5 · usability 5.5 · creativity 4 · content 3 → overall 4.8.
Caps applied: visible eyebrows and repetitive framed panels.
Top three problems, each with the screenshot and fix:
1. `before.png`: the AI banner occupies the strongest region. Move the bounded chat draft below the analysis.
2. `before.png`: the sample cannot demonstrate scientific variation or missingness. Bundle attributed real datasets with working presets.
3. User-provided screenshot: selecting a text column clears the plot. Separate the field inspector from chart axes and restrict numeric selectors.

## ROUND 2

Seen in one second: a real scatter plot with three visible species groups.
Idea (one sentence): a compact instrument organized around the data itself.
Live thing: all-data calculations, grouping and missing-value exploration.
Layout words by section: toolbar=row / fields=list / plot=canvas / explanation=notebook.
Scores: design 7.5 · usability 7 · creativity 6.5 · content 8.5 → overall 7.25 before gallery-only caps.
Caps applied: no decorative pictures or entrance animation; not scored as a marketing page.
Top three problems:
1. Tablet/mobile screenshots: SVG tick text scales too small. Measure the plot container and preserve readable text size.
2. Desktop screenshot: awkward decimal tick bounds. Use rounded numeric domains and ticks.
3. Source inspection: ensure SVG export embeds computed styles and its external color legend.

## ROUND 3

Seen in one second: the relationship between body mass and flipper length.
Idea (one sentence): data, not an AI introduction, occupies the working surface.
Live thing: presets and custom plots, original table pagination, independent field inspection, export and bounded chat draft.
Layout words by section: toolbar=row / fields=list / plot=canvas / explanation=notebook.
Scores: design 7.5 · usability 8 · creativity 6.5 · content 9 → overall 7.65 for the adapted app rubric.
Caps applied: the unmodified gallery rubric caps design at 6.5 because it requires four pictures; this tool intentionally contains none. Do not interpret the adapted score as full marketing-skill compliance.
Top three remaining limits:
1. Dense numeric tick labels remain constrained on phone screens; the primary target is the desktop app. No page overflow at 390px.
2. Large charts show up to 2,000 sampled points and at most six color groups. These limits are labeled; calculations use all valid rows.
3. AI handoff is a draft with a summary and five sample rows, not full-file agent execution.

## Evidence

- `before.png` / `after.png`: 1440 × 1000, same Paper theme and isolated real component. The new default sample is intentionally different.
- `weather.png`: 1,461 actual daily observations across four years.
- `mobile.png`: Chinese UI at 390 × 844.
- Also checked the complete app with its sidebar, English/Chinese, dark theme, dataset switching and original data table.
- Taste source lint: zero findings. Browser inspector: zero findings after documented allowances for `few-pictures`, `still-page`, `no-footage`, `body-size` and `focal-point`. A 13px dense control system, 14px explanatory copy and compact filename heading fit the desktop app; the gallery defaults require 16px prose and large hero imagery.
- No picture assets were used. Data sources and licenses are recorded in `src/assets/data-analysis/README.md`.
- Related regression suite: 23 passing tests. Full repository run: 1,012 passed, 4 skipped, 7 existing failures (three Benchmark Radar environment assumptions, three Windows-shell tests on macOS, and the existing Paper Review `window.confirm` audit).
- SVG browser audit: `penguins-scatter.svg` contains 342 points and its species legend, with computed colors embedded and no unresolved analysis color variables.
