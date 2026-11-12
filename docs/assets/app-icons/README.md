# Shadowed application icon evidence

Tracking: [#300](https://github.com/Johanson-colab/Archimedes/issues/300).
Written approval: [core-team confirmation](https://github.com/Johanson-colab/Archimedes/issues/300#issuecomment-6819581275).

## Visual audit

Before screenshots use unchanged `origin/main` at `83f8191`; after screenshots
use the implementation worktree. These are actual React pages, not recreated
application mockups. Matching viewport and state per pair:

- Narrow web sidebar: 800 × 1000.
- Composer/harness and Settings About: 1440 × 1000.
- Light and dark cases set both existing theme DOM selectors to `paper` or
  `charcoal` after navigation. This checks the mark under both real CSS themes,
  not persisted theme-preference interactions.
- `browser-audit.json` confirms seven rectangles, live SVG shadow filters,
  differing theme foregrounds and non-colliding SVG filter IDs. About remains
  decorative next to the accessible product name.
- `native-resource-*` is a PNG resource preview at multiple sizes on light/dark
  backgrounds, explicitly **not an OS taskbar/Dock screenshot**.

## Validation (Windows, 2026-11-12)

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run check:theme` | Pass |
| `npm run build` | Pass, existing large-chunk warning |
| Focused icon/About/settings/harness tests | 17 pass, 0 fail |
| Full `npm test`, unchanged baseline | 1163 tests: 1058 pass, 88 fail, 17 skipped |
| Full `npm test`, implementation (final run) | 1170 tests: 1067 pass, 86 fail, 17 skipped |
| Comparison of failing test names | All 86 implementation failures also occur on baseline |
| Asset regeneration | Eight generated files byte-for-byte reproducible |
| ICO independent Pillow decode | All seven 16–256px frames decoded |
| ICNS independent Pillow decode | Standard/Retina entries recognized, 1024px decoded |
| Windows native Electron smoke | Pass; Electron 43.4.1 decodes ICO at 256px and creates a native BrowserWindow |

`native-windows.json` records the actual Electron result. No full-suite failures
were hidden or weakened. The prior About assertion is updated for the shared SVG
component and now explicitly checks shadow presence and theme-adaptive fill.
The baseline additionally failed `switching apps retains sort/search and closes
menus and preview scroll locks` and `wide chat content cannot push history and
composer out of the viewport`; both passed in the final implementation run.
An earlier implementation run had the same 88 failures as baseline, illustrating
the timing variability of these two unrelated UI tests.

## Native platform limitations

No macOS machine or packaged `.app` was available. ICNS structural/payload checks
and mocked platform-selection tests do not establish Finder/Dock behavior on a
real Mac. A native smoke command is provided in `scripts/check-native-icons.cjs`.
Headless browser screenshots do not capture browser-tab chrome or the native
taskbar/Dock. Actual favicon/native resources are therefore covered by the
resource preview, independent format decoding, and the native Windows smoke log,
not represented as browser-tab or Dock screenshots.

There is no existing installer/bundler configuration in this repository. Native
format assets and runtime icon paths are updated, but **Windows executable/installer
resources and macOS bundle `CFBundleIconFile` are not configured by this PR**.
See `docs/app-icons.md` before adding a packaging pipeline or making release claims.
