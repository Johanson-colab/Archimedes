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
| `electron/assets/app-icon.ico` | Windows window, EXE, NSIS installer/uninstaller and shortcuts |
| `electron/assets/app-icon-256.png` | Linux/other BrowserWindow icon |
| `electron/assets/app-icon-1024.png` | macOS Dock via `app.dock.setIcon`, after app readiness |
| `electron/assets/app-icon.icns` | macOS `.app` bundle/Finder and DMG volume icon |
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

## Desktop packaging and file icons

After core-team approval, `electron-builder.config.cjs` now wires the same artwork
into the actual downloaded application/installer, not just `BrowserWindow.icon`:

- `win.icon`: embedded Windows application EXE resources.
- `nsis.installerIcon`, `uninstallerIcon`, `installerHeaderIcon`: NSIS executable
  and installer UI; desktop/Start-menu shortcuts target the branded application.
- `mac.icon`: the `.app` bundle icon and `CFBundleIconFile`, used by Finder and
  the Dock before launch. Runtime `app.dock.setIcon` uses the matching PNG.
- `dmg.icon`: the DMG volume icon.
- Runtime icons are also copied to `resources/icons` (macOS `Contents/Resources/icons`)
  outside ASAR, so native window/Dock APIs do not depend on reading an archive.
- On Windows, every application window calls `setIcon` and `setAppDetails` before
  its first show. The existing `com.archimedes.research` identity is retained;
  the taskbar gets the new ICO plus complete relaunch command/display-name
  properties. Development relaunch metadata includes the absolute app directory,
  preventing a generic `electron.exe` taskbar group/icon. Packaged metadata uses
  only the application executable.
- Vite uses relative asset URLs for packaged `file://` loading. Package files
  include the server/shared runtime modules and exclude `.env` files.

```sh
npm ci
npm run package:desktop  # host-platform unpacked app
npm run dist:win         # Windows x64 NSIS installer; build on Windows
npm run dist:mac         # host-architecture .app + DMG; build on macOS
```

Outputs go to ignored `release/`. Publishing is disabled in these commands.
Native rebuilding stays enabled: Windows requires Visual Studio C++ Build Tools;
macOS requires Xcode command-line tools. Signing/notarization credentials and
publishing are not configured or invoked by this change. Do not redistribute the
local unsigned icon-audit build as a production release.

Verify actual Windows embedded file icons rather than trusting the source ICO:

```powershell
node scripts/check-packaged-icons.cjs release/win-unpacked
.\scripts\check-windows-file-icons.ps1 -Files @('release/win-unpacked/Archimedes.exe', 'release/Archimedes-0.1.0-win-x64.exe')
```

The PowerShell check extracts each executable's shell icon and compares every
visible pixel with the approved ICO. On macOS, inspect the real bundle:

```sh
node scripts/check-packaged-icons.cjs release/mac-arm64/Archimedes.app
```

Use `release/mac/Archimedes.app` on Intel. This reads `CFBundleIconFile` with
`plutil` and compares the referenced bundled ICNS with the source. Mount the DMG
and verify the volume icon, then test Finder/Dock on a real Mac. Those native
macOS checks remain unrun here. ZIP/archive files retain the OS archive icon;
this change does not modify global file associations.

Already-downloaded/installed old bundles do not change automatically: merge the
PR, rebuild, and replace the old application. macOS may also cache old bundle
icons until the application is restarted/reinstalled or its Dock entry is re-added.
Likewise, restarting an unchanged old development checkout cannot load the new
icons. Update the code first. A previously pinned generic Electron shortcut may
need to be unpinned and the updated running Archimedes window pinned again; this
change does not rewrite the user's pinned shortcuts or clear global icon caches.

For native Windows running-window checks, `check-native-icons.cjs` now probes
the real HWND's small/large HICON and AppUserModel relaunch icon properties through
`scripts/check-windows-window-icons.ps1`. It uses an isolated hidden window,
not the user's active application. Optional `ARCHIMEDES_WINDOW_ICON_AUDIT_OUTPUT`
and `ARCHIMEDES_WINDOW_ICON_PREVIEW_PREFIX` save redacted metadata and raw HICON
previews. `ARCHIMEDES_ICON_BASELINE` accepts an old PNG for diagnostic comparison;
strict post-change validation always requires matching icon pixels and metadata.

Tracking: [Issue #300](https://github.com/Johanson-colab/Archimedes/issues/300).
Approval: [core-team scope confirmation](https://github.com/Johanson-colab/Archimedes/issues/300#issuecomment-6819581275).
Extended packaging approval: [explicit superseding approval](https://github.com/Johanson-colab/Archimedes/issues/300#issuecomment-6820240564).
