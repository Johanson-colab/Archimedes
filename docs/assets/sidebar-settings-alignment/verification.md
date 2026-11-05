# Settings gear alignment

Owner-requested refinement: place the Settings gear on the right, aligned with Research Apps' plus and Work's overflow button. Settings stays above both sections and opens General settings. The owner has instructed direct updates to `main` and `origin/main`.

The label precedes the gear in the button's markup. The icon uses a 24px box, matching the other sidebar action controls, with the existing 15px visible gear preserved through padding. Theme tokens and existing navigation styling are reused.

## Evidence

Baseline: `027dd7d`. Matching viewport (1100×960), sidebar width (260px), theme and credential-free fixture state. The capture uses real App navigation/footer markup and the real sidebar/account/settings components.

| Theme | Before | After |
| --- | --- | --- |
| Paper | [Before](paper-sidebar-before.png) | [After](paper-sidebar-after.png) |
| Charcoal | [Before](charcoal-sidebar-before.png) | [After](charcoal-sidebar-after.png) |

Run `node scripts/capture-research-apps.mjs before --settings-align` or `after --settings-align`, then run the printed Electron runner separately.

Both themes verify that the gear, plus and overflow buttons have the same horizontal center (230px), there is one Settings entry, and clicking it opens General settings. See `before-geometry.json` and `after-geometry.json`.

## Validation

- Production build and TypeScript checks passed.
- Theme checks and `git diff --check` passed.
- Full suite: 968 tests, 957 passed, 4 skipped, 7 unchanged baseline failures (three Windows-shell expectations on macOS, three Benchmark Radar fallback/cache tests affected by the adjacent checkout, and the existing PaperReviewView native-confirm audit).
- Tests ran serially under a 700MiB process-tree cap; peak measured tree memory was 500.3MiB.
