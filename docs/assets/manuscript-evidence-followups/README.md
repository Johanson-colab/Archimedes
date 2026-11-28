# Manuscript evidence review follow-ups

The pre-fix run uses a temporary `git archive` of `3b358265` with only the current
tests overlaid. It does not use a worktree or modify the branch.

```bash
node --test electron/manuscript-evidence.test.cjs
node --test electron/ui-audit-manuscript-evidence.test.cjs
node --test --test-name-pattern='a rejected source conflict|a conflicted source in another manuscript' electron/paper-writing-workspace.test.cjs
```

- `before.log`: the record referenced a disposable preview build, reopening used
  raw CRLF offsets, a rejected save had no recovery action, and an unrelated
  manuscript's save conflict blocked the target build.
- `after.log`: all four regressions pass.
- `docs/assets/writing-conflict-recovery/`: matched pre-fix and fixed Electron
  captures of the new conflict action at the same 1,180 × 900 viewport.

The two earlier CRLF and small-number findings were already fixed on the branch
and are retained by the expanded UI audit. Small nonzero values use exponential
formatting, and selection offsets are derived from the textarea's normalized value.

All fixes are lifecycle-safe: the conflict action awaits the existing save queue,
does not add timers or listeners, and the durable build copy is made once per
linked build with a restrictive mode.
