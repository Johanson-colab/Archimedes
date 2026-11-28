# Experiment code snapshot revalidation

The same regression is run against the pre-fix production files and the fixed branch. The pre-fix run uses a temporary `git archive` with only the current test overlaid; it does not use a worktree or modify the branch.

```bash
node --test --test-name-pattern='code snapshot cannot' electron/experiment-workspace.test.cjs
```

- `before.log`: a snapshot is created from clean committed code, the worktree is then modified, and `createExperimentRun` still creates a run because it only rechecks the branch and path containment.
- `after.log`: after the asynchronous branch probe, `createExperimentRun` re-inspects the whole worktree and rejects the dirty state before inserting a run row.

This is a nonvisual provenance fix; test output is the before/after evidence.
