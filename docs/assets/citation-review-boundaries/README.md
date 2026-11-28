# Citation review boundary fixes

The same focused regressions run against the pre-fix production files and the fixed branch. The pre-fix run uses a temporary `git archive` of `32d87a40` with only the current tests and source-graph helper overlaid; it does not use a worktree or modify the branch.

```bash
node --test --test-name-pattern='checks conflicts and matching references across every declared bibliography file' electron/paper-writing-citations.test.cjs
node --test --test-name-pattern='treats a missing declared bibliography as empty' electron/paper-writing-citations.test.cjs
node --test --test-name-pattern='compiling a root-level manuscript ignores an independent root-level draft' electron/paper-writing-workspace.test.cjs
node --test --test-name-pattern='a root-level compile waits for a reachable input outside the main folder' electron/paper-writing-workspace.test.cjs
node --test --test-name-pattern='the actual preload preserves compile ownership' electron/paper-writing-workspace.test.cjs
```

- `before.log`: an early matching bibliography entry hides a later key conflict; missing bibliography reads have no empty-file path; an unsavable root-level draft blocks an independent root-level build; a reachable input outside the main folder is omitted from the save barrier; creating a missing `.bib` with an empty expected baseline fails with `ENOENT`.
- `after.log`: all four regressions pass. Cross-file conflicts are checked before reuse, missing declared files are treated as empty, root-level builds save only reachable sources, and create-if-absent writes retain optimistic conflict protection.

This is a nonvisual state and provenance fix; test output is the before/after evidence.
