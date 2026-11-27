# Closeout — 2026-11-16

> **Pause update (later on 2026-11-16):** implementation is paused. Read [PAUSE-2026-11-16.md](PAUSE-2026-11-16.md) for the actual PR heads/state, the remaining O/N scope and source pointers, the preserved main-worktree backup, and the resume order. Since this closeout: #337/#338/#339 merged to `main` (`57ca05a`); #340 was closed by the maintainer as covered by #308; #354/#351/#342 received real before/after screenshots; #346 was merged with current `main`; #356/#355 and fork #7/#8 were published. The final integration branch is still **not** built.

**21 review PRs created; see the pause record for the current open set. #343, #344 and #349 are closed/deferred, with branches and code retained. This is unfinished work, not a ready-to-merge set.** Exact latest published heads and bases are in [PR_SPLIT.md](PR_SPLIT.md). Remote findings remain open. The final split-branch union has not been integrated or validated; the frozen main worktree and its checkpoint are preserved.

Deferred scope: mandatory install-time toolchain policy (#343), additional per-project annotations/provenance (#344), and full build fingerprint/diagnostics (#349). Their benefit does not justify their added contracts for this delivery; no published PR depends on them. Exclude these three branches from future integration.

## Necessity review

Keep means retain for review, not ready to merge. Prioritize the core repairs below; new features remain deferred.

| PR | Decision | Reason |
| --- | --- | --- |
| #337 | Keep | Correct valid Git-root aliases being rejected. |
| #338 | Keep | Construct Windows target paths correctly. |
| #339 | Keep | Repair the existing translation-order gate without new behavior. |
| #340 | Keep | Deliver the selected work mode to the actual agent request. |
| #341 | Keep | Persist asynchronous work under its original data owner. |
| #342 | Keep | Restore project discovery queries and their results. |
| #343 | Closed/deferred | Mandatory install policy exceeds the demonstrated prerequisite need. |
| #344 | Closed/deferred | Additional project annotation/provenance contract has limited benefit and no published dependent. |
| #345 | Keep | Make desktop preparation explicit and execute actual desktop regressions. |
| #346 | Keep | Exchange BibTeX and retain distinct local PDF identities. |
| #347 | Keep | Associate compiled PDFs with the observed source version. |
| #348 | Keep | Continue existing multi-file manuscripts with correct project selection. |
| #349 | Closed/deferred | Full fingerprint/diagnostics contract is unnecessary for this delivery. |
| #350 | Keep | Preserve file drafts and saves under their original owner. |
| #351 | Keep | Make research-app entry and configuration reachable. |
| #352 | Keep | Bound snapshot traversal and reads before expensive work. |
| #353 | Keep | Preserve structured Docker/SSH filesystem boundaries. |
| #354 | Keep | Reject incomplete responses and tool batches. |
| Fork #1 | Keep | Keep task selection and execution ownership consistent. |
| Fork #2 | Keep | Insert manuscript citations and update the bibliography. |
| Fork #3 | Keep | Preserve conversation drafts, attachments and owned notes. |

## This closeout's published heads

| PR | Exact head | Follow-up evidence |
| --- | --- | --- |
| [B1 #341](https://github.com/Johanson-colab/Archimedes/pull/341) | `8ea0f94c7ca3a19e328fd06b3702544a7f8d2e0f` | Accepted-owner/preview/recovery fix: 6 focused, type/build passed. |
| [A02 fork #1](https://github.com/feiiiiii5/Archimedes/pull/1) | `bfff0d321d29bf86a2fc5973d1df555710888a42` | New-project records + empty `/side` workspace: 6 focused/type/build; merged B1 group 16/16. |
| [O02 fork #3](https://github.com/feiiiiii5/Archimedes/pull/3) | `cc76beea86d06d091f8cf435b8a536589e25de6d` | Merged actual A02/B1 ancestry; focused group 25/25. Late-attachment finding remains open. |
| [O06 #354](https://github.com/Johanson-colab/Archimedes/pull/354) | `10ac03dec4109670967e909236bb8f4b082a04be` | 21 protocol/DB checks + 10 registry checks; lint/build/theme; standard 1276 = 1262 passed / 7 inherited failures / 7 skips. |

All pushes were ordinary updates. Fork #1 bases on B1 `8ea0f94`; fork #3 bases on A02 `bfff0d3`. Fork #2 still uses earlier O04/O13 heads, without their latest follow-ups. Cross-repository retargeting is not possible; eventual upstream submissions require fresh branches/PRs linked to fork reviews.

## Local, unpublished checkpoints

- O14: `5a339d455a126ab1b586eef449e6c50d5f8fe009`, HOLD: post-save refresh can cross a data-root switch; docs/images unfinished. Details and published product fixes: [PRODUCT_CLOSEOUT.md](PRODUCT_CLOSEOUT.md).
- O18: `704b3ef3d022543072d6022db41a4668df309e95`, local only. Focused 27/27 + affected audits 8/8; earlier standard 1319 = 1306 / 6 / 7 and lint/build/theme. Evidence: `split/O18-*`.
- O19: `f6a9bc1b67dd982b17ee669730148462ba2b2781`, local WIP. Final focused 11/11; earlier lint/build/theme; no final standard gate, screenshot or body.

These three checkpoints predate the latest ownership dependency fixes. They are not opened PRs. O34 has uncommitted config/audit/doc material, but no actual package/ASAR verification and no PR.

## Remaining work

- Highest priority, #354: planner `planReproduction` ignores incomplete `runAgent.status` and can accept partial JSON as a contract; `journeyEventState` can display incomplete work as Completed. Recovery copy also lacks Chinese translation. These findings are recorded, not repaired.
- A02: Library paper-chat data/execution-root separation; threadless default task refresh after a project-folder change. O02: late attachment updates after first-thread migration.
- #345: incomplete install marker and detached-child cancellation. Deferred #343/#349 findings remain on their preserved branches; no repairs were started.
- Product findings: see [PRODUCT_CLOSEOUT.md](PRODUCT_CLOSEOUT.md). Writing findings: #347 temporary create/use/delete source observation and translation; fork #2 disabled `@comment` entries and comma/comment insertion. Published writing follow-ups: [O04 result](split/O04-RESULT.md), [O08 result](split/O08-RESULT.md).
- The News screenshot bot finding cited superseded AGENTS instructions and is not a blocker under the current user instruction; no broken preview screenshot was published.

Remaining splits: O05/O07/O09/O10/O14–16/O18–21/O24–25/O34 and N01/N03/N04. Named-version transfer helpers belong with O20; result storage ships with O14. Temporary agent browser/API/renderer services were closed; TeX runtime and fixtures remain available. No final whole-branch acceptance is claimed.
