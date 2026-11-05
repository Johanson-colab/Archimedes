# Settings sidebar position

Owner-requested navigation follow-up: make Settings prominent above Research Apps and Work. The owner has instructed direct updates to `main` and `origin/main`.

The sidebar now reads **New research → Settings → Research Apps → Work**. Settings uses the existing navigation-row styling, a gear icon and a visible translated label. It opens the General settings page. The bottom account/sign-in entry remains; the separate bottom gear is removed. No settings behavior, app defaults or project data changes.

## Before / after

Baseline: `44cfc9e`. Both stages use a 1100×960 viewport, 260px sidebar, the same theme and a credential-free empty-work fixture. The fixture renders extracted App navigation/footer markup and the real ProjectSidebar, AccountChip and SettingsModal components.

| Theme | Before | After |
| --- | --- | --- |
| Paper | [Before](paper-sidebar-before.png) | [After](paper-sidebar-after.png) |
| Charcoal | [Before](charcoal-sidebar-before.png) | [After](charcoal-sidebar-after.png) |

Reproduce with `node scripts/capture-research-apps.mjs before --settings-entry` or `after --settings-entry`, then run the printed runner with the repository's Electron executable. Captures run in a temporary profile. No native agent or model calls are made.

The geometry files verify exactly one Settings button, its move from the footer to above Research Apps, and successful opening of General settings in both themes.

## Validation

- Production build and TypeScript checks passed.
- Theme checks and `git diff --check` passed.
- Full suite: 968 tests, 957 passed, 4 skipped, 7 unchanged baseline failures (three Windows-shell expectations on macOS, three Benchmark Radar fallback/cache tests affected by the adjacent checkout, and the existing PaperReviewView native-confirm audit).
- Tests ran serially under a 700MiB process-tree cap; peak measured tree memory was 447.7MiB.
