# Research Apps UI — issue #256

Scope: the owner requested the navigation, defaults and five-category management UI from [#256](https://github.com/Johanson-colab/Archimedes/issues/256). This does not complete the broader creator/workflow epic. The owner previously instructed direct updates to `main` and `origin/main`.

## Behavior

- Sidebar and Settings use **Research Apps**. Navigation is one list above the unchanged Work section. The `+` button opens app management.
- Default sidebar order: Library, Daily papers, Reproduce, Image creation, Paper writing.
- Flat / Group tabs / Group sections controls are removed. Legacy layout IPC remains compatible but returns the unified layout.
- Shared metadata supplies categories, descriptions, default visibility and navigation order. Legacy plugin manifests still work; optional `researchCategory` metadata allows explicit classification.
- Hiding apps changes visibility, not stored papers, projects or outputs. Install, enable and remove actions remain available inside each category.

| Category | Existing apps |
| --- | --- |
| Discovery & tracking | Daily papers, News, Benchmark Radar |
| Resources & evidence | Library, Extensions (MCP/skills support) |
| Experiments & evaluation | Reproduce |
| Analysis & visualization | Image creation / FigureForge |
| Writing & delivery | Paper writing, Paper review, Focus Timer catalog app |

Fresh installs and legacy default-all settings use the five requested defaults. Existing customized visibility lists are preserved. Version 3 saves preserve explicit choices, including showing every app. Browser preview uses the same defaults and saves visibility locally.

## UI evidence

Run `node scripts/capture-research-apps.mjs before` or `after`, then run the printed runner with the repository's Electron executable. The credential-free fixture uses navigation markup extracted from the real App and renders the real SettingsModal and ProjectSidebar. Baseline: `f12de6b`. Both stages use identical viewport, theme and fixture data; the before stage selects the old Group sections mode shown in the owner's screenshot.

| Surface | Paper before / after | Charcoal before / after |
| --- | --- | --- |
| Sidebar | [Before](paper-sidebar-before.png) / [After](paper-sidebar-after.png) | [Before](charcoal-sidebar-before.png) / [After](charcoal-sidebar-after.png) |
| Settings top | [Before](paper-settings-top-before.png) / [After](paper-settings-top-after.png) | [Before](charcoal-settings-top-before.png) / [After](charcoal-settings-top-after.png) |
| Settings bottom | [Before](paper-settings-bottom-before.png) / [After](paper-settings-bottom-after.png) | [Before](charcoal-settings-bottom-before.png) / [After](charcoal-settings-bottom-after.png) |

Geometry checks at 1100px and 680px, in both themes, confirm five categories, five enabled defaults, vertical scrolling and no horizontal overflow. See `before-geometry.json` and `after-geometry.json`.

## Validation

- TypeScript lint, production build, theme checks and `git diff --check`: passed.
- Focused suite: **50 passed, 0 failed**. Behavior tests cover category assignment, defaults/order, live switches, failed saves, plugin install/toggle/remove, catalog deduplication and legacy metadata.
- Settings tests cover persistence, default-all migration, custom visibility preservation, corrupt files and obsolete layout IPC.
- Full suite: **964 tests: 953 passed, 4 skipped, 7 existing baseline failures**. These are three macOS/Windows-shell expectations, three Benchmark Radar fallback/cache tests affected by the adjacent local checkout, and the existing native-confirm audit in PaperReviewView.

Tests ran serially with a 256MiB JavaScript heap and a 700MiB process-tree guard; the final full run peaked at 487.5MiB. Screenshot captures used a separate temporary Electron profile and a 1024MiB process-tree guard. No native agent probes or model calls were used.
