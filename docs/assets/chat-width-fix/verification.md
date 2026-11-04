# Chat width regression

The owner reported an apparently blank chat area after #237 and requested investigation. [#238](https://github.com/Johanson-colab/Archimedes/issues/238) tracks the fix. The existing session authorization allows fixes on main and push to origin/main.

## Root cause

The conversation grid defined rows but no columns. Wide content could enlarge its implicit column to its intrinsic minimum width. The history and composer were then centered in that oversized column and clipped by the main view.

Live read-only renderer measurements reproduced the exact report: a1348px host had a4817px history column and the composer started at x2294, beyond the1633px viewport. After the fix, the composer started at x559 and browser hit testing found its textarea in the visible window. Temporary diagnostics were removed; no user message contents were logged or changed.

## Fix and evidence

Set `.conversation-layout` to `grid-template-columns: minmax(0, 1fr)` with `min-width: 0`. A real Electron fixture with4800px wide content reproduced the failure on the previous commit, then passed all four combinations of Paper/Charcoal and1400/900 viewport widths.

| Viewport | Before history width | After history width | Before composer x | After composer x |
| --- | --- | --- | --- | --- |
|1400 |4810 |1120 |2285 |440 |
|900 |4810 |620 |2285 |310 |

Both themes produce the same geometry. `electron/chat-layout-width.test.cjs` runs the real browser geometry check; display-less Linux CI requires `xvfb-run`. The fixture uses no credentials or live inference. Commands: `electron scripts/check-chat-width.cjs`; add `--before` for the failing baseline and `--capture=docs/assets/chat-width-fix` for screenshots.

The layout regression and both existing typing-performance tests passed (3 tests). Build, theme checks and diff checks passed. Independent read-only review found no blockers. Validation used serial memory-limited processes; it does not reclassify the three existing Windows-shell baseline failures.

| Theme | Before | After |
| --- | --- | --- |
| Paper | ![Before](paper-before.png) | ![After](paper-after.png) |
| Charcoal | ![Before](charcoal-before.png) | ![After](charcoal-after.png) |
