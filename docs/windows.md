# Windows local build and portable packaging

Install Node.js 24 LTS and Git, then run npm.cmd ci in PowerShell. Installation
verifies node-pty's prebuilt Windows binary in Electron. Visual Studio C++ Build
Tools are needed only if the prebuilt binary fails and a source rebuild is required.

Double-click Start-Archimedes.cmd to rebuild and start the desktop app. The launcher
rebuilds on every start. For development with automatic reload, run npm.cmd run dev.
Production builds use relative asset URLs so the renderer and welcome images load
through file://.

Gallery maintenance detects py -3, python or python3 (Python 3.10+) and runs in
UTF-8 mode. Its dependencies still need to be installed separately as described
in the gallery pipeline documentation.

~~~powershell
npm.cmd run build
npm.cmd run test:windows:desktop
npm.cmd run package:win
~~~

To reuse the installed Electron runtime instead of downloading it again:

~~~powershell
npm.cmd exec electron-builder -- --win portable --x64 --config.electronDist=node_modules/electron/dist
~~~

The package is unsigned, portable-only and has no automatic updater. Output is
written under release/. To smoke-test an unpacked package:

~~~powershell
node scripts/smoke-windows.cjs release/win-unpacked/resources/app.asar
~~~

The smoke check runs the real main process, preload and renderer with a disposable
workspace/profile and blocked HTTP(S). It checks renderer startup and local image
loading, then writes release/windows-smoke.png. Command, workspace and window
policy changes are intentionally tested in their respective PRs.

## Before and after

Both captures use a 1280x720 content viewport, Paper theme, English, 100% UI
scale, the same disposable workspace, and the new-task screen loaded from file://.
Before, absolute asset URLs leave the renderer blank; after, the renderer mounts
and all five local welcome images load. HTTP(S) requests are blocked.

### Before

![Before](assets/windows-packaging/before.png)

### After

![After](assets/windows-packaging/after.png)
