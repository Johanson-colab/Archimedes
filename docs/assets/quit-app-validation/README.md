# Research App quit lifecycle

These logs compare the same focused regression tests against the pre-fix production files and the fixed branch. The pre-fix run uses a temporary `git archive` of the parent commit with only the new test files overlaid; it does not use a worktree or modify the branch.

Command:

```bash
node --test electron/accepted-workspace-owner.test.cjs electron/paper-deep-reading-ipc.test.cjs electron/research-app-runtime.test.cjs electron/research-app-delivery.test.cjs electron/experiment-run-cancellation.test.cjs
```

- `before.log`: 37 passed, 3 failed. The failures show that App-only validation did not trigger the quit guard, validation shutdown had no completion barrier, and a stopping Python App was no longer counted as active.
- `after.log`: 40 passed, 0 failed. The tests cover Chinese quit copy, window restoration after cancellation, awaiting App-only validation, stopping-runtime tracking, and the repaired extracted-handler fixture.

This is a nonvisual lifecycle fix. The parent PR's existing matched screenshots cover the affected Research App stop surface; no new UI layout is introduced here.
