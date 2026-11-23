# Daily Papers recovery

Base: `b4a4480` on `main`. This repair covers browsing, return navigation, keyword/title retrieval, and official conference catalogs.

## Changes

- Keep Daily Papers mounted after its first visit. Preserve the chosen feed, topic, query, list, and conference page when returning; reset scoped state when the workspace/project changes.
- Render matching persisted data before refreshing, including stale data. Bound renderer caches to 12 feed responses and 24 conference pages. Never show a previous query's rows under a new query.
- Keep Latest, Trending and Top conference search usable after a search. A newer request supersedes the previous request in the same window, without cancelling other windows or writing their results to another workspace.
- Explicit searches use the archive independently of feed date/category controls. Recognize arXiv IDs and keep multiword title phrases. Browsing uses stable submission-order queries and filters publication dates locally instead of generating minute-specific upstream queries.
- Use Electron `net.fetch` for discovery and conference retrieval so these requests follow the desktop's network/proxy configuration.
- Bound feed/API attempts and validate Atom responses. An unreadable response or API error must not become a cached “zero papers” success.
- On archive failure, browsing can fall back to official RSS announcements, with incomplete date coverage disclosed. Keyword searches can fall back to OpenAlex, clearly identifying its different coverage/ranking. OpenAlex uses an Environment API key if configured. A fallback with no records does not establish an empty primary search.
- Optional conference abstracts have a shorter deadline and malformed/missing abstracts cannot discard valid titles/official links. Missing abstracts alone do not trigger expensive CVF catalog rebuilding.

## Measured network behavior

These are individual measurements on this Mac, not latency guarantees. Source/network responses varied during verification.

| Request | Observation |
| --- | --- |
| Original Latest request | 25-second timeout, then HTTP 429; 46.3 seconds total |
| Original ICML transfer via Node fetch | Main catalog is 16.4 MB; only 264 KB received in a 15-second probe |
| Fixed ICML 2026 | 6,430 records; 5.5 seconds in one run with abstracts, 17.2 seconds in another run without optional abstracts |
| Same conference, cached | 5–8 ms |
| Latest / 7 days | 60 papers in 3.7 seconds in one run; a later cold API + RSS request timed out |
| `agent memory`, UI limit 60 | 60 OpenAlex fallback records in 4.5 seconds, including A-Mem and MemoryArena |
| `Attention Is All You Need`, UI limit 60 | Original paper returned through OpenAlex fallback in 3.7 seconds |
| arXiv ID `1706.03762` | Original paper through arXiv in 215 ms |
| Trending | 18 Hugging Face papers in 3.3 seconds |

Upstream arXiv rate limits and cold network failures remain possible. Existing cached papers stay usable during refresh/failure. This does not claim every conference edition or every arbitrary keyword was verified, nor that RSS covers the selected historical range.

## Automated verification

- Focused discovery, conference, figure, transfer and real-component UI tests: 67 passed.
- `npm run lint`, `npm run build`, and `npm run check:theme`: passed.
- Full suite: 1,545 tests, 1,536 passed, 5 skipped, 4 failed.
- All four failures were reproduced in a separate unchanged `b4a4480` checkout: experiment retry-audit temporary-path assertion on macOS, ordering in `native.ts`, locally missing LaTeX `phvr7t` font, and an outdated Library `searchKind` tab audit. No unrelated tests were weakened.
- UI behavior tests exercise stale-first rendering, rapid query/year changes, returning to a saved search without another request, saving into the selected Library, and reselecting the active feed/topic during an initial request.

## Matched visual evidence

Electron captures: 1180 × 820 CSS pixels, Paper theme. These are controlled bridge fixtures using a public paper record and pending refreshes, not live-source results. The conference fixture demonstrates cached-row visibility, not the paper's actual conference membership. Figure requests deliberately return no image so network/image differences do not obscure the comparison.

| Scenario | Before | After |
| --- | --- | --- |
| Old feed cache while refresh is pending | ![](assets/daily-discovery-recovery/stale-feed-before.png) | ![](assets/daily-discovery-recovery/stale-feed-after.png) |
| Search result with navigation controls | ![](assets/daily-discovery-recovery/search-before.png) | ![](assets/daily-discovery-recovery/search-after.png) |
| Old official-catalog cache during refresh | ![](assets/daily-discovery-recovery/conference-before.png) | ![](assets/daily-discovery-recovery/conference-after.png) |


## Follow-up: interrupted conference transfers

The running desktop reproduced an `AbortError` whose cause was `ERR_STREAM_PREMATURE_CLOSE`. This is an interrupted response body; the generic AbortError alone did not establish a timeout. Successful isolated requests had not covered this failure mode.

The official ICML endpoint supports HTTP byte ranges and a strong ETag. Virtual catalogs now download in 1 MiB segments with at most three concurrent streams; one broken segment retries once without discarding other validated segments. Content-Range, total length and version validators must match before assembly. A server ignoring Range is downloaded once normally; a ranged source without a version validator falls back to one complete response. The complete operation has a shared 60-second deadline and an 80 MB limit, and requests are aborted on failure. No partial/mixed catalog is saved as a completed result. The UI also translates connection/timeout failures instead of displaying Electron's raw RPC error.

Live segmented transfer: ICML 2026 returned all 6,430 records in 9.2 seconds, then cached access took 7 ms. After restarting the development app, its actual conference page displayed the 6,430-record catalog and cached results; this verification used the desktop's normal workspace rather than only an isolated probe.

Tests cover UTF-8 boundaries, concurrency limits, interrupted-segment retry, ignored ranges, changing ETags, invalid/oversized ranges, non-retryable 403/429 responses, a stalled deadline, and readable UI errors. Full suite still has the same four inherited failures documented above.

Matched 1180 × 820 Paper-theme fixtures for an interrupted request (before = commit `8bcc64d`, after = this follow-up):

| Before | After |
| --- | --- |
| ![](assets/conference-transfer-recovery/conference-error-before.png) | ![](assets/conference-transfer-recovery/conference-error-after.png) |
