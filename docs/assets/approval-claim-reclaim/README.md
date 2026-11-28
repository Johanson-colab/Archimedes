# Approval claim reclaim after store replacement

The same source-extracted regression is run against the pre-fix production files and the fixed branch. The pre-fix run uses a temporary `git archive` with only the current test overlaid; it does not use a worktree or modify the branch.

```bash
node --test --test-name-pattern='accepting a replacement store' electron/agent-approval-surface.test.cjs
```

- `before.log`: the old store keeps the approval surface and the replacement store never receives the visible thread claim.
- `after.log`: accepting the replacement store releases the old scoped claim and reissues it against the new store facade for the same visible thread.

This is a nonvisual ownership fix; test output is the before/after evidence.
