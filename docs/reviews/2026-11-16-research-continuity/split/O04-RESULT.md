# O04 ready for publication review

- Worktree: `/Users/fei/Desktop/Archimedes-pr-splits/continue-existing-manuscripts`
- Branch: `codex/continue-existing-manuscripts`
- Base: upstream main `1f4b375`
- Code: `65e2ab7` — `feat(writing): continue existing manuscripts with owned saves`
- Diff: 14 files, 713 insertions / 101 deletions; screenshots included. Only untracked renderer audit HTML/TSX remain outside the commit.
- PR body: `O04-PR.md`; published after root review as https://github.com/Johanson-colab/Archimedes/pull/348 (OPEN, non-draft, MERGEABLE on verification). Final head `f6d2207a31c178c26d0f8199a1698d3602f2ceb3` includes content-only screenshots.

The final implementation includes the project-selection correction requested in root review. Before the fix, A and B sharing a physical execution folder restored A's selected main file when B was entered. `O04-same-root-before.log` shows the regression failing (`paper/main.tex` instead of B's `other/main.tex`). The fixed view keys selection by `[workspace, projectId]` while sharing actual root/file documents and serialized save queues. Compile progress is selected by its real root and request ID. **Do not replace this code with the frozen integrated tree's older workspace-only scopes when assembling the final branches.**

Final evidence:

- `O04-focused-final.log`: writing + affected coedit/dialog audits 17/17 passed.
- `O04-npm-test-final.log`: 1281 = 1267 pass / same 7 inherited failures / 7 skips.
- `O04-lint-final.log`, `O04-build-final.log`, `O04-theme-final.log`: passed.
- Actual base/head, same 1440×1000 viewport/theme/fixture pictures are committed under `docs/assets/continue-existing-manuscripts/`.

An earlier exploratory whole-suite run had stale static source assertions and one Electron shutdown timeout in the unchanged chat-width test. The assertions were updated to check the new actual UI syntax, the chat check passed unchanged, and the final whole-suite run has only the seven same-main baseline failures.

Review follow-up: `b2299a2bf85dfe564b09efa47b8d8ea0953d97e0`, two files 70+/10-, root-reviewed and approved for ordinary push to #348. `O04-review-focused.log` 19/19; `O04-review-lint.log` and `O04-review-build.log` passed. Clean scope re-entry refresh and supporting-source compile ownership fixed; no new full baseline run.
