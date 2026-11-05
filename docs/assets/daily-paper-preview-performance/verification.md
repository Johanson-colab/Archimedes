# Daily Papers image loading

Owner-requested optimization of repeatedly slow Daily Papers previews. The owner has instructed direct updates to `main` and `origin/main`.

## Changes

- List rows request a JPEG thumbnail (longest edge 416px, suitable for the existing 208px display). Large paper previews retain the original image URL, with the cached thumbnail shown while it loads.
- Thumbnails and source links are cached for 24 hours under Electron userData `Cache/daily-figures`. Cache hits survive application restart. The disk budget is 64MiB, with up to 256 source records and 256 thumbnail files; stale/older files are evicted.
- A renderer cache retains loaded image state across page unmount/remount, with at most 128 entries and a 16MiB string budget. Daily Papers can still unmount when inactive.
- Duplicate requests share work. At most three renderer requests run together; visible rows precede prefetches. Scrolling away or unmounting drops queued subscriptions, and stale observer callbacks cannot start new requests.
- The resolver stops the HTML stream once it finds the first figure, reads at most 4MiB, and makes one 6-second attempt per HTML host. Successful URL cache entries are bounded; misses expire after two minutes.
- Image downloads use two slots and image decoding uses one. Downloads are limited to 8MiB, raster inputs to 16 million pixels, and generated thumbnails to 512KiB. Only known arXiv image hosts are downloaded by the cache; redirects are checked.
- PNG, JPEG and self-contained SVG files are resized. GIF/WebP and unsupported sources use their original browser image URL without a duplicate backend download. Failed conversion has a short cooldown; unavailable disk storage still permits an in-memory thumbnail.

No layout or control changes were introduced. Performance evidence uses an offline before/after benchmark and behavioral tests.

## Reproducible benchmark

Run `node --max-old-space-size=256 scripts/check-daily-figure-performance.mjs`. The script reads the baseline resolver from commit `200b764`, uses generated fixture data, and creates a temporary cache that is removed afterwards. It performs no external requests or model calls and does not access the user's cache.

| Measurement | Before | After |
| --- | --- | --- |
| HTML bytes consumed before resolving the first image | 4,194,304 | 65,536; remaining stream cancelled |
| Image bytes for the list preview | 4,056,377-byte PNG | 48,924-byte JPEG |
| Image dimensions | 1600×800 | 416×208, same aspect ratio |
| Cache restarted after first load | Link cache was process-local | 0 additional HTML lookups, 0 image downloads |
| Large-preview source | Original image URL | Same original image URL |

See [benchmark.json](benchmark.json). The synthetic fixture places its first figure in the first 64KiB chunk and uses a noise PNG to exercise large-image compression. These results demonstrate transfer/cache behavior; first-visit latency in production still depends on arXiv availability and the actual paper/image.

## Validation

- Focused backend and renderer checks cover persistent cache reuse, coalescing, eviction, stale/corrupt data, disk-write failure, input/redirect limits, HTML stream cancellation, bounded concurrency, viewport priority, abandoned work, instant warm remounts, and full-size preview fallback.
- Production build and TypeScript checks passed; existing Vite chunk-size warnings remain.
- Focused suite: **39 passed, 0 failed**.
- TypeScript lint, theme checks and `git diff --check` passed.
- Full suite: **987 tests: 976 passed, 4 skipped, 7 unchanged baseline failures** (three Windows-shell expectations on macOS, three Benchmark Radar fallback/cache tests affected by the adjacent checkout, and the existing PaperReviewView native-confirm audit).
- Full tests ran serially with a 256MiB JavaScript heap and a 700MiB process-tree cap; peak measured tree memory was 491.7MiB. The offline benchmark peaked at 120MiB under its separate 600MiB cap.
- Restart the desktop application to load the updated preload and main-process cache.
