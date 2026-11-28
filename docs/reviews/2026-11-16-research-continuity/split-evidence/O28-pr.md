`resolveTerminalShell({ platform: "win32" })` constructed PowerShell candidates with the host path rules. Use Windows path joining for Windows targets, including Microsoft Store installs and alternate drives, while preserving shell preference and fallback behavior.

Validation on macOS arm64, Node 26.13.0:

- `node --test electron/terminal-shell.test.cjs`: upstream main had 4 passes / 3 failures; this branch passes 8/8.
- These tests simulate a Windows target on macOS; they do not claim a Windows-machine launch test. Original shell assertions remain unchanged.

Split from #336.
