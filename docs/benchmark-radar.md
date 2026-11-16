# Benchmark Radar data and refresh

Benchmark Radar reads the public index at `https://benchmark-radar.org/data/benchmark-index.json`. It renders native Archimedes components, without embedding the external website or running its discovery pipeline.

## Data lifecycle

- Open the app: render the newer saved cache or bundled snapshot immediately, then apply the result of an online check to the current view.
- Successful downloads are cached at `<userData>/benchmark-radar/public-index.json`. Normal checks respect a six-hour TTL and conditional ETag requests. **Refresh** bypasses the TTL.
- While mounted, the page checks when it becomes visible/focused and every six hours while visible. Concurrent downloads are shared; controls prevent duplicate manual requests. Timers and event handlers are removed on unmount.
- Failed checks preserve the last usable data and display a retry notice. The page separates the source's data date from the last successful online check. Downloading today does not imply that the upstream data was collected today.
- The Electron network stack is used for desktop requests, preserving its system-network/proxy behavior. Requests have a bounded 20-second timeout.
- Latest displays the 30 most recently released entries. The 30/90-day filters use today's UTC date, rather than the date of a potentially stale snapshot.

## Explicit local development override

Set `BENCHMARK_RADAR_ROOT=/absolute/path/to/benchmark-radar` to use that checkout's `data/benchmarks_index.json` and `data/library_index.json`. No adjacent directory is discovered automatically. **Reload local data** rereads both files without restarting Electron; an invalid explicit path reports an error rather than silently selecting another source.

## Interpreting signals

- **Attention** combines the supplied attention score, GitHub stars and Hugging Face votes. Missing observations remain unknown in the displayed signals.
- **Code available** means the source provides code information. Archimedes has not executed or validated it.
- **Attention forecast** is shown only when the source provides a score. Expand it for the supplied reason, horizon and confidence. It estimates future attention rather than benchmark quality. Current public-index records may omit these fields entirely; Archimedes does not invent them.
- **Save** stores selected benchmark IDs locally; it does not download datasets or run evaluations.

## Verification

Run `node --test electron/benchmark-radar*.test.cjs` for the index and lifecycle behavior. Run `node scripts/capture-benchmark-radar-refresh.mjs before` and then `after` for isolated Electron UI checks.

The UI fixture contains three real records from the original October 15 local snapshot, including its original forecast metadata. It intentionally exercises older data and is not the current production feed. Both stages use the same data, themes and window sizes; interactions also cover in-place refresh, duplicate-click prevention, offline fallback, forecast explanations and unmount cleanup. Captures and checks are under `docs/assets/benchmark-radar-refresh/`.

![Paper before](assets/benchmark-radar-refresh/paper-before.png)
![Paper after](assets/benchmark-radar-refresh/paper-after.png)

Validation on this Mac:

- Lint, renderer build and theme-token checks passed.
- 35 focused index, refresh, translations and shared-UI checks passed.
- Paper/charcoal UI captures and behavioral checks passed, including a 780px window without horizontal overflow.
- A real public-index request returned 3,841 records, with source data dated 2026-11-04 and a successful check on 2026-11-16.
- Full `npm test`: 1,273 passed, 6 skipped, 1 failed. The unrelated LaTeX template smoke test failed because the local TeX Live installation lacks the `phvr7t` font metric. The LaTeX implementation, templates and test were unchanged.
