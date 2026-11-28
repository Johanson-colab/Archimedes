# Manuscript review receipt lifetime

The pre-fix run uses a temporary `git archive` of `a03baa6` with only the current tests overlaid. It does not use a worktree or modify the branch.

```bash
node --test electron/manuscript-handoff.test.cjs
node --test electron/manuscript-review-retention.test.cjs
node --test electron/ui-audit-paper-review.test.cjs
```

- `before.log`: a rebound project folder makes the handoff compile the new root instead of the owning session's execution folder; saved reviews require a live workspace row; reviewed page links point into the pruned five-build preview cache; refresh failures are not shown before consent.
- `after.log`: the handoff resolves and authorizes the session execution folder, stored-result operations use record-only authorization, reviewed pages use the retained SHA-256 PDF copy in a root-scoped preview token, and the refresh error is displayed before consent.

This is a nonvisual lifecycle fix; test output is the before/after evidence.
