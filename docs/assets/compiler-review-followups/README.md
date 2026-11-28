# Compiler review follow-ups

The pre-fix run uses a temporary `git archive` of `979046f0` with only the current tests overlaid. It does not use a worktree or modify the branch.

```bash
node --test --test-name-pattern='cancelling a build releases a pending system proxy lookup' electron/managed-latex-engine.test.cjs
node --test --test-name-pattern='returning to Writing drops a preview whose build inputs are no longer current' electron/paper-writing-workspace.test.cjs
```

- `before.log`: cancelling during system proxy resolution leaves the request pending until the test timeout; returning to Writing keeps a cached PDF whose inputs may have changed.
- `after.log`: cancellation rejects immediately and clears the resolution timer; re-entry verifies the saved snapshot and removes a stale preview, with an unmount guard so a late verification cannot update a dead component.

Also in this follow-up: autosave no longer starts a compile after Writing is deactivated, Windows compiler discovery recognizes `Path`, and managed-engine preparation diagnostics are translated. Their matched captures are under `docs/assets/autosave-departure/`, `docs/assets/local-compiler-path/`, and `docs/assets/managed-compiler-translations/`.

These are nonvisual lifecycle changes except the translated diagnostics; the captures and test output are the before/after evidence.
