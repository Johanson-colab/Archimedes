# Compile dependency barrier

The pre-fix run uses a temporary `git archive` of `e73a7f85` with the current component test and source-graph helper overlaid. It does not use a worktree or modify the branch.

```bash
node --test --test-name-pattern='compiling a root-level manuscript ignores an independent root-level draft' electron/paper-writing-workspace.test.cjs
node --test electron/paper-writing-sources.test.cjs
```

- `before.log`: the root-level compile barrier includes every cached document, so an unsavable independent manuscript prevents the selected build.
- `after.log`: the selected root-level build compiles independently. The source-graph regressions also verify transitive `\input` paths outside the main folder, bibliography dependencies, comments, cycles and workspace escapes.

Folder builds retain their existing whole-directory snapshot and add reachable dependencies outside that folder. This keeps normal section saves working while ensuring an external `\input` draft cannot be omitted.

This is a nonvisual build-correctness fix; test output is the before/after evidence.
