# Product split closeout — 2026-11-16

## Pushed review fixes

- O23 / https://github.com/Johanson-colab/Archimedes/pull/340 — `codex/work-mode-navigation` at `bd54968312594c9e05ef2ba47f845a15c5c29676`, base main `1f4b37581c446770d576440f9ebb9bca5c55bfb7`. Selected Experiments/Writing/Review now pass unchanged through actual composer submit into runAgent. Existing draft mode stores the explicit choice; picker shows the current specialized mode. 29/29 focused tests; lint/build/diff checks pass. Logs: `split/O23/review-{checks,lint,build}.log`.
- O13 / https://github.com/Johanson-colab/Archimedes/pull/346 — `codex/bibtex-interchange` at `f3f62fce7498ad18527aaa91376ac44151af1c2b`, same main base. Distinct local PDFs sharing a basename cannot weak-title-match: local-pdf content hash governs their identity. Valid PDF fixture reproduces the overwrite before fix, verifies separate IDs/assets/indexed pages after, and verifies identical content still deduplicates. 11/11 focused tests; lint/build/diff checks pass. Logs: `split/O13/review-pdf-before.log`, `review-pdf.log`, `review-{lint,build}.log`.

Both were ordinary pushes following root approval. PR bodies only gained follow-up validation notes. No new screenshots or full baseline reruns for these patches.

## Remaining existing-PR review findings (not fixed)

- #342: pending/failed query controls vs completed response cache key; conference year pending return can remain loading; explicit full-proceedings mode must beat saved daily mode.
- #344: provenance must use completed-response query/filter; empty deep query still displaying daily cards needs actual feed provenance; mounted Library selection reason needs refresh after import/return.
- #346: retained effective citation-key collisions; inproceedings booktitle; TeX accent roundtrip; whitespace after opening delimiter; export preview invalidation; translated parser warnings. Only the PDF overwrite item is fixed by this follow-up.
- #351: entry failure alert clipped in full-height chat layout; model hint must use effective selected harness.
- #352: before-only snapshot budget limitation must also emit notice; localized coverage event title/detail.

## O14 local checkpoint — not published

Worktree `/Users/fei/Desktop/Archimedes-pr-splits/project-data-analysis`, branch `codex/project-data-analysis`, committed head `5a339d455a126ab1b586eef449e6c50d5f8fe009`. Contains package storage plus actual analysis producer; no standalone unused result-foundation PR. Dependency A02/O02/B1 heads are under repair and must be reconciled before eventual publication.

Reviewed fixes already committed: link-only discussion association preserves saved CSV/config/SVG snapshot; delayed A association captures original dataRoot and updates A rather than newly selected B. Focused 38/38, actual component 8/8, lint/build/theme pass. Prior full gate: 1307 total, 1294 pass, 6 inherited failures, 7 skip (O02 base: 1292/1279/6/7). Logs and reproduced failures live in `split/O14/`.

**Pending concrete issue:** after `await saveProjectResult`, saveResult unconditionally calls refreshResults. A dataRoot switch during save can make the new list IPC use B with A project id, misreport a successful save or contaminate A cache. Minimal intended fix: refresh only while still viewing the captured owner; returning to A already reloads. This has NOT been changed or verified.

Local untracked docs/images remain drafts: `docs/project-data-analysis.md`, `docs/assets/project-data-analysis/{before.png,after.png,README.md}`. Reopened screenshot is missing although the actual cold DB reopen journey succeeded; README/body references need completion. Renderer harness uses actual DB/FS, fixture `/private/tmp/archimedes-analysis-split-ui`, API script `split/O14/renderer-api.cjs`, evidence `split/O14/renderer-real-result.json`. API/renderer services closed at this closeout; scripts/data preserved for resumption.

New O15/O20/O21/N04 splits stopped. O20 eventual transfer must include named-version actual files, remapped refs, and import rollback helpers from frozen root; writer N03 intentionally excludes unused transfer helpers. Earlier project-index implementation in integrated root remains frozen (see project-index-handoff.md); no changes made there during this closeout.
