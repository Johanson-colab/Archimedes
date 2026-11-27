Selecting a repository through a directory alias such as macOS `/var` could mark it suspicious because Git reports its physical `/private/var` path. Compare the real directory identities while retaining the existing checks for malformed `.git` entries and linked worktrees.

Validation on macOS arm64, Node 26.13.0:

- `node --test electron/git-state.test.cjs`: upstream main had 1 pass / 2 failures; this branch passes 4/4, including the added alias regression.
- Existing assertions are unchanged; the new test also confirms that an invalid nested `.git` still remains suspicious.

- Existing `electron/project-workspace.test.cjs` also passes 3/3, including real project/session directory creation (using the existing installed dependencies).

Split from #336.
