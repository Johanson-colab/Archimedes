# N02 publication review

- Worktree `Archimedes-pr-splits/manuscript-citations`, feature branch `codex/manuscript-citations` at `3681335b22841b7ff011bc757509bfb09314218a`.
- Review base `codex/manuscript-citations-base` at `ff5f0c4`: exact union of O04 #348 and O13 #346; no B1, A02, O02, build-receipt or review dependency.
- Own diff: 17 files, 436 insertions / 6 deletions. Production: `PaperWritingCitations.tsx`, citation helper/CSS/shard; small `PaperWritingView`, save-busy state, i18n entry and `parseBibliography` identity-only optional-title hunks. No library DB mutation is performed by insertion.
- Root review corrections included: complete concatenated-field spans with DOI/marker preservation; UUID fallback instead of late unowned DB write; selectable paper restricted to visible search results; one concise key/preservation hint.
- `N02-focused-final.log`: 24/24; `N02-npm-test-final.log`: 1294 = 1280 pass / same 7 inherited failures / 7 skips. Final lint/build/theme logs passed. `N02-concatenation-before.log` records the real failing reproduction before its fix.
- Actual renderer FS/DB flow and real managed Tectonic success: `N02-renderer-real-tex.json`; true PNG base/head 1440×1000 pair plus new-dialog/action captures are committed. Source files and key/manual entry were checked after actual UI operations.
- PR body `N02-PR.md`. Published after root review: https://github.com/feiiiiii5/Archimedes/pull/2 (fork single-feature review PR; exact base/head verified; OPEN, non-draft, MERGEABLE). Temporary audit HTML/TSX remain untracked and excluded.
