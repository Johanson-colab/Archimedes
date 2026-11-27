Prepare the Electron binary explicitly with a bounded command, and check its presence before desktop startup or the full test run. A missing binary now reports the preparation command without evaluating Electron's implicit download entry. Keep a separate core test command and two desktop checks while retaining the complete inventory in `npm test`.

Validation on macOS arm64 / Node 26.13.0:

- Three focused tests pass: missing binary without implicit download, timeout of a stalled preparation child, and unchanged complete core/desktop test inventory.
- `npm run check:desktop` finds the installed binary. Lint, build and theme checks passed. Both real Electron layout checks executed; the PDF-root check was conditionally skipped by the old main command.
- Standard `npm test`: 1273 tests, 1260 passed / 7 failed / 6 conditional skips. The failures match the same-main baseline (Git/worktree 3, Windows-target shell 3, translation ordering 1; #337–339).

Split from #336.
