Writing now starts with an existing-manuscript chooser. A paper already stored in the execution folder can be opened in place, including its section and bibliography files, while the template/import workflow remains available through **New manuscript**.

Edits and serialized saves stay with their original root/file when switching documents or projects. Each project remembers its own selected manuscript even when two projects share a folder. Compilation waits for pending source-file saves and uses a request ID so late progress/results cannot replace another manuscript's state. The two-argument compile bridge remains compatible.

This is an independent split from [the closed original PR](https://github.com/Johanson-colab/Archimedes/pull/336), following [the maintainer's request for separate PRs](https://github.com/Johanson-colab/Archimedes/pull/336#issuecomment-6912591490). Its actual base is upstream main `1f4b375`.

| Before | After |
| --- | --- |
| ![Template-first entry](https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6d2207a31c178c26d0f8199a1698d3602f2ceb3/docs/assets/continue-existing-manuscripts/before.png) | ![Existing manuscript chooser](https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6d2207a31c178c26d0f8199a1698d3602f2ceb3/docs/assets/continue-existing-manuscripts/after.png) |

Both captures use the same 1440×1000 renderer viewport, Charcoal theme and filesystem fixture; [capture details](https://github.com/feiiiiii5/Archimedes/blob/f6d2207a31c178c26d0f8199a1698d3602f2ceb3/docs/assets/continue-existing-manuscripts/README.md).

Initial validation (`f6d2207`):

- Writing and affected UI audits: **17 passed**, including actual filesystem/React checks for delayed saves, file switches, compile save barriers and two projects sharing one execution folder.
- `npm run lint`, `npm run build`, `npm run check:theme`: passed.
- `npm test`: **1281 total, 1267 passed, 7 failed, 7 skipped**. All 7 failures also occur on the same-main baseline: Git state/worktree (3), Windows shell fixtures on this macOS host (3), existing translation sort (1). Baseline is 1270 total, 1256 passed, the same 7 failed and 7 skipped; the 11 added writing tests pass.

Opening the real fixture's listed main document was also checked in the renderer and showed its section folder and bibliography without requiring compilation.

Review follow-up (`b2299a2`): returning to a clean cached manuscript rereads external edits before another save, while unsaved drafts and later typing are kept. Opening a bibliography, style file or section resolves/preserves the manuscript main document separately from the selected source. Actual filesystem/component regressions and affected audits: **19/19 passed**; lint and build passed. The full-suite result above is the initial branch run, not a repeated follow-up run.
