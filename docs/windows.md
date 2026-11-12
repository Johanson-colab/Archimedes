# Windows local build

Install Node.js 24 LTS and Git, then run `npm.cmd ci` in PowerShell.
Installation verifies node-pty's prebuilt Windows binary in Electron. A source
rebuild needs Visual Studio C++ Build Tools only if the prebuilt binary fails.

Double-click `Start-Archimedes.cmd` to rebuild and start the local desktop app.
The launcher rebuilds on every start so changes do not leave a stale UI.
For development with automatic reload, use `npm.cmd run dev`.

## Commands and terminals

Select PowerShell, PowerShell 7 or CMD in Settings > Terminal. Approved commands
use the selected shell, and the agent receives its executable and platform.
PowerShell commands run without profile scripts and report errors and native exit
codes. Use `npm.cmd` in PowerShell if the execution policy blocks `npm.ps1`.
Arbitrary custom shells remain available interactively; automated execution needs
a supported command-line interface and reports an error for unknown shell types.
Portable PowerShell 7 and custom executable names are also detected on PATH,
including quoted directory entries. Restart Archimedes after changing PATH.
The external terminal's Auto option falls back to the selected shell when Windows
Terminal is not installed; explicitly selected third-party terminals still need
to be installed separately.

Approved CMD commands run in a hidden ConPTY console so Chinese output from CMD
built-ins and native programs is decoded correctly even without a parent console.
Terminal control sequences are removed from the command log. CMD programs see a
TTY; use PowerShell for scripts that specifically require pipe-based stdout.

Windows terminal sessions use node-pty's bundled ConPTY. Stopping a command,
closing its window or quitting the app also terminates its Windows process tree.
Unsaved work in processes started by those commands will be lost when stopped.

## Optional research tools

Python is not required for the app. Gallery maintenance detects `py -3`, `python`
or `python3` (Python 3.10+) and runs in UTF-8 mode. Its Python dependencies still
need to be installed separately as described in the gallery pipeline documentation.

Paper compilation requires TeX Live, MiKTeX or Tectonic, with `latexmk.exe`,
`pdflatex.exe` or `tectonic.exe` on PATH. Restart the application after installing
one of these tools. They are not bundled with the desktop application.

## Portable Windows application

Run `npm.cmd run package:win` to build the Windows x64 portable executable under
`release/`. The build includes the runtime, production dependencies, UI and local
gallery assets; it excludes local environment files and research workspaces.
The portable app does not require Node.js on the target PC. Configure model keys
inside its Settings dialog. It is unsigned and has no automatic update mechanism.

If Electron's download stalls during packaging, an x64 Windows development machine
can reuse its already installed x64 runtime after `npm.cmd run build`:

```powershell
npm.cmd exec electron-builder -- --win portable --x64 --config.electronDist=node_modules/electron/dist
```

Automated checks: `npm.cmd test`. Windows-specific tests exercise Unicode and
space-containing paths, case variants, junction containment, command exit codes,
process-tree termination and immediate terminal closure. Mac behavior has not been
validated on a Mac as part of this local adaptation.

After building, run `npm.cmd run test:windows:desktop` to check the real Electron
main process, preload bridge, rendered UI, Chinese script files, CMD output and PTY
closure. It uses a temporary workspace/profile and blocks HTTP(S) requests. A
screenshot is written to `release/windows-smoke.png`. To check the packaged code:

```powershell
node scripts/smoke-windows.cjs release/win-unpacked/resources/app.asar
```

## Compatibility fixes — 2026-11-11

- Quoted CMD executable paths and Chinese arguments retain their values and exit codes.
- PowerShell/CMD script files (`.ps1`, `.psm1`, `.psd1`, `.cmd`, `.bat`) can be read,
  edited and included in workspace change summaries.
- File-write previews and writes check existing parent directories, preventing
  Windows junctions from redirecting a write outside the selected workspace.
- TeX discovery accepts quoted PATH entries and ignores directories named like executables.
- New windows fit the selected monitor's available area, with room for fractional
  DPI rounding and the taskbar; minimum dimensions also shrink on small displays.

Validation is on this Windows x64 machine. Windows ARM64, older Windows versions,
remote desktop/multi-monitor transitions, and installation on a clean PC still
need separate validation. Packaging remains unsigned and portable-only.
