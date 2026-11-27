Compiling the same manuscript twice currently reuses the output PDF path, so the second build replaces the first build's bytes. This change gives each build its own directory and a saved receipt linking its main file, section/bibliography/image hashes, PDF and bounded compiler log.

Requests use the source version when sharing queued work. A source edit while waiting returns a stale receipt without running TeX; an edit during compilation retains the historical artifact but returns no current PDF. The receipt can be reread against the current source and PDF bytes. Five completed previews are retained per manuscript; active build directories and the shared TeX dependency cache are preserved.

This is an independent split from [the closed original PR](https://github.com/Johanson-colab/Archimedes/pull/336), following [the maintainer's request for separate PRs](https://github.com/Johanson-colab/Archimedes/pull/336#issuecomment-6912591490). Its actual base is upstream main `1f4b375`.

There is no new visual surface. [Actual before/after filesystem evidence](https://github.com/feiiiiii5/Archimedes/blob/e48c78a5d9cf722a5ffc7d1c599e92ccec91fca8/docs/assets/manuscript-build-receipts/before-after.md) shows a real managed Tectonic 0.17.0 compile twice on both main and this branch: main replaces the first PDF, while this branch keeps both PDF/log pairs and marks the older source version noncurrent. Source coverage is the manuscript directory; the receipt records hashes rather than historical source contents. [Details](https://github.com/feiiiiii5/Archimedes/blob/e48c78a5d9cf722a5ffc7d1c599e92ccec91fca8/docs/manuscript-builds.md).

Validation:

- Snapshot, managed compiler and existing LaTeX behavior tests: **31 total, 30 passed, 1 conditional latexmk skip**. Covers actual files, changed sections/bibliography, queued requests, stale builds, artifact verification and preview retention.
- Two real managed Tectonic compilations succeeded using the existing cache; the first retained PDF stayed byte-for-byte unchanged after the second, and fresh verification returned old `current: false` / new `current: true`.
- `npm run lint`, `npm run build`, `npm run check:theme`: passed.
- `npm test`: **1278 total, 1264 passed, 7 failed, 7 skipped**. All 7 failures also occur on the same-main baseline: Git state/worktree (3), Windows shell fixtures on this macOS host (3), existing translation sort (1). Baseline is 1270 total, 1256 passed, the same 7 failed and 7 skipped; the 8 added receipt tests pass.
