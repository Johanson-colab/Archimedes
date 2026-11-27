# Localhost delivery regression — 2026-11-26

Tracking: #256. Scope: repair generated-page web-link behavior and clarify the existing Create delivery boundary. No renderer layout or generated App source changed.

## Observed before

The molecule-workbench task generated a Python HTTP server at `127.0.0.1:8765`. Its native activity recorded the startup command and successful in-turn HTTP/analysis checks, but the command was completed by the end of the native turn. At investigation time there was no port listener and curl returned connection refused. This is consistent with a native-turn-owned process being reclaimed; it was not a host-managed App runtime.

The main Electron webContents had no `setWindowOpenHandler`, while renderer Markdown opens web links in a new target. Clicking the localhost link therefore created an unmanaged Electron child, which remained blank when its destination was unavailable.

## Changes

- Handle HTTP(S) new-window links through the system browser and deny Electron popup creation. Non-web schemes are denied. Browser-launch failures are handled without an unhandled rejection.
- Tell Create explicitly that a localhost URL is not a completed sidebar App. Without host lifecycle APIs, report an uninstalled scaffold, explain process lifetime and supply a restart command; do not silently substitute an independent server or detach it to hide this gap.
- Temporarily restarted the existing generated App using its own Python virtual environment outside the native turn. This recovery is not a product-managed runtime and no startup persistence is added.

## Verification

57 focused tests passed, including link routing, scheme rejection, browser-launch failure handling, capability retrieval and native prompt propagation. Type checking, build and theme checks passed.

The recovered service returned HTTP 200 and analyzed synthetic CSV with one valid and one invalid SMILES. A browser interaction loaded the App's five-row sample, ran analysis, and displayed three valid structures with images and two invalid records. The Archimedes developer app was restarted to load the handler; the local service remained available across that restart. Working-page screenshot: `molecule-workbench-working.png` (synthetic sample only). The link-policy change has no renderer layout before/after screenshot because the implementation changes navigation handling, not page composition; the original failure was shown in the user's report.

## Remaining work

A complete Create flow still needs an App manifest and registration path, an explicit start/stop runtime owned by Archimedes, readiness/error monitoring, an isolated preview, and save/pin/reopen integration. The generated molecule page is not installed in the sidebar. No real model call or packaged-build test was performed for this fix.
