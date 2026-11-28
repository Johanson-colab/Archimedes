# O17 ready for publication review

- Worktree: `/Users/fei/Desktop/Archimedes-pr-splits/manuscript-build-receipts`
- Branch: `codex/manuscript-build-receipts`
- Base: upstream main `1f4b375`
- Head: `e48c78a5d9cf722a5ffc7d1c599e92ccec91fca8` — `feat(writing): retain version-bound compilation artifacts`
- Diff: 11 files, 461 insertions / 4 deletions; no new visual UI.
- PR body: `O17-PR.md`; published after root review as https://github.com/Johanson-colab/Archimedes/pull/347 (OPEN, non-draft, MERGEABLE on verification); exact base/head matched. Status API had no reported checks.

Scope follows root review: compile capture/write/read/prune only. No review/slides retained references or pin/unpin helpers are exported; those belong with the first real handoff consumer (O18).

Final evidence:

- `O17-focused.log`: 31 total, 30 passed, 1 existing latexmk skip, 0 failures.
- `O17-npm-test.log`: 1278 = 1264 pass / same 7 inherited failures / 7 skips.
- `O17-build.log`, `O17-theme.log`: passed; lint also passed before the non-UI pin/unpin removal, final build reran TypeScript successfully.
- `O17-before-real-tex.json`: actual main `1f4b375` two managed Tectonic runs reuse one output path and replace its PDF bytes.
- `O17-real-tex.json`: actual branch two managed Tectonic runs use distinct UUID directories; original PDF hash unchanged; older verification false and newer true. Warm runtimes 316 ms and 281 ms on small synthetic manuscript. Public sanitized evidence committed under `docs/assets/manuscript-build-receipts/before-after.md`.

The real managed engine and font/package cache remain at `/Users/fei/Library/Application Support/Archimedes/latex-runtime` for subsequent splits; no cache or generated PDF is committed. This branch has no dependency on O04.
