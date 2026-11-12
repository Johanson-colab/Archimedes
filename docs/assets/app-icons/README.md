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

The original asset-only implementation did not embed installer or bundle icons.
The approved packaging follow-up below replaces that limitation; the earlier
test figures above describe the first icon-only implementation stage.

## Packaging follow-up

Expanded approval: https://github.com/Johanson-colab/Archimedes/issues/300#issuecomment-6820240564

`electron-builder` 26.18.0 now explicitly embeds the approved ICO into Windows
EXE/NSIS installer/uninstaller resources and the ICNS into macOS bundle/DMG icon
configuration. Runtime Dock/window PNG/ICO files are copied outside ASAR. Relative
Vite asset URLs and server/shared files support packaged `file://` launch paths.

Actual local Windows icon-audit outputs:

- `release/win-unpacked/Archimedes.exe`.
- `release/Archimedes-0.1.0-win-x64.exe` (NSIS, unsigned, 278557811 bytes).
- Shell-extracted embedded icons for **both files match all 32 × 32 visible
  pixels** of the approved ICO: `windows-file-icons.json`.
- ASAR runtime-file presence, absence of `.env` files, relative renderer URLs,
  and outside-ASAR icon byte equality: `packaged-windows.json`.
- The packaged executable successfully loads its packaged native PTY module and
  runs an isolated echo command: `packaged-native-windows.json`.

The standard native rebuild step could not run because Visual Studio C++ Build
Tools are absent. The local icon-audit build explicitly skipped that step and
used the installed prebuilt native binaries; the committed configuration **keeps
`npmRebuild: true`**. These unsigned local outputs were not published, installed,
or presented as accepted production releases. macOS bundle/DMG output and real
Finder/Dock behavior remain untested on a Mac. Signing/notarization is not set up.

Follow-up checks: lint/build/theme pass; focused tests **21 pass**. Full-suite
results using the same freshly installed dependency tree for both worktrees:

| Run | Total | Pass | Fail | Skipped |
| --- | --- | --- | --- | --- |
| Unchanged `83f8191` baseline | 1163 | 1059 | 87 | 17 |
| Implementation | 1174 | 1070 | 87 | 17 |

86 failing names are common. The implementation additionally hit the known
timing-sensitive app-switch test; baseline additionally hit the known wide-chat
layout test. Both failures were also present in the earlier unchanged-baseline
run above. No new stable failure was introduced and no failure was weakened.
Existing top-level production dependency versions are unchanged by the new
development dependency. See `docs/app-icons.md` for real packaging/inspection commands.

## Running Windows taskbar / thumbnail follow-up

The user's screenshot specifically identified the running taskbar button and
thumbnail-header icon. Source inspection also found the original local checkout
still at `0a0e5b3`, without this unmerged PR. Updating installed-file resources alone
does not ensure development-mode taskbar relaunch properties are set.

The fix explicitly assigns both window HICONs and complete per-window taskbar
metadata before the first show, keeping the existing AppUserModelID unchanged.
An isolated Electron 43.4.1 hidden window was probed with actual Win32 APIs:

- `running-window-before.json`: old PNG constructor behavior has no per-window
  taskbar relaunch icon/command/display name. Legacy HICON decoding limitations
  are preserved as diagnostics, not reported as successful comparisons.
- `running-window-after.json`: taskbar icon resource is `app-icon.ico,0`,
  AppUserModelID is `com.archimedes.research`, relaunch metadata is complete.
- The post-change **16px small HICON and 32px large HICON both match the new ICO
  with zero different pixels**.
- `window-before/after-small.png` and `window-before/after-large.png` render the
  actual HWND-owned HICONs via Win32 `DrawIconEx`, on identical 64px neutral
  swatches. These are native icon extractions, not screenshots of Explorer's
  taskbar, and no user desktop content was captured.
- No active user window was closed, modified, or injected into. Old pinned
  Electron shortcuts and global shell caches were not changed.

Latest validation: lint/build/theme pass, **24 focused tests pass**. Full suite:
1177 total, **1074 pass, 86 fail, 17 skipped**; every failure name was present in
unchanged-baseline runs already recorded above. New unit cases cover development
and packaged relaunch arguments and assignment before first show. No preview
server or debug browser is required by the native HWND audit.
