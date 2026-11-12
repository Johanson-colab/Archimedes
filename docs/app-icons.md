# Application icon assets

The seven-block logo and its 3px corners / 4px × 4px black shadow (20%, 3px blur)
are defined in `shared/brand-logo.json`. The renderer uses that geometry with
`currentColor` and separate per-instance SVG shadow IDs. Sidebar, API harness
branding and Settings About share it; the artistic wordmark is unchanged.

On light themes the mark uses the dark foreground; on dark themes it uses the
light foreground. The shadow remains black, not a white glow. The original
standalone logo exports in `docs/assets/logo/` are preserved.

## Platform resources

| File | Consumer |
| --- | --- |
| `electron/assets/app-icon.ico` | Windows BrowserWindow; future Windows package/shortcut icon |
| `electron/assets/app-icon-256.png` | Linux/other BrowserWindow icon |
| `electron/assets/app-icon-1024.png` | macOS Dock via `app.dock.setIcon`, after app readiness |
| `electron/assets/app-icon.icns` | Resource for future macOS `.app` bundle icon |
| `electron/assets/app-icon.svg` | Editable native/web icon master |
| `public/favicon.svg` | Web favicon with shadow |
| `public/favicon.ico` | Web fallback icon |
| `public/apple-touch-icon.png` | 180px iOS/Safari touch icon |

Native/web icons have a neutral white rounded backing and transparent outer
corners so the black logo and shadow stay readable on light and dark desktop/tab
backgrounds. This backing is icon chrome, not part of the in-app transparent mark.
The Apple touch PNG is opaque white, allowing iOS to apply its own outer mask.
The original seven blocks are translated vertically by 15 units to center them
within a square 264-unit icon canvas; their relative positions are unchanged.

The Windows ICO contains 16/24/32/48/64/128/256px frames. Small frames use 32-bit
BGRA DIBs with AND masks; large frames are PNG-compressed. The ICNS includes
standard and Retina PNG entries (`icp4`, `icp5`, `icp6`, `ic07`–`ic14`) up to 1024px.

## Regenerate and validate

```sh
node scripts/generate-app-icons.mjs
node --test electron/app-icons.test.cjs electron/about-logo.test.cjs
```

The generator uses the already-installed `@napi-rs/canvas`; no new packages or
system icon conversion tools are required. Rasterization supersamples rounded
edges and draws shadows explicitly instead of relying on SVG-filter support in
third-party converters.

For an actual runtime smoke test, run with Electron, not Node:

```sh
npx --no-install electron scripts/check-native-icons.cjs
```

This checks native image decoding and BrowserWindow creation on the host OS, and
sets the Dock icon on macOS. It uses an isolated temporary profile.

## Packaging boundary

This repository does not currently define an installer/packager or a macOS bundle
configuration. This change does not add one. A future packaging configuration must
explicitly use `app-icon.ico` for Windows and `app-icon.icns` for macOS; simply
setting `BrowserWindow.icon` does not rewrite executable or Finder icons.

Before release, verify installed Windows executable/shortcut icons and signed
macOS `.app`/Finder/Dock icons on those platforms. A Windows smoke test and ICNS
format checks are not a substitute for an actual macOS packaged-app test. macOS
may also cache old bundle icons until the application is restarted/reinstalled.

Tracking: [Issue #300](https://github.com/Johanson-colab/Archimedes/issues/300).
Approval: [core-team scope confirmation](https://github.com/Johanson-colab/Archimedes/issues/300#issuecomment-6819581275).
